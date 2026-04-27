/**
 * Investment Report Tool (addCostTimeInvestment)
 *
 * Read-only, stateless tool returning a structured investment report
 * for a change. Used by:
 * - /adv-apply Phase 1.5 (investment check-in preamble) — tier + doom-loop
 * - /adv-discover, /adv-review, /adv-archive — one-line summary display
 *
 * All metrics are proxies derived from existing change state (timestamps,
 * retry counts, gate completions). No schema changes to Task required.
 * No persisted state on the tool side.
 *
 * Composition rules (per design D5):
 * - doom-loop detection scans all tasks (not just in_progress)
 * - hard-stop tier is advisory in v1 (does NOT trigger adv_change_reenter)
 */
import { z } from "zod";
import type { Store } from "../storage/store";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import { GATE_ORDER, type GateId, type ThresholdTier } from "../types";
import { getDoomLoopInfo } from "../events/status";

// =============================================================================
// Threshold Configuration
// =============================================================================

const ThresholdBandSchema = z.object({
  tasks: z.number().int().min(0),
  retries: z.number().int().min(0),
  // Retained for reporting/config compatibility. Elapsed time no longer
  // participates in tier classification.
  elapsed_minutes: z.number().min(0),
});

const ThresholdsSchema = z.object({
  auto: ThresholdBandSchema,
  escalate: ThresholdBandSchema,
  hardstop: ThresholdBandSchema,
});

type Thresholds = z.infer<typeof ThresholdsSchema>;

/**
 * Default conservative thresholds (agreement user decision #1).
 * Matches the values shipped in .opencode/instructions/cost-governance.md
 * YAML frontmatter. Tunable by the user without code changes.
 */
const DEFAULT_THRESHOLDS: Thresholds = {
  auto: { tasks: 3, retries: 0, elapsed_minutes: 15 },
  escalate: { tasks: 8, retries: 2, elapsed_minutes: 60 },
  hardstop: { tasks: 15, retries: 5, elapsed_minutes: 180 },
};

// =============================================================================
// Tier Classification
// =============================================================================

/**
 * Compute the threshold tier from current investment metrics.
 *
 * Rule: tier is the MAXIMUM across task count and retry signals — any one
 * dimension crossing a tier boundary promotes the whole report to that tier.
 *
 * `auto` values are retained in config for user-facing guidance and possible
 * future expansion, but v1 classification is intentionally binary above that:
 * anything below `escalate` resolves to `auto`.
 *
 * Elapsed minutes are accepted for API compatibility but ignored per the
 * discovery agreement for fixthreereflectionfollowups.
 *
 * hardstop: task count or retry count >= hardstop band
 * escalate: task count or retry count >= escalate band (but none at hardstop)
 * auto: all tiering signals below escalate band
 */
export function classifyTier(
  taskCount: number,
  retryTotal: number,
  _elapsedMinutes: number,
  thresholds: Thresholds,
): ThresholdTier {
  const hitsHardstop =
    taskCount >= thresholds.hardstop.tasks ||
    retryTotal >= thresholds.hardstop.retries;
  if (hitsHardstop) return "hardstop";

  const hitsEscalate =
    taskCount >= thresholds.escalate.tasks ||
    retryTotal >= thresholds.escalate.retries;
  if (hitsEscalate) return "escalate";

  return "auto";
}

// =============================================================================
// Tool Definition
// =============================================================================

export const investmentTools = {
  adv_investment_report: {
    description:
      "Return a structured investment report for a change — task counts, elapsed time, retry metrics, doom-loop state, per-gate durations, and threshold tier classification (auto/escalate/hardstop). Read-only, stateless. Thresholds are configurable via the thresholds arg or fall back to conservative defaults matching cost-governance.md.",
    args: {
      changeId: z.string().describe("Change ID to compute the report for"),
      thresholds: ThresholdsSchema.optional().describe(
        "Threshold configuration overriding the conservative defaults (auto ≤3/0/15min, escalate ≥8/2/60min, hardstop ≥15/5/180min)",
      ),
    },
    execute: async (
      args: { changeId: string; thresholds?: Thresholds },
      store: Store,
    ): Promise<string> => {
      const thresholds = args.thresholds ?? DEFAULT_THRESHOLDS;

      const changeResult = await store.changes.get(args.changeId);
      if (!changeResult.success) {
        return wrapWithBanner(
          { command: "adv_investment_report" },
          formatToolOutput({ error: changeResult.error }),
        );
      }
      if (!changeResult.data) {
        return wrapWithBanner(
          { command: "adv_investment_report" },
          formatToolOutput({ error: `Change not found: ${args.changeId}` }),
        );
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
      const elapsedMinutes = elapsedMs / 60_000;

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

      // Tier classification
      const thresholdTier = classifyTier(
        taskCounts.total,
        retryTotal,
        elapsedMinutes,
        thresholds,
      );

      return wrapWithBanner(
        { command: "adv_investment_report" },
        formatToolOutput({
          task_counts: taskCounts,
          elapsed_ms: elapsedMs,
          active_elapsed_ms: activeElapsedMs,
          retry_total: retryTotal,
          retry_density: retryDensity,
          doom_loop_active: doomLoopActive,
          per_gate_ms: perGateMs,
          threshold_tier: thresholdTier,
        }),
      );
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
