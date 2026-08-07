/**
 * process-inventory — worker/session process classification (AC9/DDC5).
 *
 * Scans the process table (injectable root) and classifies:
 *
 *   - Worker processes: any argv token ending in a deployed or source worker
 *     script. `deployed` workers run the deployment's script; `foreign`
 *     workers run from another checkout and their build must be
 *     identity-compared before cutover.
 *   - OpenCode session processes: executable basename `opencode` (shape
 *     verified against the live machine's `/proc`). Each must appear in the
 *     loaded-build session registry with the current digest before cutover.
 *
 * `scanComplete: false` means the process table could not be read — unknown
 * inventory, which blocks activation. Nothing here decides readiness; the
 * validator in `./inventory` turns these entries into typed blockers.
 */

import { readdirSync } from "node:fs";
import { basename } from "node:path";

import {
  listProcessEntries,
  processStartTimeMs,
  readBootTimeMs,
} from "./procfs";

export interface WorkerProcessEntry {
  pid: number;
  cmdline: string;
  startTicks: string | null;
  startTimeMs: number | null;
  workerScriptPath: string;
  root: "deployed" | "foreign";
}

export interface SessionProcessEntry {
  pid: number;
  cmdline: string;
  startTicks: string | null;
  startTimeMs: number | null;
}

export interface ProcessInventory {
  scanComplete: boolean;
  workers: WorkerProcessEntry[];
  sessions: SessionProcessEntry[];
  problems: string[];
}

const WORKER_BUNDLE_TOKEN = "/worker.js";
const WORKER_SOURCE_TOKEN = "/worker.ts";
const SESSION_EXECUTABLE = "opencode";

/** Extract the worker script path token from a cmdline, when present. */
function workerScriptFromCmdline(cmdline: string): string | null {
  for (const token of cmdline.split(" ")) {
    if (
      token.endsWith(WORKER_BUNDLE_TOKEN) ||
      token.endsWith(WORKER_SOURCE_TOKEN)
    ) {
      return token;
    }
  }
  return null;
}

function isSessionCmdline(cmdline: string): boolean {
  const first = cmdline.split(" ")[0];
  return first !== undefined && basename(first) === SESSION_EXECUTABLE;
}

export function collectProcessInventory(input: {
  /** Absolute path of the deployed worker bundle. */
  deployedWorkerScript: string;
  procRoot?: string;
  bootTimeMs?: number;
  clockTicks?: number;
  selfPid?: number;
}): ProcessInventory {
  const procRoot = input.procRoot ?? "/proc";
  const selfPid = input.selfPid ?? process.pid;
  const bootTimeMs = input.bootTimeMs ?? readBootTimeMs(procRoot);

  const entries = listProcessEntries(procRoot);
  const problems: string[] = [];
  // Completeness is structural: the root must be enumerable. An unreadable
  // root means unknown inventory (workers/sessions we cannot see), which
  // blocks activation — distinct from a genuinely empty table.
  let scanComplete = true;
  try {
    readdirSync(procRoot);
  } catch {
    scanComplete = false;
    problems.push(`process table under ${procRoot} is unreadable`);
  }
  if (bootTimeMs === null && scanComplete) {
    problems.push(`boot time unavailable under ${procRoot}`);
  }

  const toStartTime = (ticks: string | null): number | null =>
    ticks !== null && bootTimeMs !== null
      ? processStartTimeMs(ticks, {
          bootTimeMs,
          clockTicks: input.clockTicks,
        })
      : null;

  const workers: WorkerProcessEntry[] = [];
  const sessions: SessionProcessEntry[] = [];
  for (const entry of entries) {
    if (entry.pid === selfPid) continue;
    const workerScript = workerScriptFromCmdline(entry.cmdline);
    if (workerScript) {
      workers.push({
        pid: entry.pid,
        cmdline: entry.cmdline,
        startTicks: entry.startTicks,
        startTimeMs: toStartTime(entry.startTicks),
        workerScriptPath: workerScript,
        root:
          workerScript === input.deployedWorkerScript ? "deployed" : "foreign",
      });
      continue;
    }
    if (isSessionCmdline(entry.cmdline)) {
      sessions.push({
        pid: entry.pid,
        cmdline: entry.cmdline,
        startTicks: entry.startTicks,
        startTimeMs: toStartTime(entry.startTicks),
      });
    }
  }
  return { scanComplete, workers, sessions, problems };
}
