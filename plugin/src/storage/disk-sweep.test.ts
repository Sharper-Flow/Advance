/**
 * Disk Sweep Helper Tests
 *
 * Verifies `sweepClosedChangesFromDisk` removes per-id directories under
 * a given changes-root, returns per-id success/failure, and tolerates
 * missing directories (idempotent).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, chmod, rm } from "fs/promises";
import { join } from "path";
import { sweepClosedChangesFromDisk } from "./disk-sweep";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("sweepClosedChangesFromDisk", () => {
  let changesDir: string;

  beforeEach(async () => {
    changesDir = await createTempDir("adv-disk-sweep-");
  });

  afterEach(async () => {
    // Restore writable perms on any chmod'd dirs so cleanup succeeds.
    try {
      await chmod(changesDir, 0o755);
    } catch {
      // ignore
    }
    await cleanupTempDir(changesDir);
  });

  test("removes an existing change directory", async () => {
    const id = "addFeature";
    const dir = join(changesDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "change.json"), '{"id":"addFeature"}');
    await writeFile(join(dir, "proposal.md"), "# Test");

    const result = await sweepClosedChangesFromDisk([id], changesDir);

    expect(result.removed).toEqual([id]);
    expect(result.failed).toEqual([]);
    // Verify dir actually gone
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("fs/promises").access(dir),
    ).rejects.toThrow();
  });

  test("missing directory is tolerated (idempotent)", async () => {
    const result = await sweepClosedChangesFromDisk(
      ["never-existed"],
      changesDir,
    );

    expect(result.removed).toEqual(["never-existed"]);
    expect(result.failed).toEqual([]);
  });

  test("multiple ids: mix of existing and missing all succeed", async () => {
    const idA = "alpha";
    const idB = "beta";
    await mkdir(join(changesDir, idA), { recursive: true });
    // beta intentionally absent
    await writeFile(join(changesDir, idA, "change.json"), "{}");

    const result = await sweepClosedChangesFromDisk([idA, idB], changesDir);

    expect(result.removed).toEqual([idA, idB]);
    expect(result.failed).toEqual([]);
  });

  test("empty changeIds returns empty result", async () => {
    const result = await sweepClosedChangesFromDisk([], changesDir);
    expect(result.removed).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  test("non-removable dir reports failure with error message", async () => {
    // Skip on root (which can rm anything anyway).
    if (process.getuid && process.getuid() === 0) {
      return;
    }
    const id = "gamma";
    const dir = join(changesDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "change.json"), "{}");
    // Make the parent read-only so rm fails on the entry.
    await chmod(changesDir, 0o555);

    const result = await sweepClosedChangesFromDisk([id], changesDir);

    expect(result.removed).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe(id);
    expect(typeof result.failed[0].error).toBe("string");
    expect(result.failed[0].error.length).toBeGreaterThan(0);

    // Restore writable perms before afterEach cleanup (also done there).
    await chmod(changesDir, 0o755);
    await rm(dir, { recursive: true, force: true });
  });

  test("rejects path traversal in changeId for safety", async () => {
    // Belt-and-braces: a malicious changeId that escapes the changesDir
    // must NOT delete arbitrary paths. Caller is expected to pass safe
    // changeIds, but the helper defensively rejects path-separator chars.
    const result = await sweepClosedChangesFromDisk(
      ["../escape", "..", "/abs/path"],
      changesDir,
    );

    expect(result.removed).toEqual([]);
    expect(result.failed).toHaveLength(3);
    for (const failure of result.failed) {
      expect(failure.error).toMatch(/invalid|traversal|separator/i);
    }
  });
});
