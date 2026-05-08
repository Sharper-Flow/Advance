/**
 * Investment Report Tool
 *
 * Read-only, stateless tool returning a structured investment report
 * for a change. Used by:
 * - /adv-discover, /adv-review, /adv-archive — one-line summary display
 *
 * All metrics are proxies derived from existing change state (timestamps,
 * retry counts, gate completions). No schema changes to Task required.
 * No persisted state on the tool side.
 *
 * Composition rules (per design D5):
 * - doom-loop detection scans all tasks (not just in_progress)
 */
import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { GATE_ORDER, type GateId } from "../types";
import { getDoomLoopInfo } from "../events/status";

// =============================================================================
// Tool Definition
// =============================================================================

export const investmentTools = {
  adv_investment_report: {
    description:
      "Return a structured investment report for a change — task counts, elapsed time, retry metrics, doom-loop state, and per-gate durations. Read-only, stateless.",
    args: {
      changeId: z.string().describe("Change ID to compute the report for"),
    },
    execute: async (
      args: { changeId: string },
      store: Store,
    ): Promise<string> => {
      const changeResult = await store.changes.get(args.changeId);
      if (!changeResult.success) {
        return formatToolOutput({ error: changeResult.error });
      }
      if (!changeResult.data) {
        return formatToolOutput({
          error: `Change not found: ${args.changeId}`,
        });
      }

      const change = changeResult.data;
      const tasks = change.tasks ?? [];

      // Task counts
      const taskCounts = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        cancelled: tasks.filter((t) => t.status === "cancelled").length,
        pending: tasks.filter((t) => t.status === "pending").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
      };

      // Elapsed wall-clock from created_at
      const createdMs = parseTimestamp(change.created_at);
      const elapsedMs =
        createdMs === null ? 0 : Math.max(0, Date.now() - createdMs);

      // Retry aggregation from error_recovery.attempts[] across all tasks
      let retryTotal = 0;
      for (const task of tasks) {
        const attempts = task.error_recovery?.attempts ?? [];
        retryTotal += attempts.length;
      }
      const retryDenominator = Math.max(
        1,
        taskCounts.done + taskCounts.cancelled,
      );
      const retryDensity = retryTotal / retryDenominator;

      // Doom-loop state — change-level scan per design D5 (not per-task)
      let doomLoopActive = false;
      for (const task of tasks) {
        const info = getDoomLoopInfo(task.id);
        if (info.inDoomLoop) {
          doomLoopActive = true;
          break;
        }

        // Fallback for session restarts: the in-memory retry tracker is lost on
        // process restart, but persisted error_recovery attempts remain. Treat
        // 3+ persisted attempts on any task as an active doom-loop signal for
        // review/apply composition purposes.
        const persistedAttempts = task.error_recovery?.attempts?.length ?? 0;
        const persistedRetryCount = task.error_recovery?.retry_count ?? 0;
        if (persistedAttempts >= 3 || persistedRetryCount >= 3) {
          doomLoopActive = true;
          break;
        }
      }

      // Per-gate durations (completed_at deltas between consecutive gates)
      const perGateMs = computePerGateDurations(change);
      const activeElapsedMs = Object.values(perGateMs).reduce(
        (sum, ms) => sum + ms,
        0,
      );
      const perGateWorkMs = computePerGateWorkDurations(change);
      const activeWorkMs = Object.values(perGateWorkMs).reduce(
        (sum, ms) => sum + ms,
        0,
      );

      return formatToolOutput({
        task_counts: taskCounts,
        elapsed_ms: elapsedMs,
        active_elapsed_ms: activeElapsedMs,
        active_work_ms: activeWorkMs,
        retry_total: retryTotal,
        retry_density: retryDensity,
        doom_loop_active: doomLoopActive,
        per_gate_ms: perGateMs,
        per_gate_work_ms: perGateWorkMs,
        token_hint:
          "Token tracking not yet available — informational field reserved for v2.",
      });
    },
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse an ISO8601 timestamp string into ms since epoch.
 * Returns null for null/undefined/unparseable input.
 */
function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Compute per-gate durations as the delta between a gate's completed_at
 * and the previous completed gate's completed_at.
 *
 * Returns a record keyed by gate_id. Only populated for gates that are
 * themselves "done" AND have a prior completed gate to diff against.
 * The first gate (proposal) is measured against change.created_at.
 */
export function computePerGateDurations(change: {
  created_at?: string;
  gates?: Record<
    string,
    { status?: string; completed_at?: string } | undefined
  >;
}): Record<string, number> {
  const gates = change.gates ?? {};
  const result: Record<string, number> = {};

  let previousMs = parseTimestamp(change.created_at);

  for (const gateId of GATE_ORDER as GateId[]) {
    const gate = gates[gateId];
    if (!gate || gate.status !== "done") continue;
    const currentMs = parseTimestamp(gate.completed_at);
    if (currentMs === null) continue;
    if (previousMs !== null && currentMs >= previousMs) {
      result[gateId] = currentMs - previousMs;
    }
    previousMs = currentMs;
  }

  return result;
}

type TimedTaskLike = {
  started_at?: string | null;
  completed_at?: string | null;
};

interface GateWindow {
  gateId: GateId;
  startMs: number;
  endMs: number;
}

interface TimeInterval {
  startMs: number;
  endMs: number;
}

function buildCompletedGateWindows(change: {
  created_at?: string;
  gates?: Record<
    string,
    { status?: string; completed_at?: string } | undefined
  >;
}): GateWindow[] {
  const gates = change.gates ?? {};
  const windows: GateWindow[] = [];
  let previousMs = parseTimestamp(change.created_at);

  for (const gateId of GATE_ORDER as GateId[]) {
    const gate = gates[gateId];
    if (!gate || gate.status !== "done") continue;
    const currentMs = parseTimestamp(gate.completed_at);
    if (currentMs === null) continue;
    if (previousMs !== null && currentMs >= previousMs) {
      windows.push({ gateId, startMs: previousMs, endMs: currentMs });
    }
    previousMs = currentMs;
  }

  return windows;
}

function sumMergedIntervals(intervals: TimeInterval[]): number {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let current = sorted[0];

  for (const next of sorted.slice(1)) {
    if (next.startMs <= current.endMs) {
      current = {
        startMs: current.startMs,
        endMs: Math.max(current.endMs, next.endMs),
      };
      continue;
    }
    total += current.endMs - current.startMs;
    current = next;
  }

  total += current.endMs - current.startMs;
  return total;
}

/**
 * Compute task-derived work durations per completed gate.
 *
 * Keeps wall-clock `per_gate_ms` semantics separate: this helper measures only
 * task intervals (`started_at` → `completed_at`) overlapped with each gate
 * window. Overlapping task intervals are unioned per gate so concurrent work is
 * not double-counted. Gates with no overlapping work are included as `0`.
 */
export function computePerGateWorkDurations(change: {
  created_at?: string;
  gates?: Record<
    string,
    { status?: string; completed_at?: string } | undefined
  >;
  tasks?: TimedTaskLike[];
}): Record<string, number> {
  const windows = buildCompletedGateWindows(change);
  const intervalsByGate = new Map<GateId, TimeInterval[]>();
  const result: Record<string, number> = {};

  for (const window of windows) {
    intervalsByGate.set(window.gateId, []);
    result[window.gateId] = 0;
  }

  for (const task of change.tasks ?? []) {
    const taskStart = parseTimestamp(task.started_at);
    const taskEnd = parseTimestamp(task.completed_at);
    if (taskStart === null || taskEnd === null || taskEnd <= taskStart) {
      continue;
    }

    for (const window of windows) {
      const overlapStart = Math.max(taskStart, window.startMs);
      const overlapEnd = Math.min(taskEnd, window.endMs);
      if (overlapEnd > overlapStart) {
        intervalsByGate.get(window.gateId)?.push({
          startMs: overlapStart,
          endMs: overlapEnd,
        });
      }
    }
  }

  for (const [gateId, intervals] of intervalsByGate.entries()) {
    result[gateId] = sumMergedIntervals(intervals);
  }

  return result;
}
