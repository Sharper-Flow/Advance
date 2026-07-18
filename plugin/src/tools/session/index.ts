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
 * Live peer sessions are sourced from the Linux `/proc` scanner
 * (`detectPeerSessions`) and projected without PID/full-path leakage. Dead
 * or PID-reused entries are filtered via start-tick comparison.
 *
 * Citations: rq-multiSessionFraming01, rq-worktreeRegistry01.
 */

import { basename } from "path";
import { createHash } from "node:crypto";
import { z } from "zod";

import {
  initStateDb,
  getSessionRecord,
  type WorktreeStateAccess,
} from "../worktree/state";
import { isProcessAlive as isProcessAliveByPid } from "../../utils/process-liveness";
import { detectPeerSessions, type PeerInfo } from "../../utils/peer-sessions";
import {
  readProcessStartTicks,
  readBootTimeMs,
  processStartTimeMs,
  isProcessAlive as isProcessAliveByStartTicks,
} from "../../migration/procfs";

// =============================================================================
// PID liveness
// =============================================================================

/**
 * Returns true when the PID corresponds to a running process.
 *
 * Re-exported from the shared `process-liveness` helper so session listing,
 * worktree leases, and worker-lock reclaim share one fail-safe contract
 * (ESRCH → dead; EPERM/other → alive). See rq-worktreeLeaseLiveness01.
 */
export const isPidAlive = isProcessAliveByPid;

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
   * Set when the peer detector is unavailable (non-Linux or /proc scan
   * failure); consumers should surface "Peer Sessions: unavailable".
   */
  unavailable?: true;
}

// =============================================================================
// Opaque session identity
// =============================================================================

function deriveSessionId(pid: number, startTicks: string | null): string {
  const entropy = startTicks ? `${pid}:${startTicks}` : `${pid}:unknown`;
  return (
    "sess_" + createHash("sha256").update(entropy).digest("hex").slice(0, 8)
  );
}

// =============================================================================
// Internal projection
// =============================================================================

function projectPeerSession(
  pid: number,
  cwd: string,
  isSelf: boolean,
  startTicks: string | null,
  bootTimeMs: number | null,
): SessionListEntry {
  const startedAt =
    startTicks && bootTimeMs
      ? new Date(processStartTimeMs(startTicks, { bootTimeMs })).toISOString()
      : new Date().toISOString();
  const now = new Date().toISOString();

  return {
    sessionId: deriveSessionId(pid, startTicks),
    startedAt,
    worktree: basename(cwd),
    isSelf,
    lastSeenAt: now,
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
 * Sources live peers from the Linux `/proc` scanner (`detectPeerSessions`),
 * includes the caller's own session first, and projects privacy-defensive
 * entries. Non-Linux platforms or /proc scan failures degrade to
 * `unavailable: true` rather than throwing.
 *
 * Test seams:
 *   - `selfPid` injects the caller's PID (defaults to `process.pid`)
 */
export async function listPeerSessions(
  args: AdvSessionListArgs,
  opts: {
    accessOverride?: WorktreeStateAccess; // unused; kept for call-site compatibility
    selfPid?: number;
  } = {},
): Promise<SessionListResult> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const selfPid = opts.selfPid ?? process.pid;

  if (process.platform !== "linux") {
    return { sessions: [], total: 0, deadFiltered: 0, unavailable: true };
  }

  let peers: PeerInfo[];
  try {
    peers = await detectPeerSessions(projectRoot);
  } catch {
    return { sessions: [], total: 0, deadFiltered: 0, unavailable: true };
  }

  const bootTimeMs = readBootTimeMs();
  let deadFiltered = 0;
  const alive: SessionListEntry[] = [];

  // The detector excludes the current process; add the self entry explicitly.
  const selfStartTicks = readProcessStartTicks(selfPid);
  if (!isProcessAliveByStartTicks(selfPid, { startTicks: selfStartTicks })) {
    deadFiltered += 1;
  } else {
    alive.push(
      projectPeerSession(
        selfPid,
        projectRoot,
        true,
        selfStartTicks,
        bootTimeMs,
      ),
    );
  }

  for (const peer of peers) {
    // Scan-time startTicks is the only identity-continuity proof we have for a
    // peer. If the detector failed to capture it, a fresh read now could accept a
    // PID-reused process, so treat the peer as unverifiable and omit it.
    const startTicks = peer.startTicks;
    if (startTicks == null) {
      deadFiltered += 1;
      continue;
    }
    if (!isProcessAliveByStartTicks(peer.pid, { startTicks })) {
      deadFiltered += 1;
      continue;
    }
    alive.push(
      projectPeerSession(peer.pid, peer.cwd, false, startTicks, bootTimeMs),
    );
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
