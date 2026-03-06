/**
 * Unified Store Interface
 *
 * Combines JSON file storage (source of truth) with SQLite caching.
 */

import { join } from "path";
import { mkdir } from "fs/promises";
import { nanoid } from "nanoid";
import {
  WisdomEntrySchema,
  GATE_ORDER,
  canCompleteGate,
  createLegacyGates,
  createDefaultGates,
  type Gates,
} from "../types";
import type {
  Spec,
  Change,
  Task,
  ProjectConfig,
  SpecListResponse,
  ChangeListResponse,
  TaskReadyResponse,
  ProjectStatus,
  ChangeStatus,
  ChangeRecency,
  RecencyBand,
  TddPhase,
  TddPhaseEvidence,
  WisdomEntry,
  WisdomType,
  Cancellation,
} from "../types";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import {
  checkpointWAL,
  getWALSize,
  shouldCheckpoint,
  initDatabase,
  closeDatabase,
} from "./health";
import {
  loadProjectConfig,
  saveProjectConfig,
  loadAllSpecs,
  loadSpec,
  saveSpec,
  loadAllChanges,
  loadChange,
  saveChange,
  createChangeScaffold,
  getProjectPaths,
  resolveChangeId,
  listChangeDirs,
  type ProjectPaths,
  type LoadResult,
} from "./json";
import { acquireFileLock } from "../utils/fs";
import { generateChangeId } from "../utils/change-id";

// =============================================================================
// Store Interface
// =============================================================================

export interface Store {
  paths: ProjectPaths;
  config: ProjectConfig | null;

  // Lifecycle
  init: () => Promise<void>;
  sync: () => Promise<void>;
  close: () => void;
  /**
   * Flush pending writes and checkpoint the WAL.
   * Safe to call multiple times (idempotent).
   * Used by signal handlers before process exit.
   */
  flush: () => Promise<void>;

  // Specs
  specs: {
    list: (filter?: {
      capability?: string;
      tag?: string;
    }) => Promise<SpecListResponse>;
    get: (capability: string) => Promise<LoadResult<Spec | null>>;
    search: (query: string, limit?: number) => Promise<SearchResult[]>;
    save: (spec: Spec) => Promise<void>;
  };

  // Changes
  changes: {
    list: (filter?: {
      status?: string;
      includeArchived?: boolean;
    }) => Promise<ChangeListResponse>;
    get: (changeId: string) => Promise<LoadResult<Change | null>>;
    create: (
      summary: string,
      capability?: string,
      proposalContent?: string,
    ) => Promise<{ changeId: string; path: string }>;
    save: (change: Change) => Promise<void>;
  };

  // Tasks
  tasks: {
    list: (
      changeId: string,
      status?: string,
      filter?: string,
    ) => Promise<Task[]>;
    ready: (changeId: string) => Promise<TaskReadyResponse>;
    update: (
      taskId: string,
      status: string,
      notes?: string,
    ) => Promise<Task | null>;
    add: (
      changeId: string,
      content: string,
      options?: {
        blockedBy?: string[];
        section?: string;
        metadata?: Record<string, string>;
      },
    ) => Promise<Task>;
    /** Get a single task by ID */
    get: (taskId: string) => Promise<Task | null>;
    /** Get a single task by ID with its parent change ID */
    show: (taskId: string) => Promise<{ task: Task; changeId: string } | null>;
    /** Record TDD evidence for a task */
    recordEvidence: (
      taskId: string,
      phase: "red" | "green",
      evidence: TddPhaseEvidence,
    ) => Promise<Task | null>;
    /** Update TDD phase for a task */
    setPhase: (taskId: string, phase: TddPhase) => Promise<Task | null>;
    /** Skip TDD for a task with reason */
    skipTdd: (taskId: string, reason: string) => Promise<Task | null>;
    /** Cancel a task with required user-approved cancellation metadata */
    cancel: (
      taskId: string,
      cancellation: Cancellation,
    ) => Promise<Task | null>;
  };

  // Wisdom (cross-task learning)
  wisdom: {
    /** Add a wisdom entry to a change */
    add: (
      changeId: string,
      type: WisdomType,
      content: string,
      sourceTask?: string,
    ) => Promise<WisdomEntry>;
    /** List all wisdom entries for a change */
    list: (changeId: string) => Promise<WisdomEntry[]>;
  };

  // Gates (6-gate quality checklist)
  gates: {
    /** Get gates for a change or agenda item */
    get: (changeId: string) => Promise<Gates | null>;
    /** Complete a gate with sequence enforcement */
    complete: (
      changeId: string,
      gateId:
        | "research"
        | "prep"
        | "implementation"
        | "review"
        | "harden"
        | "signoff",
    ) => Promise<void>;
    /** Migrate gates to legacy status (except signoff) */
    migrate: (changeId: string) => Promise<void>;
  };

  // Status
  status: () => Promise<ProjectStatus>;
}

export interface SearchResult {
  spec: string;
  requirement: string;
  title: string;
  match: string;
}

// =============================================================================
// Recency Helpers
// =============================================================================

/** Recency band thresholds in minutes */
const RECENCY_HOT_THRESHOLD_MIN = 60;
const RECENCY_STALE_THRESHOLD_MIN = 180;

/**
 * Classify minutes-since-activity into a recency band.
 */
export function classifyRecency(minutesSince: number): RecencyBand {
  if (minutesSince <= RECENCY_HOT_THRESHOLD_MIN) return "hot";
  if (minutesSince >= RECENCY_STALE_THRESHOLD_MIN) return "stale";
  return "warm";
}

/**
 * Compute the most recent activity timestamp for a change.
 *
 * Scans (in priority order):
 * 1. Task timestamps: started_at, completed_at
 * 2. Gate completion timestamps
 * 3. Validation timestamp
 * 4. Wisdom entry timestamps
 * 5. Fallback: change.created_at
 *
 * Returns the latest ISO8601 timestamp found.
 */
export function computeLastActivity(change: Change): string {
  let latest = change.created_at;

  const consider = (ts: string | null | undefined) => {
    if (ts && ts > latest) {
      latest = ts;
    }
  };

  // Task timestamps
  for (const task of change.tasks) {
    consider(task.created_at);
    consider(task.started_at);
    consider(task.completed_at);
    if (task.cancellation?.approved_at) {
      consider(task.cancellation.approved_at);
    }
  }

  // Gate timestamps
  if (change.gates) {
    for (const gateId of GATE_ORDER) {
      consider(change.gates[gateId]?.completed_at);
    }
  }

  // Validation timestamp
  consider(change.validation?.validated_at);

  // Wisdom timestamps
  if (change.wisdom) {
    for (const entry of change.wisdom) {
      consider(entry.recorded_at);
    }
  }

  return latest;
}

/**
 * Build a ChangeRecency record for a change at a given reference time.
 */
export function buildChangeRecency(
  change: Change,
  tasks: { total: number; done: number },
  now: Date,
): ChangeRecency {
  const lastActivityAt = computeLastActivity(change);
  const activityDate = new Date(lastActivityAt);
  const minutesSinceActivity = Math.max(
    0,
    Math.floor((now.getTime() - activityDate.getTime()) / 60000),
  );

  return {
    id: change.id,
    title: change.title,
    status: change.status,
    completedTasks: tasks.done,
    taskCount: tasks.total,
    lastActivityAt,
    minutesSinceActivity,
    recency: classifyRecency(minutesSinceActivity),
  };
}

// =============================================================================
// Create Store
// =============================================================================

export async function createStore(
  directory: string,
  options?: { externalRoot?: string },
): Promise<Store> {
  // Load project config
  const config = await loadProjectConfig(directory);
  const paths = getProjectPaths(directory, config ?? undefined, {
    externalRoot: options?.externalRoot,
  });

  // Ensure .specdb directory exists
  await mkdir(paths.db, { recursive: true });

  // Initialize SQLite
  const dbPath = join(paths.db, "spec.db");
  const sqlite: SQLiteStore = createSQLiteStore(dbPath);

  // Add health check on startup
  try {
    initDatabase(sqlite.db);
  } catch (e) {
    const error = e as Error;
    const isCorruption =
      error.message.includes("corrupted") ||
      error.message.includes("malformed") ||
      error.message.includes("corrupt");

    if (isCorruption) {
      console.warn(
        `⚠️  Database corrupted: ${error.message}\n` +
          "   Deleting corrupted database and rebuilding from JSON...",
      );

      // Delete corrupted files
      const { rm } = await import("fs/promises");
      await rm(dbPath, { force: true });
      await rm(`${dbPath}-wal`, { force: true });
      await rm(`${dbPath}-shm`, { force: true });

      // Recreate database
      const newStore = createSQLiteStore(dbPath);
      sqlite.db = newStore.db;
      initDatabase(sqlite.db);
      console.log("✅ Database recovered and rebuilt from JSON");
    } else {
      throw e;
    }
  }

  // Track if closed to prevent double-close
  let closed = false;

  // ==========================================================================
  // Lazy Sync Infrastructure
  // ==========================================================================
  // Instead of syncing ALL specs/changes on startup, we sync on-demand
  // This dramatically reduces plugin initialization time

  // Track what's been synced this session
  const syncedSpecs = new Set<string>();
  const syncedChanges = new Set<string>();

  // Track pending sync promises to handle concurrent access
  const pendingSpecSyncs = new Map<string, Promise<void>>();
  const pendingChangeSyncs = new Map<string, Promise<void>>();

  // Full sync promises (for list/search operations that need everything)
  let allSpecsSyncPromise: Promise<void> | null = null;
  let allChangesSyncPromise: Promise<void> | null = null;

  /**
   * Ensure a single spec is synced to SQLite.
   * Used for targeted operations like specs.get()
   */
  const ensureSpecSynced = async (capability: string): Promise<void> => {
    if (closed) return;
    if (syncedSpecs.has(capability)) return;

    // Check if sync is already in progress
    let pending = pendingSpecSyncs.get(capability);
    if (pending) return pending;

    // Start new sync
    pending = (async () => {
      try {
        const jsonPath = join(paths.specs, capability, "spec.json");
        if (sqlite.sync.needsSync(jsonPath)) {
          const result = await loadSpec(paths.specs, capability);
          if (result.success && result.data) {
            sqlite.specs.upsert(result.data, jsonPath);
            sqlite.sync.markSynced(jsonPath);
            if (shouldCheckpoint(dbPath)) {
              checkpointWAL(sqlite.db);
            }
          }
        }
        syncedSpecs.add(capability);
      } finally {
        pendingSpecSyncs.delete(capability);
      }
    })();

    pendingSpecSyncs.set(capability, pending);
    return pending;
  };

  /**
   * Ensure all specs are synced to SQLite.
   * Required for list() and search() operations that need full FTS index.
   * Uses promise singleton pattern - only runs once per session.
   */
  const ensureAllSpecsSynced = async (): Promise<void> => {
    if (closed) return;
    if (allSpecsSyncPromise) return allSpecsSyncPromise;

    allSpecsSyncPromise = (async () => {
      const specs = await loadAllSpecs(paths.specs);
      for (const [name, spec] of specs) {
        if (syncedSpecs.has(name)) continue;

        const jsonPath = join(paths.specs, name, "spec.json");
        if (sqlite.sync.needsSync(jsonPath)) {
          sqlite.specs.upsert(spec, jsonPath);
          sqlite.sync.markSynced(jsonPath);
          if (shouldCheckpoint(dbPath)) {
            checkpointWAL(sqlite.db);
          }
        }
        syncedSpecs.add(name);
      }
    })();

    return allSpecsSyncPromise;
  };

  /**
   * Ensure a single change is synced to SQLite.
   * Used for targeted operations like changes.get()
   */
  const ensureChangeSynced = async (changeId: string): Promise<void> => {
    if (closed) return;
    if (syncedChanges.has(changeId)) return;

    // Check if sync is already in progress
    let pending = pendingChangeSyncs.get(changeId);
    if (pending) return pending;

    // Start new sync
    pending = (async () => {
      try {
        const jsonPath = join(paths.changes, changeId, "change.json");
        if (sqlite.sync.needsSync(jsonPath)) {
          const result = await loadChange(paths.changes, changeId);
          if (result.success && result.data) {
            sqlite.changes.upsert(result.data, jsonPath);
            sqlite.sync.markSynced(jsonPath);
            if (shouldCheckpoint(dbPath)) {
              checkpointWAL(sqlite.db);
            }
          }
        }
        syncedChanges.add(changeId);
      } finally {
        pendingChangeSyncs.delete(changeId);
      }
    })();

    pendingChangeSyncs.set(changeId, pending);
    return pending;
  };

  /**
   * Ensure all changes are synced to SQLite.
   * Required for list() operations.
   * Uses promise singleton pattern - only runs once per session.
   */
  const ensureAllChangesSynced = async (): Promise<void> => {
    if (closed) return;
    if (allChangesSyncPromise) return allChangesSyncPromise;

    allChangesSyncPromise = (async () => {
      const changes = await loadAllChanges(paths.changes);
      for (const [id, change] of changes) {
        if (syncedChanges.has(id)) continue;

        const jsonPath = join(paths.changes, id, "change.json");
        if (sqlite.sync.needsSync(jsonPath)) {
          sqlite.changes.upsert(change, jsonPath);
          sqlite.sync.markSynced(jsonPath);
          if (shouldCheckpoint(dbPath)) {
            checkpointWAL(sqlite.db);
          }
        }
        syncedChanges.add(id);
      }
    })();

    return allChangesSyncPromise;
  };

  /**
   * Resolve a taskId to its Task, parent Change, and changeId.
   * Extracted to DRY up the 6 methods that all need this lookup.
   * Not exposed on the Store interface — internal to the closure.
   */
  const resolveTask = async (
    taskId: string,
  ): Promise<{ task: Task; change: Change; changeId: string } | null> => {
    await ensureAllChangesSynced();

    const taskRow = sqlite.tasks.get(taskId);
    if (!taskRow) return null;

    const result = await loadChange(paths.changes, taskRow.change_id);
    if (!result.success || !result.data) return null;

    const task = result.data.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    return { task, change: result.data, changeId: taskRow.change_id };
  };

  /**
   * Execute a function within a file lock for a specific change.json.
   * Prevents read-modify-write race conditions.
   */
  const withChangeLock = async <T>(
    changeId: string,
    fn: (change: Change) => Promise<T>,
  ): Promise<T> => {
    const changePath = join(paths.changes, changeId, "change.json");

    let release;
    try {
      release = await acquireFileLock(changePath);
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        throw new Error(`Change not found: ${changeId}`);
      }
      throw e;
    }

    try {
      const result = await loadChange(paths.changes, changeId);
      if (!result.success || !result.data) {
        throw new Error(`Change not found: ${changeId}`);
      }
      return await fn(result.data);
    } finally {
      await release();
    }
  };

  /**
   * Execute a function within a file lock for the change containing a specific task.
   * Resolves the task and change under the lock.
   */
  const withTaskLock = async <T>(
    taskId: string,
    fn: (task: Task, change: Change, changeId: string) => Promise<T>,
  ): Promise<T | null> => {
    await ensureAllChangesSynced();
    const taskRow = sqlite.tasks.get(taskId);
    if (!taskRow) return null;

    const changeId = taskRow.change_id;
    return withChangeLock(changeId, async (change) => {
      const task = change.tasks.find((t) => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in change ${changeId}`);
      }
      return await fn(task, change, changeId);
    });
  };

  // Legacy flag for backwards compatibility
  let synced = false;

  const store: Store = {
    paths,
    config,

    init: async () => {
      // Create directory structure if needed
      await mkdir(paths.specs, { recursive: true });
      await mkdir(paths.changes, { recursive: true });
      await mkdir(paths.archive, { recursive: true });
      await mkdir(paths.docs, { recursive: true });

      // Create default config if missing
      if (!config) {
        const defaultConfig: ProjectConfig = {
          name: directory.split("/").pop() ?? "project",
          version: "0.1.0",
          specs_dir: ".adv/specs",
          changes_dir: ".adv/changes",
          archive_dir: ".adv/archive",
          docs_dir: "docs/specs",
          db_dir: ".adv/db",
          project_file: "project.md",
          features: {
            tdd_enforcement: "strict",
            worktree_auto_create: true,
            gate_enforcement: "strict",
            wisdom_accumulation: true,
            slop_scan: {
              nesting_depth_threshold: 4,
              defensive_guard_threshold: 3,
              complexity_threshold: 10,
              ast_timeout_ms: 10000,
            },
          },
        };
        await saveProjectConfig(directory, defaultConfig);
      }
    },

    sync: async () => {
      // Use lazy sync infrastructure - this is now idempotent
      // and can be called multiple times safely
      if (synced || closed) return;

      // Delegate to lazy sync helpers (they handle deduplication)
      await ensureAllSpecsSynced();
      await ensureAllChangesSynced();

      synced = true;
    },

    close: () => {
      if (closed) return; // Prevent double-close
      closed = true;
      closeDatabase(sqlite.db);
    },

    flush: async () => {
      // Idempotent: safe to call multiple times
      if (closed) return;
      try {
        // Force WAL checkpoint to sync pending writes to the main database file
        checkpointWAL(sqlite.db);
      } catch {
        // Non-fatal: flush is best-effort before shutdown
      }
    },

    specs: {
      list: async (filter) => {
        // Lazy sync: list needs all specs for complete results
        await ensureAllSpecsSynced();

        const rows = sqlite.specs.list({ name: filter?.capability });

        // Filter by tag if needed (requires loading full specs)
        let specs = rows;
        if (filter?.tag) {
          const filtered = [];
          for (const row of rows) {
            const specResult = await loadSpec(paths.specs, row.name);
            if (specResult.success && specResult.data) {
              const hasTags = specResult.data.requirements.some((r) =>
                r.tags?.includes(filter.tag!),
              );
              if (hasTags) filtered.push(row);
            }
          }
          specs = filtered;
        }

        return {
          specs: specs.map((s) => ({
            name: s.name,
            title: s.title,
            version: s.version,
            requirementCount: sqlite.requirements.list(s.name).length,
          })),
        };
      },

      get: async (capability) => {
        // Lazy sync: only sync this specific spec
        await ensureSpecSynced(capability);
        return loadSpec(paths.specs, capability);
      },

      search: async (query, limit = 20) => {
        // Lazy sync: search needs full FTS index
        await ensureAllSpecsSynced();

        const results = sqlite.requirements.search(query, limit);
        return results.map((r) => ({
          spec: r.spec_name,
          requirement: r.id,
          title: r.title,
          match: r.match,
        }));
      },

      save: async (spec) => {
        const jsonPath = await saveSpec(paths.specs, spec);
        sqlite.specs.upsert(spec, jsonPath);
        if (shouldCheckpoint(dbPath)) {
          checkpointWAL(sqlite.db);
        }
      },
    },

    changes: {
      list: async (filter) => {
        // Lazy sync: list needs all changes for complete results
        await ensureAllChangesSynced();

        let rows = sqlite.changes.list({ status: filter?.status });

        // Exclude archived unless requested
        if (!filter?.includeArchived) {
          rows = rows.filter((r) => r.status !== "archived");
        }

        return {
          changes: rows.map((c) => {
            const tasks = sqlite.tasks.list(c.id);
            return {
              id: c.id,
              title: c.title,
              status: c.status as ChangeStatus,
              taskCount: tasks.length,
              completedTasks: tasks.filter((t) => t.status === "done").length,
            };
          }),
        };
      },

      get: async (changeId) => {
        // Support partial ID matching (e.g., just "abc1" instead of full ID)
        const { id: resolvedId, candidates } = await resolveChangeId(
          paths.changes,
          changeId,
        );

        if (!resolvedId) {
          if (candidates.length > 1) {
            return {
              success: false,
              error: `Ambiguous change ID "${changeId}". Matches: ${candidates.join(", ")}. Please be more specific.`,
              type: "not_found" as const,
            };
          }
          return {
            success: false,
            error: `Change not found: ${changeId}`,
            type: "not_found" as const,
          };
        }

        return loadChange(paths.changes, resolvedId);
      },

      create: async (summary, _capability, proposalContent) => {
        // Generate concise change ID from summary
        const baseId = generateChangeId(summary);

        // Check for collisions and auto-increment
        const existingDirs = await listChangeDirs(paths.changes);
        let changeId = baseId;
        let counter = 2;
        while (existingDirs.includes(changeId)) {
          changeId = `${baseId}${counter}`;
          counter++;
        }

        // Create scaffold
        const { changePath, proposalPath } = await createChangeScaffold(
          paths.changes,
          changeId,
          summary,
          proposalContent,
        );

        // Create change.json
        const change: Change = {
          $schema:
            "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json",
          id: changeId,
          title: summary,
          status: "draft",
          created_at: new Date().toISOString(),
          tasks: [],
          deltas: {},
        };

        await saveChange(paths.changes, change);
        sqlite.changes.upsert(change, changePath);

        return { changeId, path: proposalPath };
      },

      save: async (change) => {
        const jsonPath = await saveChange(paths.changes, change);
        sqlite.changes.upsert(change, jsonPath);
        if (shouldCheckpoint(dbPath)) {
          checkpointWAL(sqlite.db);
        }
      },
    },

    tasks: {
      list: async (changeId, status, filter) => {
        // Lazy sync: only sync this specific change
        await ensureChangeSynced(changeId);

        // Load from JSON to get full task data including TDD fields
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return [];

        let tasks = result.data.tasks;
        if (status) {
          tasks = tasks.filter((t) => t.status === status);
        }

        // Apply metadata filter if provided
        if (filter) {
          const hasKeyMatch = filter.match(/^has_metadata_key:(.+)$/);
          const kvMatch = filter.match(/^metadata:([^=]+)=(.+)$/);
          if (hasKeyMatch) {
            const key = hasKeyMatch[1];
            tasks = tasks.filter((t) => t.metadata && key in t.metadata);
          } else if (kvMatch) {
            const key = kvMatch[1];
            const value = kvMatch[2];
            tasks = tasks.filter((t) => t.metadata?.[key] === value);
          }
        }

        return tasks;
      },

      ready: async (changeId) => {
        // Lazy sync: only sync this specific change
        await ensureChangeSynced(changeId);

        // Load from JSON to get full task data including TDD fields
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return { ready: [], blocked: [] };

        const change = result.data;

        // Use SQLite for dependency resolution
        const { ready: readyIds, blocked: blockedInfo } =
          sqlite.tasks.ready(changeId);
        const readyIdSet = new Set(readyIds.map((r) => r.id));

        const ready = change.tasks.filter((t) => readyIdSet.has(t.id));
        const blocked = blockedInfo.map((b) => ({
          task: change.tasks.find((t) => t.id === b.task.id)!,
          blockedBy: b.blockedBy,
        }));

        return { ready, blocked };
      },

      update: async (taskId, status, notes) => {
        return withTaskLock(taskId, async (task, change) => {
          task.status = status as Task["status"];

          if (status === "in_progress" && !task.started_at) {
            task.started_at = new Date().toISOString();
          }

          if (status === "done" || status === "cancelled") {
            task.completed_at = new Date().toISOString();
            if (notes) {
              task.completed_by = notes;
            }
          }

          // Save change
          await store.changes.save(change);

          return task;
        });
      },

      add: async (changeId, content, options) => {
        return withChangeLock(changeId, async (change) => {
          const task: Task = {
            id: `tk-${nanoid(8)}`,
            title: content,
            section: options?.section,
            status: "pending",
            priority: change.tasks.length, // Append at end
            created_at: new Date().toISOString(),
            deps: options?.blockedBy?.map((target) => ({
              type: "blocked_by" as const,
              target,
            })),
            tdd_phase: "none",
            ...(options?.metadata ? { metadata: options.metadata } : {}),
          };

          change.tasks.push(task);
          await store.changes.save(change);

          return task;
        });
      },

      get: async (taskId) => {
        const resolved = await resolveTask(taskId);
        return resolved?.task ?? null;
      },

      show: async (taskId) => {
        const resolved = await resolveTask(taskId);
        if (!resolved) return null;
        return { task: resolved.task, changeId: resolved.changeId };
      },

      recordEvidence: async (taskId, phase, evidence) => {
        return withTaskLock(taskId, async (task, change) => {
          // Initialize tdd_evidence if needed
          if (!task.tdd_evidence) {
            task.tdd_evidence = {};
          }

          // Add timestamp if not provided
          const evidenceWithTimestamp = {
            ...evidence,
            recorded_at: evidence.recorded_at ?? new Date().toISOString(),
          };

          // Record evidence for the phase
          task.tdd_evidence[phase] = evidenceWithTimestamp;

          // Update TDD phase based on evidence
          if (phase === "red") {
            task.tdd_phase = "red";
          } else if (phase === "green") {
            // If we have both red and green, mark as complete
            if (task.tdd_evidence.red?.recorded_at) {
              task.tdd_phase = "complete";
            } else {
              task.tdd_phase = "green";
            }
          }

          // Save change
          await store.changes.save(change);

          return task;
        });
      },

      setPhase: async (taskId, phase) => {
        return withTaskLock(taskId, async (task, change) => {
          task.tdd_phase = phase;

          // Save change
          await store.changes.save(change);

          return task;
        });
      },

      skipTdd: async (taskId, reason) => {
        return withTaskLock(taskId, async (task, change) => {
          // Initialize tdd_evidence if needed
          if (!task.tdd_evidence) {
            task.tdd_evidence = {};
          }

          task.tdd_evidence.skipped = true;
          task.tdd_evidence.skip_reason = reason;
          task.tdd_phase = "none";

          // Save change
          await store.changes.save(change);

          return task;
        });
      },

      cancel: async (taskId, cancellation) => {
        return withTaskLock(taskId, async (task, change) => {
          task.status = "cancelled";
          task.completed_at = new Date().toISOString();
          task.cancellation = cancellation;

          // Save change
          await store.changes.save(change);

          return task;
        });
      },
    },

    wisdom: {
      add: async (changeId, type, content, sourceTask) => {
        return withChangeLock(changeId, async (change) => {
          // Initialize wisdom array if needed
          if (!change.wisdom) {
            change.wisdom = [];
          }

          const entry: WisdomEntry = WisdomEntrySchema.parse({
            id: `ws-${nanoid(6)}`,
            type,
            content,
            source_task: sourceTask,
            recorded_at: new Date().toISOString(),
          });

          change.wisdom.push(entry);
          await store.changes.save(change);

          return entry;
        });
      },

      list: async (changeId) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success) {
          throw new Error(result.error);
        }
        if (!result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }

        return result.data.wisdom ?? [];
      },
    },

    gates: {
      get: async (changeId) => {
        // Lazy sync: only sync this specific change
        await ensureChangeSynced(changeId);

        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;

        return result.data.gates ?? createDefaultGates();
      },

      complete: async (changeId, gateId) => {
        return withChangeLock(changeId, async (change) => {
          if (!change.gates) {
            change.gates = createDefaultGates();
          }

          const gates = change.gates!;

          if (!canCompleteGate(gates, gateId)) {
            const prevIdx = GATE_ORDER.indexOf(gateId);
            const prevGateId = GATE_ORDER[prevIdx - 1];
            const prevStatus = gates[prevGateId].status;

            const reason = `Cannot complete ${gateId} gate: previous gate ${
              prevGateId
            } is not satisfied (status: ${prevStatus})`;
            throw new Error(reason);
          }

          const oldStatus = gates[gateId].status;
          const now = new Date().toISOString();

          gates[gateId].status = "done";
          gates[gateId].completed_at = now;
          gates[gateId].completed_by = "agent";

          // Structured log for gate transition
          if (process.env.ADV_DEBUG) {
            console.log(
              JSON.stringify({
                event: "gate_complete",
                changeId,
                gateId,
                oldStatus,
                newStatus: "done",
                timestamp: now,
              }),
            );
          }

          await store.changes.save(change);
        });
      },

      migrate: async (changeId) => {
        return withChangeLock(changeId, async (change) => {
          const now = new Date().toISOString();
          change.gates = createLegacyGates();

          // Structured log for gate migration
          if (process.env.ADV_DEBUG) {
            console.log(
              JSON.stringify({
                event: "gates_migrated",
                changeId,
                status: "legacy",
                timestamp: now,
              }),
            );
          }

          await store.changes.save(change);
        });
      },
    },

    status: async () => {
      // Lazy sync: status needs complete overview
      await ensureAllSpecsSynced();
      await ensureAllChangesSynced();

      const specRows = sqlite.specs.list();
      const changeRows = sqlite.changes.list();

      const byStatus: Record<ChangeStatus, number> = {
        draft: 0,
        pending: 0,
        active: 0,
        archived: 0,
      };

      for (const change of changeRows) {
        byStatus[change.status as ChangeStatus]++;
      }

      const recommendations: string[] = [];

      // Build recency-sorted list of active (non-archived) changes
      const now = new Date();
      const recentChanges: ChangeRecency[] = [];

      // Doctor-lite integrity checks
      // 1) JSON/SQLite consistency for changes and tasks
      for (const change of changeRows) {
        const jsonResult = await loadChange(paths.changes, change.id);
        if (!jsonResult.success || !jsonResult.data) {
          recommendations.push(
            `[doctor] JSON/SQLite inconsistency: change \`${change.id}\` exists in SQLite cache but change.json could not be loaded`,
          );
          continue;
        }

        const sqliteTasks = sqlite.tasks.list(change.id).map((t) => t.id);
        const jsonTasks = jsonResult.data.tasks.map((t) => t.id);
        const sqliteOnly = sqliteTasks.filter((id) => !jsonTasks.includes(id));
        const jsonOnly = jsonTasks.filter((id) => !sqliteTasks.includes(id));
        if (sqliteOnly.length > 0 || jsonOnly.length > 0) {
          recommendations.push(
            `[doctor] JSON/SQLite inconsistency: task index mismatch for change \`${change.id}\` (sqlite_only=${sqliteOnly.length}, json_only=${jsonOnly.length})`,
          );
        }

        // Compute recency for non-archived changes
        if (change.status !== "archived") {
          const tasks = jsonResult.data.tasks;
          recentChanges.push(
            buildChangeRecency(
              jsonResult.data,
              {
                total: tasks.length,
                done: tasks.filter((t) => t.status === "done").length,
              },
              now,
            ),
          );
        }
      }

      // Sort by most recent activity first; tie-break by id for determinism
      recentChanges.sort((a, b) => {
        const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

      // 2) Broken task->change references in SQLite cache
      const danglingTaskRefs = sqlite.db
        .query(
          `SELECT t.id as task_id, t.change_id
           FROM tasks t
           LEFT JOIN changes c ON c.id = t.change_id
           WHERE c.id IS NULL`,
        )
        .all() as Array<{ task_id: string; change_id: string }>;
      if (danglingTaskRefs.length > 0) {
        recommendations.push(
          `[doctor] Broken task->change refs: ${danglingTaskRefs.length} task(s) reference missing change rows in SQLite cache`,
        );
      }

      // 3) Pending WAL check (archive reliability)
      const walBytes = getWALSize(dbPath);
      if (walBytes > 0) {
        recommendations.push(
          `[doctor] Pending WAL checkpoint: ${walBytes} bytes in WAL file (run flush/checkpoint before archive)`,
        );
      }

      // Check for ready-to-archive changes
      for (const change of changeRows) {
        if (change.status === "active") {
          const tasks = sqlite.tasks.list(change.id);
          const allDone = tasks.every(
            (t) => t.status === "done" || t.status === "cancelled",
          );
          if (allDone && tasks.length > 0) {
            recommendations.push(
              `Ready to archive: \`/adv-archive ${change.id}\``,
            );
          }
        }
      }

      return {
        specs: {
          count: specRows.length,
          capabilities: specRows.map((s) => s.name),
        },
        changes: {
          active: changeRows.filter((c) => c.status !== "archived").length,
          byStatus,
          recent: recentChanges,
        },
        recommendations,
      };
    },
  };

  return store;
}
