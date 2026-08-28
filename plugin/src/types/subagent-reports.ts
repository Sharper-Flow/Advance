/**
 * Sub-agent Report Types
 *
 * Typed payloads submitted by ADV sub-agents through
 * `adv_subagent_report_submit`. These schemas are intentionally strict at the
 * ingest boundary: unknown fields are rejected instead of silently becoming
 * LLM-parsed prose state.
 */

import { z } from "zod";
import { GateRecoveryAuditSchema } from "./gates";
import { WisdomTypeSchema } from "./wisdom";

export const SUBAGENT_REPORT_SCHEMA_VERSION = "1.0";

/**
 * Retry budget applied when a blocked sub-agent report is mapped into a task's
 * `error_recovery`.
 *
 * Single source of truth by necessity, not just tidiness. This value is also
 * the ceiling `ErrorRecoverySchema` enforces on read (`attempts.length` must
 * not exceed `max_retries`), so a writer using a different literal than the
 * reader produces state ADV refuses to load. It previously lived as a bare `3`
 * at both write sites; during a 2026-08-04 incident an operator raised the
 * budget on the disk projection to unbrick a change and the workflow
 * immediately re-emitted its own hardcoded `3`, re-bricking it. Divergent
 * literals defeat repair.
 *
 * Declared here (types/) rather than in tools/ because the shared type module
 * must not statically import from
 * storage/, tools/, tool-registry.ts, plugin-init.ts, or node:*.
 */
export const SUBAGENT_REPORT_MAX_RETRIES = 3;

/**
 * Per-lane maximum size (chars) for any single free-text field in a typed
 * sub-agent report (AC1, boundSubAgentReportContract). Bounds are declared
 * per lane (C3) and confirmed by measurement of 2,791 real persisted reports
 * (SC2 — no currently-conforming report is rejected). Observed maxima:
 * researcher architecture_assessment 8,257; engineer context_update 2,627;
 * reviewer verification.evidence 2,238. Bounds grant 45-80% headroom.
 *
 * Enforced via superRefine (not per-field .max()) because heavy fields are
 * shared across lanes via sub-schemas (SubagentDecisionSchema,
 * SubagentSourceReferenceSchema, ReviewerFindingSchema), so per-field .max()
 * cannot express different bounds per lane. The walker checks every string
 * field against the lane max and names the offending field path in the
 * rejection (AC1 "naming the offending fields").
 */
export const RESEARCHER_FIELD_MAX = 12_000;
const ENGINEER_FIELD_MAX = 4_000;
const REVIEWER_FIELD_MAX = 4_000;
const DESIGNER_FIELD_MAX = 4_000;

/**
 * Build a superRefine that rejects any report whose free-text fields exceed
 * the lane max. Recursively walks the report value, checking each string
 * field. Returns the bound function for `.superRefine(...)` chaining.
 */
const laneFieldBoundsRefine =
  (max: number, lane: string) =>
  (report: unknown, ctx: z.RefinementCtx): void => {
    const walk = (value: unknown, path: (string | number)[]): void => {
      if (typeof value === "string") {
        if (value.length > max) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `${lane} field "${path.join(".")}" exceeds ${max}-char lane size bound (${value.length} chars)`,
          });
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, [...path, i]));
        return;
      }
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          walk(v, path.length > 0 ? [...path, k] : [k]);
        }
      }
    };
    walk(report, []);
  };

/**
 * Recovery audit shape persisted on sub-agent reports when a poisoned or
 * completed-workflow recovery write lands on the disk projection via
 * saveRecoveredSubagentReport. Mirrors GateRecoveryAuditSchema with the
 * additional `persisted_via` marker recorded by the writer
 * (active-projection vs archive-sidecar) so read paths can route the
 * sidecar back to the correct terminal projection.
 */
export const SubagentReportRecoveryAuditSchema = GateRecoveryAuditSchema.extend(
  {
    persisted_via: z.string().min(1),
  },
);

export const SubagentAgentSchema = z.enum([
  "adv-engineer",
  "adv-reviewer",
  "adv-designer",
  "adv-researcher",
  "adv-tron",
  "adv-scanner-bundle",
  "adv-verification-triage-bundle",
  "adv-visual-review",
]);

export type SubagentAgent = z.infer<typeof SubagentAgentSchema>;

export const ChangeReportScopeKeySchema = z
  .string()
  .min(1)
  .regex(
    /^(?:(researcher|tron|scanner-bundle|verifier|visual-review):[a-z0-9][a-z0-9-]*|review:acceptance|harden:release)$/u,
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
  /**
   * Recovery-audit marker stamped by saveRecoveredSubagentReport when a
   * poisoned/completed-workflow recovery write lands on the disk projection.
   * Carries the `persisted_via` routing marker so reads can route the sidecar
   * back to the correct terminal projection.
   */
  recovery_audit: SubagentReportRecoveryAuditSchema.optional(),
}).strict();

const ChangeScopedBaseSubagentReportSchema = BaseSubagentReportSchema.extend({
  scope: ChangeSubagentReportScopeSchema,
  /**
   * Recovery-audit marker stamped by saveRecoveredSubagentReport when a
   * poisoned/completed-workflow recovery write lands on the disk projection.
   * Carries the `persisted_via` routing marker so reads can route the sidecar
   * back to the correct terminal projection.
   */
  recovery_audit: SubagentReportRecoveryAuditSchema.optional(),
}).strict();

export const SubagentVerificationEntrySchema = z
  .object({
    run_id: z.string().min(1).optional(),
    // rq-subagentReports25: typed test-run binding. Canonical name
    // preferred over the additive `run_id` alias. When present, the
    // entry's identity is (test_run_id, exit_code); the `command` label is
    // descriptive only and cosmetic differences (extra args, reordered
    // flags, prefix vars, absolute paths) MUST NOT break identity match.
    // Absence of both `run_id` and `test_run_id` normalizes the entry to
    // the explicit legacy variant and binds by exact command only. No
    // fuzzy normalization, no timestamp cutover. Authored reports should
    // set `test_run_id` whenever `adv_run_test` recorded a run for the
    // same task; legacy reports without either field remain readable.
    test_run_id: z.string().min(1).optional(),
    command: z.string().min(1),
    exit_code: z.number().int(),
    summary: z.string().min(1),
  })
  .strict();

export const EvidenceBindingVersionSchema = z.enum([
  "typed-v1",
  "legacy-command-v0",
]);

function requireTypedRunIds(
  report: {
    evidence_binding_version?: z.infer<typeof EvidenceBindingVersionSchema>;
    verification: Array<{ run_id?: string; test_run_id?: string }>;
  },
  ctx: z.RefinementCtx,
): void {
  if (report.evidence_binding_version !== "typed-v1") return;
  report.verification.forEach((entry, index) => {
    if (!entry.run_id && !entry.test_run_id) {
      ctx.addIssue({
        code: "custom",
        path: ["verification", index, "run_id"],
        message:
          "typed-v1 verification requires a durable test run ID (run_id or test_run_id)",
      });
    }
  });
}

const ImplementationProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("engineer"),
      baseline_head_sha: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("engineer_report"),
      report_key: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inline"),
      baseline_head_sha: z.string().min(1),
      diff_ref: z.string().min(1),
    })
    .strict(),
]);

export const SubagentApplyContextSchema = z
  .object({
    implementation_cycle_id: z.string().min(1),
    implementation_provenance: ImplementationProvenanceSchema,
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

/**
 * Shared scope-drift shape deliberately reused by engineer, designer, and
 * reviewer reports.
 */
export const ReviewerScopeDriftSchema = z
  .object({
    items: z.array(z.string().min(1)),
    details: z.string().min(1),
    recommendation: ScopeDriftRecommendationSchema,
  })
  .strict();

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
      // Advisory marker emitted when a designer design_dimensions concern /
      // neighboring recommendation is raised. The structural acceptance/release
      // block is owned by the gate-readiness evaluator; this warning surfaces
      // that a typed disposition (adv_design_concern_disposition) is required.
      "design_concern_promoted",
    ]),
    message: z.string().min(1),
  })
  .strict();

/**
 * Typed disposition of a single design-quality concern (a design_dimensions
 * `concern` verdict or a neighboring recommendation) raised by an adv-designer
 * report. Recorded via designConcernDispositionedSignal and read by the
 * gate-readiness evaluator to clear an otherwise-blocking concern.
 *
 * There is intentionally no `accepted_debt` verb — unresolved debt is never a
 * terminal state. Concerns are either fixed, rejected with evidence, or routed
 * out via split / fast-follow.
 */
export const DesignConcernDispositionSchema = z
  .object({
    taskId: z.string().trim().min(1),
    concernKey: z.string().trim().min(1),
    disposition: z.enum([
      "fixed",
      "rejected_with_evidence",
      "split",
      "fast_follow",
    ]),
    evidence: z.string().trim().min(1),
    dispositionedAt: z.string().trim().min(1),
    /**
     * Recovery-audit marker stamped by
     * saveRecoveredDesignConcernDisposition when a poisoned/completed-workflow
     * recovery write lands on the disk projection. Optional for backward
     * compatibility with dispositions recorded via the normal signal path.
     */
    recovery_audit: GateRecoveryAuditSchema.optional(),
  })
  .strict();
export type DesignConcernDisposition = z.infer<
  typeof DesignConcernDispositionSchema
>;

/**
 * Typed disposition of a verification-evidence gap (an unresolved
 * `verification_missing` / `verification_mismatch` consumer warning) on a
 * completed task with a proof-bearing evidence policy. Recorded via
 * verificationEvidenceDispositionedSignal and read by the gate-readiness
 * evaluator to clear an otherwise-blocking VERIFICATION_EVIDENCE_MISSING
 * blocker.
 *
 * Mirrors the design-concern disposition mechanics: latest disposition wins
 * for a given (taskId, concernKey), and there is intentionally no
 * `accepted_debt` verb — a verification gap is either re-verified (newer
 * warning-free report), dispositioned with evidence, or routed out via
 * split / fast-follow. It is never silently grandfathered.
 */
export const VerificationEvidenceDispositionSchema = z
  .object({
    taskId: z.string().trim().min(1),
    concernKey: z.string().trim().min(1),
    disposition: z.enum([
      "fixed",
      "rejected_with_evidence",
      "split",
      "fast_follow",
    ]),
    evidence: z.string().trim().min(1),
    dispositionedAt: z.string().trim().min(1),
    /**
     * Recovery-audit marker stamped by
     * saveRecoveredVerificationEvidenceDisposition when a
     * poisoned/completed-workflow recovery write lands on the disk projection.
     * Optional for backward compatibility with dispositions recorded via the
     * normal signal path.
     */
    recovery_audit: GateRecoveryAuditSchema.optional(),
  })
  .strict();
export type VerificationEvidenceDisposition = z.infer<
  typeof VerificationEvidenceDispositionSchema
>;

export const EngineerSubagentReportSchema =
  TaskScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-engineer"),
    status: z.enum(["complete", "error"]),
    evidence_binding_version: EvidenceBindingVersionSchema.optional(),
    files_touched: z.array(z.string().min(1)),
    verification: z.array(SubagentVerificationEntrySchema).min(1),
    decisions: z.array(SubagentDecisionSchema),
    blockers: z.array(SubagentBlockerSchema),
    scope_drift: ReviewerScopeDriftSchema.nullable(),
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
    apply_context: SubagentApplyContextSchema.optional(),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  })
    .strict()
    .superRefine(requireTypedRunIds)
    .superRefine(laneFieldBoundsRefine(ENGINEER_FIELD_MAX, "adv-engineer"));

export const DesignerDesignDimensionSchema = z.enum(["pass", "concern", "n/a"]);

export const DesignerDesignDimensionsSchema = z
  .object({
    component_correctness: DesignerDesignDimensionSchema,
    semantic_html_a11y: DesignerDesignDimensionSchema,
    responsive_behavior: DesignerDesignDimensionSchema,
    visual_polish: DesignerDesignDimensionSchema,
    site_design_consistency: DesignerDesignDimensionSchema,
    finer_details: DesignerDesignDimensionSchema,
    notes: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((dimensions, ctx) => {
    const verdicts = [
      dimensions.component_correctness,
      dimensions.semantic_html_a11y,
      dimensions.responsive_behavior,
      dimensions.visual_polish,
      dimensions.site_design_consistency,
      dimensions.finer_details,
    ];
    const needsNotes = verdicts.some((verdict) =>
      ["concern", "n/a"].includes(verdict),
    );

    if (needsNotes && !dimensions.notes?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message:
          "design_dimensions.notes is required when any design dimension is concern or n/a",
      });
    }
  });

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
    evidence_binding_version: EvidenceBindingVersionSchema.optional(),
    files_touched: z.array(z.string().min(1)),
    verification: z.array(SubagentVerificationEntrySchema).min(1),
    decisions: z.array(SubagentDecisionSchema),
    blockers: z.array(SubagentBlockerSchema),
    scope_drift: ReviewerScopeDriftSchema.nullable(),
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
    apply_context: SubagentApplyContextSchema.optional(),
    required_follow_ups: z.array(RequiredFollowUpSchema).optional(),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  })
    .strict()
    .superRefine(requireTypedRunIds)
    .superRefine(laneFieldBoundsRefine(DESIGNER_FIELD_MAX, "adv-designer"));

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
  TaskScopedBaseSubagentReportSchema.extend(ReviewerReportFields)
    .strict()
    .superRefine(laneFieldBoundsRefine(REVIEWER_FIELD_MAX, "adv-reviewer"));

/**
 * Change-scoped reviewer report for independent acceptance/release summaries.
 * Task-scoped `ReviewerSubagentReportSchema` remains the remediation-report
 * shape; this variant uses `review:acceptance` or `harden:release` scope keys.
 */
export const ChangeScopedReviewerSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend(ReviewerReportFields)
    .strict()
    .superRefine(laneFieldBoundsRefine(REVIEWER_FIELD_MAX, "adv-reviewer"));

export const SubagentSourceReferenceSchema = z
  .object({
    label: z.string().min(1),
    locator: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const ResearcherValidationBlockerSchema = z
  .object({
    finding: z.string().min(1),
    contract_ids: z.array(z.string().min(1)).min(1),
    scope: z.literal("in_scope"),
    in_scope_remediation: z.string().min(1),
    source: SubagentSourceReferenceSchema,
  })
  .strict();

export const ResearcherValidationSchema = z
  .object({
    status: z.enum(["pass", "caution", "fail", "unknown"]),
    blockers: z.array(
      z.union([z.string().min(1), ResearcherValidationBlockerSchema]),
    ),
    notes: z.string().min(1),
  })
  .strict();

export const ResearcherArchitectureAlternativeSchema = z
  .object({
    option: z.string().min(1),
    disposition: z.enum(["preferred", "rejected", "deferred"]),
    rationale: z.string().min(1),
  })
  .strict();

export const ResearcherArchitectureJudgementSchema = z.discriminatedUnion(
  "applicability",
  [
    z
      .object({
        applicability: z.literal("applicable"),
        confidence: z.enum(["high", "medium", "low"]),
        risk: z.enum(["low", "medium", "high"]),
        tradeoffs: z.array(z.string().min(1)).min(1),
        alternatives_considered: z
          .array(ResearcherArchitectureAlternativeSchema)
          .min(1),
        recommendation: z.string().min(1),
      })
      .strict(),
    z
      .object({
        applicability: z.literal("not_applicable"),
        confidence: z.enum(["high", "medium", "low"]),
        reason: z.string().min(1),
        recommendation: z.string().min(1),
      })
      .strict(),
  ],
);

export const ResearcherSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-researcher"),
    topic: z.string().min(1),
    sources: z.array(SubagentSourceReferenceSchema).min(1),
    architecture_assessment: z.string().min(1),
    validation: ResearcherValidationSchema,
    architecture_judgement: ResearcherArchitectureJudgementSchema,
    recommendation: z.string().min(1),
    follow_ups: z.array(z.string().min(1)),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  })
    .strict()
    .superRefine((report, ctx) => {
      const judgement = report.architecture_judgement;

      if (
        report.validation.status === "pass" &&
        judgement.applicability === "applicable" &&
        judgement.confidence === "low"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["architecture_judgement", "confidence"],
          message: "pass validation requires high or medium confidence",
        });
      }

      if (
        report.validation.status === "fail" &&
        report.validation.blockers.length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["validation", "blockers"],
          message: "fail validation requires at least one blocker",
        });
      }

      // NOTE: design-validation bare-string-blocker enforcement lives at the
      // adv_subagent_report_submit write boundary (subagent-report.ts executeSubmit).
      // rq-subagentReports24.1 names the submit tool as the canonical enforcement
      // point. Do NOT re-add schema-time rejection here — it would re-wedge
      // historical changes whose legacy reports carry string blockers (see
      // makeLegacyDesignValidation).

      if (
        judgement.applicability === "not_applicable" &&
        report.scope.scope_key === "researcher:design-validation"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["architecture_judgement", "applicability"],
          message:
            "design validation requires applicable architecture judgement",
        });
      }
    })
    .superRefine(laneFieldBoundsRefine(RESEARCHER_FIELD_MAX, "adv-researcher"));

// =============================================================================
// Tron Optimization Candidates (opt-scan integration)
// =============================================================================

/**
 * Evidence attached to a Tron optimization candidate. Mirrors the opt-scan
 * evidence shape so that every source record is preserved verbatim.
 */
export const TronOptimizationCandidateEvidenceSchema = z
  .object({
    role: z.enum([
      "trigger",
      "scope",
      "measurement",
      "rejected_scope",
      "invalidation",
      "ownership",
    ]),
    file: z.string().min(1),
    line: z.number().int().positive().nullable(),
    column: z.number().int().positive().optional(),
    matchedSignal: z.string().optional(),
    snippet: z.string().optional(),
  })
  .strict();

/**
 * Expected cost shape for a Tron optimization candidate. Mirrors the opt-scan
 * cost-shape contract.
 */
export const TronOptimizationCandidateCostShapeSchema = z
  .object({
    family: z.enum([
      "repeated_boundary_work",
      "avoidable_collection_work",
      "worker_startup_pressure",
      "cache_opportunity",
    ]),
    pattern: z.enum([
      "cpu",
      "memory",
      "io",
      "latency",
      "boundary",
      "collection",
      "startup",
      "cache_miss",
    ]),
    description: z.string().min(1),
  })
  .strict();

/**
 * A static, advisory optimization candidate carried by a Tron reconnaissance
 * report. Candidates are validated opt-scan output (or equivalent deterministic
 * scanner output) that Tron preserves read-only and advisory. Measured fields
 * are intentionally omitted: static candidates must not assert speedup, latency,
 * runtime impact, or other measured claims.
 */
export const TronOptimizationCandidateSchema = z
  .object({
    id: z.string().min(1),
    detector_id: z.string().min(1),
    description: z.string().min(1),
    evidence: z.array(TronOptimizationCandidateEvidenceSchema).min(1),
    expected_cost_shape: TronOptimizationCandidateCostShapeSchema,
    false_positive_caveat: z.string().min(1),
    verification_needed: z.string().min(1),
    recommendation: z.string().min(1),
  })
  .strict();

export const TronEvidenceSchema = z
  .object({
    file: z.string().min(1),
    line: z.number().int().positive().optional(),
    summary: z.string().min(1),
  })
  .strict();

// Heuristic guard: prose fields on a Tron optimization candidate must not
// assert speedup, latency reduction, or runtime impact. Static candidates are
// advisory only; measured claims require a measured evidence branch that this
// Tron schema intentionally omits.
const STATIC_MEASURED_CLAIM_RE =
  /\b(speedup|speed-up|latency reduction|runtime impact|performance (gain|improvement|boost)|\d+%\s*(faster|speedup|improvement)|\d+x\s*(faster|slower))\b/i;

function forbidStaticMeasuredClaims(
  candidates: Array<z.infer<typeof TronOptimizationCandidateSchema>>,
  ctx: z.RefinementCtx,
): void {
  for (const [index, candidate] of candidates.entries()) {
    for (const [field, text] of [
      ["description", candidate.description],
      ["false_positive_caveat", candidate.false_positive_caveat],
      ["verification_needed", candidate.verification_needed],
      ["recommendation", candidate.recommendation],
    ] as const) {
      if (STATIC_MEASURED_CLAIM_RE.test(text)) {
        ctx.addIssue({
          code: "custom",
          path: ["optimization_candidates", index, field],
          message: `static optimization candidate cannot assert measured runtime impact in ${field}`,
        });
      }
    }
  }
}

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
    optimization_candidates: z
      .array(TronOptimizationCandidateSchema)
      .optional(),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  })
    .strict()
    .superRefine((report, ctx) => {
      if (report.optimization_candidates) {
        forbidStaticMeasuredClaims(report.optimization_candidates, ctx);
      }
    });

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

export const VerificationTriageErrorClassSchema = z.enum([
  "SEMANTIC",
  "TRANSIENT",
  "ENVIRONMENTAL",
  "FATAL",
  // Routing-only: accepted in triage evidence, never mapped into task
  // error_recovery.error_class.
  "UNKNOWN",
]);

export const VerificationTriageTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("command"),
      command: z.string().min(1),
      exit_code: z.number().int().nullable(),
      duration_ms: z.number().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ci_check"),
      repo: z.string().min(1),
      check_name: z.string().min(1),
      head_sha: z.string().regex(/^[0-9a-f]{7,40}$/iu),
      run_url: z.string().url().optional(),
      conclusion: z.enum([
        "success",
        "failure",
        "cancelled",
        "timed_out",
        "action_required",
        "neutral",
        "skipped",
        "unknown",
      ]),
    })
    .strict(),
]);

export const VerificationTriageFindingSchema = z
  .object({
    id: z.string().min(1),
    severity: z.enum(["blocker", "issue", "suggestion", "info"]),
    summary: z.string().min(1),
    evidence: z.array(SubagentSourceReferenceSchema).min(1),
  })
  .strict();

export const VerificationTriageHandoffSchema = z
  .object({
    summary: z.string().min(1),
    in_scope: z.array(z.string().min(1)).min(1),
    out_of_scope: z.array(z.string().min(1)),
    done_when: z.array(z.string().min(1)).min(1),
    verification: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const VerificationTriageFailureModeSchema = z.enum([
  "assertion_mismatch",
  "exception",
  "timeout",
  "missing_coverage",
  "contract_conflict",
  "order_sensitive",
  "unknown",
]);

export const VerificationTriageAttributionResultSchema = z.enum([
  "pass",
  "fail",
  "inconclusive",
  "not_run",
]);

export const VerificationTriageComparisonStatusSchema = z.enum([
  "compared_clean",
  "base_failed_branch_fail",
  "base_unavailable",
  "not_compared",
]);

/**
 * Typed failure attribution for a failed verification result (AC6).
 *
 * Captures the exact assertion, test and production locators, branch/base
 * comparison status, failure mode, and evidence references so ownership
 * decisions are structural, not prose heuristics. Kept optional on the bundle
 * so historical reports remain readable; new fail reports SHOULD populate it.
 */
export const VerificationTriageFailureAttributionSchema = z
  .object({
    assertion: z.string().min(1),
    test_locator: SubagentSourceReferenceSchema.optional(),
    production_locator: SubagentSourceReferenceSchema.optional(),
    branch_result: VerificationTriageAttributionResultSchema,
    base_result: VerificationTriageAttributionResultSchema,
    comparison_status: VerificationTriageComparisonStatusSchema,
    failure_mode: VerificationTriageFailureModeSchema,
    owner_task: z.string().min(1).optional(),
    evidence_refs: z.array(SubagentSourceReferenceSchema).min(1),
  })
  .strict();

export const VerificationTriageBundleSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-verification-triage-bundle"),
    phase: z.enum(["local_verify", "ci_check"]),
    targets: z.array(VerificationTriageTargetSchema).min(1),
    status: z.enum(["pass", "fail", "inconclusive"]),
    error_class: VerificationTriageErrorClassSchema,
    confidence: z.enum(["high", "medium", "low"]),
    evidence_basis: z.string().min(1),
    findings: z.array(VerificationTriageFindingSchema),
    recommended_next_action: z.enum([
      "continue",
      "retry_narrower",
      "route_adv_engineer",
      "ask_user",
      "block_environment",
      "wait_ci",
      "no_action",
    ]),
    scope_risk: z.boolean(),
    suggested_handoff: VerificationTriageHandoffSchema.optional(),
    failure_attribution: VerificationTriageFailureAttributionSchema.optional(),
    required_main_agent_actions: z.array(z.string().min(1)),
    follow_ups: z.array(z.string().min(1)),
    consumer_warnings: z.array(SubagentConsumerWarningSchema).optional(),
  })
    .strict()
    .superRefine((report, ctx) => {
      if (report.recommended_next_action !== "route_adv_engineer") return;

      if (report.error_class !== "SEMANTIC") {
        ctx.addIssue({
          code: "custom",
          path: ["error_class"],
          message: "route_adv_engineer requires SEMANTIC error_class",
        });
      }
      if (report.scope_risk) {
        ctx.addIssue({
          code: "custom",
          path: ["scope_risk"],
          message: "route_adv_engineer requires scope_risk false",
        });
      }
      if (report.confidence === "low") {
        ctx.addIssue({
          code: "custom",
          path: ["confidence"],
          message: "route_adv_engineer requires high or medium confidence",
        });
      }
      if (!report.suggested_handoff) {
        ctx.addIssue({
          code: "custom",
          path: ["suggested_handoff"],
          message: "route_adv_engineer requires suggested_handoff",
        });
      }
    });

export const VisualReviewSubagentReportSchema =
  ChangeScopedBaseSubagentReportSchema.extend({
    agent: z.literal("adv-visual-review"),
    image: z.string().min(1),
    description: z.string().min(1),
    text_found: z.array(z.string().min(1)),
    elements: z.array(z.string().min(1)),
    anomalies: z.array(z.string().min(1)),
    confidence: z.enum(["high", "medium", "low"]),
    confidence_reason: z.string().min(1),
    suggested_follow_up: z.array(z.string().min(1)),
    blockers: z.array(z.string().min(1)),
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
  VerificationTriageBundleSubagentReportSchema,
  VisualReviewSubagentReportSchema,
]);

/**
 * Full report ingest schema: task-scoped worker reports plus change-scoped
 * sidecar reports.
 */
export const ScopedSubagentReportSchema = z.union([
  TaskScopedSubagentReportSchema,
  ChangeScopedSubagentReportSchema,
]);

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
  if (agent === "adv-researcher" && row.architecture_judgement === undefined) {
    return [
      {
        ...row,
        architecture_judgement: {
          applicability: "not_applicable",
          confidence: "low",
          reason:
            "Legacy persisted adv-researcher report predates typed architecture judgement.",
          recommendation:
            typeof row.recommendation === "string" && row.recommendation.trim()
              ? row.recommendation
              : "Review legacy researcher report context manually if architecture judgement is needed.",
        },
      },
      true,
    ];
  }

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
    architecture_judgement: "worker_derived",
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
    optimization_candidates: "worker_derived",
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
  "adv-verification-triage-bundle": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    scope: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    workdir_used: "packet_anchor",
    phase: "packet_anchor",
    targets: "worker_derived",
    status: "worker_derived",
    error_class: "worker_derived",
    confidence: "worker_derived",
    evidence_basis: "worker_derived",
    findings: "worker_derived",
    recommended_next_action: "worker_derived",
    scope_risk: "worker_derived",
    suggested_handoff: "worker_derived",
    failure_attribution: "worker_derived",
    required_main_agent_actions: "worker_derived",
    follow_ups: "worker_derived",
    consumer_warnings: "tool_enriched",
  },
  "adv-visual-review": {
    schema_version: "worker_derived",
    change_id: "packet_anchor",
    scope: "packet_anchor",
    attempt: "packet_anchor",
    agent: "worker_derived",
    workdir_used: "packet_anchor",
    image: "worker_derived",
    description: "worker_derived",
    text_found: "worker_derived",
    elements: "worker_derived",
    anomalies: "worker_derived",
    confidence: "worker_derived",
    confidence_reason: "worker_derived",
    suggested_follow_up: "worker_derived",
    blockers: "worker_derived",
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
export type TronOptimizationCandidateEvidence = z.infer<
  typeof TronOptimizationCandidateEvidenceSchema
>;
export type TronOptimizationCandidateCostShape = z.infer<
  typeof TronOptimizationCandidateCostShapeSchema
>;
export type TronOptimizationCandidate = z.infer<
  typeof TronOptimizationCandidateSchema
>;
export type TronSubagentReport = z.infer<typeof TronSubagentReportSchema>;
export type ScannerBundleSubagentReport = z.infer<
  typeof ScannerBundleSubagentReportSchema
>;
export type VerificationTriageFailureMode = z.infer<
  typeof VerificationTriageFailureModeSchema
>;
export type VerificationTriageAttributionResult = z.infer<
  typeof VerificationTriageAttributionResultSchema
>;
export type VerificationTriageComparisonStatus = z.infer<
  typeof VerificationTriageComparisonStatusSchema
>;
export type VerificationTriageFailureAttribution = z.infer<
  typeof VerificationTriageFailureAttributionSchema
>;
export type VerificationTriageBundleSubagentReport = z.infer<
  typeof VerificationTriageBundleSubagentReportSchema
>;
export type VisualReviewSubagentReport = z.infer<
  typeof VisualReviewSubagentReportSchema
>;
export type ScopedSubagentReport = z.infer<typeof ScopedSubagentReportSchema>;
export type SupportedSubagentReport = z.infer<
  typeof TaskScopedSubagentReportSchema
>;

/**
 * Stable persisted sub-agent report identity shared by every sidecar
 * (tools/change.ts, tools/subagent-report.ts, tools/_recovery-writers.ts,
 * tools/followup.ts, and utils/loop-ledger.ts).
 *
 * Lives in `types/` so all layers import the same pure helper without
 * cross-layer identity logic being duplicated.
 *
 * Format (byte-stable — pinned by `subagent-reports.test.ts`):
 * - taskId present: `changeId|taskId|agent|attempt` (legacy shape)
 * - taskId absent + task scope: `changeId|task:<task_id>|agent|attempt`
 * - taskId absent + change scope: `changeId|change:<scope_key>|agent|attempt`
 * - neither: `changeId|unknown-scope|agent|attempt`
 */
export function subagentReportKey(input: {
  changeId: string;
  taskId?: string;
  scope?: SubagentReportScope;
  agent: SubagentAgent;
  attempt: number;
  implementationCycleId?: string;
}): string {
  const cycleSuffix = input.implementationCycleId
    ? `|cycle:${input.implementationCycleId}`
    : "";
  if (input.taskId) {
    return `${input.changeId}|${input.taskId}|${input.agent}|${input.attempt}${cycleSuffix}`;
  }
  const scopeId = input.scope
    ? input.scope.kind === "task"
      ? `task:${input.scope.task_id}`
      : `change:${input.scope.scope_key}`
    : "unknown-scope";
  return `${input.changeId}|${scopeId}|${input.agent}|${input.attempt}${cycleSuffix}`;
}

export function subagentReportImplementationCycleId(
  report: ScopedSubagentReport,
): string | undefined {
  if (report.agent !== "adv-engineer" && report.agent !== "adv-designer") {
    return undefined;
  }
  return report.apply_context?.implementation_cycle_id;
}

/**
 * Builds a binding hint for `apply_context.implementation_cycle_id`. The
 * returned example is itself valid against `SubagentApplyContextSchema` so
 * callers can copy it verbatim after replacing the placeholders.
 */
export function buildApplyContextBindingHint(): {
  path: string;
  example: string;
} {
  const example = {
    implementation_cycle_id: "ic_<id>",
    implementation_provenance: {
      kind: "engineer_report",
      report_key: "<stable report key>",
    },
  };
  return {
    path: "apply_context.implementation_cycle_id",
    example: JSON.stringify(example),
  };
}

/**
 * Renders the apply_context binding hint as a human-readable string suitable
 * for appending to a rejection message.
 */
export function formatApplyContextBindingHint(): string {
  const { path, example } = buildApplyContextBindingHint();
  return ` Bind the active cycle under ${path} (with implementation_provenance). Example: ${example}`;
}

// =============================================================================
// Typed Report Follow-Up Routing
// =============================================================================

/**
 * Which report follow-up array a typed reference points to.
 */
const ReportFollowUpKindSchema = z.enum(["follow_ups", "required_follow_ups"]);

/**
 * Structural reference to a specific follow-up inside a persisted sub-agent
 * report. The `report_key` is the stable report identity (see
 * `subagentReportKey`); `kind` and `index` disambiguate within the report.
 * Text matching is never authority — this ref is.
 */
export const ReportFollowUpRefSchema = z
  .object({
    /** Stable report key (subagentReportKey format). */
    report_key: z.string().min(1),
    /** Which follow-up array this ref points to. */
    kind: ReportFollowUpKindSchema,
    /** Zero-based index within the array. */
    index: z.number().int().min(0),
  })
  .strict();

/**
 * Compute the stable report key for a persisted report.
 * Mirrors `subagentReportKey` but operates on the report object directly.
 */
export function reportKeyFromReport(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId:
      typeof report.scope !== "string" && report.scope.kind === "task"
        ? report.scope.task_id
        : undefined,
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
  });
}

/** @deprecated Use `TaskScopedSubagentReport` or `ScopedSubagentReport` explicitly. */
export type SubagentReport = SupportedSubagentReport;
