/**
 * Unified Store Interface
 *
 * Combines JSON file storage (source of truth) with SQLite caching.
 */

import { join } from "path";
import { mkdir } from "fs/promises";
import { nanoid } from "nanoid";
import { WisdomEntrySchema } from "../types";
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
  TddPhase,
  TddPhaseEvidence,
  WisdomEntry,
  WisdomType,
} from "../types";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import {
  checkpointWAL,
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
  type ProjectPaths,
  type LoadResult,
} from "./json";

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
    ) => Promise<{ changeId: string; path: string }>;
    save: (change: Change) => Promise<void>;
  };

  // Tasks
  tasks: {
    list: (changeId: string, status?: string) => Promise<Task[]>;
    ready: (changeId: string) => Promise<TaskReadyResponse>;
    update: (
      taskId: string,
      status: string,
      notes?: string,
    ) => Promise<Task | null>;
    add: (
      changeId: string,
      content: string,
      options?: { blockedBy?: string[]; section?: string },
    ) => Promise<Task>;
    /** Get a single task by ID */
    get: (taskId: string) => Promise<Task | null>;
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
// Create Store
// =============================================================================

export async function createStore(directory: string): Promise<Store> {
  // Load project config
  const config = await loadProjectConfig(directory);
  const paths = getProjectPaths(directory, config ?? undefined);

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

  // Track if synced this session
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
          specs_dir: "specs",
          changes_dir: "changes",
          archive_dir: "archive",
          docs_dir: "docs/specs",
          db_dir: ".specdb",
          project_file: "project.md",
        };
        await saveProjectConfig(directory, defaultConfig);
      }
    },

    sync: async () => {
      if (synced) return;

      // Sync specs
      const specs = await loadAllSpecs(paths.specs);
      for (const [name, spec] of specs) {
        const jsonPath = join(paths.specs, name, "spec.json");
        sqlite.specs.upsert(spec, jsonPath);
        if (shouldCheckpoint(dbPath)) {
          checkpointWAL(sqlite.db);
        }
      }

      // Sync changes
      const changes = await loadAllChanges(paths.changes);
      for (const [id, change] of changes) {
        const jsonPath = join(paths.changes, id, "change.json");
        sqlite.changes.upsert(change, jsonPath);
        if (shouldCheckpoint(dbPath)) {
          checkpointWAL(sqlite.db);
        }
      }

      synced = true;
    },

    close: () => {
      closeDatabase(sqlite.db);
    },

    specs: {
      list: async (filter) => {
        await store.sync();

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
        return loadSpec(paths.specs, capability);
      },

      search: async (query, limit = 20) => {
        await store.sync();

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
        await store.sync();

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

      create: async (summary, _capability) => {
        // Generate change ID from summary
        // Keep slug short (15 chars) + 4-char nanoid for quick typing
        // Users can reference by just the nanoid suffix (e.g., "abc1")
        const slug = summary
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 15);
        const changeId = `${slug}-${nanoid(4)}`;

        // Create scaffold
        const { changePath, proposalPath } = await createChangeScaffold(
          paths.changes,
          changeId,
          summary,
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
      list: async (changeId, status) => {
        await store.sync();

        // Load from JSON to get full task data including TDD fields
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return [];

        let tasks = result.data.tasks;
        if (status) {
          tasks = tasks.filter((t) => t.status === status);
        }

        return tasks;
      },

      ready: async (changeId) => {
        await store.sync();

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
        await store.sync();

        // Find which change this task belongs to
        const taskRow = sqlite.tasks.get(taskId);
        if (!taskRow) return null;

        // Load the change
        const result = await loadChange(paths.changes, taskRow.change_id);
        if (!result.success || !result.data) return null;

        const change = result.data;

        // Update task in change
        const task = change.tasks.find((t) => t.id === taskId);
        if (!task) return null;

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
      },

      add: async (changeId, content, options) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success) {
          throw new Error(result.error);
        }
        if (!result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }

        const change = result.data;

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
        };

        change.tasks.push(task);
        await store.changes.save(change);

        return task;
      },

      get: async (taskId) => {
        await store.sync();

        // Find which change this task belongs to
        const taskRow = sqlite.tasks.get(taskId);
        if (!taskRow) return null;

        // Load from JSON to get full task data including TDD fields
        const result = await loadChange(paths.changes, taskRow.change_id);
        if (!result.success || !result.data) return null;

        return result.data.tasks.find((t) => t.id === taskId) ?? null;
      },

      recordEvidence: async (taskId, phase, evidence) => {
        await store.sync();

        // Find which change this task belongs to
        const taskRow = sqlite.tasks.get(taskId);
        if (!taskRow) return null;

        // Load the change
        const result = await loadChange(paths.changes, taskRow.change_id);
        if (!result.success || !result.data) return null;

        const change = result.data;

        // Update task in change
        const task = change.tasks.find((t) => t.id === taskId);
        if (!task) return null;

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
      },

      setPhase: async (taskId, phase) => {
        await store.sync();

        // Find which change this task belongs to
        const taskRow = sqlite.tasks.get(taskId);
        if (!taskRow) return null;

        // Load the change
        const result = await loadChange(paths.changes, taskRow.change_id);
        if (!result.success || !result.data) return null;

        const change = result.data;

        // Update task in change
        const task = change.tasks.find((t) => t.id === taskId);
        if (!task) return null;

        task.tdd_phase = phase;

        // Save change
        await store.changes.save(change);

        return task;
      },

      skipTdd: async (taskId, reason) => {
        await store.sync();

        // Find which change this task belongs to
        const taskRow = sqlite.tasks.get(taskId);
        if (!taskRow) return null;

        // Load the change
        const result = await loadChange(paths.changes, taskRow.change_id);
        if (!result.success || !result.data) return null;

        const change = result.data;

        // Update task in change
        const task = change.tasks.find((t) => t.id === taskId);
        if (!task) return null;

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
      },
    },

    wisdom: {
      add: async (changeId, type, content, sourceTask) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success) {
          throw new Error(result.error);
        }
        if (!result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }

        const change = result.data;

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

    status: async () => {
      await store.sync();

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
        },
        recommendations,
      };
    },
  };

  return store;
}
