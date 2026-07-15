/**
 * Tests for the adv_change_archive typed timeout classifier.
 *
 * fixArchiveTerminalProjection SC3/AC4: when the safety-net tool timeout
 * fires AFTER the archive bundle is durable on disk, adv_change_archive
 * must return a typed "still_finalizing / re-run to reconcile" result
 * instead of a bare ToolExecutionTimeout. When no bundle exists, the
 * classifier must decline (return undefined) so the generic timeout
 * response surfaces the real failure.
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatArchiveTimeoutResult } from "./archive-timeout";
import type { Store } from "../../storage/store-types";

let tempDir: string;

function fakeStore(root: string, archive: string): Store {
  return {
    paths: { root, archive },
  } as unknown as Store;
}

async function writeBundle(
  archiveDir: string,
  changeId: string,
): Promise<string> {
  const bundleDir = join(archiveDir, `2026-07-13-${changeId}`);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, "change.json"),
    JSON.stringify({ id: changeId, status: "archived" }),
  );
  return bundleDir;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "adv-archive-timeout-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("formatArchiveTimeoutResult", () => {
  it("returns a typed still_finalizing result when the bundle is durable in the external archive dir", async () => {
    const root = join(tempDir, "repo");
    const archive = join(tempDir, "external", "archive");
    const bundlePath = await writeBundle(archive, "example");

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example" },
      timeoutMs: 420_000,
    });

    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.success).toBe(false);
    expect(parsed.errorClass).toBe("ToolExecutionTimeout");
    expect(parsed.tool).toBe("adv_change_archive");
    expect(parsed.changeId).toBe("example");
    expect(parsed.archiveStatus).toBe("still_finalizing");
    expect(parsed.bundleDurable).toBe(true);
    expect(parsed.archivePath).toBe(bundlePath);
    expect(parsed.retrySafe).toBe(true);
    expect(parsed.remediation).toMatch(/re-run adv_change_archive/i);
    expect(parsed.remediation).toMatch(/idempotent/i);
  });

  it("finds the bundle in the worktree in-repo mirror when the external archive lacks it", async () => {
    const root = join(tempDir, "repo");
    const archive = join(tempDir, "external", "archive");
    const worktree = join(tempDir, "worktree");
    const bundlePath = await writeBundle(
      join(worktree, ".adv", "archive"),
      "example",
    );

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example", worktreePath: worktree },
      timeoutMs: 420_000,
    });

    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.archiveStatus).toBe("still_finalizing");
    expect(parsed.archivePath).toBe(bundlePath);
  });

  it("finds the bundle under target_path's in-repo mirror for cross-project archive timeouts", async () => {
    const root = join(tempDir, "caller-repo");
    const archive = join(tempDir, "caller-external", "archive");
    const target = join(tempDir, "target-repo");
    const bundlePath = await writeBundle(
      join(target, ".adv", "archive"),
      "example",
    );

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example", target_path: target },
      timeoutMs: 420_000,
    });

    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.archiveStatus).toBe("still_finalizing");
    expect(parsed.archivePath).toBe(bundlePath);
  });

  it("declines (undefined) when no bundle exists anywhere — the generic timeout must surface the real failure", async () => {
    const root = join(tempDir, "repo");
    const archive = join(tempDir, "external", "archive");
    await mkdir(archive, { recursive: true });

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example", worktreePath: join(tempDir, "nope") },
      timeoutMs: 420_000,
    });

    expect(raw).toBeUndefined();
  });

  it("declines when changeId is missing or not a string", async () => {
    const root = join(tempDir, "repo");
    const archive = join(tempDir, "external", "archive");
    await writeBundle(archive, "example");

    expect(
      await formatArchiveTimeoutResult({
        store: fakeStore(root, archive),
        args: {},
        timeoutMs: 420_000,
      }),
    ).toBeUndefined();
    expect(
      await formatArchiveTimeoutResult({
        store: fakeStore(root, archive),
        args: { changeId: 42 },
        timeoutMs: 420_000,
      }),
    ).toBeUndefined();
  });

  it("ignores archive dirs that do not exist and never throws", async () => {
    const root = join(tempDir, "missing-root");
    const archive = join(tempDir, "missing-archive");

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example" },
      timeoutMs: 420_000,
    });

    expect(raw).toBeUndefined();
  });

  it("declines when a matching dir exists but has no readable change.json manifest", async () => {
    const root = join(tempDir, "repo");
    const archive = join(tempDir, "external", "archive");
    await mkdir(join(archive, "2026-07-13-example"), { recursive: true });

    const raw = await formatArchiveTimeoutResult({
      store: fakeStore(root, archive),
      args: { changeId: "example" },
      timeoutMs: 420_000,
    });

    expect(raw).toBeUndefined();
  });
});
