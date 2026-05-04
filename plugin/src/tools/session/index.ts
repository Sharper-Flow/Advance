/**
 * Session Tools (T19, T20 — KD-4 privacy-defensive).
 *
 * Two tools:
 *   - `adv_session_list` — peer sessions via privacy-defensive schema
 *   - `adv_session_show` — own-session-only details (lives in T20)
 *
 * Privacy contract (KD-4 + T3):
 *   - Public schema (`SessionListEntry`) exposes ONLY:
 *       sessionId (opaque), startedAt (ISO 8601), worktree (basename),
 *       isSelf (boolean for caller's own session).
 *   - PID, full workdir, activeChangeId, currentTaskId, activeGate are
 *     INTERNAL ONLY — leaked nowhere except own-session via `adv_session_show`.
 *
 * PID-liveness filter:
 *   - Each session entry's pid is checked via `process.kill(pid, 0)`.
 *   - Dead pids → entry omitted from output. Async cleanup is the
 *     responsibility of the periodic stale-session sweep (T8 migration);
 *     `adv_session_list` does not initiate workflow updates from a read.
 *
 * Citations: rq-multiSessionFraming01, rq-worktreeRegistry01.
 */

import { basename } from "path";
import { z } from "zod";

import {
  initStateDb,
  listSessions,
  getSessionRecord,
  type WorktreeStateAccess,
} from "../worktree/state";
import type { SessionRecord } from "../../temporal/contracts";

// =============================================================================
// PID liveness
// =============================================================================

/**
 * Returns true when the PID corresponds to a running process.
 *
 * - alive (signal 0 succeeds) → true
 * - ESRCH (no such process) → false
 * - EPERM (process exists but not ours) → true (treat as alive)
 * - any other error → true (conservative: avoid filtering live peers)
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return true;
  }
}

// =============================================================================
// Public types
// =============================================================================

/**
 * Privacy-defensive projection of a session_registry entry. Used by
 * `adv_session_list` and the Peer Sessions section in `adv_status`.
 */
export interface SessionListEntry {
  /** Opaque session id (`sess_<8 alphanumeric>`). */
  sessionId: string;
  /** ISO 8601 session start time. */
  startedAt: string;
  /** Worktree directory basename only — full path is internal. */
  worktree: string;
  /** True when this entry represents the caller's own session. */
  isSelf: boolean;
  /** ISO 8601 time when the session was last observed active. Optional in v1. */
  lastSeenAt?: string;
}

export interface SessionListResult {
  sessions: SessionListEntry[];
  /** Total count after dead-PID filter. */
  total: number;
  /**
   * Number of entries filtered as dead PIDs. Surfaced for diagnostics
   * and to inform the user that drift is expected and harmless.
   */
  deadFiltered: number;
  /**
   * Set when the project workflow is unreachable; consumers should
   * surface "Peer Sessions: unavailable (project workflow not reachable)".
   */
  unavailable?: true;
}

// =============================================================================
// Internal projection
// =============================================================================

export function projectSession(
  record: SessionRecord,
  selfPid: number,
): SessionListEntry {
  return {
    sessionId: record.sessionId,
    startedAt: record.startedAt,
    worktree: basename(record.worktreePath || ""),
    isSelf: record.pid === selfPid,
    lastSeenAt: record.lastSeenAt || record.startedAt,
  };
}

// =============================================================================
// Tool handler
// =============================================================================

export const advSessionListArgs = z.object({
  /**
   * Optional override for the project root. Defaults to `process.cwd()`.
   * Cross-project session listing is NOT supported in v1 — this argument
   * is reserved for future expansion.
   */
  projectRoot: z.string().optional(),
});

export type AdvSessionListArgs = z.infer<typeof advSessionListArgs>;

/**
 * Implementation entry point for `adv_session_list`.
 *
 * Test seams:
 *   - `accessOverride` injects a `WorktreeStateAccess` (skips initStateDb)
 *   - `liveness` injects a custom PID-liveness predicate
 *   - `selfPid` injects the caller's PID (defaults to `process.pid`)
 */
export async function listPeerSessions(
  args: AdvSessionListArgs,
  opts: {
    accessOverride?: WorktreeStateAccess;
    liveness?: (pid: number) => boolean;
    selfPid?: number;
  } = {},
): Promise<SessionListResult> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const liveness = opts.liveness ?? isPidAlive;
  const selfPid = opts.selfPid ?? process.pid;

  let access: WorktreeStateAccess;
  try {
    access = opts.accessOverride ?? (await initStateDb(projectRoot));
  } catch {
    return { sessions: [], total: 0, deadFiltered: 0, unavailable: true };
  }

  const records = await listSessions(access);
  let deadFiltered = 0;
  const alive: SessionListEntry[] = [];
  for (const record of records) {
    if (!liveness(record.pid)) {
      deadFiltered += 1;
      continue;
    }
    alive.push(projectSession(record, selfPid));
  }

  // Stable order: own session first, then others by startedAt ascending.
  alive.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.startedAt.localeCompare(b.startedAt);
  });

  return { sessions: alive, total: alive.length, deadFiltered };
}

// =============================================================================
// adv_session_show (T20)
// =============================================================================

/**
 * Detail returned for an own-session lookup. Includes PID, full workdir,
 * and active workflow context — these MUST NOT leak to peers.
 */
export interface SessionDetail {
  sessionId: string;
  pid: number;
  workdir: string;
  startedAt: string;
  lastSeenAt: string;
  activeChangeId?: string;
  currentTaskId?: string;
  activeGate?: string;
}

export type SessionShowError =
  | { error: "SESSION_NOT_FOUND" }
  | {
      error: "ACCESS_DENIED";
      reason: "pid_mismatch" | "non_self_peer" | "workflow_unavailable";
    };

export type SessionShowResult = SessionDetail | SessionShowError;

export const advSessionShowArgs = z.object({
  sessionId: z.string().describe("Opaque session id (sess_<8 alphanumeric>)"),
  projectRoot: z.string().optional(),
});

export type AdvSessionShowArgs = z.infer<typeof advSessionShowArgs>;

/**
 * Implementation of `adv_session_show` with **2-factor ACL**:
 *
 *   Factor 1 — PID match: the requested session's `pid` must equal the
 *              caller's `process.pid`. Anything else returns `ACCESS_DENIED`.
 *   Factor 2 — own-session sentinel: when `currentSessionId` is supplied
 *              (caller's known own session id) and does not match the
 *              requested sessionId, deny even on PID match. This guards
 *              the PID-spoof edge case where two sessions briefly share
 *              a recycled PID.
 *
 * × MUST NOT support arbitrary peer lookup. There is no `force` override.
 *
 * Test seams: `accessOverride`, `selfPid`, `currentSessionId`.
 */
export async function showOwnSession(
  args: AdvSessionShowArgs,
  opts: {
    accessOverride?: WorktreeStateAccess;
    selfPid?: number;
    /**
     * Caller's own session id, if known. When supplied and the requested
     * sessionId differs, the call is denied even if PID happens to match.
     * Defaults to undefined (Factor 2 skipped — Factor 1 is sufficient).
     */
    currentSessionId?: string;
  } = {},
): Promise<SessionShowResult> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const selfPid = opts.selfPid ?? process.pid;

  let access: WorktreeStateAccess;
  try {
    access = opts.accessOverride ?? (await initStateDb(projectRoot));
  } catch {
    return { error: "ACCESS_DENIED", reason: "workflow_unavailable" };
  }

  const record = await getSessionRecord(access, args.sessionId);
  if (!record) return { error: "SESSION_NOT_FOUND" };

  // Factor 1: PID match.
  if (record.pid !== selfPid) {
    return { error: "ACCESS_DENIED", reason: "pid_mismatch" };
  }

  // Factor 2: own-session sentinel (optional, defense-in-depth).
  if (
    opts.currentSessionId !== undefined &&
    opts.currentSessionId !== args.sessionId
  ) {
    return { error: "ACCESS_DENIED", reason: "non_self_peer" };
  }

  return {
    sessionId: record.sessionId,
    pid: record.pid,
    workdir: record.worktreePath,
    startedAt: record.startedAt,
    lastSeenAt: record.lastSeenAt,
    activeChangeId: record.activeChangeId,
    currentTaskId: record.currentTaskId,
    activeGate: record.activeGate,
  };
}
