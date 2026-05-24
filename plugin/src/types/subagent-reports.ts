/**
 * Sub-agent Report Types
 *
 * Typed payloads submitted by ADV sub-agents through
 * `adv_subagent_report_submit`. These schemas are intentionally strict at the
 * ingest boundary: unknown fields are rejected instead of silently becoming
 * LLM-parsed prose state.
 */

import { z } from "zod";
import { WisdomTypeSchema } from "./wisdom";

export const SUBAGENT_REPORT_SCHEMA_VERSION = "1.0";

export const SubagentAgentSchema = z.enum([
  "adv-engineer",
  "adv-reviewer",
  "adv-researcher",
  "adv-tron",
]);

export type SubagentAgent = z.infer<typeof SubagentAgentSchema>;

const BaseSubagentReportSchema = z.object({
  schema_version: z.literal(SUBAGENT_REPORT_SCHEMA_VERSION),
  change_id: z.string().min(1),
  task_id: z.string().min(1),
  attempt: z.number().int().min(1),
  scope: z.string().min(1),
  workdir_used: z.string().min(1),
});

export const SubagentVerificationEntrySchema = z
  .object({
    command: z.string().min(1),
    exit_code: z.number().int(),
    summary: z.string().min(1),
  })
  .strict();

export const SubagentDecisionSchema = z
  .object({
    what: z.string().min(1),
    why: z.string().min(1),
  })
  .strict();

export const SubagentBlockerSchema = z
  .object({
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    what: z.string().min(1),
    diagnosis: z.string().min(1),
  })
  .strict();

export const SubagentConsumerWarningSchema = z
  .object({
    kind: z.enum([
      "verification_mismatch",
      "verification_missing",
      "consumer_failure",
    ]),
    message: z.string().min(1),
  })
  .strict();

export const EngineerSubagentReportSchema = BaseSubagentReportSchema.extend({
  agent: z.literal("adv-engineer"),
  status: z.enum(["complete", "error"]),
  files_touched: z.array(z.string().min(1)),
  verification: z.array(SubagentVerificationEntrySchema).min(1),
  decisions: z.array(SubagentDecisionSchema),
  blockers: z.array(SubagentBlockerSchema),
  follow_ups: z.array(z.string().min(1)),
  related_scan: z.string().min(1),
  context_update_for_adv: z
    .object({
      what_ads_needs_to_know: z.string().min(1),
      suggested_next_action: z.string().min(1),
    })
    .strict(),
  consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
}).strict();

export const ReviewerFindingSchema = z
  .object({
    id: z.string().min(1),
    label: z.enum([
      "blocker",
      "issue",
      "suggestion",
      "nit",
      "question",
      "praise",
    ]),
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    what: z.string().min(1),
    why: z.string().min(1),
    fix: z.string().min(1).optional(),
  })
  .strict();

export const ReviewerChangeMadeSchema = z
  .object({
    file: z.string().min(1),
    summary: z.string().min(1),
    verification: z.string().min(1),
  })
  .strict();

export const ReviewerScopeDriftSchema = z
  .object({
    items: z.array(z.string().min(1)),
    details: z.string().min(1),
    recommendation: z.enum([
      "stop_and_report",
      "reenter_scope",
      "accept_compromise",
    ]),
  })
  .strict();

export const ReviewerSubagentReportSchema = BaseSubagentReportSchema.extend({
  agent: z.literal("adv-reviewer"),
  phase: z.enum(["review", "harden"]),
  verdict: z.enum(["READY", "NEEDS_WORK", "BLOCKED", "CONFLICT"]),
  blocking_findings: z.array(ReviewerFindingSchema),
  nonblocking_findings: z.array(ReviewerFindingSchema),
  changes_made: z.array(ReviewerChangeMadeSchema),
  wisdom_candidates: z.array(
    z
      .object({
        type: WisdomTypeSchema,
        content: z.string().min(1).max(2000),
      })
      .strict(),
  ),
  verification: z
    .object({
      tests_run: z.array(z.string().min(1)),
      results: z.enum(["pass", "fail", "n/a"]),
      evidence: z.string().min(1),
    })
    .strict(),
  scope_drift: ReviewerScopeDriftSchema.nullable(),
  risks: z.array(z.string().min(1)),
  required_main_agent_actions: z.array(z.string().min(1)),
  consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
}).strict();

export const SupportedSubagentReportSchema = z.discriminatedUnion("agent", [
  EngineerSubagentReportSchema,
  ReviewerSubagentReportSchema,
]);

export type PersistedSubagentReportAgent = "adv-engineer" | "adv-reviewer";

export type SubagentReportFieldSource =
  | "packet_anchor"
  | "worker_derived"
  | "tool_enriched";

export const SUBAGENT_REPORT_PACKET_ANCHORS = {
  change_id: "CHANGE",
  task_id: "TASK",
  attempt: "ATTEMPT",
  workdir_used: "WORKING DIRECTORY",
  phase: "PHASE",
} as const;

export const SUBAGENT_REPORT_FIELD_SOURCES = {
  "adv-engineer": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    task_id: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    scope: "worker_derived",
    status: "worker_derived",
    files_touched: "worker_derived",
    verification: "worker_derived",
    decisions: "worker_derived",
    blockers: "worker_derived",
    follow_ups: "worker_derived",
    related_scan: "worker_derived",
    workdir_used: "packet_anchor",
    context_update_for_adv: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-reviewer": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    task_id: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    scope: "worker_derived",
    workdir_used: "packet_anchor",
    phase: "packet_anchor",
    verdict: "worker_derived",
    blocking_findings: "worker_derived",
    nonblocking_findings: "worker_derived",
    changes_made: "worker_derived",
    wisdom_candidates: "worker_derived",
    verification: "worker_derived",
    scope_drift: "worker_derived",
    risks: "worker_derived",
    required_main_agent_actions: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
} as const satisfies Record<
  PersistedSubagentReportAgent,
  Record<string, SubagentReportFieldSource>
>;

export function getSubagentReportPacketAnchors(
  agent: PersistedSubagentReportAgent,
): string[] {
  return Object.entries(SUBAGENT_REPORT_FIELD_SOURCES[agent])
    .filter(([, source]) => source === "packet_anchor")
    .map(([field]) => {
      const anchor =
        SUBAGENT_REPORT_PACKET_ANCHORS[
          field as keyof typeof SUBAGENT_REPORT_PACKET_ANCHORS
        ];
      if (!anchor) {
        throw new Error(`Missing packet anchor for sub-agent report field ${field}`);
      }
      return anchor;
    })
    .sort();
}

export type EngineerSubagentReport = z.infer<
  typeof EngineerSubagentReportSchema
>;
export type ReviewerSubagentReport = z.infer<
  typeof ReviewerSubagentReportSchema
>;
export type SupportedSubagentReport = z.infer<
  typeof SupportedSubagentReportSchema
>;

export const SubagentReportSchema = SupportedSubagentReportSchema;
export type SubagentReport = SupportedSubagentReport;
