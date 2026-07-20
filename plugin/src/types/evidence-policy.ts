import { z } from "zod";

/**
 * Shared evidence-policy vocabulary used by contract items, review-matrix rows,
 * and tasks. Keeps the policy surface consistent across obligation defaulting,
 * completion proof, and acceptance review.
 */
export const ContractEvidencePolicySchema = z.enum([
  "test",
  "review",
  "static_check",
  "design_proof",
  "not_applicable",
  "source_citation",
  "source_audit",
  "rubric_review",
  "stakeholder_acceptance",
  "artifact_reference",
]);

export type ContractEvidencePolicy = z.infer<
  typeof ContractEvidencePolicySchema
>;

// =============================================================================
// Policy partition: proof-bearing vs warn-first
// =============================================================================

/**
 * Proof-bearing evidence policies. At acceptance/release readiness, unresolved
 * verification_missing / verification_mismatch consumer warnings on a completed
 * task with one of these policies become a typed VERIFICATION_EVIDENCE_MISSING
 * blocker.
 */
export const PROOF_BEARING_EVIDENCE_POLICIES: ContractEvidencePolicy[] = [
  "test",
  "static_check",
  "review",
  "artifact_reference",
] as const;

/**
 * Warn-first evidence policies. Consumer warnings on completed tasks with these
 * policies stay advisory; they do not hard-block acceptance/release readiness.
 */
export const WARN_FIRST_EVIDENCE_POLICIES: ContractEvidencePolicy[] = [
  "source_citation",
  "source_audit",
  "rubric_review",
  "stakeholder_acceptance",
  "design_proof",
  "not_applicable",
] as const;

export function isProofBearingEvidencePolicy(
  policy: ContractEvidencePolicy,
): boolean {
  return PROOF_BEARING_EVIDENCE_POLICIES.includes(policy);
}

export function isWarnFirstEvidencePolicy(
  policy: ContractEvidencePolicy,
): boolean {
  return WARN_FIRST_EVIDENCE_POLICIES.includes(policy);
}

// =============================================================================
// Reviewer-owned evidence reference
// =============================================================================

/**
 * Typed reference to a persisted task-scoped reviewer report. Written only by
 * the adv-reviewer report consumer; it is the completion-stage authority for
 * non-test behavior-critical tasks. Legacy review_conclusion text remains
 * readable but is not authority for stage-v2 plans.
 */
export const ReviewEvidenceRefSchema = z
  .object({
    report_key: z.string().trim().min(1),
  })
  .strict();

export type ReviewEvidenceRef = z.infer<typeof ReviewEvidenceRefSchema>;

// =============================================================================
// Task Evidence Plan
// =============================================================================

/**
 * Compatibility provenance for a task evidence plan.
 *
 * - new: task was created under the normalized evidence-plan model.
 * - reclassified: task was materially reclassified after creation (e.g., TDD
 *   intent changed via adv_task_reclassify_tdd).
 * - legacy: task predates the plan model; its plan is a compatibility
 *   normalization, not a structural declaration.
 */
export const TaskEvidenceCompatibilitySchema = z.enum([
  "new",
  "reclassified",
  "legacy",
]);

export type TaskEvidenceCompatibility = z.infer<
  typeof TaskEvidenceCompatibilitySchema
>;

export const TaskEvidenceStageSchema = z.enum(["stage-v1", "stage-v2"]);
export type TaskEvidenceStage = z.infer<typeof TaskEvidenceStageSchema>;

/**
 * Normalized evidence plan for a task. One policy, one proof target, and
 * explicit compatibility provenance. Non-test routes for logic-bearing work
 * carry a bounded rationale and linked review conclusion.
 */
export const TaskEvidencePlanSchema = z.object({
  policy: ContractEvidencePolicySchema,
  proof_target: z.string().trim().min(1),
  rationale: z.string().trim().optional(),
  review_conclusion: z.string().trim().optional(),
  review_evidence_ref: ReviewEvidenceRefSchema.optional(),
  provenance: TaskEvidenceCompatibilitySchema,
  stage: TaskEvidenceStageSchema.optional(),
});

export type TaskEvidencePlan = z.infer<typeof TaskEvidencePlanSchema>;

/**
 * Pure resolver output. Consumers receive validity, the normalized policy/proof
 * target, compatibility provenance, and any structural errors.
 */
export const TaskEvidenceResolutionSchema = z.object({
  valid: z.boolean(),
  policy: ContractEvidencePolicySchema.optional(),
  proof_target: z.string().trim().min(1).optional(),
  rationale: z.string().trim().optional(),
  review_conclusion: z.string().trim().optional(),
  review_evidence_ref: ReviewEvidenceRefSchema.optional(),
  compatibility: TaskEvidenceCompatibilitySchema.optional(),
  stage: TaskEvidenceStageSchema.optional(),
  errors: z.array(z.string()).default([]),
});

export type TaskEvidenceResolution = z.infer<
  typeof TaskEvidenceResolutionSchema
>;
