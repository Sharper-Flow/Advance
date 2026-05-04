/**
 * Migration script (T8): auto + bidirectional reconciliation + stale session sweep.
 *
 * Implements migrateAndReconcile with 4 sequential steps:
 * 1. Project workflow precondition (KD-1)
 * 2. SQLite → Temporal migration (idempotent, reversible)
 * 3. Bidirectional git worktree reconciliation
 * 4. Stale session registry sweep (KD-4)
 *
 * Spec anchors: KD-9, A10, KD-1, KD-4.
 */

import { execFile } from "child_process";
import { existsSync } from "fs";
import { rename } from "fs/promises";
import { join } from "path";

import {
  assertProjectWorkflowReachable,
  WorkflowNotReadyError,
} from "../../temporal/contracts";
import type { ProjectWorkflowState } from "../../temporal/contracts";
import {
  addWorktreeSessionUpdate,
  projectStateQuery,
  setPendingWorktreeDeleteUpdate,
} from "../../temporal/messages";
import { getBoundedProjectWorkflowAccess } from "../project-workflow-helper";
import { isPidAlive } from "../session/index";
import { getDataHome, getExternalRoot } from "../../utils/project-id";
import {
  addSession,
  inferChangeIdFromBranch,
  initStateDb,
  listSessions,
  listWorktrees,
  unregisterSession,
  type WorktreeStateAccess,
} from "./state";

// =============================================================================
// Types
// =============================================================================

export interface MigrationResult {
  workflowPresent: boolean;
  sqlite: {
    found: boolean;
    migratedRows?: number;
    backupPath?: string;
    skippedReason?: string;
  };
  reconciliation: {
    adopted: Array<{ branch: string; path: string }>;
    flaggedMissing: Array<{ branch: string; path: string }>;
    mismatches: Array<{
      branch: string;
      diskPath: string;
      registryPath: string;
    }>;
  };
  staleSessionsSwept: Array<{
    sessionId: string;
    pid: number;
    lastSeenAt: string;
  }>;
  dryRun: boolean;
}

// =============================================================================
// Step 1 helpers — project workflow precondition
// =============================================================================

async function readProjectState(
  access: WorktreeStateAccess,
): Promise<ProjectWorkflowState | null> {
  const mutablePath = join(
    getExternalRoot(access.projectId),
    "worktree-state.marker",
  );
  const resolved = await getBoundedProjectWorkflowAccess({
    projectDir: access.projectDir,
    mutablePath,
  });
  if (resolved.mode !== "workflow-backed") return null;
  return (await resolved.handle.query(
    projectStateQuery,
  )) as ProjectWorkflowState;
}

// =============================================================================
// Step 2 helpers — legacy SQLite read
// =============================================================================

export async function readLegacySessions(
  sqlitePath: string,
): Promise<
  Array<{ id: string; branch: string; path: string; createdAt: string }>
> {
  try {
    // Keep the Bun-only module out of Node/Vitest static resolution while
    // preserving the exact runtime specifier for OpenCode's Bun executable.
    const specifier = "bun:" + "sqlite";
    const sqlite = await import(specifier);
    const db = new sqlite.Database(sqlitePath, { readonly: true });
    const rows = db
      .query("SELECT id, branch, path, createdAt FROM sessions")
      .all();
    return rows as Array<{
      id: string;
      branch: string;
      path: string;
      createdAt: string;
    }>;
  } catch {
    return [];
  }
}

// =============================================================================
// Step 3 helpers — git worktree list parser
// =============================================================================

export async function parseGitWorktreeList(
  projectRoot: string,
): Promise<Array<{ path: string; branch?: string; head?: string }>> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["worktree", "list", "--porcelain"],
      {
        cwd: projectRoot,
        timeout: 10000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const worktrees: Array<{
          path: string;
          branch?: string;
          head?: string;
        }> = [];
        const lines = stdout.split("\n");
        let current: {
          path: string;
          branch?: string;
          head?: string;
        } | null = null;

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            if (current) worktrees.push(current);
            current = { path: line.slice("worktree ".length) };
          } else if (line.startsWith("HEAD ")) {
            if (current) current.head = line.slice("HEAD ".length);
          } else if (line.startsWith("branch ")) {
            if (current) {
              current.branch = line.slice("branch refs/heads/".length);
            }
          } else if (line.trim() === "" && current) {
            worktrees.push(current);
            current = null;
          }
        }
        if (current) worktrees.push(current);

        resolve(worktrees);
      },
    );
  });
}

// =============================================================================
// Step 3 helpers — direct workflow update helpers
// =============================================================================

async function addGitCensusWorktree(
  access: WorktreeStateAccess,
  payload: { branch: string; path: string },
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const mutablePath = join(
    getExternalRoot(access.projectId),
    "worktree-state.marker",
  );
  const resolved = await getBoundedProjectWorkflowAccess({
    projectDir: access.projectDir,
    mutablePath,
  });
  if (resolved.mode !== "workflow-backed") return;
  const now = new Date().toISOString();
  await resolved.handle.executeUpdate(addWorktreeSessionUpdate, {
    args: [
      {
        branch: payload.branch,
        path: payload.path,
        changeId: inferChangeIdFromBranch(payload.branch),
        baseRef: "",
        headSha: "",
        source: "git_census",
        now,
        sourceVersion: Date.parse(now),
      },
    ],
  });
}

async function flagMissingWorktree(
  access: WorktreeStateAccess,
  input: { branch: string; path: string; reason: string },
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const mutablePath = join(
    getExternalRoot(access.projectId),
    "worktree-state.marker",
  );
  const resolved = await getBoundedProjectWorkflowAccess({
    projectDir: access.projectDir,
    mutablePath,
  });
  if (resolved.mode !== "workflow-backed") return;
  const now = new Date().toISOString();
  await resolved.handle.executeUpdate(setPendingWorktreeDeleteUpdate, {
    args: [
      {
        branch: input.branch,
        path: input.path,
        reason: input.reason,
        now,
      },
    ],
  });
}

// =============================================================================
// Main entry point
// =============================================================================

export async function migrateAndReconcile(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const dryRun = opts.dryRun ?? false;

  // Step 1: Project workflow precondition
  let access: WorktreeStateAccess;
  try {
    access = await initStateDb(projectRoot);
  } catch {
    throw new WorkflowNotReadyError([
      "worktree_registry",
      "pending_worktree_deletes",
      "session_registry",
    ]);
  }

  const state = await readProjectState(access);
  assertProjectWorkflowReachable(state);

  const result: MigrationResult = {
    workflowPresent: true,
    sqlite: { found: false },
    reconciliation: { adopted: [], flaggedMissing: [], mismatches: [] },
    staleSessionsSwept: [],
    dryRun,
  };

  // Step 2: SQLite → Temporal migration
  const sqlitePath = join(
    getDataHome(),
    "opencode",
    "plugins",
    "worktree",
    `${access.projectId}.sqlite`,
  );
  const backupPath = `${sqlitePath}.bak`;

  if (existsSync(sqlitePath)) {
    result.sqlite.found = true;
    if (existsSync(backupPath)) {
      result.sqlite.skippedReason = "backup_already_exists";
    } else {
      const rows = await readLegacySessions(sqlitePath);
      if (!dryRun) {
        for (const row of rows) {
          await addSession(
            access,
            {
              sessionId: row.id,
              branch: row.branch,
              path: row.path,
            },
            undefined,
            inferChangeIdFromBranch(row.branch),
          );
        }
        await rename(sqlitePath, backupPath);
      }
      result.sqlite.migratedRows = rows.length;
      result.sqlite.backupPath = backupPath;
    }
  } else if (existsSync(backupPath)) {
    result.sqlite.found = true;
    result.sqlite.skippedReason = "backup_already_exists";
  }

  // Step 3: Bidirectional git worktree reconciliation
  const diskWorktrees = await parseGitWorktreeList(projectRoot);
  const registryWorktrees = await listWorktrees(access);

  const diskMap = new Map(
    diskWorktrees.filter((w) => w.branch).map((w) => [w.branch!, w]),
  );
  const registryMap = new Map(registryWorktrees.map((w) => [w.branch, w]));

  // Adopt disk-only entries on change/* branches
  for (const disk of diskWorktrees) {
    if (!disk.branch?.startsWith("change/")) continue;
    const registry = registryMap.get(disk.branch);
    if (!registry) {
      await addGitCensusWorktree(
        access,
        { branch: disk.branch, path: disk.path },
        dryRun,
      );
      result.reconciliation.adopted.push({
        branch: disk.branch,
        path: disk.path,
      });
    } else if (registry.path !== disk.path) {
      result.reconciliation.mismatches.push({
        branch: disk.branch,
        diskPath: disk.path,
        registryPath: registry.path,
      });
    }
  }

  // Flag registry-only entries
  for (const registry of registryWorktrees) {
    if (!diskMap.has(registry.branch)) {
      await flagMissingWorktree(
        access,
        {
          branch: registry.branch,
          path: registry.path,
          reason: "disk_missing",
        },
        dryRun,
      );
      result.reconciliation.flaggedMissing.push({
        branch: registry.branch,
        path: registry.path,
      });
    }
  }

  // Step 4: Stale session registry sweep
  const sessions = await listSessions(access);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const session of sessions) {
    const lastSeenMs = new Date(session.lastSeenAt).getTime();
    if (lastSeenMs < oneHourAgo && !isPidAlive(session.pid)) {
      if (!dryRun) {
        await unregisterSession(access, session.sessionId);
      }
      result.staleSessionsSwept.push({
        sessionId: session.sessionId,
        pid: session.pid,
        lastSeenAt: session.lastSeenAt,
      });
    }
  }

  return result;
}
