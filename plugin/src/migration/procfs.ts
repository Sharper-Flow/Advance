/**
 * procfs — Linux process-table primitives for machine inventory (AC9/DDC5).
 *
 * Structural full-machine migration proof needs to know which processes are
 * running the deployed worker and which OpenCode sessions are live.
 * These helpers parse `/proc` deterministically with an injectable root so
 * tests run against fixture trees:
 *
 *   - `readProcessStartTicks` extracts field 22 (`starttime`) from
 *     `/proc/<pid>/stat`, robust to `comm` values containing spaces/parens.
 *   - `readProcessCmdline` decodes the NUL-separated argv.
 *   - `listProcessEntries` enumerates pid dirs, skipping unreadable entries.
 *   - `isProcessAlive` combines start-tick comparison (PID-reuse-safe) with
 *     a `kill(pid, 0)` probe fallback (EPERM counts as alive).
 *
 * Heuristic boundary (P33): process-table reads are discovery evidence. The
 * inventory validator in `./inventory` converts them into typed blockers;
 * nothing here authorizes or blocks cutover by itself.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProcEntry {
  pid: number;
  cmdline: string;
  startTicks: string | null;
}

/** Parse `/proc/<pid>/stat`, returning field 22 (starttime in clock ticks). */
export function readProcessStartTicks(
  pid: number,
  procRoot = "/proc",
): string | null {
  let raw: string;
  try {
    raw = readFileSync(join(procRoot, String(pid), "stat"), "utf8");
  } catch {
    return null;
  }
  // comm (field 2) may contain spaces and parentheses; fields after the last
  // ") " are fields 3..N. starttime is field 22 → index 19 of the remainder.
  const close = raw.lastIndexOf(") ");
  if (close === -1) return null;
  const rest = raw
    .slice(close + 2)
    .trim()
    .split(/\s+/);
  const startTicks = rest[19];
  if (!startTicks || !/^\d+$/.test(startTicks)) return null;
  return startTicks;
}

/** Decode `/proc/<pid>/cmdline` (NUL-separated) into a space-joined string. */
export function readProcessCmdline(
  pid: number,
  procRoot = "/proc",
): string | null {
  let raw: string;
  try {
    raw = readFileSync(join(procRoot, String(pid), "cmdline"), "utf8");
  } catch {
    return null;
  }
  const argv = raw.split("\0").filter((part) => part.length > 0);
  if (argv.length === 0) return null;
  return argv.join(" ");
}

/**
 * Enumerate process entries under `procRoot`. Entries whose stat AND cmdline
 * are both unreadable are skipped (races with exiting processes). Returns an
 * empty list when the root itself is unreadable — callers that require a
 * complete scan must check root readability separately.
 */
export function listProcessEntries(procRoot = "/proc"): ProcEntry[] {
  let names: string[];
  try {
    names = readdirSync(procRoot);
  } catch {
    return [];
  }
  const entries: ProcEntry[] = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    const cmdline = readProcessCmdline(pid, procRoot);
    const startTicks = readProcessStartTicks(pid, procRoot);
    if (cmdline === null && startTicks === null) continue;
    entries.push({ pid, cmdline: cmdline ?? "", startTicks });
  }
  entries.sort((a, b) => a.pid - b.pid);
  return entries;
}

/** Read the machine boot time (`btime` in `/proc/stat`) as epoch ms. */
export function readBootTimeMs(procRoot = "/proc"): number | null {
  let raw: string;
  try {
    raw = readFileSync(join(procRoot, "stat"), "utf8");
  } catch {
    return null;
  }
  const match = raw.match(/^btime (\d+)$/m);
  if (!match) return null;
  return Number(match[1]) * 1000;
}

/** Convert `/proc` start ticks to epoch ms given the boot time. */
export function processStartTimeMs(
  startTicks: string,
  opts: { bootTimeMs: number; clockTicks?: number },
): number {
  const ticks = opts.clockTicks ?? 100; // Linux USER_HZ default
  return opts.bootTimeMs + (Number(startTicks) / ticks) * 1000;
}

export interface IsProcessAliveOptions {
  procRoot?: string;
  /**
   * Expected `/proc` start ticks. When provided and the stat file is
   * readable, a mismatch means the PID was reused by a different process —
   * the recorded process is dead even though `pid` exists.
   */
  startTicks?: string | null;
  /**
   * Liveness probe, defaults to `kill(pid, 0)` semantics. EPERM means the
   * process exists but is owned by another user → alive.
   */
  killProbe?: (pid: number) => boolean;
}

function defaultKillProbe(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** PID-reuse-safe liveness check. */
export function isProcessAlive(
  pid: number,
  opts: IsProcessAliveOptions = {},
): boolean {
  const killProbe = opts.killProbe ?? defaultKillProbe;
  const ticks = readProcessStartTicks(pid, opts.procRoot ?? "/proc");
  if (ticks !== null && opts.startTicks != null) {
    // Stat readable and we have a recorded start time: exact match decides.
    return ticks === opts.startTicks;
  }
  return killProbe(pid);
}
