// Tool-layer module — imports child_process for git fsck. Not workflow-safe.

import { readdir, stat, access, readFile, unlink, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { spawnGitStreams } from "../utils/git-binary";
import { getDataHome } from "../utils/project-id";

// =============================================================================
// Constants
// =============================================================================

export const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
export const OVERSIZED_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100MB
export const FSCK_SKIP_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500MB
export const MAX_FSCK_ERRORS_PER_REPO = 10;
export const SNAPSHOT_HEALTH_SCHEMA_VERSION = 1;

// =============================================================================
// Types
// =============================================================================

export type SnapshotFindingSeverity = "critical" | "warning" | "info";
export type SnapshotFindingPattern =
  | "stale_lock"
  | "zero_byte_object"
  | "fsck_error"
  | "orphan_bare_repo"
  | "oversized_dir"
  | "legacy_layout"
  | "no_snapshot_dirs";
export type RepairAction =
  | "delete_stale_locks"
  | "delete_zero_byte_objects"
  | "delete_orphan_bare_repos"
  | "delete_fsck_corrupt_repos";

export interface SnapshotFinding {
  pattern: SnapshotFindingPattern;
  severity: SnapshotFindingSeverity;
  project_id: string;
  bare_repo_path: string;
  detail: string;
  remediation?: RepairAction;
  metadata?: Record<string, unknown>;
}

export interface SnapshotHealthSummary {
  projects_scanned: number;
  bare_repos_scanned: number;
  critical: number;
  warnings: number;
  info: number;
}

export interface SnapshotHealthOutput {
  schema_version: 1;
  scan_duration_ms: number;
  scope: "project" | "global";
  project_id: string;
  summary: SnapshotHealthSummary;
  findings: SnapshotFinding[];
}

export interface RepairActionRecord {
  action: RepairAction;
  target_path: string;
  status: "success" | "skipped" | "failed";
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ScanOptions {
  scope: "project" | "global";
  projectId: string;
  snapshotRoot?: string;
  lsofCheck?: (path: string) => Promise<string | null | "unknown_no_lsof">;
  resolveWorktreePath?: (projectId: string) => Promise<string | null>;
  now?: () => number;
}

export interface RepairOptions extends ScanOptions {
  findings: SnapshotFinding[];
  repairActions: RepairAction[];
  dryRun: boolean;
}

// =============================================================================
// Default Dependencies
// =============================================================================

async function defaultLsofCheck(
  path: string,
): Promise<string | null | "unknown_no_lsof"> {
  return new Promise((resolve) => {
    const proc = spawn("lsof", ["-t", path], { timeout: 3000 });
    let stdout = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stdout += data.toString();
    });
    proc.on("error", (err) => {
      if ("code" in err && err.code === "ENOENT") {
        resolve("unknown_no_lsof");
      } else {
        resolve("unknown_no_lsof");
      }
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        // lsof returns non-zero when no processes hold the file open
        resolve(null);
        return;
      }
      const line = stdout.trim().split("\n")[0];
      resolve(line || null);
    });
  });
}

async function defaultResolveWorktreePath(
  projectId: string,
): Promise<string | null> {
  try {
    const projectJsonPath = join(
      getDataHome(),
      "opencode",
      "storage",
      "project",
      `${projectId}.json`,
    );
    const content = await readFile(projectJsonPath, "utf-8");
    const data = JSON.parse(content) as { worktree?: string };
    return data.worktree ?? null;
  } catch {
    return null;
  }
}

function defaultNow(): number {
  return Date.now();
}

// =============================================================================
// Helpers
// =============================================================================

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function isBareRepo(dir: string): Promise<boolean> {
  return (
    (await pathExists(join(dir, "HEAD"))) &&
    (await pathExists(join(dir, "objects"))) &&
    (await pathExists(join(dir, "refs")))
  );
}

async function dirSize(p: string): Promise<number> {
  let total = 0;
  const entries = await readdir(p, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(p, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(child);
    } else if (entry.isFile()) {
      try {
        const s = await stat(child);
        total += s.size;
      } catch {
        // ignore
      }
    }
  }
  return total;
}

async function listSubdirs(p: string): Promise<string[]> {
  try {
    const entries = await readdir(p, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        out.push(join(p, e.name));
      }
    }
    return out;
  } catch {
    return [];
  }
}

// =============================================================================
// Per-Repo Scan
// =============================================================================

async function scanBareRepo(
  repoPath: string,
  pid: string,
  opts: Required<
    Pick<ScanOptions, "lsofCheck" | "resolveWorktreePath" | "now">
  >,
): Promise<SnapshotFinding[]> {
  const findings: SnapshotFinding[] = [];
  const now = opts.now();

  // Stale locks
  const lockEntries = await findLockFiles(repoPath);
  for (const lockPath of lockEntries) {
    try {
      const s = await stat(lockPath);
      const age = now - s.mtime.getTime();
      if (age > STALE_LOCK_THRESHOLD_MS) {
        const holder = await opts.lsofCheck(lockPath);
        if (holder === null || holder === "unknown_no_lsof") {
          findings.push({
            pattern: "stale_lock",
            severity: "critical",
            project_id: pid,
            bare_repo_path: repoPath,
            detail: `Stale lock file: ${basename(lockPath)}`,
            remediation: "delete_stale_locks",
            metadata: {
              holder_pid: holder,
              lock_age_ms: age,
              size_bytes: s.size,
              lock_path: lockPath,
            },
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Zero-byte objects
  const objRoot = join(repoPath, "objects");
  if (await isDirectory(objRoot)) {
    const objSubdirs = await readdir(objRoot, { withFileTypes: true });
    for (const sd of objSubdirs) {
      if (!sd.isDirectory()) continue;
      const sdName = sd.name;
      if (sdName.length !== 2) continue;
      const sdPath = join(objRoot, sdName);
      const objFiles = await readdir(sdPath, { withFileTypes: true });
      for (const obj of objFiles) {
        if (!obj.isFile()) continue;
        const objName = obj.name;
        if (!/^[0-9a-f]{38,}$/.test(objName)) continue;
        const objPath = join(sdPath, objName);
        try {
          const s = await stat(objPath);
          if (s.size === 0) {
            findings.push({
              pattern: "zero_byte_object",
              severity: "critical",
              project_id: pid,
              bare_repo_path: repoPath,
              detail: `Zero-byte object: ${sdName}${objName}`,
              remediation: "delete_zero_byte_objects",
              metadata: {
                object_hash: `${sdName}${objName}`,
                object_path: objPath,
              },
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // Size checks
  let size = 0;
  try {
    size = await dirSize(repoPath);
  } catch {
    // ignore
  }

  if (size > OVERSIZED_THRESHOLD_BYTES) {
    findings.push({
      pattern: "oversized_dir",
      severity: "info",
      project_id: pid,
      bare_repo_path: repoPath,
      detail: `Oversized directory: ${size} bytes`,
      metadata: {
        size_bytes: size,
      },
    });
  }

  // fsck
  if (size <= FSCK_SKIP_THRESHOLD_BYTES) {
    const fsckErrs = await runFsck(repoPath);
    for (const errLine of fsckErrs) {
      findings.push({
        pattern: "fsck_error",
        severity: "critical",
        project_id: pid,
        bare_repo_path: repoPath,
        detail: `git fsck error: ${errLine}`,
        remediation: "delete_fsck_corrupt_repos",
        metadata: {
          error_line: errLine,
        },
      });
    }
  }

  // Orphan check
  const worktreePath = await opts.resolveWorktreePath(pid);
  if (worktreePath && !(await pathExists(worktreePath))) {
    findings.push({
      pattern: "orphan_bare_repo",
      severity: "warning",
      project_id: pid,
      bare_repo_path: repoPath,
      detail: `Orphan bare repo: worktree missing at ${worktreePath}`,
      remediation: "delete_orphan_bare_repos",
      metadata: {
        worktree_path: worktreePath,
        missing: true,
      },
    });
  }

  return findings;
}

async function findLockFiles(repoPath: string): Promise<string[]> {
  const locks: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const child = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(child);
      } else if (e.isFile() && e.name.endsWith(".lock")) {
        locks.push(child);
      }
    }
  }
  try {
    await walk(repoPath);
  } catch {
    // ignore
  }
  return locks;
}

async function runFsck(repoPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawnGitStreams(
      ["--git-dir", repoPath, "fsck", "--no-dangling", "--connectivity-only"],
      { timeout: 20000 },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", () => {
      resolve([]);
    });
    proc.on("close", () => {
      const lines = (stdout + stderr).split("\n");
      const errs: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("notice:")) continue;
        if (
          trimmed.toLowerCase().includes("error:") ||
          trimmed.toLowerCase().includes("fatal:") ||
          trimmed.toLowerCase().includes("missing") ||
          trimmed.toLowerCase().includes("corrupt") ||
          trimmed.toLowerCase().includes("broken")
        ) {
          errs.push(trimmed);
          if (errs.length >= MAX_FSCK_ERRORS_PER_REPO) break;
        }
      }
      resolve(errs);
    });
  });
}

// =============================================================================
// Public API — Scan
// =============================================================================

export async function scanSnapshotHealth(
  opts: ScanOptions,
): Promise<SnapshotHealthOutput> {
  const startTime = (opts.now ?? defaultNow)();
  const root = opts.snapshotRoot ?? join(getDataHome(), "opencode", "snapshot");

  if (!(await pathExists(root))) {
    const now = (opts.now ?? defaultNow)();
    return {
      schema_version: SNAPSHOT_HEALTH_SCHEMA_VERSION,
      scan_duration_ms: now - startTime,
      scope: opts.scope,
      project_id: opts.scope === "global" ? "global" : opts.projectId,
      summary: {
        projects_scanned: 0,
        bare_repos_scanned: 0,
        critical: 0,
        warnings: 0,
        info: 0,
      },
      findings: [],
    };
  }

  const lsofCheck = opts.lsofCheck ?? defaultLsofCheck;
  const resolveWorktreePath =
    opts.resolveWorktreePath ?? defaultResolveWorktreePath;
  const nowFn = opts.now ?? defaultNow;

  const projectIds =
    opts.scope === "global"
      ? (await listSubdirs(root)).map((p) => basename(p))
      : [opts.projectId];

  const findings: SnapshotFinding[] = [];
  let projectsScanned = 0;
  let bareReposScanned = 0;

  for (const pid of projectIds) {
    const pidDir = join(root, pid);
    if (!(await isDirectory(pidDir))) continue;

    // Legacy layout check
    if (await isBareRepo(pidDir)) {
      findings.push({
        pattern: "legacy_layout",
        severity: "info",
        project_id: pid,
        bare_repo_path: pidDir,
        detail: "Legacy layout: bare repo at project root",
        remediation: "delete_orphan_bare_repos",
        metadata: { layout: "legacy" },
      });
      const repoFindings = await scanBareRepo(pidDir, pid, {
        lsofCheck,
        resolveWorktreePath,
        now: nowFn,
      });
      findings.push(...repoFindings);
      bareReposScanned++;
      projectsScanned++;
      continue;
    }

    // Modern layout
    const subdirs = await listSubdirs(pidDir);
    const bareSubdirs: string[] = [];
    for (const sd of subdirs) {
      const sdBase = basename(sd);
      const repoPath = join(pidDir, sdBase);
      if (await isBareRepo(repoPath)) {
        bareSubdirs.push(sdBase);
      }
    }

    if (bareSubdirs.length === 0) {
      findings.push({
        pattern: "no_snapshot_dirs",
        severity: "info",
        project_id: pid,
        bare_repo_path: pidDir,
        detail: "No bare repos found in project directory",
        metadata: {},
      });
      continue;
    }

    for (const sd of bareSubdirs) {
      const repoPath = join(pidDir, sd);
      const repoFindings = await scanBareRepo(repoPath, pid, {
        lsofCheck,
        resolveWorktreePath,
        now: nowFn,
      });
      findings.push(...repoFindings);
      bareReposScanned++;
    }

    projectsScanned++;
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;

  const endTime = nowFn();

  return {
    schema_version: SNAPSHOT_HEALTH_SCHEMA_VERSION,
    scan_duration_ms: endTime - startTime,
    scope: opts.scope,
    project_id: opts.scope === "global" ? "global" : opts.projectId,
    summary: {
      projects_scanned: projectsScanned,
      bare_repos_scanned: bareReposScanned,
      critical,
      warnings,
      info,
    },
    findings,
  };
}

// =============================================================================
// Public API — Repair
// =============================================================================

export async function executeRepair(
  opts: RepairOptions,
): Promise<RepairActionRecord[]> {
  const lsofCheck = opts.lsofCheck ?? defaultLsofCheck;
  const resolveWorktreePath =
    opts.resolveWorktreePath ?? defaultResolveWorktreePath;
  const results: RepairActionRecord[] = [];

  for (const f of opts.findings) {
    if (!f.remediation || !opts.repairActions.includes(f.remediation)) {
      continue;
    }

    const record: RepairActionRecord = {
      action: f.remediation,
      target_path: f.bare_repo_path,
      status: "success",
      reason: "",
    };

    switch (f.remediation) {
      case "delete_stale_locks": {
        const lockPath = (f.metadata?.lock_path as string) || f.bare_repo_path;
        const holder = await lsofCheck(lockPath);
        if (holder !== null && holder !== "unknown_no_lsof") {
          record.status = "skipped";
          record.reason = `holder reappeared: pid ${holder}`;
        } else if (!opts.dryRun) {
          try {
            await unlink(lockPath);
            record.status = "success";
          } catch (err) {
            record.status = "failed";
            record.reason = String(err);
          }
        } else {
          record.status = "success";
          record.reason = "dryRun";
        }
        break;
      }

      case "delete_zero_byte_objects": {
        const objectPath =
          (f.metadata?.object_path as string) || f.bare_repo_path;
        if (!opts.dryRun) {
          try {
            await unlink(objectPath);
            record.status = "success";
          } catch (err) {
            record.status = "failed";
            record.reason = String(err);
          }
        } else {
          record.status = "success";
          record.reason = "dryRun";
        }
        break;
      }

      case "delete_orphan_bare_repos": {
        const wt = await resolveWorktreePath(f.project_id);
        if (wt && (await pathExists(wt))) {
          record.status = "skipped";
          record.reason = "worktree reappeared";
        } else if (!opts.dryRun) {
          try {
            await rm(f.bare_repo_path, { recursive: true, force: true });
            record.status = "success";
          } catch (err) {
            record.status = "failed";
            record.reason = String(err);
          }
        } else {
          record.status = "success";
          record.reason = "dryRun";
        }
        break;
      }

      case "delete_fsck_corrupt_repos": {
        // Safety: re-run fsck on the live repo before deletion so a
        // transient/race-y false positive from the original scan cannot
        // destroy a now-healthy bare repo. Skip the re-check in dryRun
        // so previews are cheap.
        if (opts.dryRun) {
          record.status = "success";
          record.reason = "dryRun";
        } else {
          const liveErrors = await runFsck(f.bare_repo_path);
          if (liveErrors.length === 0) {
            record.status = "skipped";
            record.reason = "fsck now clean";
          } else {
            try {
              await rm(f.bare_repo_path, { recursive: true, force: true });
              record.status = "success";
              record.reason = `removed ${liveErrors.length} fsck error(s) worth of corruption`;
            } catch (err) {
              record.status = "failed";
              record.reason = String(err);
            }
          }
        }
        break;
      }
    }

    results.push(record);
  }

  return results;
}
