/**
 * SQLite State Module for Worktree Plugin
 *
 * Provides atomic, crash-safe persistence for worktree sessions and pending operations.
 * Uses bun:sqlite for zero external dependencies.
 *
 * Database location: ~/.local/share/opencode/plugins/worktree/{project-id}.sqlite
 * Project ID is the first git root commit SHA (40-char hex), with SHA-256 path hash fallback (16-char).
 */

import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { z } from "zod"
import type { OpencodeClient } from "../../utils/opencode-types"
import { getProjectId as getProjectIdRaw } from "../../utils/project-id"
import { appendDebugLog } from "../../utils/debug-log"

// T7 relocation shim: ADV's getProjectId returns string|null; the kdco
// signature was (cwd) → string. Wrap to keep call sites unchanged.
async function getProjectId(directory: string): Promise<string> {
	const id = await getProjectIdRaw(directory)
	if (!id) throw new Error(`getProjectId: unable to resolve project id for ${directory}`)
	return id
}

// T7 relocation: legacy `logWarn(client, service, msg)` adapted to
// ADV's `appendDebugLog(scope, msg)`. Client arg is unused in the
// new logger; signature shim preserved so call sites need no edits.
// Behavioral rewrites (T9 delete, T10 create) follow in later tasks.
function logWarn(_client: OpencodeClient | undefined, service: string, message: string): void {
	appendDebugLog(service, `WARN ${message}`)
}

// =============================================================================
// TYPES
// =============================================================================

/** Represents an active worktree session */
export interface Session {
	id: string
	branch: string
	path: string
	createdAt: string
}

/** Pending spawn operation to be processed on session.idle */
export interface PendingSpawn {
	branch: string
	path: string
	sessionId: string
}

/** Input for creating a pending delete (callers provide branch + path only) */
export interface PendingDeleteInput {
	branch: string
	path: string
}

/** Full pending delete record as stored/returned (includes retry tracking) */
export interface PendingDelete {
	branch: string
	path: string
	attempts: number
	lastAttemptAt: string | null
	createdAt: string
}

// =============================================================================
// SCHEMAS (Boundary Validation)
// =============================================================================

const sessionSchema = z.object({
	id: z.string().min(1),
	branch: z.string().min(1),
	path: z.string().min(1),
	createdAt: z.string().min(1),
})

const pendingSpawnSchema = z.object({
	branch: z.string().min(1),
	path: z.string().min(1),
	sessionId: z.string().min(1),
})

const pendingDeleteSchema = z.object({
	branch: z.string().min(1),
	path: z.string().min(1),
})

// =============================================================================
// DATABASE UTILITIES
// =============================================================================

/**
 * Get the worktree path for a given project and branch.
 *
 * @param projectRoot - Absolute path to the project root
 * @param branch - Branch name for the worktree
 * @returns Absolute path to the worktree directory
 */
export async function getWorktreePath(projectRoot: string, branch: string): Promise<string> {
	if (!branch || typeof branch !== "string") {
		throw new Error("branch is required")
	}
	const projectId = await getProjectId(projectRoot)
	return path.join(os.homedir(), ".local", "share", "opencode", "worktree", projectId, branch)
}

/**
 * Get the database directory path.
 * Location: ~/.local/share/opencode/plugins/worktree/
 */
function getDbDirectory(): string {
	const home = os.homedir()
	return path.join(home, ".local", "share", "opencode", "plugins", "worktree")
}

/**
 * Get the full database file path for a project.
 * @param projectRoot - Absolute path to the project root
 */
async function getDbPath(projectRoot: string): Promise<string> {
	const projectId = await getProjectId(projectRoot)
	return path.join(getDbDirectory(), `${projectId}.sqlite`)
}

/**
 * Initialize the SQLite database for worktree state.
 * Creates the database file and schema if they don't exist.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Configured Database instance
 *
 * @example
 * ```ts
 * const db = await initStateDb("/home/user/my-project")
 * const sessions = getAllSessions(db)
 * db.close()
 * ```
 */
export async function initStateDb(projectRoot: string): Promise<Database> {
	// Guard: validate project root
	if (!projectRoot || typeof projectRoot !== "string") {
		throw new Error("initStateDb requires a valid project root path")
	}

	const dbPath = await getDbPath(projectRoot)
	const dbDir = path.dirname(dbPath)

	// Create directory synchronously (required before opening DB)
	mkdirSync(dbDir, { recursive: true })

	// Open database (creates if doesn't exist)
	const db = new Database(dbPath)

	// Configure SQLite for concurrent access
	db.exec("PRAGMA journal_mode=WAL")
	db.exec("PRAGMA busy_timeout=5000")

	// Create tables with schema
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			branch TEXT NOT NULL,
			path TEXT NOT NULL,
			created_at TEXT NOT NULL
		)
	`)

	db.exec(`
		CREATE TABLE IF NOT EXISTS pending_operations (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			type TEXT NOT NULL,
			branch TEXT NOT NULL,
			path TEXT NOT NULL,
			session_id TEXT,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_attempt_at TEXT
		)
	`)

	db.exec(`
		CREATE TABLE IF NOT EXISTS pending_deletes (
			branch TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_attempt_at TEXT,
			created_at TEXT NOT NULL
		)
	`)

	// Migration: add attempts/last_attempt_at columns to existing databases
	// ALTER TABLE ADD COLUMN is a no-op if the column already exists in SQLite 3.37+
	// For older SQLite, wrap in try/catch per column
	try { db.exec("ALTER TABLE pending_operations ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0") } catch { /* already exists */ }
	try { db.exec("ALTER TABLE pending_operations ADD COLUMN last_attempt_at TEXT") } catch { /* already exists */ }

	// Migration: move legacy singleton pending delete into queued table.
	try {
		const legacyDelete = db.prepare(`
			SELECT branch, path, attempts, last_attempt_at as lastAttemptAt
			FROM pending_operations
			WHERE id = 1 AND type = 'delete'
		`).get() as Record<string, string | number> | null
		if (legacyDelete) {
			db.prepare(`
				INSERT OR IGNORE INTO pending_deletes (branch, path, attempts, last_attempt_at, created_at)
				VALUES ($branch, $path, $attempts, $lastAttemptAt, $createdAt)
			`).run({
				$branch: legacyDelete.branch,
				$path: legacyDelete.path,
				$attempts: legacyDelete.attempts ?? 0,
				$lastAttemptAt: legacyDelete.lastAttemptAt ?? null,
				$createdAt: new Date().toISOString(),
			})
			db.prepare(`DELETE FROM pending_operations WHERE id = 1 AND type = 'delete'`).run()
		}
	} catch {
		// Best-effort migration: cleanup still works for fresh databases.
	}

	return db
}

// =============================================================================
// SESSION CRUD
// =============================================================================

/**
 * Add a new session to the database.
 * Uses atomic INSERT OR REPLACE for idempotency.
 *
 * @param db - Database instance from initStateDb
 * @param session - Session data to persist
 */
export function addSession(db: Database, session: Session): void {
	// Parse at boundary for type safety
	const parsed = sessionSchema.parse(session)

	const stmt = db.prepare(`
		INSERT OR REPLACE INTO sessions (id, branch, path, created_at)
		VALUES ($id, $branch, $path, $createdAt)
	`)

	stmt.run({
		$id: parsed.id,
		$branch: parsed.branch,
		$path: parsed.path,
		$createdAt: parsed.createdAt,
	})
}

/**
 * Get a session by ID.
 *
 * @param db - Database instance from initStateDb
 * @param sessionId - Session ID to look up
 * @returns Session if found, null otherwise
 */
export function getSession(db: Database, sessionId: string): Session | null {
	// Guard: empty session ID
	if (!sessionId) return null

	const stmt = db.prepare(`
		SELECT id, branch, path, created_at as createdAt
		FROM sessions
		WHERE id = $id
	`)

	const row = stmt.get({ $id: sessionId }) as Record<string, string> | null
	if (!row) return null

	return {
		id: row.id,
		branch: row.branch,
		path: row.path,
		createdAt: row.createdAt,
	}
}

/**
 * Remove a session by branch name.
 * Deletes all sessions matching the branch.
 *
 * @param db - Database instance from initStateDb
 * @param branch - Branch name to remove
 */
export function removeSession(db: Database, branch: string): void {
	// Guard: empty branch
	if (!branch) return

	const stmt = db.prepare(`DELETE FROM sessions WHERE branch = $branch`)
	stmt.run({ $branch: branch })
}

/**
 * Get all active sessions.
 *
 * @param db - Database instance from initStateDb
 * @returns Array of all sessions, empty if none
 */
export function getAllSessions(db: Database): Session[] {
	const stmt = db.prepare(`
		SELECT id, branch, path, created_at as createdAt
		FROM sessions
		ORDER BY created_at ASC
	`)

	const rows = stmt.all() as Array<Record<string, string>>
	return rows.map((row) => ({
		id: row.id,
		branch: row.branch,
		path: row.path,
		createdAt: row.createdAt,
	}))
}

// =============================================================================
// PENDING SPAWN OPERATIONS
// =============================================================================

/**
 * Set a pending spawn operation. Uses singleton pattern (last-write-wins).
 *
 * If a pending spawn already exists, it will be REPLACED and a warning logged.
 * This is intentional: only the most recent spawn request should be processed.
 *
 * @param db - Database instance from initStateDb
 * @param spawn - Spawn operation data
 */
export function setPendingSpawn(db: Database, spawn: PendingSpawn, client?: OpencodeClient): void {
	// Parse at boundary for type safety
	const parsed = pendingSpawnSchema.parse(spawn)

	// Check for existing operations and warn about replacement
	const existingSpawn = getPendingSpawn(db)
	const existingDelete = getPendingDelete(db)

	if (existingSpawn) {
		logWarn(
			client,
			"worktree",
			`Replacing pending spawn: "${existingSpawn.branch}" → "${parsed.branch}"`,
		)
	} else if (existingDelete) {
		logWarn(
			client,
			"worktree",
			`Pending spawn replacing pending delete for: "${existingDelete.branch}"`,
		)
	}

	// Atomic: replace any existing pending operation
	const stmt = db.prepare(`
		INSERT OR REPLACE INTO pending_operations (id, type, branch, path, session_id)
		VALUES (1, 'spawn', $branch, $path, $sessionId)
	`)

	stmt.run({
		$branch: parsed.branch,
		$path: parsed.path,
		$sessionId: parsed.sessionId,
	})
}

/**
 * Get the pending spawn operation if one exists.
 *
 * @param db - Database instance from initStateDb
 * @returns PendingSpawn if exists and type is 'spawn', null otherwise
 */
export function getPendingSpawn(db: Database): PendingSpawn | null {
	const stmt = db.prepare(`
		SELECT type, branch, path, session_id as sessionId
		FROM pending_operations
		WHERE id = 1 AND type = 'spawn'
	`)

	const row = stmt.get() as Record<string, string> | null
	if (!row) return null

	return {
		branch: row.branch,
		path: row.path,
		sessionId: row.sessionId,
	}
}

/**
 * Clear any pending spawn operation.
 * Removes the row if it's a spawn type, leaves deletes untouched.
 *
 * @param db - Database instance from initStateDb
 */
export function clearPendingSpawn(db: Database): void {
	const stmt = db.prepare(`DELETE FROM pending_operations WHERE id = 1 AND type = 'spawn'`)
	stmt.run()
}

// =============================================================================
// PENDING DELETE OPERATIONS
// =============================================================================

/**
 * Set a pending delete operation. Uses queue pattern by branch.
 *
 * If a pending delete already exists for the same branch, it will be refreshed.
 * Unrelated pending deletes are preserved.
 *
 * @param db - Database instance from initStateDb
 * @param del - Delete operation data
 */
export function setPendingDelete(db: Database, del: PendingDeleteInput, client?: OpencodeClient): void {
	// Parse at boundary for type safety
	const parsed = pendingDeleteSchema.parse(del)

	// Check for existing operations and warn about duplicate queueing
	const existingDelete = getPendingDelete(db, parsed.branch)
	const existingSpawn = getPendingSpawn(db)

	if (existingDelete) {
		logWarn(
			client,
			"worktree",
			`Refreshing pending delete for: "${parsed.branch}"`,
		)
	} else if (existingSpawn) {
		logWarn(
			client,
			"worktree",
			`Pending delete replacing pending spawn for: "${existingSpawn.branch}"`,
		)
	}

	// Atomic: queue by branch; do not overwrite unrelated pending deletes.
	const stmt = db.prepare(`
		INSERT INTO pending_deletes (branch, path, attempts, last_attempt_at, created_at)
		VALUES ($branch, $path, 0, NULL, $createdAt)
		ON CONFLICT(branch) DO UPDATE SET
			path = excluded.path,
			attempts = 0,
			last_attempt_at = NULL
	`)

	stmt.run({
		$branch: parsed.branch,
		$path: parsed.path,
		$createdAt: new Date().toISOString(),
	})
}

/**
 * Get a pending delete operation if one exists.
 *
 * Without a branch, returns the oldest queued delete for legacy/status callers.
 * Use getPendingDeletes() when processing the full queue.
 *
 * @param db - Database instance from initStateDb
 * @returns PendingDelete if exists and type is 'delete', null otherwise
 */
export function getPendingDelete(db: Database, branch?: string): PendingDelete | null {
	if (branch) {
		const stmt = db.prepare(`
			SELECT branch, path, attempts, last_attempt_at as lastAttemptAt, created_at as createdAt
			FROM pending_deletes
			WHERE branch = $branch
		`)
		const row = stmt.get({ $branch: branch }) as Record<string, string | number> | null
		return row ? toPendingDelete(row) : null
	}

	const stmt = db.prepare(`
		SELECT branch, path, attempts, last_attempt_at as lastAttemptAt, created_at as createdAt
		FROM pending_deletes
		ORDER BY created_at ASC
		LIMIT 1
	`)

	const row = stmt.get() as Record<string, string | number> | null
	return row ? toPendingDelete(row) : null
}

export function getPendingDeletes(db: Database): PendingDelete[] {
	const stmt = db.prepare(`
		SELECT branch, path, attempts, last_attempt_at as lastAttemptAt, created_at as createdAt
		FROM pending_deletes
		ORDER BY created_at ASC
	`)
	const rows = stmt.all() as Array<Record<string, string | number>>
	return rows.map(toPendingDelete)
}

/**
 * Clear any pending delete operation.
 * Removes the row if it's a delete type, leaves spawns untouched.
 *
 * @param db - Database instance from initStateDb
 */
export function clearPendingDelete(db: Database, branch?: string): void {
	if (branch) {
		const stmt = db.prepare(`DELETE FROM pending_deletes WHERE branch = $branch`)
		stmt.run({ $branch: branch })
		return
	}
	const stmt = db.prepare(`DELETE FROM pending_deletes`)
	stmt.run()
}

/**
 * Increment the attempts counter and set lastAttemptAt to now for the pending delete.
 * Used by the event handler when deletion is skipped because the worktree is in-use.
 *
 * @param db - Database instance from initStateDb
 */
export function incrementPendingDeleteAttempts(db: Database, branch?: string): void {
	if (branch) {
		const stmt = db.prepare(`
			UPDATE pending_deletes
			SET attempts = attempts + 1, last_attempt_at = $now
			WHERE branch = $branch
		`)
		stmt.run({ $now: new Date().toISOString(), $branch: branch })
		return
	}
	const stmt = db.prepare(`
		UPDATE pending_deletes
		SET attempts = attempts + 1, last_attempt_at = $now
	`)
	stmt.run({ $now: new Date().toISOString() })
}

function toPendingDelete(row: Record<string, string | number>): PendingDelete {
	return {
		branch: row.branch as string,
		path: row.path as string,
		attempts: (row.attempts as number) ?? 0,
		lastAttemptAt: row.lastAttemptAt as string | null,
		createdAt: row.createdAt as string,
	}
}
