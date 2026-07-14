/**
 * worker-process-probe
 *
 * Advisory enumeration of ADV Temporal worker OS processes for the
 * `adv_status` health probe (AC5 of fixTemporalTimeoutsWorker).
 *
 * Motivation: multi-session worker contention is currently invisible until
 * it wedges the shared STSL gRPC. This probe makes the live worker count —
 * and orphaned workers whose parent plugin-host died — observable BEFORE
 * the wedge.
 *
 * Method: scan a proc-style directory (default `/proc`) for processes whose
 * NUL-separated cmdline references the worker script marker
 * (`dist/temporal/worker.js`, the bundle spawned by worker-multi.ts). For
 * each match, parse `PPid:` from `<pid>/status` and flag orphans with the
 * same signal-0 ESRCH liveness check the AC4 parent-liveness watchdog uses
 * (worker.ts `isParentAlive`). `ppid === 1` alone is NOT used — after a
 * parent crash the child is reparented to init or a systemd subreaper, so
 * only the existence check is meaningful... and even it can only catch the
 * not-yet-reparented window. This is advisory visibility, not a watchdog.
 *
 * Portability: Linux `/proc` is the primary target. On any failure (missing
 * proc dir, non-Linux host, permission errors on the directory itself) the
 * probe returns `null` so callers omit the section gracefully. Per-entry
 * read failures (process exited mid-scan, other users' processes) skip the
 * entry.
 *
 * Purity: read-only observation. Never signals, kills, or mutates anything.
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

/** Substring matched against each process cmdline (NUL-separated argv). */
export const DEFAULT_WORKER_SCRIPT_MARKER = "dist/temporal/worker.js";

export interface WorkerProcessInfo {
  pid: number;
  /** Parent pid from `<pid>/status`; null when the status file is unreadable. */
  ppid: number | null;
  /**
   * True when the parent pid fails the signal-0 existence check (ESRCH).
   * Always false when ppid is unknown — never guess. Advisory only: a
   * reparented orphan (ppid now 1/subreaper, still alive) is NOT detected
   * here; the AC4 watchdog covers that case from inside the child.
   */
  orphan: boolean;
}

export interface WorkerProcessSnapshot {
  workerCount: number;
  orphanCount: number;
  processes: WorkerProcessInfo[];
}

export interface EnumerateWorkerProcessesOptions {
  /** Proc-style directory to scan. Defaults to `/proc`. */
  procDir?: string;
  /** Cmdline substring identifying an ADV worker. Defaults to the dist bundle path. */
  marker?: string;
  /**
   * Parent-liveness probe — injectable for tests. Defaults to the signal-0
   * ESRCH check (same semantics as worker.ts `isParentAlive`).
   */
  isAlive?: (pid: number) => boolean;
}

/**
 * Default liveness probe. Signal 0 performs an existence check without
 * delivering a signal. Returns false only when the pid has been reaped
 * (ESRCH); other errors (e.g. EPERM — process exists but isn't signalable
 * by us) are treated as "alive" so a permission quirk never produces a
 * spurious orphan flag. Mirrors worker.ts `isParentAlive` — deliberately
 * duplicated here to keep this probe free of any worker-module dependency.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

const NUMERIC_DIR_RE = /^\d+$/;
const PPID_RE = /^PPid:\s*(\d+)\s*$/m;

/** Parse `PPid:` from a `/proc/<pid>/status` body; null when absent. */
export function parsePpidFromStatus(statusBody: string): number | null {
  const match = PPID_RE.exec(statusBody);
  if (!match) return null;
  const ppid = Number.parseInt(match[1], 10);
  return Number.isFinite(ppid) ? ppid : null;
}

/**
 * Enumerate ADV worker OS processes. Returns `null` when the proc directory
 * is unavailable (non-Linux host, missing mount, permission denied) so the
 * caller can omit the advisory section. Per-entry failures skip the entry.
 */
export async function enumerateAdvWorkerProcesses(
  options: EnumerateWorkerProcessesOptions = {},
): Promise<WorkerProcessSnapshot | null> {
  const procDir = options.procDir ?? "/proc";
  const marker = options.marker ?? DEFAULT_WORKER_SCRIPT_MARKER;
  const isAlive = options.isAlive ?? isProcessAlive;

  let entries: string[];
  try {
    entries = await readdir(procDir);
  } catch {
    // Non-Linux host, missing /proc mount, or unreadable directory —
    // omit the section rather than failing the health probe.
    return null;
  }

  const pids = entries
    .filter((name) => NUMERIC_DIR_RE.test(name))
    .map((name) => Number.parseInt(name, 10))
    .filter((pid) => Number.isFinite(pid))
    .sort((a, b) => a - b);

  const processes: WorkerProcessInfo[] = [];
  await Promise.all(
    pids.map(async (pid) => {
      let cmdline: string;
      try {
        cmdline = await readFile(join(procDir, String(pid), "cmdline"), "utf8");
      } catch {
        // Process exited mid-scan or owned by another user.
        return;
      }
      if (!cmdline.includes(marker)) return;

      let ppid: number | null = null;
      try {
        const statusBody = await readFile(
          join(procDir, String(pid), "status"),
          "utf8",
        );
        ppid = parsePpidFromStatus(statusBody);
      } catch {
        // Status unreadable — ppid stays null; never guess orphan status.
      }

      processes.push({
        pid,
        ppid,
        orphan: ppid !== null && !isAlive(ppid),
      });
    }),
  );

  processes.sort((a, b) => a.pid - b.pid);
  return {
    workerCount: processes.length,
    orphanCount: processes.filter((p) => p.orphan).length,
    processes,
  };
}
