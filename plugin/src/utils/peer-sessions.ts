/**
 * Peer Session Detection (T17 — KD-14, replaces concurrent-sessions.ts)
 *
 * Detects other OpenCode processes that share the same project as the
 * current session. Uses git-common-dir + ADV project-id matching (NOT
 * CWD-equality) so peers in sibling worktrees, subdirectories, or
 * different checkout paths of the same project are reliably found.
 *
 * J4 SCOPE REDUCTION (post-Phase 1.5): Linux-only target.
 *   - /proc enumeration only — drops lsof macOS path
 *   - Platform guard throws on non-Linux at the public entry point
 *   - macOS / Windows / BSD path semantics are out of scope
 *
 * Privacy-defensive (KD-4 + T3): consumers (adv_status, adv_session_list)
 * project the public schema (session_id + started_at + workdir-basename
 * only). PID + full path remain internal to this module + diagnostics.
 *
 * × Replaces flawed CWD-equality logic in old `concurrent-sessions.ts`.
 *   Old module remains until import sites are updated (T31).
 *
 * Citations: rq-multiSessionFraming01, rq-worktreeRegistry01.
 */

import { readdir, readlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

import { getProjectId } from "./project-id";

const execFileAsync = promisify(execFile);

// =============================================================================
// Public types
// =============================================================================

/**
 * Information about a peer OpenCode session detected in the same project.
 *
 * `matchVia` records WHY this process was classified as a peer:
 *   - `"common-dir"` — same `git rev-parse --git-common-dir` (worktree-aware)
 *   - `"project-id"` — same ADV project-id (root commit SHA) via different path
 *
 * PID + full cwd are internal. Public consumers MUST project to the
 * privacy-defensive schema (session_id + started_at + workdir-basename).
 */
export interface PeerInfo {
  /** Linux PID of the peer process. Internal only — never surfaced publicly. */
  pid: number;
  /** Resolved CWD of the peer process (from `/proc/<pid>/cwd`). Internal only. */
  cwd: string;
  /** Why this peer matched the current session's project. */
  matchVia: "common-dir" | "project-id";
}

// =============================================================================
// Helpers
// =============================================================================

async function getGitCommonDir(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Linux /proc enumeration. Returns candidate processes whose `exe` path
 * contains "opencode" (rough filter — production refinement may inspect
 * cmdline / parent process if false positives surface).
 *
 * Mockable via `__setProcessScannerForTests` for unit tests.
 */
async function defaultScanOpencodeProcesses(): Promise<
  Array<{ pid: number; cwd: string }>
> {
  const candidates: Array<{ pid: number; cwd: string }> = [];
  const procDirs = await readdir("/proc").catch(() => [] as string[]);
  for (const dir of procDirs) {
    if (!/^\d+$/.test(dir)) continue;
    const pid = Number(dir);
    const exe = await readlink(`/proc/${pid}/exe`).catch(() => "");
    if (!exe.includes("opencode")) continue;
    const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => "");
    if (!cwd) continue;
    candidates.push({ pid, cwd });
  }
  return candidates;
}

let processScanner: () => Promise<Array<{ pid: number; cwd: string }>> =
  defaultScanOpencodeProcesses;

/**
 * Test seam — replace process scanner. Tests must restore the default
 * after each case via `__resetProcessScannerForTests()`.
 */
export function __setProcessScannerForTests(
  scanner: () => Promise<Array<{ pid: number; cwd: string }>>,
): void {
  processScanner = scanner;
}

export function __resetProcessScannerForTests(): void {
  processScanner = defaultScanOpencodeProcesses;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Detect peer OpenCode sessions in the same project as `currentCwd`.
 *
 * Matching rules (first match wins):
 *   1. Same `git rev-parse --git-common-dir` → `matchVia: "common-dir"`
 *      Catches sibling worktrees + subdirectory CWDs of the same checkout.
 *   2. Same ADV project-id (root commit SHA) → `matchVia: "project-id"`
 *      Catches sessions in different checkout paths of the same repo.
 *
 * Excludes the current process (`process.pid`).
 *
 * J4 platform guard: throws on non-Linux. Caller is responsible for
 * gating invocation on `process.platform === "linux"`.
 *
 * Returns empty array on error (best-effort; never blocks caller).
 */
export async function detectPeerSessions(
  currentCwd: string,
): Promise<PeerInfo[]> {
  if (process.platform !== "linux") {
    throw new Error(
      `peer-sessions.ts requires Linux (got platform=${process.platform})`,
    );
  }

  const myPid = process.pid;
  const myCommonDir = await getGitCommonDir(currentCwd);
  const myProjectId = await getProjectId(currentCwd);

  // If neither identifier is resolvable, we cannot determine peers.
  if (!myCommonDir && !myProjectId) {
    return [];
  }

  const candidates = await processScanner();
  const peers: PeerInfo[] = [];

  for (const proc of candidates) {
    if (proc.pid === myPid) continue;

    if (myCommonDir) {
      const peerCommonDir = await getGitCommonDir(proc.cwd);
      if (peerCommonDir && peerCommonDir === myCommonDir) {
        peers.push({ ...proc, matchVia: "common-dir" });
        continue;
      }
    }

    if (myProjectId) {
      const peerProjectId = await getProjectId(proc.cwd);
      if (peerProjectId && peerProjectId === myProjectId) {
        peers.push({ ...proc, matchVia: "project-id" });
      }
    }
  }

  return peers;
}
