/**
 * Task Classifier — shared TDD intent detection for all validators.
 *
 * Spec: .adv/specs/tdd-contract/spec.json
 * Requirement: rq-TDD004cls (Task Classifier with Metadata-First Detection)
 *
 * Detection order:
 *   1. metadata.tdd_intent (if valid) — authoritative
 *   2. Title heuristics — legacy fallback
 *
 * This module is the single source of truth for TDD intent classification.
 * All validators (prep-readiness, completeness, gate checks) MUST use this
 * instead of implementing their own detection logic.
 */

import {
  isLogicTask,
  TDD_TRIVIAL_PATTERNS,
  TDD_REQUIRED_PATTERNS,
} from "../types";
import type {
  ContractEvidencePolicy,
  ScopedSubagentReport,
  Task,
  TaskEvidenceCompatibility,
  TaskEvidenceResolution,
  TaskType,
} from "../types";
import { reportKeyFromReport } from "../types";

// =============================================================================
// Types
// =============================================================================

/** Valid values for metadata.tdd_intent */
type TddIntent = "inline" | "separate_verification" | "not_applicable";

const VALID_TDD_INTENTS = new Set<string>([
  "inline",
  "separate_verification",
  "not_applicable",
]);

// =============================================================================
// Title Heuristics (extracted from prep-readiness.ts)
// =============================================================================

/** Returns true if a task title indicates it is a test/spec task */
export function isTestTask(title: string): boolean {
  return /\b(test|tests|spec|specs|failing test|red phase)\b/i.test(title);
}

/** Returns true if a task title indicates it is an implementation task */
export function isImplTask(title: string): boolean {
  return /\b(implement|impl|create|build|add|develop|code|write\s+(?!test|spec))\b/i.test(
    title,
  );
}

// =============================================================================
// Classifier
// =============================================================================

/**
 * Classify a task's TDD intent using metadata-first detection with title fallback.
 *
 * Per rq-TDD004cls:
 *   - metadata.tdd_intent takes precedence when valid
 *   - Invalid metadata values are ignored (fall back to title heuristics)
 *   - Tasks without metadata use title-based heuristics for backward compatibility
 *
 * @returns The resolved TDD intent for the task
 */
export function classifyTddIntent(
  task: Pick<Task, "title" | "metadata">,
): TddIntent {
  // 1. Check metadata.tdd_intent first (authoritative when valid)
  const metadataIntent = task.metadata?.tdd_intent;
  if (metadataIntent !== undefined && VALID_TDD_INTENTS.has(metadataIntent)) {
    return metadataIntent as TddIntent;
  }

  // 2. Fall back to title heuristics
  const title = task.title;

  // Trivial tasks (docs, config, chores) → not_applicable
  if (TDD_TRIVIAL_PATTERNS.some((p) => p.test(title))) {
    return "not_applicable";
  }

  // Logic-heavy tasks (implement, create, fix, etc.) → inline
  if (TDD_REQUIRED_PATTERNS.some((p) => p.test(title))) {
    return "inline";
  }

  // Test-like tasks without metadata → inline (they're part of impl work)
  if (isTestTask(title)) {
    return "inline";
  }

  // Default: inline (conservative — require TDD evidence)
  return "inline";
}

/**
 * Returns whether a task should produce TDD evidence under the metadata-first
 * contract.
 */
export function requiresTddEvidence(
  task: Pick<Task, "title" | "metadata">,
): boolean {
  const intent = classifyTddIntent(task);

  if (intent === "not_applicable" || intent === "separate_verification") {
    return false;
  }

  return task.metadata?.tdd_intent === "inline" || isLogicTask(task.title);
}

/**
 * Shape of TDD evidence/proof preserved on the Task. Older archived tasks may
 * carry passthrough `tdd_evidence`; signal-driven tasks carry the canonical
 * completion proof in `verification` from taskCompletedSignal.
 */
type TaskWithTddEvidence = Pick<Task, "title" | "metadata"> & {
  tdd_evidence?: {
    red?: unknown;
    green?: unknown;
  };
  verification?: string;
};

/**
 * Metadata-aware TDD compliance used by validators and task tools.
 *
 * Returns:
 *   - "not_required" when TDD does not apply (intent: not_applicable /
 *     separate_verification, or trivial title heuristic).
 *   - "compliant" when TDD applies AND the task carries either complete legacy
 *     red/green `tdd_evidence` OR signal-driven completion verification.
 *     rq-TDD001inl now records inline TDD through adv_run_test calls with the
 *     final claim in taskCompletedSignal.verification; the validator cannot
 *     query historical adv_run_test records here, so the durable task-level
 *     completion proof is sufficient for archive validation.
 *   - "missing" when TDD applies but evidence is absent or incomplete.
 *
 * Bug history: prior to rq-TDDvalidatorCompliantPath01, this function
 * had no path to "compliant" and returned "missing" for every
 * inline-intent / logic-heavy task regardless of recorded evidence.
 * Archive validation (rq-archiveValidate01) treated those false
 * positives as hard blockers, preventing release of work that had in
 * fact completed full red→green cycles.
 */
export function getTaskTddCompliance(
  task: TaskWithTddEvidence,
): "compliant" | "missing" | "not_required" {
  if (!requiresTddEvidence(task)) {
    return "not_required";
  }

  const evidence = task.tdd_evidence;
  if (evidence && evidence.red && evidence.green) {
    return "compliant";
  }

  if (task.verification?.trim()) {
    return "compliant";
  }

  return "missing";
}

// =============================================================================
// Task Evidence Resolver
// =============================================================================

import {
  ContractEvidencePolicySchema,
  TaskEvidenceCompatibilitySchema,
} from "../types";

const DEFAULT_POLICY_BY_TYPE: Record<
  Exclude<TaskType, "code" | "verification">,
  ContractEvidencePolicy
> = {
  docs: "source_citation",
  ops: "artifact_reference",
  research: "source_citation",
  approval: "stakeholder_acceptance",
};

function defaultPolicyFor(type: TaskType): ContractEvidencePolicy {
  if (type === "code" || type === "verification") {
    return "test";
  }
  return DEFAULT_POLICY_BY_TYPE[type];
}

function proofTargetFor(policy: ContractEvidencePolicy): string {
  const targets: Record<ContractEvidencePolicy, string> = {
    test: "Automated red/green tests evidenced by adv_run_test",
    review: "Structured review conclusion",
    static_check: "Static analysis or check output",
    design_proof: "Design proof or design artifact",
    not_applicable: "No evidence required",
    source_citation: "Source citation or reference",
    source_audit: "Source audit or inspection",
    rubric_review: "Rubric-based review",
    stakeholder_acceptance: "Stakeholder acceptance evidence",
    artifact_reference: "Artifact reference or operational output",
  };
  return targets[policy];
}

function isBehaviorCritical(type: TaskType): boolean {
  return type === "code" || type === "verification";
}

function countNonWhitespace(value: string): number {
  return value.replace(/\s/g, "").length;
}

function resolveCompatibility(
  task: Pick<Task, "evidence_plan" | "tdd_reclassification">,
): TaskEvidenceCompatibility {
  if (task.evidence_plan?.provenance) {
    return TaskEvidenceCompatibilitySchema.parse(task.evidence_plan.provenance);
  }
  if (task.tdd_reclassification) {
    return "reclassified";
  }
  return "legacy";
}

/**
 * Pure, table-driven resolver for a task's normalized evidence plan.
 *
 * Implements rq-ADVEXEC06: normalized evidence-plan compatibility boundary
 * and advisory proxies. Quality proxies are advisory only; non-test routes for
 * logic-bearing work require a bounded rationale and linked review conclusion;
 * legacy plans are normalized on read with explicit compatibility provenance.
 *
 * Returns exactly one evidence policy, one proof target, explicit compatibility
 * provenance, and structural errors for new or materially reclassified tasks.
 *
 * Rules:
 * - New/reclassified tasks default to a type-appropriate policy when none is
 *   declared, so they always carry exactly one policy and proof target.
 * - Behavior-critical tasks (code / verification) may not use
 *   evidence_policy 'not_applicable'.
 * - Non-test routes for behavior-critical work require a bounded rationale and
 *   a linked review conclusion.
 * - Legacy tasks without plan provenance are normalized on read with
 *   compatibility 'legacy'; no heuristic cutover is performed.
 *
 * @param task Task to resolve evidence for
 * @returns Normalized evidence resolution
 */
export function resolveTaskEvidence(task: Task): TaskEvidenceResolution {
  const errors: string[] = [];

  const compatibility = resolveCompatibility(task);
  const isNewOrReclassified =
    compatibility === "new" || compatibility === "reclassified";
  const effectiveType = task.type ?? "code";
  const behaviorCritical = isBehaviorCritical(effectiveType);

  // Determine effective policy, defaulting by type when absent.
  const declaredPolicy = task.evidence_plan?.policy ?? task.evidence_policy;
  let policy: ContractEvidencePolicy;
  if (declaredPolicy) {
    const parsed = ContractEvidencePolicySchema.safeParse(declaredPolicy);
    if (parsed.success) {
      policy = parsed.data;
    } else {
      policy = defaultPolicyFor(effectiveType);
      errors.push(`Invalid evidence_policy: ${declaredPolicy}`);
    }
  } else {
    policy = defaultPolicyFor(effectiveType);
  }

  // Behavior-critical not_applicable prohibition.
  if (behaviorCritical && policy === "not_applicable") {
    errors.push(
      "Behavior-critical task cannot use evidence_policy 'not_applicable'. Use a proof-bearing route such as test, review, or static_check.",
    );
  }

  const proofTarget =
    task.evidence_plan?.proof_target?.trim() ?? proofTargetFor(policy);

  const rationale = task.evidence_plan?.rationale?.trim();
  const reviewConclusion = task.evidence_plan?.review_conclusion?.trim();
  const reviewEvidenceRef = task.evidence_plan?.review_evidence_ref;
  const stage = task.evidence_plan?.stage;

  // Non-test routes for behavior-critical work always require a bounded
  // rationale. Stage-v2 defers reviewer-owned proof to completion; older plans
  // preserve the linked-conclusion requirement for compatibility.
  if (isNewOrReclassified && behaviorCritical && policy !== "test") {
    if (!rationale) {
      errors.push(
        `Non-test route '${policy}' for logic-bearing work requires a bounded rationale.`,
      );
    } else if (countNonWhitespace(rationale) > 500) {
      errors.push(
        `Rationale exceeds 500 non-whitespace characters (got ${countNonWhitespace(rationale)}).`,
      );
    }
    if (stage !== "stage-v2" && !reviewConclusion && !reviewEvidenceRef) {
      errors.push(
        `Non-test route '${policy}' for logic-bearing work requires a linked review conclusion or reviewer evidence reference.`,
      );
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    policy,
    proof_target: proofTarget,
    ...(rationale ? { rationale } : {}),
    ...(reviewConclusion ? { review_conclusion: reviewConclusion } : {}),
    ...(reviewEvidenceRef ? { review_evidence_ref: reviewEvidenceRef } : {}),
    compatibility,
    ...(stage ? { stage } : {}),
    errors,
  };
}

// =============================================================================
// Stage-aware evidence validation (v2)
// =============================================================================

export type TaskEvidenceStage = "prep" | "completion";

export interface TaskEvidenceStageValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Stage-aware evidence validator.
 *
 * - prep: policy, proof target, compatible TDD intent, bounded rationale.
 * - completion: prep validity plus review_evidence_ref resolving to a persisted
 *   task-scoped reviewer report for non-test behavior-critical tasks.
 *
 * Legacy plans (no stage or provenance legacy) accept review_conclusion as a
 * readability fallback; stage-v2 plans require the typed reviewer reference.
 */
export function validateTaskEvidenceForStage(
  task: Task,
  stage: TaskEvidenceStage,
  reports: ScopedSubagentReport[] = [],
): TaskEvidenceStageValidationResult {
  const base = resolveTaskEvidence(task);
  const errors: string[] = [...base.errors];

  const effectiveType = task.type ?? "code";
  const behaviorCritical =
    effectiveType === "code" || effectiveType === "verification";
  const policy = base.policy;

  const planStage = task.evidence_plan?.stage;
  const isStageV2 = planStage === "stage-v2";

  if (stage === "completion") {
    if (
      behaviorCritical &&
      policy &&
      policy !== "test" &&
      policy !== "not_applicable"
    ) {
      const reviewEvidenceRef = task.evidence_plan?.review_evidence_ref;
      const reviewConclusion = task.evidence_plan?.review_conclusion;

      if (isStageV2) {
        if (!reviewEvidenceRef) {
          errors.push(
            `Stage-v2 non-test route '${policy}' requires a reviewer-owned review_evidence_ref by completion.`,
          );
        } else {
          const matchingReport = reports.find(
            (r) =>
              reportKeyFromReport(r) === reviewEvidenceRef.report_key &&
              r.agent === "adv-reviewer" &&
              (typeof r.scope !== "string" && r.scope.kind === "task"
                ? r.scope.task_id === task.id
                : "task_id" in r && r.task_id === task.id),
          );
          if (!matchingReport) {
            errors.push(
              `review_evidence_ref ${reviewEvidenceRef.report_key} does not resolve to a persisted task-scoped reviewer report owned by task ${task.id}.`,
            );
          }
        }
      } else if (!reviewConclusion && !reviewEvidenceRef) {
        errors.push(
          `Non-test route '${policy}' requires a linked review conclusion or reviewer evidence reference.`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
