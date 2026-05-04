/**
 * Tasks Domain Types
 *
 * TaskStatus, Cancellation, TddReclassification, TDD Phase/Evidence,
 * Error Recovery, Durable Task-Run Lifecycle, TaskType, Task.
 */

import { z } from "zod";
import { DependencySchema } from "./specs";

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
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
// TDD Phase & Evidence
// =============================================================================

/**
 * TDD phase for a task.
 * - none: Not a TDD task (docs, config, etc.)
 * - red: Writing failing test
 * - green: Implementing to make test pass
 * - refactor: Refactoring with passing tests
 * - complete: TDD cycle finished with evidence
 */
export const TddPhaseSchema = z.enum([
  "none",
  "red",
  "green",
  "refactor",
  "complete",
]);

export type TddPhase = z.infer<typeof TddPhaseSchema>;

/**
 * Evidence for a single TDD phase (red or green).
 * Captures the test run details for audit and verification.
 */
export const TddPhaseEvidenceSchema = z.object({
  /** Test file or test name that was run */
  test_file: z.string().optional(),
  /** Command used to run the test */
  command: z.string().optional(),
  /** First 80 chars of test output (truncated for storage) */
  output_snippet: z.string().optional(),
  /** Exit code from test runner (0 = pass, non-zero = fail) */
  exit_code: z.number().optional(),
  /** ISO8601 timestamp when evidence was recorded */
  recorded_at: z.string().optional(),
  /** Rationale required when replacing conflicting same-phase fallback evidence */
  correction_reason: z.string().optional(),
});

export type TddPhaseEvidence = z.infer<typeof TddPhaseEvidenceSchema>;

/**
 * Complete TDD evidence for a task.
 * Tracks both red (failing) and green (passing) phases.
 */
export const TddEvidenceSchema = z.object({
  /** Red phase: test written and failing */
  red: TddPhaseEvidenceSchema.optional(),
  /** Green phase: implementation makes test pass */
  green: TddPhaseEvidenceSchema.optional(),
  /** Whether TDD was skipped with rationale */
  skipped: z.boolean().optional(),
  /** Rationale for skipping TDD (e.g., "trivial: docs change") */
  skip_reason: z.string().optional(),
});

export type TddEvidence = z.infer<typeof TddEvidenceSchema>;

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

export const ErrorRecoverySchema = z.object({
  /** Human-readable description of the last error encountered */
  last_error: z.string(),
  /** Number of retry attempts made so far */
  retry_count: z.number().int().min(0),
  /** Maximum retries allowed for this error class */
  max_retries: z.number().int().min(0),
  /** Classification of the error for retry strategy selection */
  error_class: z.enum(["TRANSIENT", "SEMANTIC", "ENVIRONMENTAL", "FATAL"]),
  /** Planned next action if retrying (optional) */
  next_strategy: z.string().optional(),
  /** Full history of retry attempts for doom-loop auditing */
  attempts: z.array(AttemptSchema).optional(),
});

export type ErrorRecovery = z.infer<typeof ErrorRecoverySchema>;

// =============================================================================
// Durable Task-Run Lifecycle
// =============================================================================

export const TaskRunPhaseSchema = z.enum([
  "not_started",
  "started",
  "baseline_captured",
  "awaiting_red",
  "red_recorded",
  "awaiting_green",
  "green_recorded",
  "verified",
  "awaiting_checkpoint",
  "checkpointed",
  "done",
  "blocked",
  "failed",
]);

export type TaskRunPhase = z.infer<typeof TaskRunPhaseSchema>;

export const TaskRunRequiredNextActionSchema = z.enum([
  "start_task",
  "capture_baseline",
  "record_red_evidence",
  "record_green_evidence",
  "run_incremental_verification",
  "checkpoint_task",
  "mark_done",
  "resolve_blocker",
  "none",
]);

export type TaskRunRequiredNextAction = z.infer<
  typeof TaskRunRequiredNextActionSchema
>;

export const TaskRunEventTypeSchema = z.enum([
  "start",
  "baseline",
  "red_evidence",
  "green_evidence",
  "verification",
  "checkpoint",
  "complete",
  "failure",
  "blocker",
]);

export type TaskRunEventType = z.infer<typeof TaskRunEventTypeSchema>;

export const TaskRunEventSchema = z.object({
  idempotencyKey: z.string().min(1),
  type: TaskRunEventTypeSchema,
  recordedAt: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type TaskRunEvent = z.infer<typeof TaskRunEventSchema>;

export const TaskRunStateSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  phase: TaskRunPhaseSchema,
  startedAt: z.string().optional(),
  updatedAt: z.string(),
  resumeHint: z.string(),
  requiredNextAction: TaskRunRequiredNextActionSchema,
  baseline: z
    .object({
      branch: z.string(),
      headSha: z.string(),
      workdir: z.string(),
      capturedAt: z.string(),
    })
    .optional(),
  evidence: z
    .object({
      red: TddPhaseEvidenceSchema.optional(),
      green: TddPhaseEvidenceSchema.optional(),
    })
    .optional(),
  verification: z
    .object({
      summary: z.string(),
      recordedAt: z.string(),
    })
    .optional(),
  checkpoint: z
    .object({
      status: z.enum(["clean", "committed"]),
      sha: z.string().optional(),
      branch: z.string().optional(),
      gitRoot: z.string().optional(),
      message: z.string().optional(),
      recordedAt: z.string(),
    })
    .optional(),
  attempts: z.array(AttemptSchema).optional(),
  seenIdempotencyKeys: z.array(z.string()).default([]),
  events: z.array(TaskRunEventSchema).default([]),
});

export type TaskRunState = z.infer<typeof TaskRunStateSchema>;

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
    /** Current TDD phase for this task */
    tdd_phase: TddPhaseSchema.default("none"),
    /** TDD evidence (red/green phase recordings) */
    tdd_evidence: TddEvidenceSchema.optional(),
    /** Target repository ID for cross-repo tasks (matches related_repos[].id in project config) */
    target_repo: z.string().optional(),
    /** Absolute path to the target repo directory (resolved from related_repos or explicit) */
    target_path: z.string().optional(),
    /** Structured cancellation metadata — required when status is "cancelled" */
    cancellation: CancellationSchema.optional(),
    /** Structured TDD reclassification audit trail — populated when tdd_intent is changed after prep gate */
    tdd_reclassification: TddReclassificationSchema.optional(),
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
     * Repo-relative paths of files changed by this task.
     * Populated by adv_task_checkpoint after successful git commit.
     * Empty array when no files changed or on git failure.
     */
    touched_files: z.array(z.string()).optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Task = z.infer<typeof TaskSchema>;
