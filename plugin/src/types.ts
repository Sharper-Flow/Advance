/**
 * Advance (ADV) Core Types
 *
 * Type definitions for specs, changes, tasks, and deltas.
 * Based on the ADV proposal JSON schemas.
 */

import { z } from "zod";

// =============================================================================
// ID Generation
// =============================================================================

/** ID prefixes for different entity types */
const _ID_PREFIXES = {
  requirement: "rq-",
  task: "tk-",
  delta: "dl-",
  change: "", // Changes use camelCase title
} as const;

// =============================================================================
// Priority (RFC 2119)
// =============================================================================

export const PrioritySchema = z.enum(["must", "should", "may"]);
type _Priority = z.infer<typeof PrioritySchema>;

// =============================================================================
// Scenario (Given/When/Then)
// =============================================================================

export const ScenarioSchema = z
  .object({
    id: z.string(), // Hierarchical: rq-V1StGXR8.1
    title: z.string(),
    given: z.array(z.string()),
    when: z.string(),
    then: z.array(z.string()),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Scenario = z.infer<typeof ScenarioSchema>;

// =============================================================================
// Requirement
// =============================================================================

export const RequirementSchema = z
  .object({
    id: z.string(), // rq-V1StGXR8
    title: z.string(),
    body: z.string(), // Markdown allowed
    priority: PrioritySchema,
    tags: z.array(z.string()).optional(),
    scenarios: z.array(ScenarioSchema).optional(),
    // Audit-trail metadata for moved/merged requirements.
    meta: z
      .object({
        merged_from: z.string(), // e.g., "contract-system/rq-renameop"
      })
      .optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Requirement = z.infer<typeof RequirementSchema>;

// =============================================================================
// Spec (The Law)
// =============================================================================

export const SpecSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string(), // kebab-case capability ID
    title: z.string(),
    purpose: z.string(),
    version: z.string(), // Semantic version
    updated_at: z.string(), // ISO8601
    requirements: z.array(RequirementSchema),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Spec = z.infer<typeof SpecSchema>;

// =============================================================================
// Dependency Types
// =============================================================================

const DependencyTypeSchema = z.enum([
  "blocked_by", // Cannot start until target completes
  "related", // Informational link, no blocking
  "discovered_from", // Found while working on target
  "parent", // Hierarchical containment
]);

type _DependencyType = z.infer<typeof DependencyTypeSchema>;

export const DependencySchema = z.object({
  type: DependencyTypeSchema,
  target: z.string(), // Target entity ID
});

type _Dependency = z.infer<typeof DependencySchema>;

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

type TddEvidence = z.infer<typeof TddEvidenceSchema>;

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

// =============================================================================
// Delta Operations
// =============================================================================

const DeltaAddSchema = z.object({
  id: z.string(), // dl-Xt5zW3vB
  operation: z.literal("add"),
  requirement: RequirementSchema,
});

/**
 * Typed partial of RequirementSchema for modify delta changes.
 * Only allows known requirement fields with correct types.
 * Uses .strict() to reject unknown keys at parse time.
 */
const DeltaModifyChangesSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    priority: PrioritySchema.optional(),
    tags: z.array(z.string()).optional(),
    scenarios: z.array(ScenarioSchema).optional(),
  })
  .strict(); // Reject unknown keys

type _DeltaModifyChanges = z.infer<typeof DeltaModifyChangesSchema>;

const DeltaModifySchema = z.object({
  id: z.string(),
  operation: z.literal("modify"),
  target_id: z.string(), // Requirement ID to modify
  changes: DeltaModifyChangesSchema, // Typed fields to update
});

const DeltaRemoveSchema = z.object({
  id: z.string(),
  operation: z.literal("remove"),
  target_id: z.string(),
  reason: z.string(),
});

/**
 * Rename delta - changes a requirement's title and optionally its ID.
 * Applied before remove/modify/add to avoid target-not-found errors.
 */
const DeltaRenameSchema = z.object({
  id: z.string(), // dl-{nanoid}
  operation: z.literal("rename"),
  target_id: z.string(), // Existing requirement ID
  new_title: z.string(), // New title for the requirement
  new_id: z.string().optional(), // Optional new ID (if renaming the identifier too)
});

export const DeltaSchema = z.discriminatedUnion("operation", [
  DeltaAddSchema,
  DeltaModifySchema,
  DeltaRemoveSchema,
  DeltaRenameSchema,
]);

export type Delta = z.infer<typeof DeltaSchema>;

// =============================================================================
// Validation Result
// =============================================================================

const ValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

type _ValidationError = z.infer<typeof ValidationErrorSchema>;

const ValidationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

type _ValidationWarning = z.infer<typeof ValidationWarningSchema>;

const ValidationResultSchema = z.object({
  checked_against_specs: z.array(z.string()),
  conflicts: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationWarningSchema),
  validated_at: z.string().optional(),
});

type _ValidationResult = z.infer<typeof ValidationResultSchema>;

// =============================================================================
// Wisdom (Cross-Task Learning)
// =============================================================================

/**
 * Type of wisdom entry - categorizes the learning for better retrieval.
 */
export const WisdomTypeSchema = z.enum([
  "pattern", // Reusable code pattern or approach
  "success", // What worked well
  "failure", // What didn't work and why
  "gotcha", // Non-obvious issue or pitfall
  "convention", // Codebase convention to follow
]);

export type WisdomType = z.infer<typeof WisdomTypeSchema>;

/**
 * A single wisdom entry - a learning accumulated during task execution.
 * Stored per-change and injected into subsequent task context.
 */
export const WisdomEntrySchema = z.object({
  /** Unique ID (ws-{nanoid(6)}) */
  id: z.string(),
  /** Category of this learning */
  type: WisdomTypeSchema,
  /** The actual learning content (max 2000 chars) */
  content: z.string().max(2000),
  /** Task that generated this wisdom (optional) */
  source_task: z.string().optional(),
  /** ISO8601 timestamp when recorded */
  recorded_at: z.string(),
});

export type WisdomEntry = z.infer<typeof WisdomEntrySchema>;

// =============================================================================
// Change Status
// =============================================================================

export const ChangeStatusSchema = z.enum([
  "draft", // Being written
  "pending", // Awaiting approval
  "active", // In progress
  "archived", // Completed and promoted
  "closed", // Retired without completion
]);

export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;

const ChangeClosureReasonSchema = z.enum([
  "cancelled",
  "superseded",
  "not_planned",
]);

type _ChangeClosureReason = z.infer<typeof ChangeClosureReasonSchema>;

export const ChangeClosureSchema = z.object({
  reason: ChangeClosureReasonSchema,
  approved_by_user: z.literal(true),
  approval_evidence: z.string(),
  superseded_by: z.string().optional(),
  approved_at: z.string(),
});

export type ChangeClosure = z.infer<typeof ChangeClosureSchema>;

// =============================================================================
// Bulk Close
// =============================================================================

export const BulkCloseExplicitSelectorSchema = z.object({
  kind: z.literal("explicit"),
  changeIds: z.array(z.string()).min(1),
});

export const BulkCloseFilterSelectorSchema = z.object({
  kind: z.literal("filter"),
  filter: z.object({
    status: z.string().optional(),
    titleContains: z.string().optional(),
    prefix: z.string().optional(),
    createdBefore: z.string().optional(),
    lastActivityBefore: z.string().optional(),
  }),
});

export const BulkCloseSelectorSchema = z.discriminatedUnion("kind", [
  BulkCloseExplicitSelectorSchema,
  BulkCloseFilterSelectorSchema,
]);

export type BulkCloseSelector = z.infer<typeof BulkCloseSelectorSchema>;

export const BulkCloseResultSchema = z.object({
  success: z.boolean(),
  closed: z.number(),
  results: z.array(
    z.object({
      changeId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    }),
  ),
  message: z.string(),
});

export type BulkCloseResult = z.infer<typeof BulkCloseResultSchema>;

// =============================================================================
// Quality Gates
// =============================================================================

/**
 * Gate definition — single source of truth for all gate metadata.
 * Add/remove/reorder gates here; all derived artifacts follow automatically.
 */
interface GateDef {
  /** Unique gate identifier (used as JSON key, schema enum value, etc.) */
  id: string;
  /** Human-readable description */
  description: string;
}

/**
 * GATE_DEFS — the canonical, ordered list of gates.
 * Everything else (GateIdSchema, GATE_ORDER, GatesSchema, createDefaultGates)
 * is derived from this array.
 *
 * To change the gate model: edit this array only.
 */
export const GATE_DEFS: readonly GateDef[] = [
  {
    id: "proposal",
    description: "Proposal: Problem statement confirmed via /adv-proposal",
  },
  {
    id: "discovery",
    description:
      "Discovery: Context gathered, objectives agreed via /adv-discover",
  },
  {
    id: "design",
    description: "Design: Architecture decisions validated via /adv-design",
  },
  {
    id: "planning",
    description: "Planning: Task graph synthesized via /adv-prep",
  },
  {
    id: "execution",
    description: "Execution: Deliverables produced via /adv-apply",
  },
  {
    id: "acceptance",
    description: "Acceptance: User accepts deliverables via /adv-review",
  },
  {
    id: "release",
    description:
      "Release: Final quality pass and archive via /adv-harden + /adv-archive",
  },
] as const;

/** Gate IDs derived from GATE_DEFS */
const GATE_IDS = GATE_DEFS.map((g) => g.id) as [string, ...string[]];

/**
 * Gate ID schema — Zod enum derived from GATE_DEFS.
 */
export const GateIdSchema = z.enum(GATE_IDS);

export type GateId = z.infer<typeof GateIdSchema>;

/**
 * Ordered list of gate IDs for sequence enforcement.
 * Derived from GATE_DEFS order.
 */
export const GATE_ORDER: GateId[] = GATE_DEFS.map((g) => g.id) as GateId[];

/**
 * Gate status values.
 * - pending: Not yet completed
 * - done: Actually completed with timestamp + actor evidence
 * - legacy: Predates gate system, counts as "satisfied" but wasn't performed
 * - skipped: Explicitly skipped with documented reason (future use)
 */
const GateStatusSchema = z.enum(["pending", "done", "legacy", "skipped"]);

type _GateStatus = z.infer<typeof GateStatusSchema>;

/**
 * Single gate completion record.
 * Tracks who completed the gate and when.
 */
export const GateCompletionSchema = z.object({
  /** Current status of this gate */
  status: GateStatusSchema.default("pending" as const),
  /** ISO8601 timestamp when gate was completed */
  completed_at: z.string().optional(),
  /** Who completed the gate (user, agent, migration) */
  completed_by: z.string().optional(),
  /** Key decisions or context captured at gate completion */
  notes: z.string().optional(),
  /** Original gate ID before migration (audit trail for gate renames) */
  migrated_from: z.string().optional(),
  /** Additional old gate completions absorbed into this gate during migration */
  absorbed_completions: z
    .array(
      z.object({
        gate_id: z.string(),
        status: GateStatusSchema,
        completed_at: z.string().optional(),
        completed_by: z.string().optional(),
      }),
    )
    .optional(),
});

export type GateCompletion = z.infer<typeof GateCompletionSchema>;

/**
 * Full gates object — one field per GATE_DEFS entry.
 * Derived from GATE_DEFS so adding/removing a gate propagates automatically.
 */
export const GatesSchema = z.object(
  Object.fromEntries(
    GATE_DEFS.map((g) => [
      g.id,
      GateCompletionSchema.default({ status: "pending" as const }),
    ]),
  ) as Record<string, ReturnType<typeof GateCompletionSchema.default>>,
);

export type Gates = z.infer<typeof GatesSchema>;

/**
 * Check if a gate is "satisfied" (done or legacy).
 * Legacy gates count as satisfied for sequence enforcement.
 */
export const isGateSatisfied = (gate: GateCompletion): boolean => {
  return (
    gate.status === "done" ||
    gate.status === "legacy" ||
    gate.status === "skipped"
  );
};

/**
 * Check if a gate can be completed (previous gate must be satisfied).
 * @param gates - Current gates state
 * @param gateId - Gate to check
 * @returns true if the gate can be completed
 */
export const canCompleteGate = (gates: Gates, gateId: GateId): boolean => {
  const idx = GATE_ORDER.indexOf(gateId);
  if (idx === 0) return true; // First gate can always be completed

  // Check all previous gates are satisfied
  for (let i = 0; i < idx; i++) {
    const prevGateId = GATE_ORDER[i];
    if (!isGateSatisfied(gates[prevGateId])) {
      return false;
    }
  }
  return true;
};

/**
 * Get list of incomplete gates (not done or legacy).
 */
export const getIncompleteGates = (gates: Gates): GateId[] => {
  return GATE_ORDER.filter((gateId) => !isGateSatisfied(gates[gateId]));
};

/**
 * Check if all gates are satisfied (can archive/complete).
 */
export const allGatesSatisfied = (gates: Gates): boolean => {
  return GATE_ORDER.every((gateId) => isGateSatisfied(gates[gateId]));
};

/**
 * Create default gates object with all gates pending.
 * Derived from GATE_DEFS — adding a gate here is automatic.
 */
export const createDefaultGates = (): Gates =>
  Object.fromEntries(
    GATE_DEFS.map((g) => [g.id, { status: "pending" as const }]),
  ) as Gates;

// =============================================================================
// Re-Entry History (Scope Expansion Audit Trail)
// =============================================================================

/**
 * A single re-entry event — recorded when mid-change scope expansion
 * triggers a cascade reopen of gates back through discovery/design/planning.
 *
 * Append-only audit trail: each re-entry is a new entry, never modified.
 */
export const ReentryHistoryEntrySchema = z.object({
  /** Gate to reopen FROM (this gate + all downstream reset to pending) */
  from_gate: GateIdSchema,
  /** Human-readable reason for the re-entry */
  reason: z.string(),
  /** Description of what scope was added/changed (optional) */
  scope_delta: z.string().optional(),
  /** Who triggered the re-entry (agent name, user, command) */
  reopened_by: z.string(),
  /** Optional audit evidence for the re-entry (for example, direct user instruction) */
  approval_evidence: z.string().optional(),
  /** ISO8601 timestamp when the re-entry was triggered */
  reopened_at: z.string(),
  /** Gate IDs that were reset to pending (from_gate + all downstream) */
  gates_reset: z.array(GateIdSchema).nonempty(),
});

export type ReentryHistoryEntry = z.infer<typeof ReentryHistoryEntrySchema>;

// =============================================================================
// Change
// =============================================================================

/**
 * A persisted snapshot of a clarify finding — enables resolution tracking.
 * Findings are append-only; resolved status is set when the finding is addressed.
 */
export const ClarifyFindingSnapshotSchema = z.object({
  /** Finding code (e.g., CLARIFY_MISSING_SUCCESS_CRITERIA) */
  code: z.string(),
  /** Severity of the finding */
  severity: z.enum(["error", "warning", "info"]),
  /** Human-readable finding message */
  message: z.string(),
  /** ISO8601 timestamp when this finding was first recorded */
  recorded_at: z.string(),
  /** Whether this finding has been resolved */
  resolved: z.boolean().optional(),
  /** ISO8601 timestamp when this finding was resolved */
  resolved_at: z.string().optional(),
});

export type ClarifyFindingSnapshot = z.infer<
  typeof ClarifyFindingSnapshotSchema
>;

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

// =============================================================================
// Cross-Project Origin (Follow-up Change Provenance)
// =============================================================================

/**
 * Provenance metadata for changes created from another project.
 * Set when project A creates a follow-up change in project B (e.g. pokeedge
 * backend creating a follow-up in pokeedge-web).
 */
export const CrossProjectOriginSchema = z.object({
  /** Name of the source project that created this follow-up change */
  source_project: z.string(),
  /** Absolute path to the source project repository */
  source_path: z.string(),
  /** Change ID in the source project that triggered this follow-up */
  source_change_id: z.string().optional(),
  /** ISO8601 timestamp when the cross-project link was established */
  linked_at: z.string(),
});

export type CrossProjectOrigin = z.infer<typeof CrossProjectOriginSchema>;

// =============================================================================
// Fast Follow (Same-Project Follow-up Lineage)
// =============================================================================

/**
 * Provenance metadata for changes created as a fast-follow within the same
 * project. Set when a child change is created with `parent_change_id` to
 * establish same-project lineage.
 */
export const FastFollowOfSchema = z.object({
  /** Change ID of the parent change in the current project */
  parent_change_id: z.string(),
  /** ISO8601 timestamp when the fast-follow link was established */
  linked_at: z.string(),
});

export type FastFollowOf = z.infer<typeof FastFollowOfSchema>;

export const ChangeSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string(), // camelCase title
    title: z.string(),
    status: ChangeStatusSchema,
    created_at: z.string(), // ISO8601
    created_by: z.string().optional(),
    tasks: z.array(TaskSchema),
    deltas: z.record(z.string(), z.array(DeltaSchema)), // Keyed by capability
    validation: ValidationResultSchema.optional(),
    /** Accumulated wisdom/learnings for this change (optional, backwards compatible) */
    wisdom: z.array(WisdomEntrySchema).optional(),
    /** 7-gate quality checklist (optional, backwards compatible with migration) */
    gates: GatesSchema.optional(),
    /** Linked GitHub issue URLs (optional, backwards compatible) */
    github_issues: z.array(z.string().url()).optional(),
    /** Structured closure metadata for retired changes */
    closure: ChangeClosureSchema.optional(),
    /** Persisted clarify finding snapshots for resolution tracking */
    clarify_findings: z.array(ClarifyFindingSnapshotSchema).optional(),
    /** Append-only audit trail for scope-expansion re-entry events */
    reentry_history: z.array(ReentryHistoryEntrySchema).optional(),
    /**
     * Investment check-in judgment calls (addCostTimeInvestment v1).
     * Identified during /adv-prep Phase J; surfaced at /adv-apply Phase 1.5.
     * Absence (undefined) marks a legacy pre-v1 change — /adv-apply Phase 1.5
     * skips surfacing silently. Empty array marks a new-generation change
     * with zero calls identified (Phase 1.5 still records batch_surfaced_at).
     */
    judgment_calls: z.array(JudgmentCallSchema).optional(),
    /**
     * ISO8601 timestamp recorded by /adv-apply Phase 1.5 after the judgment
     * batch is surfaced (including the N=0 silent case) for auditability.
     */
    batch_surfaced_at: z.string().optional(),
    /**
     * Cross-project origin provenance — set when this change was created
     * as a follow-up from another project. Presence signals to /adv-discover
     * that origin validation is required before agreement.
     */
    cross_project_origin: CrossProjectOriginSchema.optional(),
    /**
     * Same-project fast-follow lineage — set when this change was created
     * as a follow-up to another change within the same project. Presence
     * signals to /adv-discover that lineage validation is required.
     */
    fast_follow_of: FastFollowOfSchema.optional(),
    /**
     * Set when /adv-autopilot was invoked on this change. Marks the change as
     * having been driven through the routine checkpoints under autopilot
     * delegation rather than per-gate manual approval.
     */
    approval_mode: z.literal("autopilot").optional(),
    /**
     * ISO8601 timestamp when /adv-autopilot was invoked.
     * Set once at the start of an autopilot run; not modified afterwards.
     */
    autopilot_invoked_at: z.string().optional(),
    /**
     * Temporal project ID that owns this change. Persisted on disk snapshots
     * so the shared guard can detect cross-project context mismatches.
     * Optional for legacy compatibility — ownerless changes are best-effort.
     */
    adv_project_id: z.string().optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Change = z.infer<typeof ChangeSchema>;

// =============================================================================
// Related Repositories (Cross-Repo Routing)
// =============================================================================

/**
 * A related repository that tasks in this project may target.
 * Generic model — any repo/path pair, not hardcoded to specific projects.
 */
const RelatedRepoSchema = z.object({
  /** Short identifier used in task metadata (e.g., "backend", "api", "db") */
  id: z.string(),
  /** Absolute path to the repository root */
  path: z.string(),
  /** Human-readable role description (e.g., "Backend API server", "Database migrations") */
  role: z.string().optional(),
});

type _RelatedRepo = z.infer<typeof RelatedRepoSchema>;

// =============================================================================
// Slop Scan Config
// =============================================================================

/**
 * Per-project threshold overrides for /adv-slop-scan.
 *
 * Defaults are calibrated to avoid false positives on normal single-guard
 * or single-catch patterns. Override in project.json under features.slop_scan.
 *
 * Example:
 * {
 *   "features": {
 *     "slop_scan": {
 *       "nesting_depth_threshold": 6,
 *       "complexity_threshold": 15
 *     }
 *   }
 * }
 */
const SlopScanConfigSchema = z
  .object({
    /**
     * Maximum nesting depth before flagging as MAINT-004.
     * Default: 4 — functions with 4+ levels of nesting are flagged.
     * Increase for domains (parsers, compilers) that legitimately need deeper nesting.
     */
    nesting_depth_threshold: z.number().int().min(1).default(4),
    /**
     * Minimum number of redundant guard patterns on the same value before
     * flagging as QUAL-011 (defensive_overkill).
     * Default: 3 — a single null check is legitimate; 3+ on the same value is slop.
     */
    defensive_guard_threshold: z.number().int().min(1).default(3),
    /**
     * Cyclomatic complexity ceiling before flagging as MAINT-004.
     * Default: 10 — aligns with ESLint complexity rule default.
     */
    complexity_threshold: z.number().int().min(1).default(10),
    /**
     * Per-file timeout in milliseconds for AST tool invocations.
     * If exceeded, the file falls back to degraded (brace/indent counter) detection.
     * Default: 10000ms (10 seconds).
     */
    ast_timeout_ms: z.number().int().min(1).default(10000),
  })
  .passthrough(); // Forward compatibility: unknown keys pass through

type _SlopScanConfig = z.infer<typeof SlopScanConfigSchema>;

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Per-project feature flag overrides.
 * All flags default to current ADV behavior — no behavior change without explicit opt-in.
 *
 * Add to project.json under the "features" key:
 * {
 *   "features": {
 *     "tdd_enforcement": "advisory",
 *     "worktree_auto_create": false,
 *     "slop_scan": {
 *       "nesting_depth_threshold": 6
 *     }
 *   }
 * }
 */
export const FeatureFlagsSchema = z
  .object({
    /**
     * TDD enforcement mode.
     * - "strict" (default): Red/green phases required; doom-loop escalation at 3 attempts
     * - "advisory": TDD encouraged but not enforced; warnings emitted instead of blocks
     * - "off": TDD skipped entirely; tasks complete without test evidence
     */
    tdd_enforcement: z.enum(["strict", "advisory", "off"]).default("strict"),
    /**
     * Whether /adv-apply automatically creates a git worktree for high-risk changes.
     * Default: true (current behavior)
     */
    worktree_auto_create: z.boolean().default(true),
    /**
     * Gate enforcement mode.
     * - "strict" (default): Gates must be completed in sequence; archive blocked until all pass
     * - "advisory": Gate status shown but not enforced; archive allowed with warnings
     */
    gate_enforcement: z.enum(["strict", "advisory"]).default("strict"),
    /**
     * Whether wisdom entries are accumulated and promoted across changes.
     * Default: true (current behavior)
     */
    wisdom_accumulation: z.boolean().default(true),
    /**
     * Clarify enforcement mode.
     * - "off" (default): Clarify checks skipped entirely; no findings emitted
     * - "advisory": Ambiguity findings surfaced as warnings in tool output; no blocking
     * - "strict": Ambiguity findings block the prep gate until resolved via /adv-clarify
     */
    clarify_enforcement: z
      .enum(["off", "advisory", "strict"])
      .default("advisory"),
    /**
     * Threshold overrides for /adv-slop-scan detection.
     * All thresholds have smart defaults; override only what differs from project norms.
     */
    slop_scan: SlopScanConfigSchema.default(() =>
      SlopScanConfigSchema.parse({}),
    ),
  })
  .passthrough(); // Allow future flags without breaking existing configs

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

// =============================================================================
// Project Configuration
// =============================================================================

export const ProjectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string(),
    version: z.string().optional(),
    specs_dir: z.string().default(".adv/specs"),
    changes_dir: z.string().default(".adv/changes"),
    archive_dir: z.string().default(".adv/archive"),
    docs_dir: z.string().default("docs/specs"),
    db_dir: z.string().default(".adv/db"),
    project_file: z.string().default("project.md"),
    /** Related repositories for cross-repo task routing */
    related_repos: z.array(RelatedRepoSchema).optional(),
    /** Per-project feature flag overrides. All flags default to current ADV behavior. */
    features: FeatureFlagsSchema.default(() => FeatureFlagsSchema.parse({})),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// =============================================================================
// Project Metadata Entry
// =============================================================================

/**
 * A single project metadata entry — lightweight, timestamped fact about
 * something that happened to this project (scan run, external event, etc.).
 * Stored in a flat JSON file for easy inspection and cross-worktree sharing.
 */
export const ProjectMetadataEntrySchema = z
  .object({
    /** Unique key identifying the metadata category (e.g., "slop-scan", "arch-scan") */
    key: z.string().min(1).max(64),
    /** ISO8601 timestamp when this entry was written */
    timestamp: z.string(),
    /** Integer count (e.g., number of findings, number of files scanned) */
    count: z.number().int().min(0),
    /** Human-readable one-line summary (max 200 chars) */
    summary: z.string().min(1).max(200),
    /** Who wrote this entry — defaults to "agent" */
    written_by: z.enum(["agent", "user", "system"]).default("agent"),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type ProjectMetadataEntry = z.infer<typeof ProjectMetadataEntrySchema>;

// =============================================================================
// Tool Response Types
// =============================================================================

export interface SpecListResponse {
  specs: Array<{
    name: string;
    title: string;
    version: string;
    requirementCount: number;
  }>;
}

export interface ChangeListResponse {
  changes: Array<{
    id: string;
    title: string;
    status: ChangeStatus;
    created_at: string;
    lastActivityAt: string;
    taskCount: number;
    completedTasks: number;
    /** Same-project fast-follow lineage (optional) */
    fast_follow_of?: FastFollowOf;
    /** Convenience top-level annotation when fast_follow_of is set (added by adv_change_list) */
    parent_change_id?: string;
  }>;
}

export interface TaskReadyResponse {
  ready: Task[];
  blocked: Array<{
    task: Task;
    blockedBy: string[];
  }>;
  /** Context for tasks unblocked by cancelled blockers */
  cancelledBlockerContext?: Array<{
    taskId: string;
    cancelledBlockerId: string;
    cancellationReason: string;
  }>;
}

interface _ArchiveResult {
  success: boolean;
  specsUpdated: string[];
  docsGenerated: string[];
  archivePath: string;
}

// =============================================================================
// Recency Bands (for /adv-status)
// =============================================================================

/**
 * Recency classification for active changes.
 * Used by /adv-status to surface which changes are likely in-flight
 * vs abandoned/stale and need pickup.
 *
 * Thresholds:
 * - "hot":  <= 60 minutes since last activity (likely another agent working)
 * - "warm": > 60 minutes and < 180 minutes (recently active, may need attention)
 * - "stale": >= 180 minutes since last activity (needs pickup / was abandoned)
 */
export type RecencyBand = "hot" | "warm" | "stale";

/**
 * Per-change recency summary included in ProjectStatus.
 * Computed from the most recent timestamp across tasks, gates, and change metadata.
 */
export interface ChangeRecency {
  /** Change ID */
  id: string;
  /** Change title */
  title: string;
  /** Change status */
  status: ChangeStatus;
  /** Tasks completed / total */
  completedTasks: number;
  taskCount: number;
  /** ISO8601 timestamp of the most recent activity on this change */
  lastActivityAt: string;
  /** Minutes elapsed since lastActivityAt (at time of status generation) */
  minutesSinceActivity: number;
  /** Recency classification */
  recency: RecencyBand;
  /** Parent change ID when this change is a same-project fast-follow */
  parent_change_id?: string;
}

export interface ProjectStatus {
  specs: {
    count: number;
    capabilities: string[];
  };
  changes: {
    active: number;
    byStatus: Record<ChangeStatus, number>;
    /** Active (non-archived) changes sorted by most recent activity first */
    recent: ChangeRecency[];
  };
  recommendations: string[];
}

// =============================================================================
// Status Markers (for terminal UI)
// =============================================================================

export const STATUS_MARKERS = {
  WORK: "[ADV:WORK]", // 🟩 Agent actively working
  TOOLING: "[ADV:TOOLING]", // 🟨 Tool run or sub-agent in flight
  ATTN: "[ADV:ATTN]", // 🟥 User needed (permission pending, approval, or question)
  IDLE: "[ADV:IDLE]", // ⬜ Agent idle, no action needed (session start or finished work)
  BLOCKED: "[ADV:BLOCKED]", // 🟥💀 Doom-loop / stuck / crash
} as const;

export type StatusMarker = keyof typeof STATUS_MARKERS;

// =============================================================================
// TDD Detection Patterns
// =============================================================================

/**
 * Keywords that indicate a task requires TDD (logic-heavy).
 * Tasks matching these patterns should have TDD evidence.
 */
export const TDD_REQUIRED_PATTERNS = [
  /\bimplement\b/i,
  /\bcreate\b/i,
  /\badd\b/i,
  /\bfix\b/i,
  /\brefactor\b/i,
  /\bhandle\b/i,
  /\bvalidate\b/i,
  /\bparse\b/i,
  /\bcalculate\b/i,
  /\bprocess\b/i,
  /\bgenerate\b/i,
  /\btransform\b/i,
  /\bconvert\b/i,
  /\bfilter\b/i,
  /\bsort\b/i,
  /\bmerge\b/i,
  /\bauth/i,
  /\bapi\b/i,
  /\bendpoint\b/i,
  /\bfunction\b/i,
  /\bmethod\b/i,
  /\bclass\b/i,
  /\bmodule\b/i,
  /\bservice\b/i,
  /\bhandler\b/i,
  /\bcontroller\b/i,
  /\brepository\b/i,
  /\bstore\b/i,
];

/**
 * Keywords that indicate a task is trivial (no TDD required).
 * Tasks matching these patterns can skip TDD.
 */
export const TDD_TRIVIAL_PATTERNS = [
  /\bdoc(s|umentation)?\b/i,
  /\breadme\b/i,
  /\bchangelog\b/i,
  /\bconfig(uration)?\b/i,
  /\bformat(ting)?\b/i,
  /\blint(ing)?\b/i,
  /\btypo\b/i,
  /\bcomment\b/i,
  /\brename\b/i,
  /\bmove\b/i,
  /\bcleanup\b/i,
  /\bclean up\b/i,
  /\bremove unused\b/i,
  /\bupdate version\b/i,
  /\bbump version\b/i,
];

/**
 * Check if a task title indicates logic-heavy work requiring TDD.
 */
export const isLogicTask = (title: string): boolean => {
  // First check if explicitly trivial
  if (TDD_TRIVIAL_PATTERNS.some((p) => p.test(title))) {
    return false;
  }
  // Then check if matches logic patterns
  return TDD_REQUIRED_PATTERNS.some((p) => p.test(title));
};

/**
 * Check if a task title indicates trivial work (TDD optional).
 */
export const isTrivialTask = (title: string): boolean => {
  return TDD_TRIVIAL_PATTERNS.some((p) => p.test(title));
};

/**
 * Check if a task has complete TDD evidence (both red and green phases).
 */
export const hasCompleteTddEvidence = (task: Task): boolean => {
  if (!task.tdd_evidence) return false;

  // If explicitly skipped with reason, that counts as complete
  if (task.tdd_evidence.skipped && task.tdd_evidence.skip_reason) {
    return true;
  }

  // Otherwise need both red and green phases
  const hasRed = !!task.tdd_evidence.red?.recorded_at;
  const hasGreen = !!task.tdd_evidence.green?.recorded_at;

  return hasRed && hasGreen;
};

/**
 * Get TDD compliance status for a task.
 */
export const getTddComplianceStatus = (
  task: Task,
): "compliant" | "missing" | "not_required" => {
  // Trivial tasks don't require TDD
  if (isTrivialTask(task.title)) {
    return "not_required";
  }

  // Explicitly skipped with reason
  if (task.tdd_evidence?.skipped && task.tdd_evidence.skip_reason) {
    return "compliant";
  }

  // Logic tasks require evidence
  if (isLogicTask(task.title)) {
    return hasCompleteTddEvidence(task) ? "compliant" : "missing";
  }

  // Default: not required for non-matching tasks
  return "not_required";
};

/**
 * Strip TDD evidence to minimal proof for archive storage.
 * Keeps exit_code, recorded_at, and test_file (audit value).
 * Removes command and output_snippet (bulk of the bloat).
 * Preserves skipped/skip_reason unchanged.
 */
export const stripTddEvidence = (evidence: TddEvidence): TddEvidence => {
  const result: TddEvidence = {};

  if (evidence.red) {
    result.red = {
      exit_code: evidence.red.exit_code,
      recorded_at: evidence.red.recorded_at,
      ...(evidence.red.test_file ? { test_file: evidence.red.test_file } : {}),
    };
  }

  if (evidence.green) {
    result.green = {
      exit_code: evidence.green.exit_code,
      recorded_at: evidence.green.recorded_at,
      ...(evidence.green.test_file
        ? { test_file: evidence.green.test_file }
        : {}),
    };
  }

  if (evidence.skipped !== undefined) {
    result.skipped = evidence.skipped;
  }
  if (evidence.skip_reason !== undefined) {
    result.skip_reason = evidence.skip_reason;
  }

  return result;
};

/**
 * Truncate output to max length for storage.
 */
export const truncateOutput = (output: string, maxLength = 80): string => {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... [truncated]";
};

// =============================================================================
// Agenda (Lightweight Task Contracts)
// =============================================================================

/**
 * Agenda item priority levels.
 * Used for quick task ordering without formal spec process.
 */
export const AgendaPrioritySchema = z.enum([
  "critical", // Must do immediately
  "high", // Should do soon
  "medium", // Normal priority
  "low", // Nice to have
  "backlog", // Future consideration
]);

export type AgendaPriority = z.infer<typeof AgendaPrioritySchema>;

/**
 * Agenda item status.
 */
export const AgendaStatusSchema = z.enum([
  "pending", // Not started
  "active", // Currently working on
  "blocked", // Waiting on something
  "done", // Completed
  "cancelled", // Won't do
]);

export type AgendaStatus = z.infer<typeof AgendaStatusSchema>;

/**
 * Agenda item - lightweight task without full spec ceremony.
 * Stored in JSONL format for easy append-only operations.
 */
export const AgendaItemSchema = z
  .object({
    /** Unique ID (ag-{nanoid}) */
    id: z.string(),
    /** Task description */
    title: z.string(),
    /** Optional detailed description or acceptance criteria */
    description: z.string().optional(),
    /** Priority level */
    priority: AgendaPrioritySchema.default("medium"),
    /** Current status */
    status: AgendaStatusSchema.default("pending"),
    /** Category/tag for grouping (e.g., "tests", "bugfix", "refactor") */
    category: z.string().optional(),
    /** Blocked by another agenda item ID */
    blocked_by: z.string().optional(),
    /** Created timestamp */
    created_at: z.string(),
    /** Started timestamp */
    started_at: z.string().optional(),
    /** Completed timestamp */
    completed_at: z.string().optional(),
    /** Completion notes or evidence */
    completion_notes: z.string().optional(),
    /** TDD phase if applicable */
    tdd_phase: TddPhaseSchema.default("none"),
    /** TDD evidence if recorded */
    tdd_evidence: TddEvidenceSchema.optional(),
    /** 7-gate quality checklist (optional, backwards compatible with migration) */
    gates: GatesSchema.optional(),
    /** Linked GitHub issue URLs (optional, backwards compatible) */
    github_issues: z.array(z.string().url()).optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type AgendaItem = z.infer<typeof AgendaItemSchema>;

/**
 * Agenda file metadata stored at top of JSONL.
 */
export const AgendaMetaSchema = z
  .object({
    type: z.literal("meta"),
    version: z.string().default("1.0"),
    created_at: z.string(),
    project: z.string().optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type AgendaMeta = z.infer<typeof AgendaMetaSchema>;

/**
 * Priority order for sorting (lower = higher priority).
 */
export const AGENDA_PRIORITY_ORDER: Record<AgendaPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  backlog: 4,
};

// =============================================================================
// Conformance State (rq-confSource01, rq-confLock01, rq-confVerdict01,
// rq-confArchiveGate01, rq-confOverride01, rq-confDegradation01)
//
// Per-spec conformance lock state + sibling-repo path + audit log.
// Lives in external state at:
//   ~/.local/share/opencode/plugins/advance/{project-id}/conformance.json
// Pure opt-in backfill: every spec defaults conformance_required: false.
// =============================================================================

export const ConformanceVerdictSchema = z.enum(["PASS", "DRIFT"]);
export type ConformanceVerdict = z.infer<typeof ConformanceVerdictSchema>;

export const ConformanceLastVerdictSchema = z
  .object({
    verdict: ConformanceVerdictSchema,
    run_id: z.string(),
    ran_at: z.string(),
  })
  .passthrough();
export type ConformanceLastVerdict = z.infer<typeof ConformanceLastVerdictSchema>;

export const ConformanceOverrideSchema = z
  .object({
    user: z.string(),
    reason: z.string(),
    re_verify_deadline: z.string(),
    applied_at: z.string(),
  })
  .passthrough();
export type ConformanceOverride = z.infer<typeof ConformanceOverrideSchema>;

export const ConformanceSpecEntrySchema = z
  .object({
    conformance_required: z.boolean(),
    locked: z.boolean(),
    locked_at: z.string().optional(),
    locked_at_archive: z.string().optional(),
    last_verdict: ConformanceLastVerdictSchema.optional(),
    overrides: z.array(ConformanceOverrideSchema).default([]),
  })
  .passthrough();
export type ConformanceSpecEntry = z.infer<typeof ConformanceSpecEntrySchema>;

export const ConformanceStateSchema = z
  .object({
    version: z.literal(1),
    sibling_repo_path: z.string(),
    specs: z.record(z.string(), ConformanceSpecEntrySchema),
  })
  .passthrough();
export type ConformanceState = z.infer<typeof ConformanceStateSchema>;

/**
 * Empty conformance state used when conformance.json is missing.
 * Pure opt-in: every spec defaults to conformance_required: false.
 */
export const EMPTY_CONFORMANCE_STATE = (siblingRepoPath: string): ConformanceState => ({
  version: 1,
  sibling_repo_path: siblingRepoPath,
  specs: {},
});
