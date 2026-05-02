/**
 * Concurrent Session Detection
 *
 * Detects other OpenCode processes sharing the same project CWD.
 * Warns when multiple sessions may mutate git state concurrently.
 */

import { readdir, readlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function detectConcurrentSessions(
  currentCwd: string,
): Promise<number[]> {
  const myPid = process.pid;
  const peers: number[] = [];

  if (process.platform === "linux") {
    const procDirs = await readdir("/proc").catch(() => [] as string[]);
    for (const dir of procDirs) {
      if (!/^\d+$/.test(dir)) continue;
      const pid = Number(dir);
      if (pid === myPid) continue;

      const exe = await readlink(`/proc/${pid}/exe`).catch(() => "");
      if (!exe.includes("opencode")) continue;

      const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => "");
      if (cwd === currentCwd) peers.push(pid);
    }
  } else if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("lsof", [
        "+D",
        currentCwd,
        "-Fpc",
      ]);
      const lines = stdout.split("\n");
      let currentPid: number | null = null;
      for (const line of lines) {
        if (line.startsWith("p")) {
          currentPid = Number(line.slice(1));
        } else if (
          line.startsWith("c") &&
          currentPid !== null &&
          currentPid !== myPid
        ) {
          const command = line.slice(1);
          if (command.includes("opencode")) {
            peers.push(currentPid);
          }
        }
      }
    } catch {
      // lsof failed or not available — return empty, don't block init
    }
  }

  return peers;
}
