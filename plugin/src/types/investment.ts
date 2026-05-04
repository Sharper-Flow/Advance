/**
 * Investment Check-In / Judgment-Surfacing Governance Types
 *
 * ThresholdTier, JudgmentCallCategory, JudgmentCall, InvestmentReport.
 */

import { z } from "zod";

// =============================================================================
// Investment Check-In / Judgment-Surfacing Governance (addCostTimeInvestment)
// =============================================================================

/**
 * Threshold tier classification for investment reports.
 *
 * Tiers are computed by `adv_investment_report` from current thresholds
 * in `.opencode/instructions/cost-governance.md` YAML frontmatter.
 *
 * - "auto" — below all thresholds; agent proceeds without surfacing
 * - "escalate" — judgment calls should be surfaced if any exist
 * - "hardstop" — strongly-worded advisory; in v1 does NOT trigger
 *   adv_change_reenter (re-entry remains scope-expansion-driven per
 *   rq-scopeReentry01)
 */
export const ThresholdTierSchema = z.enum(["auto", "escalate", "hardstop"]);
export type ThresholdTier = z.infer<typeof ThresholdTierSchema>;

/**
 * In-scope judgment-call categories for v1.
 *
 * Per agreement user decision #3: surface only categories where user
 * intuition materially changes the outcome. Excluded from v1 (agent
 * resolves autonomously to avoid decision fatigue):
 *   - defaults (e.g., DEFAULT_TIMEOUT value)
 *   - naming (e.g., verify vs validate)
 *   - error_semantics (e.g., throw vs return-null)
 */
export const JudgmentCallCategorySchema = z.enum([
  "non_functional_tradeoff",
  "extensibility",
  "scope_boundary",
]);
export type JudgmentCallCategory = z.infer<typeof JudgmentCallCategorySchema>;

/**
 * A single judgment call surfaced to the user during /adv-apply Phase 1.5.
 *
 * Identified during /adv-prep Phase J from the synthesized task graph.
 * Surfaced at /adv-apply Phase 1.5 via a single `question` tool call with
 * the provided options plus a P26 write-in.
 */
export const JudgmentCallSchema = z
  .object({
    /** Unique ID (jc-<6char>) */
    id: z.string(),
    /** Judgment category — only three in-scope categories permitted in v1 */
    category: JudgmentCallCategorySchema,
    /** The judgment question framed around outcome/behavior/priority */
    question: z.string(),
    /** Agent's recommended answer when surfaced (labeled Recommended) */
    agent_recommendation: z.string(),
    /** Why user intuition matters for this decision */
    rationale: z.string(),
    /** 3-4 options for the question tool; write-in added automatically by P26 */
    options: z.array(
      z.object({
        label: z.string(),
        description: z.string(),
      }),
    ),
    /** ISO8601 when surfaced to user (set by /adv-apply Phase 1.5) */
    surfaced_at: z.string().optional(),
    /** Who resolved it: user (explicit pick) or agent_default (no surface) */
    resolved_by: z.enum(["user", "agent_default"]).optional(),
    /** The user's selected option label, or "(write-in: ...)" */
    user_choice: z.string().optional(),
  })
  .passthrough();

export type JudgmentCall = z.infer<typeof JudgmentCallSchema>;

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
    /** Classification against current thresholds */
    threshold_tier: ThresholdTierSchema,
  })
  .passthrough();

export type InvestmentReport = z.infer<typeof InvestmentReportSchema>;
