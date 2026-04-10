/**
 * Tasks and Wisdom Domain Operations
 *
 * Factory functions that return the `tasks` and `wisdom` namespaces of the
 * Store interface. Extracted from store.ts to keep domain logic co-located
 * and testable.
 */

import { nanoid } from "nanoid";
import type { Change, Task, WisdomEntry } from "../types";
import { WisdomEntrySchema } from "../types";
import {
  withChangeLock,
  withTaskLock,
  resolveTask,
  loadChangeOrNull,
  loadChangeOrThrow,
} from "./store-locks";
import type { StoreContext } from "./store-context";
import type { Store } from "./store";

export function createTasksOps(
  ctx: StoreContext,
  ensureAllChangesSynced: () => Promise<void>,
  ensureChangeSynced: (id: string) => Promise<void>,
  saveFn: (change: Change) => Promise<void>,
): Store["tasks"] {
  return {
    list: async (changeId, status, filter) => {
      // Lazy sync: only sync this specific change
      await ensureChangeSynced(changeId);

      // Load from JSON to get full task data including TDD fields
      const change = await loadChangeOrNull(ctx, changeId);
      if (!change) return [];

      let tasks = change.tasks;
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
      const change = await loadChangeOrNull(ctx, changeId);
      if (!change) return { ready: [], blocked: [] };

      // Use SQLite for dependency resolution
      const { ready: readyIds, blocked: blockedInfo } =
        ctx.sqlite.tasks.ready(changeId);
      const readyIdSet = new Set(readyIds.map((r) => r.id));

      const ready = change.tasks.filter((t) => readyIdSet.has(t.id));
      const blocked = blockedInfo.flatMap((b) => {
        const task = change.tasks.find((t) => t.id === b.task.id);
        if (!task) {
          return [];
        }
        return [{ task, blockedBy: b.blockedBy }];
      });

      return { ready, blocked };
    },

    update: async (taskId, status, notes) => {
      return withTaskLock(
        ctx,
        taskId,
        ensureAllChangesSynced,
        async (task, change) => {
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
          await saveFn(change);

          return task;
        },
      );
    },

    add: async (changeId, content, options) => {
      return withChangeLock(ctx, changeId, async (change) => {
        const nextPriority =
          change.tasks.length === 0
            ? 0
            : Math.max(...change.tasks.map((t) => t.priority ?? 0)) + 1;
        const task: Task = {
          id: `tk-${nanoid(8)}`,
          title: content,
          type: options?.type ?? "code",
          section: options?.section,
          status: "pending",
          priority: nextPriority,
          created_at: new Date().toISOString(),
          deps: options?.blockedBy?.map((target) => ({
            type: "blocked_by" as const,
            target,
          })),
          tdd_phase: "none",
          ...(options?.metadata ? { metadata: options.metadata } : {}),
        };

        change.tasks.push(task);
        await saveFn(change);

        return task;
      });
    },

    get: async (taskId) => {
      const resolved = await resolveTask(ctx, taskId, ensureAllChangesSynced);
      return resolved?.task ?? null;
    },

    show: async (taskId) => {
      const resolved = await resolveTask(ctx, taskId, ensureAllChangesSynced);
      if (!resolved) return null;
      return { task: resolved.task, changeId: resolved.changeId };
    },

    recordEvidence: async (taskId, phase, evidence) => {
      return withTaskLock(
        ctx,
        taskId,
        ensureAllChangesSynced,
        async (task, change) => {
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
          await saveFn(change);

          return task;
        },
      );
    },

    setPhase: async (taskId, phase) => {
      return withTaskLock(
        ctx,
        taskId,
        ensureAllChangesSynced,
        async (task, change) => {
          task.tdd_phase = phase;

          // Save change
          await saveFn(change);

          return task;
        },
      );
    },

    cancel: async (taskId, cancellation) => {
      return withTaskLock(
        ctx,
        taskId,
        ensureAllChangesSynced,
        async (task, change) => {
          task.status = "cancelled";
          task.completed_at = new Date().toISOString();
          task.cancellation = cancellation;

          // Save change
          await saveFn(change);

          return task;
        },
      );
    },

    reclassifyTdd: async (taskId, reclassification) => {
      return withTaskLock(
        ctx,
        taskId,
        ensureAllChangesSynced,
        async (task, change) => {
          // Update the metadata tdd_intent
          if (!task.metadata) {
            task.metadata = {};
          }
          task.metadata.tdd_intent = reclassification.to_intent;

          // Record the audit trail
          task.tdd_reclassification = reclassification;

          // Save change
          await saveFn(change);

          return task;
        },
      );
    },
  };
}

export function createWisdomOps(
  ctx: StoreContext,
  saveFn: (change: Change) => Promise<void>,
): Store["wisdom"] {
  return {
    add: async (changeId, type, content, sourceTask) => {
      return withChangeLock(ctx, changeId, async (change) => {
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
        await saveFn(change);

        return entry;
      });
    },

    list: async (changeId) => {
      const change = await loadChangeOrThrow(ctx, changeId);
      return change.wisdom ?? [];
    },
  };
}
