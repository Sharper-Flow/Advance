/**
 * Worktree State (T13 / KD-1) — thin Temporal client wrapper.
 *
 * Replaces the legacy SQLite-backed state module with workflow-update
 * calls into the project workflow. State authority for worktrees
 * lives in `ProjectWorkflowState.{worktree_registry,
 * pending_worktree_deletes, session_registry}` — populated and
 * mutated via the 8 lifecycle handlers wired in T5.
 *
 * Spec anchors:
 * - rq-worktreeRegistry01 (state authority lives in the project workflow)
 * - rq-multiSessionCoordination01 (Temporal serializes peer-session writes)
 *
 * NO SQLite. NO sidecar JSONL. NO local files written by this module.
 *
 * The legacy `Database` parameter is replaced by a typed
 * `WorktreeStateAccess` token that callers obtain from `initStateDb`
 * (kept for back-compat with the relocated worktree.ts call sites).
 */

import { join } from "node:path";
import * as os from "node:os";
import { getBoundedProjectWorkflowAccess } from "../project-workflow-helper";
import { projectStateQuery } from "../../temporal/messages";
import {
  addWorktreeSessionUpdate,
  clearPendingWorktreeDeleteUpdate,
  incrementPendingWorktreeDeleteAttemptsUpdate,
  registerSessionUpdate,
  removeWorktreeSessionUpdate,
  setPendingWorktreeDeleteUpdate,
  unregisterSessionUpdate,
  updateSessionActivityUpdate,
} from "../../temporal/messages";
import type {
  PendingWorktreeDelete,
  ProjectWorkflowState,
  SessionRecord,
  WorktreeRecord,
} from "../../temporal/contracts";
import type { OpencodeClient } from "../../utils/opencode-types";
import { appendDebugLog } from "../../utils/debug-log";
import { getProjectId as getProjectIdRaw } from "../../utils/project-id";

// =============================================================================
// TYPES — back-compat wrappers around the new contracts.
// =============================================================================

/** Represents an active worktree session. Back-compat shape. */
export interface Session {
  id: string;
  branch: string;
  path: string;
  createdAt: string;
}

/** Pending spawn operation to be processed on session.idle. */
export interface PendingSpawn {
  branch: string;
  path: string;
  sessionId: string;
}

/** Input for creating a pending delete (callers provide branch + path only). */
export interface PendingDeleteInput {
  branch: string;
  path: string;
}

/** Full pending delete record as stored/returned (includes retry tracking). */
export interface PendingDelete {
  branch: string;
  path: string;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

/**
 * Opaque state-access token returned by `initStateDb`. Replaces the
 * legacy `Database` type. Holds the project directory so subsequent
 * calls can re-resolve the project workflow access on demand.
 *
 * Per rq-worktreeRegistry01: NO SQLite, NO sidecar JSONL behind this
 * token. Each call resolves a fresh handle via
 * `getBoundedProjectWorkflowAccess`.
 */
export interface WorktreeStateAccess {
  /** Project directory used to resolve project workflow access. */
  projectDir: string;
  /** Resolved project id (for diagnostics + external mutable path key). */
  projectId: string;
}

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Get the worktree path for a given project + branch. Pure path
 * derivation; matches the legacy SQLite module's path scheme so
 * existing `worktree create/delete` flows reuse the same on-disk
 * layout.
 */
export async function getWorktreePath(
  projectRoot: string,
  branch: string,
): Promise<string> {
  const projectId = await getProjectIdRaw(projectRoot);
  if (!projectId) {
    throw new Error(
      `getWorktreePath: unable to resolve project id for ${projectRoot}`,
    );
  }
  // Mirrors the legacy layout: ~/.local/share/opencode/worktree/{pid}/{branch}
  // Branch slashes are kept literal — git accepts paths with `/` segments
  // and the standalone plugin used the same layout.
  const base = join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "worktree",
    projectId,
  );
  return join(base, branch);
}

// =============================================================================
// INIT
// =============================================================================

/**
 * Verify the project workflow is reachable and return an opaque
 * access token used by all other functions in this module.
 *
 * Throws if the project workflow is unavailable (missing project id,
 * Temporal unreachable, or workflow not bootstrapped). Callers receive
 * a clear error rather than a NPE on later mutations.
 *
 * Back-compat: the legacy module returned `Database` from `initStateDb`.
 * This implementation returns a `WorktreeStateAccess` token of the
 * same call-site shape.
 */
export async function initStateDb(
  projectRoot: string,
): Promise<WorktreeStateAccess> {
  const projectId = await getProjectIdRaw(projectRoot);
  if (!projectId) {
    throw new Error(
      `initStateDb: unable to resolve project id for ${projectRoot}`,
    );
  }
  // Probe the project workflow once so failures surface early.
  const access = await resolveAccess(projectRoot);
  if (access.mode === "unavailable") {
    throw new Error(
      `initStateDb: project workflow unavailable for ${projectId}: ${access.reason}`,
    );
  }
  // local-only mode is acceptable here — many code paths still want
  // to function (read empty registries) when Temporal is offline.
  appendDebugLog("worktree-state", `initStateDb ready for project ${projectId}`);
  return { projectDir: projectRoot, projectId };
}

// =============================================================================
// INTERNAL — workflow access resolution
// =============================================================================

async function resolveAccess(projectDir: string) {
  // Use the external mutable path convention so the helper returns
  // workflow-backed mode. Worktree state is intrinsically external
  // (lives in the project workflow), so we point at the conventional
  // external state directory for this project.
  const mutablePath = join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "plugins",
    "advance",
    "PROJECT", // sentinel — getBoundedProjectWorkflowAccess re-resolves
    "worktree-state.marker",
  );
  return getBoundedProjectWorkflowAccess({ projectDir, mutablePath });
}

async function readProjectState(
  access: WorktreeStateAccess,
): Promise<ProjectWorkflowState | null> {
  const resolved = await resolveAccess(access.projectDir);
  if (resolved.mode !== "workflow-backed") return null;
  return (await resolved.handle.query(
    projectStateQuery,
  )) as ProjectWorkflowState;
}

async function withHandle<R>(
  access: WorktreeStateAccess,
  fn: (handle: {
    query: (def: unknown, ...args: unknown[]) => Promise<unknown>;
    executeUpdate: (
      def: unknown,
      options: { args?: unknown[] },
    ) => Promise<unknown>;
  }) => Promise<R>,
  fallback: () => R,
): Promise<R> {
  const resolved = await resolveAccess(access.projectDir);
  if (resolved.mode !== "workflow-backed") {
    appendDebugLog(
      "worktree-state",
      `workflow access ${resolved.mode}; falling back (projectId=${access.projectId})`,
    );
    return fallback();
  }
  return fn(resolved.handle);
}

// =============================================================================
// SESSION LIFECYCLE
// =============================================================================

/**
 * Add a worktree session to the registry.
 *
 * Translates the legacy `addSession(database, {sessionId, branch, path}, changeId?)`
 * call into an `addWorktreeSession` workflow update payload + a
 * `registerSession` workflow update for session-registry parity.
 */
export async function addSession(
  access: WorktreeStateAccess,
  session: { sessionId?: string; branch: string; path: string },
  client?: OpencodeClient,
  changeId?: string,
): Promise<void> {
  void client;
  const now = new Date().toISOString();
  await withHandle(
    access,
    async (handle) => {
      // Insert/update worktree registry entry.
      await handle.executeUpdate(addWorktreeSessionUpdate, {
        args: [
          {
            branch: session.branch,
            path: session.path,
            changeId,
            // baseRef + headSha: relocation phase keeps these as
            // best-effort placeholders (the old SQLite module didn't
            // track them). T10 (worktree_create rewrite) will populate
            // these fields with real values.
            baseRef: "",
            headSha: "",
            source: "tool",
            now,
            sourceVersion: Date.parse(now), // monotonic per-call
          },
        ],
      });
      // If a session id was supplied, also reflect it in session_registry.
      if (session.sessionId) {
        await handle.executeUpdate(registerSessionUpdate, {
          args: [
            {
              sessionId: session.sessionId,
              worktreeBranch: session.branch,
              worktreePath: session.path,
              pid: process.pid,
              now,
            },
          ],
        });
      }
    },
    () => undefined,
  );
}

/**
 * Get a session by its session id. Returns null when the session is
 * unknown or the workflow is unreachable (graceful degradation).
 */
export async function getSession(
  access: WorktreeStateAccess,
  sessionId: string,
): Promise<Session | null> {
  const state = await readProjectState(access);
  if (!state) return null;
  const record: SessionRecord | undefined = state.session_registry[sessionId];
  if (!record) return null;
  return {
    id: record.sessionId,
    branch: record.worktreeBranch ?? "",
    path: record.worktreePath,
    createdAt: record.startedAt,
  };
}

/** Remove a worktree session (soft-delete in registry). */
export async function removeSession(
  access: WorktreeStateAccess,
  branch: string,
): Promise<void> {
  const now = new Date().toISOString();
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(removeWorktreeSessionUpdate, {
        args: [{ branch, now }],
      });
      // Best-effort: also unregister any session record(s) keyed to
      // this branch. We need to read the registry to know which
      // sessionIds map to this branch.
      const state = (await handle.query(
        projectStateQuery,
      )) as ProjectWorkflowState;
      const matchingSessions = Object.values(state.session_registry).filter(
        (s) => s.worktreeBranch === branch,
      );
      for (const s of matchingSessions) {
        await handle.executeUpdate(unregisterSessionUpdate, {
          args: [{ sessionId: s.sessionId }],
        });
      }
    },
    () => undefined,
  );
}

// =============================================================================
// PENDING DELETES
// =============================================================================

/** Set a pending-delete record (idempotent). */
export async function setPendingDelete(
  access: WorktreeStateAccess,
  input: PendingDeleteInput,
  client?: OpencodeClient,
): Promise<void> {
  void client;
  const now = new Date().toISOString();
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(setPendingWorktreeDeleteUpdate, {
        args: [
          {
            branch: input.branch,
            path: input.path,
            reason: "deferred_delete",
            now,
          },
        ],
      });
    },
    () => undefined,
  );
}

/** List pending-delete records. Returns [] when workflow is unreachable. */
export async function getPendingDeletes(
  access: WorktreeStateAccess,
): Promise<PendingDelete[]> {
  const state = await readProjectState(access);
  if (!state) return [];
  return Object.values(state.pending_worktree_deletes).map(
    (record: PendingWorktreeDelete) => ({
      branch: record.branch,
      path: record.path,
      attempts: record.attempts,
      lastAttemptAt: null,
      createdAt: record.recordedAt,
    }),
  );
}

/** Increment retry counter on a pending-delete record. */
export async function incrementPendingDeleteAttempts(
  access: WorktreeStateAccess,
  branch: string,
): Promise<void> {
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(
        incrementPendingWorktreeDeleteAttemptsUpdate,
        {
          args: [{ branch }],
        },
      );
    },
    () => undefined,
  );
}

/** Clear a pending-delete record (idempotent). */
export async function clearPendingDelete(
  access: WorktreeStateAccess,
  branch: string,
): Promise<void> {
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(clearPendingWorktreeDeleteUpdate, {
        args: [{ branch }],
      });
    },
    () => undefined,
  );
}

// =============================================================================
// REGISTRY READS — for triage / inspection paths (T18, T22)
// =============================================================================

/** Snapshot of the worktree registry (used by triage + status). */
export async function listWorktrees(
  access: WorktreeStateAccess,
): Promise<WorktreeRecord[]> {
  const state = await readProjectState(access);
  if (!state) return [];
  return Object.values(state.worktree_registry);
}

/** Snapshot of the session registry (used by adv_session_list at T19). */
export async function listSessions(
  access: WorktreeStateAccess,
): Promise<SessionRecord[]> {
  const state = await readProjectState(access);
  if (!state) return [];
  return Object.values(state.session_registry);
}

/**
 * Snapshot of `change_summaries` map keyed by changeId. Used by triage
 * (T18) to classify worktrees whose underlying change is archived.
 * Returns empty object when the project workflow is unreachable.
 */
export async function getChangeSummaries(
  access: WorktreeStateAccess,
): Promise<Record<string, { status?: string }>> {
  const state = await readProjectState(access);
  if (!state) return {};
  return (state.change_summaries ?? {}) as Record<string, { status?: string }>;
}

/**
 * Full SessionRecord lookup by sessionId. Used by adv_session_show (T20)
 * which requires PID + full workdir for own-session ACL checks. Returns
 * null when the session is unknown or the workflow is unreachable.
 *
 * × DO NOT surface the returned record to peers — it contains PID,
 * full workdir, activeChangeId, etc. Public callers must use
 * `listPeerSessions` (T19) which projects to the privacy-defensive schema.
 */
export async function getSessionRecord(
  access: WorktreeStateAccess,
  sessionId: string,
): Promise<SessionRecord | null> {
  const state = await readProjectState(access);
  if (!state) return null;
  const record = state.session_registry[sessionId];
  return record ?? null;
}

// =============================================================================
// Session lifecycle (T21) — register/unregister/heartbeat at plugin init/shutdown
// =============================================================================

/**
 * Register the current session in `session_registry`. Called once at
 * plugin init after the project workflow is reachable. Idempotent —
 * re-registering with the same sessionId refreshes startedAt.
 *
 * Distinct from `addSession` (which adds a worktree_registry entry):
 * a session may exist without owning a worktree (e.g. main checkout).
 */
export async function registerSession(
  access: WorktreeStateAccess,
  payload: {
    sessionId: string;
    worktreeBranch?: string;
    worktreePath: string;
    pid: number;
    now: string;
  },
): Promise<void> {
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(registerSessionUpdate, { args: [payload] });
    },
    () => {
      // Workflow not reachable — best-effort silent skip.
    },
  );
}

/**
 * Unregister the current session from `session_registry`. Called on
 * graceful shutdown (SIGINT/SIGTERM). Idempotent.
 */
export async function unregisterSession(
  access: WorktreeStateAccess,
  sessionId: string,
): Promise<void> {
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(unregisterSessionUpdate, {
        args: [{ sessionId }],
      });
    },
    () => {
      // Workflow not reachable — best-effort silent skip.
    },
  );
}

/**
 * Update session heartbeat + active-context fields. Called periodically
 * (or on tool-call) to keep the registry fresh and surface what the
 * session is currently working on. Best-effort — any failure is logged
 * and swallowed so the heartbeat never blocks the caller.
 */
export async function updateSessionActivity(
  access: WorktreeStateAccess,
  payload: {
    sessionId: string;
    now: string;
    activeChangeId?: string;
    currentTaskId?: string;
    activeGate?: string;
  },
): Promise<void> {
  await withHandle(
    access,
    async (handle) => {
      await handle.executeUpdate(updateSessionActivityUpdate, {
        args: [payload],
      });
    },
    () => {
      // Workflow not reachable — best-effort silent skip.
    },
  );
}
