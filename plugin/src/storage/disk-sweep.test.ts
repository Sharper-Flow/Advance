/**
 * Disk Sweep Helper Tests
 *
 * Verifies `sweepClosedChangesFromDisk` removes per-id directories under
 * a given changes-root, returns per-id success/failure, and tolerates
 * missing directories (idempotent).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, chmod, rm, access } from "fs/promises";
import { join } from "path";
import { sweepClosedChangesFromDisk } from "./disk-sweep";
import { loadClosedChange } from "./json";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("sweepClosedChangesFromDisk", () => {
  let changesDir: string;
  let closedDir: string;

  beforeEach(async () => {
    changesDir = await createTempDir("adv-disk-sweep-");
    closedDir = await createTempDir("adv-disk-sweep-closed-");
  });

  afterEach(async () => {
    // Restore writable perms on any chmod'd dirs so cleanup succeeds.
    try {
      await chmod(changesDir, 0o755);
    } catch {
      // ignore
    }
    await cleanupTempDir(changesDir);
    await cleanupTempDir(closedDir);
  });

  test("removes an existing change directory", async () => {
    const id = "addFeature";
    const dir = join(changesDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "change.json"), '{"id":"addFeature"}');
    await writeFile(join(dir, "proposal.md"), "# Test");

    const result = await sweepClosedChangesFromDisk(
      [id],
      changesDir,
      closedDir,
    );

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
      closedDir,
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

    const result = await sweepClosedChangesFromDisk(
      [idA, idB],
      changesDir,
      closedDir,
    );

    expect(result.removed).toEqual([idA, idB]);
    expect(result.failed).toEqual([]);
  });

  test("empty changeIds returns empty result", async () => {
    const result = await sweepClosedChangesFromDisk([], changesDir, closedDir);
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

    const result = await sweepClosedChangesFromDisk(
      [id],
      changesDir,
      closedDir,
    );

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
      closedDir,
    );

    expect(result.removed).toEqual([]);
    expect(result.failed).toHaveLength(3);
    for (const failure of result.failed) {
      expect(failure.error).toMatch(/invalid|traversal|separator/i);
    }
  });
});

describe("sweepClosedChangesFromDisk — durability guard", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("adv-sweep-guard-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  async function exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  function closedRecord(id: string): string {
    return JSON.stringify({
      id,
      title: `Change ${id}`,
      status: "closed",
      lifecycleState: "closed",
      created_at: "2026-08-01T00:00:00.000Z",
      tasks: [],
      gates: {},
      deltas: {},
      wisdom: [],
      subagent_reports: [],
      closure: {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User approved closure.",
        approved_at: "2026-08-26T00:00:00.000Z",
      },
    });
  }

  test("preserves a swept record as a readable closed bundle", async () => {
    const changesDir = join(root, "changes");
    const closedPath = join(root, "closed");
    await mkdir(join(changesDir, "hasRecord"), { recursive: true });
    await writeFile(
      join(changesDir, "hasRecord", "change.json"),
      closedRecord("hasRecord"),
    );

    const result = await sweepClosedChangesFromDisk(
      ["hasRecord"],
      changesDir,
      closedPath,
    );

    expect(result.removed).toContain("hasRecord");
    expect(await exists(join(changesDir, "hasRecord"))).toBe(false);
    const readback = await loadClosedChange(closedPath, "hasRecord");
    expect(readback.success).toBe(true);
    expect(readback.data?.id).toBe("hasRecord");
  });

  test("refuses to remove a record it cannot make durable", async () => {
    const changesDir = join(root, "changes");
    const closedPath = join(root, "closed");
    await mkdir(join(changesDir, "blocked"), { recursive: true });
    await writeFile(
      join(changesDir, "blocked", "change.json"),
      closedRecord("blocked"),
    );
    // Occupy closed/ with a regular file so no bundle can be written.
    await writeFile(closedPath, "not a directory");

    const result = await sweepClosedChangesFromDisk(
      ["blocked"],
      changesDir,
      closedPath,
    );

    expect(result.failed.map((f) => f.id)).toContain("blocked");
    expect(await exists(join(changesDir, "blocked", "change.json"))).toBe(true);
  });
});
