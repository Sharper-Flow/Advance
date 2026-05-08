/**
 * Investment Report Types (post-retirement)
 *
 * Slimmed type surface for `adv_investment_report`: just `InvestmentReport`.
 * The full investment-governance surface (Phase J / Phase 1.5 / threshold tier /
 * judgment_calls / cost-governance) was retired in retireinvestmentgovernancedead.
 */

import { z } from "zod";

/**
 * Structured investment report returned by `adv_investment_report`.
 *
 * Read-only, stateless computation from change.json. All signals are
 * proxies derivable from existing timestamps + retry records — no
 * schema changes to Task required.
 */
export const InvestmentReportSchema = z
  .object({
    /** Task counts by status */
    task_counts: z.object({
      total: z.number().int().min(0),
      done: z.number().int().min(0),
      cancelled: z.number().int().min(0),
      pending: z.number().int().min(0),
      in_progress: z.number().int().min(0),
    }),
    /** Active gate duration ms, computed from per_gate_ms */
    active_elapsed_ms: z.number().int().min(0).optional(),
    /** Wall-clock ms since change.created_at */
    elapsed_ms: z.number().int().min(0),
    /** Sum of retry attempts across all tasks (from error_recovery.attempts[]) */
    retry_total: z.number().int().min(0),
    /** retry_total / max(1, done + cancelled) */
    retry_density: z.number().min(0),
    /** True when any task is in active doom-loop per getDoomLoopInfo */
    doom_loop_active: z.boolean(),
    /** Per-gate duration in ms (gate.completed_at - previous_gate.completed_at) */
    per_gate_ms: z.record(z.string(), z.number()),
  })
  .passthrough();

export type InvestmentReport = z.infer<typeof InvestmentReportSchema>;
