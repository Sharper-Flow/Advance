/**
 * Tasks Domain Types
 *
 * TaskStatus, Cancellation, TddReclassification,
 * Error Recovery, TaskType, Task.
 */

import { z } from "zod";
import {
  ContractEvidencePolicySchema,
  TaskEvidencePlanSchema,
} from "./evidence-policy";
import { DependencySchema } from "./specs";
import {
  ReportFollowUpRefSchema,
  TaskScopedSubagentReportSchema,
} from "./subagent-reports";
import { TaskStructuredOutputSchema } from "./task-output";

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);

type _TaskStatus = z.infer<typeof TaskStatusSchema>;

// =============================================================================
// Cancellation Metadata (required for any task cancellation)
// =============================================================================

/**
 * Structured cancellation record.
 * Every task cancellation MUST have user approval with evidence.
 * Batch approvals are allowed — agents present all cancellations to the user,
 * each with a reason, and the user approves the batch.
 */
export const CancellationSchema = z.object({
  /** Why this task was cancelled (required per-task even in batch) */
  reason: z.string(),
  /** Must be true — cancellations require explicit user signoff */
  approved_by_user: z.literal(true),
  /** Evidence of approval (e.g., question tool response, user message) */
  approval_evidence: z.string(),
  /** Task ID that supersedes this one (if applicable) */
  superseded_by: z.string().optional(),
  /** ISO8601 timestamp when cancellation was approved */
  approved_at: z.string(),
});

export type Cancellation = z.infer<typeof CancellationSchema>;

/**
 * Structured TDD reclassification record.
 * Reclassifying tdd_intent after prep gate requires explicit user approval
 * with a full audit trail — mirrors the CancellationSchema pattern.
 */
export const TddReclassificationSchema = z.object({
  /** Original tdd_intent value before reclassification */
  from_intent: z.string(),
  /** New tdd_intent value (inline | separate_verification | not_applicable) */
  to_intent: z.enum(["inline", "separate_verification", "not_applicable"]),
  /** Reason for reclassification */
  reason: z.string(),
  /** Must be true — reclassifications require explicit user signoff */
  approved_by_user: z.literal(true),
  /** Evidence of approval (e.g., question tool response, user message) */
  approval_evidence: z.string(),
  /** ISO8601 timestamp when reclassification was approved */
  approved_at: z.string(),
});

export type TddReclassification = z.infer<typeof TddReclassificationSchema>;

// =============================================================================
// Contract References
// =============================================================================

export const TaskContractRefsSchema = z.object({
  /** Contract items this task implements, usually AC-* or SC-* IDs. */
  implements: z.array(z.string()).optional(),
  /** Contract items this task verifies with tests/checks/evidence. */
  verifies: z.array(z.string()).optional(),
  /** Contract items this task must preserve, usually C-*, DONT-*, or OOS-* IDs. */
  respects: z.array(z.string()).optional(),
  /** Required when a task intentionally has no contract refs. */
  not_applicable_reason: z.string().optional(),
});

export type TaskContractRefs = z.infer<typeof TaskContractRefsSchema>;

// =============================================================================
// Failure Attribution
// =============================================================================

/**
 * Typed failure attribution for execution diagnosis.
 * Captures what kind of failure occurred and, when relevant, which contract
 * items are involved.
 */
export const FailureAttributionKindSchema = z.enum([
  "contract_conflict",
  "implementation_defect",
  "infrastructure",
  "external_service",
  "unknown",
]);

export type FailureAttributionKind = z.infer<
  typeof FailureAttributionKindSchema
>;

export const ContractConflictKindSchema = z.enum([
  "overlapping_implements_verifies",
  "implements_respects_overlap",
  "missing_required_respects",
  "not_applicable_with_refs",
  "unattributed_acceptance_criterion",
]);

export type ContractConflictKind = z.infer<typeof ContractConflictKindSchema>;

export const ContractConflictSchema = z.object({
  kind: ContractConflictKindSchema,
  contract_ids: z.array(z.string()).min(1),
  reason: z.string().min(1),
});

export type ContractConflict = z.infer<typeof ContractConflictSchema>;

export const FailureAttributionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("contract_conflict"),
    description: z.string().min(1),
    contract_conflict: ContractConflictSchema,
  }),
  z.object({
    kind: z.enum([
      "implementation_defect",
      "infrastructure",
      "external_service",
      "unknown",
    ]),
    description: z.string().min(1),
    contract_refs: TaskContractRefsSchema.optional(),
  }),
]);

export type FailureAttribution = z.infer<typeof FailureAttributionSchema>;

// =============================================================================
// Error Recovery
// =============================================================================

/**
 * Structured error recovery state for autonomous retry tracking in /adv-apply.
 *
 * error_class values:
 * - TRANSIENT: Network timeout, flaky test — retry once with 5s delay
 * - SEMANTIC: Type error, logic bug, test failure — retry up to 3x with diagnosis
 * - ENVIRONMENTAL: Missing dep, config not found — escalate immediately
 * - FATAL: Unrecoverable error — escalate immediately, do not retry
 */

/**
 * A single retry attempt record — captures the diagnosis and outcome for doom-loop auditing.
 */
export const AttemptSchema = z.object({
  /** Which retry attempt this is (1-indexed) */
  attempt_number: z.number().int().min(1),
  /** The error encountered in this attempt */
  error: z.string(),
  /** Root cause diagnosis before fix was tried */
  diagnosis: z.string(),
  /** What fix was attempted */
  fix_tried: z.string(),
  /** Short label identifying the retry strategy (e.g., "rewrite-import-path"). Enables deduplication across attempts. */
  strategy_label: z.string().optional(),
  /** Result of this attempt */
  outcome: z.enum(["failed", "succeeded"]),
  /** ISO8601 timestamp when attempt was made */
  attempted_at: z.string(),
});

type _Attempt = z.infer<typeof AttemptSchema>;

export const ErrorRecoverySchema = z
  .object({
    /** Human-readable description of the last error encountered */
    last_error: z.string(),
    /** Number of retry attempts made so far */
    retry_count: z.number().int().min(0),
    /** Maximum retries allowed for this error class */
    max_retries: z.number().int().min(0),
    /** Classification of the error for retry strategy selection */
    error_class: z.enum([
      "TRANSIENT",
      "SEMANTIC",
      "ENVIRONMENTAL",
      "FATAL",
      "CONTRACT_CONFLICT",
    ]),
    /** Planned next action if retrying (optional) */
    next_strategy: z.string().optional(),
    /**
     * Retained window of retry attempts for doom-loop auditing.
     *
     * Bounded to `max_retries` by the accumulator — this is NOT the full
     * history. Use `total_attempts` (or {@link observedAttemptCount}) whenever
     * reporting how many attempts occurred.
     */
    attempts: z.array(AttemptSchema).optional(),
    /**
     * How many attempts actually occurred, including those elided from
     * `attempts` by the retention bound.
     *
     * Recorded explicitly rather than derived, because `attempt_number` is a
     * per-agent counter: two agents reporting on one task can both submit
     * attempt 1, so the highest retained `attempt_number` can be lower than
     * the true count. Deriving the number would make an operator-facing figure
     * depend on a heuristic; this field owns it structurally. Optional for
     * backward compatibility with records written before it existed.
     */
    total_attempts: z.number().int().min(0).optional(),
    /**
     * Explicit marker set when the retention clamp has fired — i.e. the true
     * attempt count ({@link total_attempts}) has reached or exceeded
     * `max_retries`. Makes the clamp visible rather than silent: report
     * submission is never refused at/over budget (AC7), but the operator can
     * see that history was elided. Set by the reducer
     * (`applySubagentReportSubmittedToState`); absent while the budget holds.
     */
    budget_warning: z.string().optional(),
    /** Typed failure attribution for this recovery state */
    failure_attribution: FailureAttributionSchema.optional(),
  })
  .superRefine((recovery, ctx) => {
    // `attempts` is the retry record; `retry_count` is a projection of it.
    // When history is present it is the only source of truth, so budget
    // enforcement uses the recorded attempts rather than the caller's counter.
    const effectiveRetryCount =
      recovery.attempts?.length ?? recovery.retry_count;

    if (effectiveRetryCount > recovery.max_retries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["retry_count"],
        message: "retry_count must not exceed max_retries",
      });
    }

    if (recovery.error_class === "SEMANTIC" && recovery.attempts) {
      const labels = recovery.attempts
        .map((attempt) => attempt.strategy_label)
        .filter((label): label is string => Boolean(label));
      if (new Set(labels).size !== labels.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts"],
          message: "semantic retry strategy_label values must be distinct",
        });
      }
    }

    if (recovery.error_class === "CONTRACT_CONFLICT") {
      if (recovery.max_retries !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["max_retries"],
          message:
            "CONTRACT_CONFLICT errors are non-retryable; max_retries must be 0",
        });
      }
      if (recovery.retry_count !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["retry_count"],
          message:
            "CONTRACT_CONFLICT errors are non-retryable; retry_count must be 0",
        });
      }
      if (recovery.attempts && recovery.attempts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts"],
          message:
            "CONTRACT_CONFLICT errors are non-retryable; attempts must be empty",
        });
      }
      if (
        !recovery.failure_attribution ||
        recovery.failure_attribution.kind !== "contract_conflict"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failure_attribution"],
          message:
            "CONTRACT_CONFLICT errors require a contract_conflict failure_attribution",
        });
      }
    }
  })
  // Normalize the projection so a stored record can never disagree with its
  // own retry history. Callers may send a stale counter; the parsed value is
  // always derived from `attempts` when history is recorded.
  .transform((recovery) =>
    recovery.attempts
      ? { ...recovery, retry_count: recovery.attempts.length }
      : recovery,
  );

export type ErrorRecovery = z.infer<typeof ErrorRecoverySchema>;

/**
 * How many attempts actually occurred, as opposed to how many are retained.
 *
 * `attempts[]` is bounded to `max_retries` by the accumulator, so its length is
 * the size of the retained window, not a count of what happened.
 *
 * Prefers the explicitly recorded `total_attempts`. Falls back to deriving from
 * the retained window only for legacy records written before that field
 * existed — and that fallback is a floor, not a guarantee: `attempt_number` is
 * a per-agent counter, so two agents reporting on one task can both submit
 * attempt 1 and the highest retained value can sit below the true count.
 * Structural value first, heuristic only where nothing better survives (P33).
 *
 * Shared rather than reimplemented per call site: this is the same class of
 * mistake as the duplicated `max_retries` literal that let a workflow re-emit
 * its own budget and re-brick a change. Any surface reporting attempt counts to
 * an operator must use this, or it will understate the situation at exactly the
 * moment someone is deciding how to intervene.
 */
export function observedAttemptCount(
  // Deliberately permissive: several call sites hold their own narrowed
  // recovery shapes (loop-ledger's AttemptLike, tool-formatters' DoomLoopInput,
  // status.ts's unknown[]). Requiring the full `ErrorRecovery` shape would push
  // casts onto callers, and a cast at a call site is exactly how a reporting
  // surface drifts back to the wrong number.
  recovery:
    | {
        attempts?: readonly unknown[] | null;
        total_attempts?: number | null;
        retry_count?: number | null;
      }
    | null
    | undefined,
): number {
  if (!recovery) return 0;
  const attempts = recovery.attempts ?? [];
  // Every known signal is a floor; take the strongest. retry_count matters for
  // legacy records that carry a counter but no attempts array — dropping it
  // here would silently report zero retries for exactly those records.
  const derivedFloor = attempts.reduce<number>((highest, attempt) => {
    const attemptNumber =
      attempt && typeof attempt === "object" && "attempt_number" in attempt
        ? (attempt as { attempt_number?: unknown }).attempt_number
        : undefined;
    return typeof attemptNumber === "number"
      ? Math.max(highest, attemptNumber)
      : highest;
  }, attempts.length);
  return Math.max(
    derivedFloor,
    typeof recovery.total_attempts === "number" ? recovery.total_attempts : 0,
    typeof recovery.retry_count === "number" ? recovery.retry_count : 0,
  );
}

// =============================================================================
// Delegation Recovery (AC5 — bounded empty-worker recovery)
// =============================================================================

/**
 * Task-scoped delegation recovery state.
 *
 * Records empty/malformed worker output incidents and enforces the bounded
 * recovery rule: one narrower retry at most; after that retry is exhausted,
 * further same-scope delegation is refused until inline diagnosis evidence
 * exists. Empty output is tracked here, NOT in ErrorRecovery.attempts, so it
 * does not count as a genuine semantic repair attempt.
 */
export const DelegationRecoverySchema = z
  .object({
    /** Number of empty or malformed worker-output incidents recorded. */
    empty_or_malformed_count: z.number().int().min(0),
    /** Number of narrower retries already attempted in response to incidents. */
    narrower_retry_count: z.number().int().min(0),
    /** Whether inline diagnosis evidence has been recorded for the incident. */
    inline_diagnosis_evidence: z.boolean(),
    /** ISO8601 timestamp of the most recent incident or recovery update. */
    last_updated_at: z.string().trim().min(1),
    /** Optional fingerprint identifying the blocked delegation scope. */
    blocked_scope: z.string().optional(),
  })
  .superRefine((recovery, ctx) => {
    // AC5: at most one narrower retry after empty/malformed worker output.
    if (recovery.narrower_retry_count > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["narrower_retry_count"],
        message:
          "AC5: at most one narrower retry is allowed after empty/malformed worker output",
      });
    }

    // AC5: once more than one narrower retry has been attempted, same-scope
    // delegation is blocked until inline diagnosis evidence exists.
    if (
      recovery.narrower_retry_count > 1 &&
      !recovery.inline_diagnosis_evidence
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inline_diagnosis_evidence"],
        message:
          "AC5: inline diagnosis evidence is required before further same-scope delegation after empty/malformed worker output",
      });
    }

    // Cannot attempt more retries than recorded incidents.
    if (recovery.narrower_retry_count > recovery.empty_or_malformed_count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["narrower_retry_count"],
        message:
          "narrower_retry_count must not exceed empty_or_malformed_count",
      });
    }
  });

export type DelegationRecovery = z.infer<typeof DelegationRecoverySchema>;

// =============================================================================
// Progress Rounds (rq-retryProgressAccounting01)
// =============================================================================
//
// A BLOCKED sub-agent verdict whose blocking findings share no id or stable
// fingerprint with the previous blocked round is progress on new ground, not
// a failed retry of the same ground. Progress rounds are recorded here and
// MUST NOT inflate error_recovery: rq-loopLedger01 derives retry severity
// from error_recovery, and a progress round is not a failure.

/**
 * One productive review/implementation round: a blocked report whose findings
 * were disjoint from the previous blocked round's findings.
 */
export const ProgressRoundSchema = z
  .object({
    /** Per-agent monotonic attempt counter from the source report. */
    attempt: z.number().int().min(0),
    /** Submitting agent (e.g. "adv-reviewer"). */
    agent: z.string().trim().min(1),
    /** Human-readable joined blocker summary from the report. */
    summary: z.string(),
    /** Stable finding keys (`id:`/`text:`/`file:` prefixed) for this round. */
    fingerprints: z.array(z.string()),
    /** ISO8601 submission timestamp from the signal payload. */
    recorded_at: z.string().trim().min(1),
  })
  .strict();
export type ProgressRound = z.infer<typeof ProgressRoundSchema>;

/**
 * Normalize finding text for fingerprint comparison. Pure and deterministic
 * (DDC2 — replay-safe): lowercase, collapse whitespace, trim. No Date, no
 * randomness.
 */
export function normalizeFindingText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// =============================================================================
// Wisdom Drafts (rq-wisdomAutoSurfacing01)
// =============================================================================
//
// Advisory-only typed drafts auto-created when a task records a SEMANTIC
// error_recovery attempt. Drafts are task-scoped (AC7) and follow a strict
// lifecycle (AC4): suggested → promoted | dismissed. No revival path.
// Promotion happens via adv_wisdom_add from_draft_id; auto-dismissal happens
// at adv_task_checkpoint with dismiss_reason "auto_checkpoint"; explicit user
// dismiss carries dismiss_reason "user_dismissed".

/**
 * Lifecycle status for a WisdomDraft.
 * - suggested: newly created, awaiting review
 * - promoted:  terminal — promoted to a Wisdom entry via adv_wisdom_add
 * - dismissed: terminal — auto-dismissed at checkpoint OR explicitly by user
 */
export const WisdomDraftStatusSchema = z.enum([
  "suggested",
  "promoted",
  "dismissed",
]);

/**
 * Reason a draft entered the dismissed terminal state.
 * - auto_checkpoint: draft was unreviewed when adv_task_checkpoint completed
 * - user_dismissed:  user explicitly dismissed the draft
 */
export const WisdomDraftDismissReasonSchema = z.enum([
  "auto_checkpoint",
  "user_dismissed",
]);

/**
 * Suggested wisdom category derived from the triggering error_class.
 * SEMANTIC errors map to "failure"; future FATAL support may add "gotcha".
 */
export const WisdomDraftSuggestedTypeSchema = z.enum(["failure", "gotcha"]);

/**
 * A single wisdom draft suggestion auto-created from a SEMANTIC error_recovery
 * attempt. The agent reviews the draft and either promotes it to a real Wisdom
 * entry (via adv_wisdom_add from_draft_id) or lets it auto-dismiss at checkpoint.
 *
 * Lifecycle invariant: once status leaves "suggested", it never returns.
 */
export const WisdomDraftSchema = z.object({
  /** Stable draft identifier; format dr-<8hex> (unique per task — DDC3) */
  id: z.string(),
  /** Suggested wisdom type derived from triggering error_class */
  suggested_type: WisdomDraftSuggestedTypeSchema,
  /**
   * Terse "{diagnosis} → {fix}" template populated from the first SEMANTIC
   * attempt. Multiple SEMANTIC attempts are concatenated with "; ".
   * Capped at 2000 chars (matches WisdomEntrySchema.content) to bound
   * Persisted record payload size.
   */
  suggested_content: z.string().max(2000),
  /** attempt_number refs from error_recovery.attempts[] that triggered this draft */
  source_attempts: z.array(z.number().int().min(1)).optional(),
  /** Current lifecycle status (suggested → promoted | dismissed) */
  status: WisdomDraftStatusSchema,
  /** ISO8601 timestamp when the draft was created */
  created_at: z.string(),
  /** ISO8601 timestamp when the draft entered a terminal state */
  dismissed_at: z.string().optional(),
  /** Reason for dismissal — required when status === "dismissed" */
  dismiss_reason: WisdomDraftDismissReasonSchema.optional(),
  /** Wisdom ID set when status === "promoted" via adv_wisdom_add from_draft_id */
  promoted_wisdom_id: z.string().optional(),
});

export type WisdomDraft = z.infer<typeof WisdomDraftSchema>;

// =============================================================================
// Task
// =============================================================================

/**
 * Task type — classifies what kind of deliverable a task produces.
 * Drives type-aware behavior in apply, review, harden, and accept.
 */
export const TaskTypeSchema = z.enum([
  "code", // Source code (TDD applies)
  "docs", // Documentation
  "ops", // Configuration, deployment, infrastructure
  "research", // Investigation, analysis
  "approval", // User approval checkpoint
  "verification", // Cross-cutting test / verification
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskApplyCycleSchema = z
  .object({
    implementation_cycle_id: z.string().trim().min(1),
    started_at: z.string().trim().min(1),
    kind: z.enum(["initial", "retry"]),
  })
  .strict();
export type TaskApplyCycle = z.infer<typeof TaskApplyCycleSchema>;

export const TaskSchema = z
  .object({
    id: z.string(), // tk-Hf7dK2mN
    title: z.string(),
    /** Task type — defaults to "code" for backward compatibility */
    type: TaskTypeSchema.default("code"),
    section: z.string().optional(), // Grouping label
    status: TaskStatusSchema,
    priority: z.number().default(0), // Lower = higher priority
    deps: z.array(DependencySchema).optional(),
    created_at: z.string(), // ISO8601
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    completed_by: z.string().nullable().optional(),
    /** Structured summary of what was done and how — persisted at task completion */
    implementation_summary: z.string().optional(),
    /** Signal-driven completion proof supplied by taskCompletedSignal. */
    verification: z.string().optional(),
    /** Concise completion summary supplied by taskCompletedSignal. */
    summary: z.string().optional(),
    /** Repo-relative files reported by taskCompletedSignal. */
    filesTouched: z.array(z.string()).optional(),
    /** Git checkpoint SHA associated with task completion. */
    checkpointSha: z.string().optional(),
    /** ISO8601 completion timestamp from taskCompletedSignal. */
    completedAt: z.string().optional(),
    /** Session/agent assigned through taskAssignedSignal. */
    assignedTo: z.string().optional(),
    /** Orchestrator-minted implementation lifecycle anchor for delegated work. */
    apply_cycle: TaskApplyCycleSchema.optional(),
    /** Human-readable block reason from taskBlockedSignal. */
    blockReason: z.string().optional(),
    /** Retry/block attempts captured when a task gets stuck. */
    attempts: z.array(AttemptSchema).optional(),
    /** Approval evidence captured by taskCancelledSignal. */
    cancelApproval: z.string().optional(),
    /** ISO8601 cancellation timestamp from taskCancelledSignal. */
    cancelledAt: z.string().optional(),
    /** Target repository ID for cross-repo tasks (matches related_repos[].id in project config) */
    target_repo: z.string().optional(),
    /** Absolute path to the target repo directory (resolved from related_repos or explicit) */
    target_path: z.string().optional(),
    /** Structured cancellation metadata — required when status is "cancelled" */
    cancellation: CancellationSchema.optional(),
    /** Structured TDD reclassification audit trail — populated when tdd_intent is changed after prep gate */
    tdd_reclassification: TddReclassificationSchema.optional(),
    /** Structured links from task work back to approved change-contract items. */
    contract_refs: TaskContractRefsSchema.optional(),
    /**
     * Structural reference to the report follow-up that motivated this task.
     * Present when a task was created as the pre-planning owner of a promoted
     * report follow-up. Text matching is never authority — this ref is.
     */
    followup_ref: ReportFollowUpRefSchema.optional(),
    /**
     * Normalized evidence plan for the task. Contains exactly one evidence
     * policy, one proof target, and compatibility provenance. Added at task
     * creation or material reclassification; legacy tasks are normalized
     * on read without heuristic cutover.
     */
    evidence_plan: TaskEvidencePlanSchema.optional(),
    /**
     * Evidence policy that governs what kind of proof satisfies task completion.
     * Uses the shared contract evidence-policy vocabulary.
     */
    evidence_policy: ContractEvidencePolicySchema.optional(),
    /**
     * Arbitrary key-value metadata for agent-driven filtering and routing.
     * All values are strings. Examples: { env: "production", target_repo: "backend" }
     * Queryable via adv_task_list filter: "has_metadata_key:<key>" or "metadata:<key>=<value>"
     */
    metadata: z.record(z.string(), z.string()).optional(),
    /**
     * Structured error recovery state for autonomous retry tracking.
     * Populated by /adv-apply when a task fails and is being retried.
     * Cleared when the task succeeds.
     */
    error_recovery: ErrorRecoverySchema.optional(),
    /**
     * Delegation recovery state for bounded empty/malformed worker output.
     * Tracks the single allowed narrower retry and blocks same-scope
     * delegation until inline diagnosis evidence exists (AC5).
     */
    delegation_recovery: DelegationRecoverySchema.optional(),
    /**
     * Productive blocked rounds whose findings were disjoint from the prior
     * blocked round (rq-retryProgressAccounting01). Zod-optional; absent on
     * pre-change state and treated as `[]` everywhere (C-REPLAY/DDC2).
     */
    progress_rounds: z.array(ProgressRoundSchema).optional(),
    /**
     * Finding fingerprints of the most recent blocked round on this task.
     * Updated on every blocked report regardless of progress/retry
     * classification so the next round compares against the latest ground.
     */
    last_blocking_fingerprints: z.array(z.string()).optional(),
    /**
     * Repo-relative paths of files changed by this task.
     * Populated by adv_task_checkpoint after successful git commit.
     * Empty array when no files changed or on git failure.
     */
    touched_files: z.array(z.string()).optional(),
    /**
     * Structured output extracted from `<adv-output>` tags in task completion text.
     * Populated by adv_task_update / adv_task_checkpoint when agent emits structured output.
     * Optional — most tasks won't have this. Non-blocking extraction.
     */
    structured_output: TaskStructuredOutputSchema.optional(),
    /**
     * Typed, durable sub-agent reports submitted through
     * adv_subagent_report_submit. These replace ADV worker fenced-JSON report
     * extraction while preserving structured_output for legacy callers.
     * Task records intentionally keep the task-scoped report schema; independent
     * review/research/scanner sidecars persist on change.subagent_reports[].
     */
    subagent_reports: z.array(TaskScopedSubagentReportSchema).optional(),
    /**
     * Advisory-only typed wisdom drafts auto-created from SEMANTIC
     * error_recovery attempts (rq-wisdomAutoSurfacing01). Task-scoped (AC7):
     * cancelled tasks' drafts do not appear in change-level wisdom queries.
     * Lifecycle is one-way: suggested → promoted | dismissed (AC4).
     */
    wisdom_drafts: z.array(WisdomDraftSchema).optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Task = z.infer<typeof TaskSchema>;
