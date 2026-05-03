/**
 * isWorktreeInUse — Linux /proc/[pid]/cwd guard
 *
 * Detect whether any running process currently has the given worktree directory
 * (or a subdirectory of it) as its working directory.
 *
 * Uses Linux /proc/[pid]/cwd symlinks — the only reliable, zero-dependency way
 * to answer this question synchronously on Linux without shelling out.
 *
 * Returns false immediately on non-Linux platforms (graceful degradation).
 * Per-PID EACCES / ENOENT errors are silently swallowed — the process may have
 * exited between iteration and readlink, or we may lack permission; either is safe.
 */

import { readdirSync, readlinkSync } from "node:fs"

/**
 * @param worktreePath - Absolute path to the worktree directory
 * @returns true if at least one process has worktreePath (or a subpath) as its CWD
 */
export function isWorktreeInUse(worktreePath: string): boolean {
	if (typeof worktreePath !== "string" || !worktreePath) return false
	if (process.platform !== "linux") return false

	// Normalise: strip trailing slash for consistent prefix matching
	const normalised = worktreePath.endsWith("/") ? worktreePath.slice(0, -1) : worktreePath

	let pids: string[]
	try {
		pids = readdirSync("/proc")
	} catch {
		// /proc not mounted or unreadable — can't determine, default to safe false
		return false
	}

	for (const pid of pids) {
		// Only numeric entries are process directories
		if (!/^\d+$/.test(pid)) continue

		try {
			const cwd = readlinkSync(`/proc/${pid}/cwd`)
			// Match exact path or any subdirectory (cwd starts with worktreePath/)
			if (cwd === normalised || cwd.startsWith(normalised + "/")) {
				return true
			}
		} catch {
			// EACCES (no permission) or ENOENT (process exited) — skip this PID
		}
	}

	return false
}
