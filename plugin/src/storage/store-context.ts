/**
 * Store Context
 *
 * Shared mutable state for the `createStore` closure.
 *
 * # Concurrency Contract
 *
 * Two independent write-boundary mechanisms are used, each protecting a
 * different layer:
 *
 * 1. **File lock** (`acquireFileLock`) — serialises JSON read-modify-write
 *    for a specific `change.json`. Prevents concurrent agents from
 *    clobbering the source-of-truth file.
 *
 * 2. **SQLite IMMEDIATE transaction** — atomically mirrors each JSON write
 *    into the derived SQLite cache.  `BEGIN IMMEDIATE` acquires the write
 *    lock at transaction start so no mid-transaction upgrade is needed.
 *
 * 3. **PRAGMA busy_timeout = 5000** (set in health.ts) — lets SQLite wait up
 *    to 5 s for a DB lock before returning SQLITE_BUSY.  No application-level
 *    retry loop is needed on top of this.
 *
 * Correct write sequence:
 *   acquire file lock → read JSON → mutate → write JSON → upsert SQLite → release lock
 *
 * The file lock and the SQLite transaction are NOT the same thing.  Both are
 * necessary; removing either creates a race window.
 */

import type { SQLiteStore } from "./sqlite";
import type { ProjectPaths } from "./json";
import type { ProjectConfig } from "../types";

export interface StoreContext {
  /** Resolved filesystem paths for specs, changes, archive, etc. */
  paths: ProjectPaths;

  /** SQLite derived-cache store */
  sqlite: SQLiteStore;

  /** Absolute path to the SQLite database file (used for WAL checkpointing) */
  dbPath: string;

  /** Project configuration loaded from project.json (may be null) */
  config: ProjectConfig | null;

  /** Set to true once the store is closed; guards against double-close */
  closed: boolean;

  // ---------------------------------------------------------------------------
  // Lazy-sync state
  // ---------------------------------------------------------------------------

  /** Spec capabilities that have been synced to SQLite in this session */
  syncedSpecs: Set<string>;

  /** Change IDs that have been synced to SQLite in this session */
  syncedChanges: Set<string>;

  /** In-flight spec sync promises (deduplicate concurrent requests) */
  pendingSpecSyncs: Map<string, Promise<void>>;

  /** In-flight change sync promises (deduplicate concurrent requests) */
  pendingChangeSyncs: Map<string, Promise<void>>;

  /** Singleton promise for full spec sync (list/search operations) */
  allSpecsSyncPromise: Promise<void> | null;

  /** Singleton promise for full change sync (list operations) */
  allChangesSyncPromise: Promise<void> | null;

  /** True once project-level wisdom.jsonl has been synced to SQLite in this session */
  projectWisdomSynced: boolean;
}

/**
 * Create a fresh StoreContext given the resolved paths, sqlite instance,
 * dbPath, and optional project config.
 */
export function createStoreContext(
  paths: ProjectPaths,
  sqlite: SQLiteStore,
  dbPath: string,
  config: ProjectConfig | null,
): StoreContext {
  return {
    paths,
    sqlite,
    dbPath,
    config,
    closed: false,
    syncedSpecs: new Set(),
    syncedChanges: new Set(),
    pendingSpecSyncs: new Map(),
    pendingChangeSyncs: new Map(),
    allSpecsSyncPromise: null,
    allChangesSyncPromise: null,
    projectWisdomSynced: false,
  };
}
