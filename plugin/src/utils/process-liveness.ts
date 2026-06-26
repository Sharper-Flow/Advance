/**
 * Shared process-liveness probe — single source of truth for PID existence
 * checks across worktree leases, session listing, and worker-lock reclaim.
 *
 * Contract (rq-worktreeLeaseLiveness01): a signal-0 probe that throws ESRCH
 * means the process is gone (dead). EPERM (the process exists but is not
 * signalable by this user) or any other error means the process is alive.
 * This fail-safe direction prevents reclaiming a live peer's lease/lock on
 * multi-user hosts, preserving exclusive-ownership invariants.
 */

export type ProcessKill = (pid: number, signal: number | string) => void;

/**
 * Returns true when the PID corresponds to a running process.
 *
 * - probe succeeds (signal 0) → true
 * - ESRCH (no such process) → false
 * - EPERM (process exists but not ours) → true (treat as alive)
 * - any other error → true (conservative: avoid filtering live peers)
 *
 * @param pid Process ID to probe.
 * @param kill Injectable kill function (defaults to `process.kill`); used for testing.
 */
export function isProcessAlive(
  pid: number,
  kill: ProcessKill = process.kill.bind(process),
): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}
