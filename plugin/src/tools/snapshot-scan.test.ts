/**
 * Snapshot Health Scan — Pure Filesystem Scan Logic Tests
 *
 * Inline TDD for snapshot-scan.ts.
 * Fixtures: 8 scenario builds + edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdir,
  writeFile,
  utimes,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  scanSnapshotHealth,
  executeRepair,
  STALE_LOCK_THRESHOLD_MS,
  OVERSIZED_THRESHOLD_BYTES,
  FSCK_SKIP_THRESHOLD_BYTES,
  SNAPSHOT_HEALTH_SCHEMA_VERSION,
  type SnapshotFinding,
} from "./snapshot-scan";

// =============================================================================
// Fixture Builders
// =============================================================================

async function makeBareRepo(path: string): Promise<void> {
  await mkdir(join(path, "refs", "heads"), { recursive: true });
  await mkdir(join(path, "objects", "info"), { recursive: true });
  await mkdir(join(path, "objects", "pack"), { recursive: true });
  await writeFile(join(path, "HEAD"), "ref: refs/heads/main\n");
  await writeFile(
    join(path, "config"),
    "[core]\n\trepositoryformatversion = 0\n",
  );
}

async function addStaleLock(
  repoPath: string,
  lockName: string,
  ageMs: number,
): Promise<string> {
  const lockPath = join(repoPath, `${lockName}.lock`);
  await writeFile(lockPath, "lock");
  const now = Date.now();
  const mtime = new Date(now - ageMs);
  await utimes(lockPath, mtime, mtime);
  return lockPath;
}

async function addZeroByteObject(
  repoPath: string,
  hash: string,
): Promise<string> {
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  const dir = join(repoPath, "objects", prefix);
  await mkdir(dir, { recursive: true });
  const objPath = join(dir, suffix);
  await writeFile(objPath, "");
  return objPath;
}

async function addCorruptedObject(repoPath: string): Promise<void> {
  const hash = "deadbeef" + "0".repeat(32);
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  const dir = join(repoPath, "objects", prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, suffix), "this is not a valid git object");
}

async function makeLegacyLayout(
  rootPath: string,
  projectId: string,
): Promise<string> {
  const pidDir = join(rootPath, projectId);
  await makeBareRepo(pidDir);
  return pidDir;
}

async function makeOrphanRepo(
  rootPath: string,
  projectId: string,
  wtHash: string,
): Promise<string> {
  const repoPath = join(rootPath, projectId, wtHash);
  await makeBareRepo(repoPath);
  return repoPath;
}

async function makeOversizedRepo(
  rootPath: string,
  projectId: string,
  wtHash: string,
): Promise<string> {
  const repoPath = join(rootPath, projectId, wtHash);
  await makeBareRepo(repoPath);
  // Create a sparse file > 100MB
  const bigFile = join(repoPath, "objects", "pack", "big.pack");
  await writeFile(bigFile, Buffer.alloc(0));
  await (
    await import("node:fs/promises")
  ).truncate(bigFile, 110 * 1024 * 1024);
  return repoPath;
}

// =============================================================================
// Scan Tests
// =============================================================================

describe("scanSnapshotHealth", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await createTempDir("adv-snapshot-scan-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempRoot);
  });

  it("returns empty output when snapshot root does not exist", async () => {
    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: join(tempRoot, "nonexistent"),
    });
    expect(result.schema_version).toBe(SNAPSHOT_HEALTH_SCHEMA_VERSION);
    expect(result.scope).toBe("project");
    expect(result.project_id).toBe("test-pid");
    expect(result.findings).toHaveLength(0);
    expect(result.summary.projects_scanned).toBe(0);
    expect(result.summary.bare_repos_scanned).toBe(0);
  });

  it("detects no findings for a clean bare repo (modern layout)", async () => {
    await makeBareRepo(join(tempRoot, "test-pid", "abc123"));
    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });
    expect(result.findings).toHaveLength(0);
    expect(result.summary.projects_scanned).toBe(1);
    expect(result.summary.bare_repos_scanned).toBe(1);
  });

  it("detects stale lock (>5min, no holder) as critical", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      lsofCheck: async () => null,
    });

    expect(result.findings).toHaveLength(1);
    const f = result.findings[0];
    expect(f.pattern).toBe("stale_lock");
    expect(f.severity).toBe("critical");
    expect(f.project_id).toBe("test-pid");
    expect(f.bare_repo_path).toBe(repoPath);
    expect(f.remediation).toBe("delete_stale_locks");
    expect(f.metadata).toMatchObject({
      holder_pid: null,
      lock_age_ms: expect.any(Number),
      size_bytes: expect.any(Number),
    });
    expect(f.metadata!.lock_age_ms).toBeGreaterThan(STALE_LOCK_THRESHOLD_MS);
  });

  it("does NOT flag a lock with a live holder", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(repoPath, "index", STALE_LOCK_THRESHOLD_MS + 1000);

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      lsofCheck: async () => "12345",
    });

    expect(result.findings).toHaveLength(0);
  });

  it("detects zero-byte object as critical", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const objPath = await addZeroByteObject(
      repoPath,
      "deadbeef" + "0".repeat(32),
    );

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    expect(result.findings).toHaveLength(1);
    const f = result.findings[0];
    expect(f.pattern).toBe("zero_byte_object");
    expect(f.severity).toBe("critical");
    expect(f.remediation).toBe("delete_zero_byte_objects");
    expect(f.metadata).toMatchObject({
      object_hash: "deadbeef" + "0".repeat(32),
      object_path: objPath,
    });
  });

  it("detects fsck errors in a corrupted bare repo", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addCorruptedObject(repoPath);
    // Create a ref pointing to a non-existent object so fsck reports an error
    await writeFile(
      join(repoPath, "refs", "heads", "main"),
      "deadbeef00000000000000000000000000000000\n",
    );

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    const fsckFindings = result.findings.filter(
      (f) => f.pattern === "fsck_error",
    );
    expect(fsckFindings.length).toBeGreaterThan(0);
    const f = fsckFindings[0];
    expect(f.severity).toBe("critical");
    expect(f.project_id).toBe("test-pid");
    expect(f.metadata).toHaveProperty("error_line");
  });

  it("detects orphan bare repo when worktree path does not exist", async () => {
    await makeOrphanRepo(tempRoot, "test-pid", "abc123");

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      resolveWorktreePath: async () => "/nonexistent/path",
    });

    const orphanFindings = result.findings.filter(
      (f) => f.pattern === "orphan_bare_repo",
    );
    expect(orphanFindings).toHaveLength(1);
    const f = orphanFindings[0];
    expect(f.severity).toBe("warning");
    expect(f.remediation).toBe("delete_orphan_bare_repos");
    expect(f.metadata).toMatchObject({
      worktree_path: "/nonexistent/path",
      missing: true,
    });
  });

  it("detects legacy layout as info", async () => {
    const pidDir = await makeLegacyLayout(tempRoot, "test-pid");

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    const legacyFindings = result.findings.filter(
      (f) => f.pattern === "legacy_layout",
    );
    expect(legacyFindings).toHaveLength(1);
    const f = legacyFindings[0];
    expect(f.severity).toBe("info");
    expect(f.remediation).toBe("delete_orphan_bare_repos");
    expect(f.bare_repo_path).toBe(pidDir);
    expect(f.metadata).toMatchObject({ layout: "legacy" });
  });

  it("detects oversized dir as info", async () => {
    await makeOversizedRepo(tempRoot, "test-pid", "abc123");

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    const oversizedFindings = result.findings.filter(
      (f) => f.pattern === "oversized_dir",
    );
    expect(oversizedFindings).toHaveLength(1);
    const f = oversizedFindings[0];
    expect(f.severity).toBe("info");
    expect(f.remediation).toBeUndefined();
    expect(f.metadata!.size_bytes).toBeGreaterThan(OVERSIZED_THRESHOLD_BYTES);
  });

  it("detects no_snapshot_dirs when project dir has no bare repos", async () => {
    await mkdir(join(tempRoot, "test-pid"), { recursive: true });
    await writeFile(join(tempRoot, "test-pid", "random.txt"), "hello");

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    const noDirFindings = result.findings.filter(
      (f) => f.pattern === "no_snapshot_dirs",
    );
    expect(noDirFindings).toHaveLength(1);
    const f = noDirFindings[0];
    expect(f.severity).toBe("info");
    expect(f.project_id).toBe("test-pid");
  });

  it("flags stale_lock even when lsof is unavailable", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(repoPath, "index", STALE_LOCK_THRESHOLD_MS + 1000);

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      lsofCheck: async () => "unknown_no_lsof",
    });

    const staleFindings = result.findings.filter(
      (f) => f.pattern === "stale_lock",
    );
    expect(staleFindings).toHaveLength(1);
    expect(staleFindings[0].metadata!.holder_pid).toBe("unknown_no_lsof");
  });

  it("skips fsck when dir size exceeds FSCK_SKIP_THRESHOLD_BYTES", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addCorruptedObject(repoPath);
    // Make it oversized so fsck is skipped
    const bigFile = join(repoPath, "objects", "pack", "huge.pack");
    await writeFile(bigFile, Buffer.alloc(0));
    await (
      await import("node:fs/promises")
    ).truncate(bigFile, FSCK_SKIP_THRESHOLD_BYTES + 1024);

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
    });

    const fsckFindings = result.findings.filter(
      (f) => f.pattern === "fsck_error",
    );
    expect(fsckFindings).toHaveLength(0);
  });

  it("counts findings correctly in summary", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(repoPath, "index", STALE_LOCK_THRESHOLD_MS + 1000);
    await addZeroByteObject(repoPath, "deadbeef" + "0".repeat(32));

    const result = await scanSnapshotHealth({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      lsofCheck: async () => null,
    });

    expect(result.summary.critical).toBe(2);
    expect(result.summary.warnings).toBe(0);
  });

  it("global scope scans all projects", async () => {
    await makeBareRepo(join(tempRoot, "pid-a", "wt1"));
    await makeBareRepo(join(tempRoot, "pid-b", "wt2"));

    const result = await scanSnapshotHealth({
      scope: "global",
      projectId: "pid-a",
      snapshotRoot: tempRoot,
    });

    expect(result.scope).toBe("global");
    expect(result.project_id).toBe("global");
    expect(result.summary.projects_scanned).toBe(2);
    expect(result.summary.bare_repos_scanned).toBe(2);
  });
});

// =============================================================================
// Repair Tests
// =============================================================================

describe("executeRepair", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await createTempDir("adv-snapshot-repair-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempRoot);
  });

  it("dryRun returns success records but does not delete files", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const finding: SnapshotFinding = {
      pattern: "stale_lock",
      severity: "critical",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "stale lock",
      remediation: "delete_stale_locks",
      metadata: {
        lock_path: lockPath,
        lock_age_ms: STALE_LOCK_THRESHOLD_MS + 1000,
        holder_pid: null,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_stale_locks"],
      dryRun: true,
      lsofCheck: async () => null,
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");
    expect(result[0].reason).toBe("dryRun");

    // File should still exist
    await expect(access(lockPath)).resolves.toBeUndefined();
  });

  it("actually deletes stale lock when not dryRun", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const finding: SnapshotFinding = {
      pattern: "stale_lock",
      severity: "critical",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "stale lock",
      remediation: "delete_stale_locks",
      metadata: {
        lock_path: lockPath,
        lock_age_ms: STALE_LOCK_THRESHOLD_MS + 1000,
        holder_pid: null,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_stale_locks"],
      dryRun: false,
      lsofCheck: async () => null,
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");

    // File should be gone
    await expect(access(lockPath)).rejects.toThrow();
  });

  it("skips stale lock deletion when holder reappears (race guard)", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const finding: SnapshotFinding = {
      pattern: "stale_lock",
      severity: "critical",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "stale lock",
      remediation: "delete_stale_locks",
      metadata: {
        lock_path: lockPath,
        lock_age_ms: STALE_LOCK_THRESHOLD_MS + 1000,
        holder_pid: null,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_stale_locks"],
      dryRun: false,
      lsofCheck: async () => "99999",
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("skipped");
    expect(result[0].reason).toContain("holder reappeared");

    // File should still exist
    await expect(access(lockPath)).resolves.toBeUndefined();
  });

  it("deletes zero-byte objects when not dryRun", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const objPath = await addZeroByteObject(
      repoPath,
      "deadbeef" + "0".repeat(32),
    );

    const finding: SnapshotFinding = {
      pattern: "zero_byte_object",
      severity: "critical",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "zero byte object",
      remediation: "delete_zero_byte_objects",
      metadata: {
        object_hash: "deadbeef" + "0".repeat(32),
        object_path: objPath,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_zero_byte_objects"],
      dryRun: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");
    await expect(access(objPath)).rejects.toThrow();
  });

  it("deletes orphan bare repo when worktree still missing", async () => {
    const repoPath = await makeOrphanRepo(tempRoot, "test-pid", "abc123");

    const finding: SnapshotFinding = {
      pattern: "orphan_bare_repo",
      severity: "warning",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "orphan repo",
      remediation: "delete_orphan_bare_repos",
      metadata: {
        worktree_path: "/nonexistent/path",
        missing: true,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_orphan_bare_repos"],
      dryRun: false,
      resolveWorktreePath: async () => "/nonexistent/path",
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");
    await expect(access(repoPath)).rejects.toThrow();
  });

  it("skips orphan deletion when worktree reappears", async () => {
    const repoPath = await makeOrphanRepo(tempRoot, "test-pid", "abc123");

    const finding: SnapshotFinding = {
      pattern: "orphan_bare_repo",
      severity: "warning",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "orphan repo",
      remediation: "delete_orphan_bare_repos",
      metadata: {
        worktree_path: "/nonexistent/path",
        missing: true,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_orphan_bare_repos"],
      dryRun: false,
      resolveWorktreePath: async () => tempRoot, // now exists
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("skipped");
    expect(result[0].reason).toContain("worktree reappeared");
    await expect(access(repoPath)).resolves.toBeUndefined();
  });

  it("only processes repairActions in the whitelist", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const finding: SnapshotFinding = {
      pattern: "stale_lock",
      severity: "critical",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "stale lock",
      remediation: "delete_stale_locks",
      metadata: {
        lock_path: lockPath,
        lock_age_ms: STALE_LOCK_THRESHOLD_MS + 1000,
        holder_pid: null,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_zero_byte_objects"], // different action
      dryRun: false,
      lsofCheck: async () => null,
    });

    expect(result).toHaveLength(0);
    await expect(access(lockPath)).resolves.toBeUndefined();
  });

  it("skips findings with no remediation", async () => {
    const repoPath = join(tempRoot, "test-pid", "abc123");
    await makeBareRepo(repoPath);
    await makeOversizedRepo(tempRoot, "test-pid", "abc123");

    const finding: SnapshotFinding = {
      pattern: "oversized_dir",
      severity: "info",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "oversized",
      // no remediation
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_stale_locks"],
      dryRun: false,
    });

    expect(result).toHaveLength(0);
  });

  it("dryRun orphan deletion returns success with reason dryRun", async () => {
    const repoPath = await makeOrphanRepo(tempRoot, "test-pid", "abc123");

    const finding: SnapshotFinding = {
      pattern: "orphan_bare_repo",
      severity: "warning",
      project_id: "test-pid",
      bare_repo_path: repoPath,
      detail: "orphan repo",
      remediation: "delete_orphan_bare_repos",
      metadata: {
        worktree_path: "/nonexistent/path",
        missing: true,
      },
    };

    const result = await executeRepair({
      scope: "project",
      projectId: "test-pid",
      snapshotRoot: tempRoot,
      findings: [finding],
      repairActions: ["delete_orphan_bare_repos"],
      dryRun: true,
      resolveWorktreePath: async () => "/nonexistent/path",
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");
    expect(result[0].reason).toBe("dryRun");
    await expect(access(repoPath)).resolves.toBeUndefined();
  });
});
