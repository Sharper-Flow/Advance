/**
 * Worktree Lease Protocol — one-writer-per-worktree coordination.
 *
 * Lease state keyed by canonical worktree path, stored as JSON files
 * in the ADV external state directory under `leases/`.
 *
 * Each lease record tracks: PID, sessionId, acquiredAt, heartbeatAt.
 * Liveness is determined by heartbeat freshness and (optionally) PID existence.
 */

import * as fs from "fs";
import * as path from "path";
import { isProcessAlive } from "./process-liveness";

// ── Types ──────────────────────────────────────────────────────────────

export interface LeaseRecord {
  /** OS process ID of the lease holder */
  pid: number;
  /** OpenCode session ID */
  sessionId: string;
  /** Timestamp (ms) when lease was acquired */
  acquiredAt: number;
  /** Timestamp (ms) of last heartbeat */
  heartbeatAt: number;
}

export interface AcquireLeaseInput {
  leasesDir: string;
  worktreePath: string;
  pid: number;
  sessionId: string;
  staleHeartbeatMs: number;
}

export interface AcquireLeaseResult {
  status: "acquired" | "blocked";
  lease?: LeaseRecord;
  existingLease?: LeaseRecord;
}

export interface ReclaimStaleLeaseInput {
  leasesDir: string;
  worktreePath: string;
  newPid: number;
  newSessionId: string;
  staleHeartbeatMs: number;
  /** When true, also reclaim if the PID is not alive (even if heartbeat is fresh) */
  allowDeadPidReclaim?: boolean;
}

export interface ReclaimStaleLeaseResult {
  status: "reclaimed" | "blocked";
  previousLease?: LeaseRecord;
  newLease: LeaseRecord;
}

export interface RefreshHeartbeatInput {
  leasesDir: string;
  worktreePath: string;
  pid: number;
}

export interface ReleaseLeaseInput {
  leasesDir: string;
  worktreePath: string;
  pid: number;
}

export interface CheckLeaseInput {
  leasesDir: string;
  worktreePath: string;
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Sanitize worktree path to a safe filename. Uses basename of last
 *  segment for legibility, with a hash suffix for uniqueness. */
function leaseFileName(worktreePath: string): string {
  const basename = path.basename(worktreePath);
  // Simple hash from path for uniqueness
  let hash = 0;
  for (let i = 0; i < worktreePath.length; i++) {
    const c = worktreePath.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  const hashStr = Math.abs(hash).toString(36).slice(0, 8);
  return `${basename}-${hashStr}.json`;
}

/** @internal Exported for testing — resolves lease file path from worktree path. */
export function leaseFilePath(leasesDir: string, worktreePath: string): string {
  return path.join(leasesDir, leaseFileName(worktreePath));
}

function readLeaseFile(filePath: string): LeaseRecord | null {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data) as LeaseRecord;
  } catch {
    return null;
  }
}

function writeLeaseFile(filePath: string, record: LeaseRecord): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(record, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmpFile, filePath);
}

function deleteLeaseFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function acquireLease(input: AcquireLeaseInput): AcquireLeaseResult {
  const { leasesDir, worktreePath, pid, sessionId, staleHeartbeatMs } = input;
  const filePath = leaseFilePath(leasesDir, worktreePath);

  const existing = readLeaseFile(filePath);
  if (existing) {
    // Same PID: idempotent re-acquire (refresh)
    if (existing.pid === pid) {
      const updated: LeaseRecord = {
        ...existing,
        heartbeatAt: Date.now(),
        sessionId,
      };
      writeLeaseFile(filePath, updated);
      return { status: "acquired", lease: updated };
    }

    // Different PID: check if stale
    const now = Date.now();
    const heartbeatAge = now - existing.heartbeatAt;
    if (heartbeatAge < staleHeartbeatMs) {
      return { status: "blocked", existingLease: existing };
    }

    // Stale: allow overwrite (implicit reclaim)
    // Fall through to create new lease
  }

  const record: LeaseRecord = {
    pid,
    sessionId,
    acquiredAt: Date.now(),
    heartbeatAt: Date.now(),
  };
  writeLeaseFile(filePath, record);
  return { status: "acquired", lease: record };
}

export function refreshHeartbeat(input: RefreshHeartbeatInput): boolean {
  const { leasesDir, worktreePath, pid } = input;
  const filePath = leaseFilePath(leasesDir, worktreePath);

  const existing = readLeaseFile(filePath);
  if (!existing || existing.pid !== pid) return false;

  existing.heartbeatAt = Date.now();
  writeLeaseFile(filePath, existing);
  return true;
}

export function reclaimStaleLease(
  input: ReclaimStaleLeaseInput,
): ReclaimStaleLeaseResult {
  const {
    leasesDir,
    worktreePath,
    newPid,
    newSessionId,
    staleHeartbeatMs,
    allowDeadPidReclaim = false,
  } = input;
  const filePath = leaseFilePath(leasesDir, worktreePath);

  const existing = readLeaseFile(filePath);
  if (!existing) {
    // No existing lease: just acquire
    const record: LeaseRecord = {
      pid: newPid,
      sessionId: newSessionId,
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    writeLeaseFile(filePath, record);
    return { status: "reclaimed", newLease: record };
  }

  // Check heartbeat staleness
  const now = Date.now();
  const heartbeatAge = now - existing.heartbeatAt;
  if (heartbeatAge >= staleHeartbeatMs) {
    const previous = { ...existing };
    const record: LeaseRecord = {
      pid: newPid,
      sessionId: newSessionId,
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    writeLeaseFile(filePath, record);
    return { status: "reclaimed", previousLease: previous, newLease: record };
  }

  // Check PID liveness (if enabled). isProcessAlive is fail-safe: EPERM and
  // unknown probe errors are treated as alive so a live peer's lease is never
  // reclaimed on a multi-user host (rq-worktreeLeaseLiveness01).
  if (allowDeadPidReclaim && !isProcessAlive(existing.pid)) {
    const previous = { ...existing };
    const record: LeaseRecord = {
      pid: newPid,
      sessionId: newSessionId,
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    writeLeaseFile(filePath, record);
    return { status: "reclaimed", previousLease: previous, newLease: record };
  }

  return { status: "blocked", newLease: existing };
}

export function releaseLease(input: ReleaseLeaseInput): boolean {
  const { leasesDir, worktreePath, pid } = input;
  const filePath = leaseFilePath(leasesDir, worktreePath);

  const existing = readLeaseFile(filePath);
  if (!existing || existing.pid !== pid) return false;

  deleteLeaseFile(filePath);
  return true;
}

export function checkLease(input: CheckLeaseInput): LeaseRecord | null {
  const filePath = leaseFilePath(input.leasesDir, input.worktreePath);
  return readLeaseFile(filePath);
}
