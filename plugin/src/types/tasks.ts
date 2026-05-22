/**
 * Tasks Domain Types
 *
 * TaskStatus, Cancellation, TddReclassification,
 * Error Recovery, TaskType, Task.
 */

import { z } from "zod";
import { DependencySchema } from "./specs";
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
    /**
     * Structured output extracted from `<adv-output>` tags in task completion text.
     * Populated by adv_task_update / adv_task_checkpoint when agent emits structured output.
     * Optional — most tasks won't have this. Non-blocking extraction.
     */
    structured_output: TaskStructuredOutputSchema.optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Task = z.infer<typeof TaskSchema>;
