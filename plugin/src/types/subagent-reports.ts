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
  "adv-designer",
  "adv-researcher",
  "adv-tron",
  "adv-scanner-bundle",
]);

export type SubagentAgent = z.infer<typeof SubagentAgentSchema>;

export const ChangeReportScopeKeySchema = z
  .string()
  .min(1)
  .regex(
    /^(?:(researcher|tron|scanner-bundle):[a-z0-9][a-z0-9-]*|review:acceptance|harden:release)$/u,
  );

export const TaskSubagentReportScopeSchema = z
  .object({
    kind: z.literal("task"),
    task_id: z.string().min(1),
  })
  .strict();

export const ChangeSubagentReportScopeSchema = z
  .object({
    kind: z.literal("change"),
    scope_key: ChangeReportScopeKeySchema,
  })
  .strict();

export const SubagentReportScopeSchema = z.discriminatedUnion("kind", [
  TaskSubagentReportScopeSchema,
  ChangeSubagentReportScopeSchema,
]);

const BaseSubagentReportSchema = z.object({
  schema_version: z.literal(SUBAGENT_REPORT_SCHEMA_VERSION),
  change_id: z.string().min(1),
  attempt: z.number().int().min(1),
  workdir_used: z.string().min(1),
});

const TaskScopedBaseSubagentReportSchema = BaseSubagentReportSchema.extend({
  task_id: z.string().min(1),
  // Backward-compatible with existing adv-engineer / adv-reviewer examples and
  // live workers that still send a prose scope string. New task-scoped reports
  // should use { kind: "task", task_id } so later consumers can rely on
  // structural scope metadata without breaking legacy report ingestion.
  scope: z.union([TaskSubagentReportScopeSchema, z.string().min(1)]),
}).strict();

const ChangeScopedBaseSubagentReportSchema = BaseSubagentReportSchema.extend({
  scope: ChangeSubagentReportScopeSchema,
}).strict();

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

export const ScopeDriftRecommendationSchema = z.enum([
  "finish_owned_scope_then_report",
  "stop_and_report",
  "reenter_scope",
  "accept_compromise",
]);

export const ReviewerScopeDriftSchema = z
  .object({
    items: z.array(z.string().min(1)),
    details: z.string().min(1),
    recommendation: ScopeDriftRecommendationSchema,
  })
  .strict();

export const EngineerScopeDriftSchema = ReviewerScopeDriftSchema;

export const RequiredFollowUpSchema = z
  .object({
    text: z.string().min(1),
    obligation_class: z.enum(["required_critical", "required_standard"]),
    severity: z.enum(["critical", "high"]).default("high"),
    source_contract_id: z.string().optional(),
  })
  .strict();
export type RequiredFollowUp = z.infer<typeof RequiredFollowUpSchema>;

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

export const EngineerSubagentReportSchema =
  TaskScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-engineer"),
    status: z.enum(["complete", "error"]),
    files_touched: z.array(z.string().min(1)),
    verification: z.array(SubagentVerificationEntrySchema).min(1),
    decisions: z.array(SubagentDecisionSchema),
    blockers: z.array(SubagentBlockerSchema),
    scope_drift: EngineerScopeDriftSchema.nullable(),
    follow_ups: z.array(z.string().min(1)),
    required_follow_ups: z.array(RequiredFollowUpSchema).optional(),
    required_main_agent_actions: z.array(z.string().min(1)),
    related_scan: z.string().min(1),
    context_update_for_adv: z
      .object({
        what_ads_needs_to_know: z.string().min(1),
        suggested_next_action: z.string().min(1),
      })
      .strict(),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  }).strict();

export const DesignerDesignDimensionSchema = z.enum(["pass", "concern", "n/a"]);

export const DesignerDesignDimensionsSchema = z
  .object({
    component_correctness: DesignerDesignDimensionSchema,
    semantic_html_a11y: DesignerDesignDimensionSchema,
    responsive_behavior: DesignerDesignDimensionSchema,
    visual_polish: DesignerDesignDimensionSchema,
    site_design_consistency: DesignerDesignDimensionSchema,
    finer_details: DesignerDesignDimensionSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const DesignerNeighboringRecommendationSchema = z
  .object({
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    what: z.string().min(1),
    why: z.string().min(1),
  })
  .strict();

export const DesignerSubagentReportSchema =
  TaskScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-designer"),
    status: z.enum(["complete", "error"]),
    files_touched: z.array(z.string().min(1)),
    verification: z.array(SubagentVerificationEntrySchema).min(1),
    decisions: z.array(SubagentDecisionSchema),
    blockers: z.array(SubagentBlockerSchema),
    scope_drift: EngineerScopeDriftSchema.nullable(),
    follow_ups: z.array(z.string().min(1)),
    required_main_agent_actions: z.array(z.string().min(1)),
    related_scan: z.string().min(1),
    context_update_for_adv: z
      .object({
        what_ads_needs_to_know: z.string().min(1),
        suggested_next_action: z.string().min(1),
      })
      .strict(),
    design_dimensions: DesignerDesignDimensionsSchema,
    neighboring_recommendations: z.array(
      DesignerNeighboringRecommendationSchema,
    ),
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

const ReviewerReportFields = {
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
  required_follow_ups: z.array(RequiredFollowUpSchema).optional(),
  consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
};

export const ReviewerSubagentReportSchema =
  TaskScopedBaseSubagentReportSchema.extend(ReviewerReportFields).strict();

/**
 * Change-scoped reviewer report for independent acceptance/release summaries.
 * Task-scoped `ReviewerSubagentReportSchema` remains the remediation-report
 * shape; this variant uses `review:acceptance` or `harden:release` scope keys.
 */
export const ChangeScopedReviewerSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend(ReviewerReportFields).strict();

export const SubagentSourceReferenceSchema = z
  .object({
    label: z.string().min(1),
    locator: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const ResearcherValidationSchema = z
  .object({
    status: z.enum(["pass", "caution", "fail", "unknown"]),
    blockers: z.array(z.string().min(1)),
    notes: z.string().min(1),
  })
  .strict();

export const ResearcherSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-researcher"),
    topic: z.string().min(1),
    sources: z.array(SubagentSourceReferenceSchema).min(1),
    architecture_assessment: z.string().min(1),
    validation: ResearcherValidationSchema,
    recommendation: z.string().min(1),
    follow_ups: z.array(z.string().min(1)),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  }).strict();

export const TronEvidenceSchema = z
  .object({
    file: z.string().min(1),
    line: z.number().int().positive().optional(),
    summary: z.string().min(1),
  })
  .strict();

export const TronSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-tron"),
    target: z.string().min(1),
    evidence: z.array(TronEvidenceSchema).min(1),
    findings: z.array(z.string().min(1)),
    hotspots: z.array(z.string().min(1)),
    risks: z.array(z.string().min(1)),
    open_questions: z.array(z.string().min(1)),
    suggested_next_commands: z.array(z.string().min(1)),
    follow_ups: z.array(z.string().min(1)),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  }).strict();

export const ScannerBundleFindingSchema = z
  .object({
    scanner: z.string().min(1),
    severity: z.enum(["blocker", "issue", "suggestion", "info"]),
    summary: z.string().min(1),
    evidence: z.array(SubagentSourceReferenceSchema),
  })
  .strict();

export const ScannerBundleSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-scanner-bundle"),
    phase: z.enum(["review", "harden"]),
    scanner_count: z.number().int().min(1),
    dimensions: z.array(z.string().min(1)).min(1),
    summary: z.string().min(1),
    findings: z.array(ScannerBundleFindingSchema),
    follow_ups: z.array(z.string().min(1)),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  }).strict();

export const TaskScopedSubagentReportSchema = z.discriminatedUnion("agent", [
  EngineerSubagentReportSchema,
  ReviewerSubagentReportSchema,
  DesignerSubagentReportSchema,
]);

/** Change-level report sidecars accepted by `adv_subagent_report_submit`. */
export const ChangeScopedSubagentReportSchema = z.discriminatedUnion("agent", [
  ChangeScopedReviewerSubagentReportSchema,
  ResearcherSubagentReportSchema,
  TronSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
]);

/**
 * Full report ingest schema: task-scoped worker reports plus change-scoped
 * sidecar reports.
 */
export const ScopedSubagentReportSchema = z.union([
  TaskScopedSubagentReportSchema,
  ChangeScopedSubagentReportSchema,
]);

/**
 * Backward-compatible alias for reports persisted on task records only.
 * Change-scoped reports persist on `change.subagent_reports[]`; use
 * `ScopedSubagentReportSchema` for the full ingest surface accepted by
 * `adv_subagent_report_submit`.
 */
export const SupportedSubagentReportSchema = TaskScopedSubagentReportSchema;

// Only these task-scoped agents existed before `scope_drift` and
// `required_main_agent_actions` became required fields. Change-scoped agents
// were introduced with the current strict shape and must not receive legacy
// default-filling on ingest.
const LEGACY_DEFAULT_NORMALIZED_REPORT_AGENTS = new Set<string>([
  "adv-engineer",
  "adv-reviewer",
  "adv-designer",
]);

function normalizeLegacySubagentReportRow(value: unknown): [unknown, boolean] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [value, false];
  }

  const row = value as Record<string, unknown>;
  const agent = row.agent;
  if (
    typeof agent !== "string" ||
    !LEGACY_DEFAULT_NORMALIZED_REPORT_AGENTS.has(agent)
  ) {
    return [value, false];
  }

  let changed = false;
  const next: Record<string, unknown> = { ...row };

  if (next.scope_drift === undefined) {
    next.scope_drift = null;
    changed = true;
  }

  if (next.required_main_agent_actions === undefined) {
    next.required_main_agent_actions = [];
    changed = true;
  }

  return [changed ? next : value, changed];
}

/**
 * Normalize legacy persisted sub-agent reports before strict whole-change
 * parsing or workflow projection. This is intentionally NOT part of the
 * adv_subagent_report_submit ingest schema: new malformed reports still fail
 * strict Zod validation at the tool boundary.
 */
export function normalizePersistedSubagentReportState(
  value: unknown,
): [unknown, boolean] {
  let changed = false;

  if (Array.isArray(value)) {
    const next = value.map((item) => {
      const [normalized, itemChanged] =
        normalizePersistedSubagentReportState(item);
      changed = changed || itemChanged;
      return normalized;
    });
    return [changed ? next : value, changed];
  }

  if (!value || typeof value !== "object") {
    return [value, false];
  }

  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "subagent_reports" && Array.isArray(raw)) {
      let reportsChanged = false;
      const nextReports = raw.map((report) => {
        const [normalizedReport, reportChanged] =
          normalizeLegacySubagentReportRow(report);
        reportsChanged = reportsChanged || reportChanged;
        return normalizedReport;
      });
      out[key] = reportsChanged ? nextReports : raw;
      changed = changed || reportsChanged;
      continue;
    }

    const [normalized, childChanged] =
      normalizePersistedSubagentReportState(raw);
    out[key] = normalized;
    changed = changed || childChanged;
  }

  return [changed ? out : value, changed];
}

export type PersistedSubagentReportAgent = z.infer<typeof SubagentAgentSchema>;

export type SubagentReportFieldSource =
  | "packet_anchor"
  | "worker_derived"
  | "tool_enriched";

export const SUBAGENT_REPORT_PACKET_ANCHORS = {
  change_id: "CHANGE",
  task_id: "TASK",
  scope: "SCOPE KEY",
  attempt: "ATTEMPT",
  workdir_used: "WORKING DIRECTORY",
  phase: "PHASE",
} as const;

export const SUBAGENT_WARN_FIRST_PACKET_ANCHORS = [
  "TASK_SCOPE",
  "IN_SCOPE",
  "OUT_OF_SCOPE",
  "DONE_WHEN",
  "STOP_WHEN",
  "VERIFICATION",
] as const;

export const SUBAGENT_REPORT_FIELD_SOURCES = {
  "adv-engineer": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    task_id: "packet_anchor",
    scope: "worker_derived",
    attempt: "packet_anchor",
    agent: "worker_derived",
    status: "worker_derived",
    files_touched: "worker_derived",
    verification: "worker_derived",
    decisions: "worker_derived",
    blockers: "worker_derived",
    scope_drift: "worker_derived",
    follow_ups: "worker_derived",
    required_main_agent_actions: "worker_derived",
    related_scan: "worker_derived",
    workdir_used: "packet_anchor",
    context_update_for_adv: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-reviewer": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    task_id: "packet_anchor",
    scope: "worker_derived",
    attempt: "packet_anchor",
    agent: "worker_derived",
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
  "adv-designer": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    task_id: "packet_anchor",
    scope: "worker_derived",
    attempt: "packet_anchor",
    agent: "worker_derived",
    status: "worker_derived",
    files_touched: "worker_derived",
    verification: "worker_derived",
    decisions: "worker_derived",
    blockers: "worker_derived",
    scope_drift: "worker_derived",
    follow_ups: "worker_derived",
    required_main_agent_actions: "worker_derived",
    related_scan: "worker_derived",
    workdir_used: "packet_anchor",
    context_update_for_adv: "worker_derived",
    design_dimensions: "worker_derived",
    neighboring_recommendations: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-researcher": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    scope: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    workdir_used: "packet_anchor",
    topic: "worker_derived",
    sources: "worker_derived",
    architecture_assessment: "worker_derived",
    validation: "worker_derived",
    recommendation: "worker_derived",
    follow_ups: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-tron": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    scope: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    workdir_used: "packet_anchor",
    target: "worker_derived",
    evidence: "worker_derived",
    findings: "worker_derived",
    hotspots: "worker_derived",
    risks: "worker_derived",
    open_questions: "worker_derived",
    suggested_next_commands: "worker_derived",
    follow_ups: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-scanner-bundle": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    scope: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    workdir_used: "packet_anchor",
    phase: "packet_anchor",
    scanner_count: "worker_derived",
    dimensions: "worker_derived",
    summary: "worker_derived",
    findings: "worker_derived",
    follow_ups: "worker_derived",
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
        throw new Error(
          `Missing packet anchor for sub-agent report field ${field}`,
        );
      }
      return anchor;
    })
    .sort();
}

export type SubagentReportScope = z.infer<typeof SubagentReportScopeSchema>;
export type TaskSubagentReportScope = z.infer<
  typeof TaskSubagentReportScopeSchema
>;
export type ChangeSubagentReportScope = z.infer<
  typeof ChangeSubagentReportScopeSchema
>;
export type EngineerSubagentReport = z.infer<
  typeof EngineerSubagentReportSchema
>;
export type ReviewerSubagentReport = z.infer<
  typeof ReviewerSubagentReportSchema
>;
export type ChangeScopedReviewerSubagentReport = z.infer<
  typeof ChangeScopedReviewerSubagentReportSchema
>;
export type DesignerSubagentReport = z.infer<
  typeof DesignerSubagentReportSchema
>;
export type TaskScopedSubagentReport = z.infer<
  typeof TaskScopedSubagentReportSchema
>;
export type ChangeScopedSubagentReport = z.infer<
  typeof ChangeScopedSubagentReportSchema
>;
export type ResearcherSubagentReport = z.infer<
  typeof ResearcherSubagentReportSchema
>;
export type TronSubagentReport = z.infer<typeof TronSubagentReportSchema>;
export type ScannerBundleSubagentReport = z.infer<
  typeof ScannerBundleSubagentReportSchema
>;
export type ScopedSubagentReport = z.infer<typeof ScopedSubagentReportSchema>;
export type SupportedSubagentReport = z.infer<
  typeof SupportedSubagentReportSchema
>;

/** @deprecated Use `TaskScopedSubagentReportSchema` or `ScopedSubagentReportSchema` explicitly. */
export const SubagentReportSchema = SupportedSubagentReportSchema;
/** @deprecated Use `TaskScopedSubagentReport` or `ScopedSubagentReport` explicitly. */
export type SubagentReport = SupportedSubagentReport;
