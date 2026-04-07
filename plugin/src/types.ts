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
export const ID_PREFIXES = {
  requirement: "rq-",
  task: "tk-",
  delta: "dl-",
  change: "", // Changes use camelCase title
} as const;

// =============================================================================
// Priority (RFC 2119)
// =============================================================================

export const PrioritySchema = z.enum(["must", "should", "may"]);
export type Priority = z.infer<typeof PrioritySchema>;

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

export const DependencyTypeSchema = z.enum([
  "blocked_by", // Cannot start until target completes
  "related", // Informational link, no blocking
  "discovered_from", // Found while working on target
  "parent", // Hierarchical containment
]);

export type DependencyType = z.infer<typeof DependencyTypeSchema>;

export const DependencySchema = z.object({
  type: DependencyTypeSchema,
  target: z.string(), // Target entity ID
});

export type Dependency = z.infer<typeof DependencySchema>;

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "done",
  "cancelled",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

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
});

export type ErrorRecovery = z.infer<typeof ErrorRecoverySchema>;

// =============================================================================
// Task
// =============================================================================

export const TaskSchema = z
  .object({
    id: z.string(), // tk-Hf7dK2mN
    title: z.string(),
    section: z.string().optional(), // Grouping label
    status: TaskStatusSchema,
    priority: z.number().default(0), // Lower = higher priority
    deps: z.array(DependencySchema).optional(),
    created_at: z.string(), // ISO8601
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    completed_by: z.string().nullable().optional(),
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
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Task = z.infer<typeof TaskSchema>;

// =============================================================================
// Delta Operations
// =============================================================================

export const DeltaOperationSchema = z.enum([
  "add",
  "modify",
  "remove",
  "rename",
]);
export type DeltaOperation = z.infer<typeof DeltaOperationSchema>;

export const DeltaAddSchema = z.object({
  id: z.string(), // dl-Xt5zW3vB
  operation: z.literal("add"),
  requirement: RequirementSchema,
});

/**
 * Typed partial of RequirementSchema for modify delta changes.
 * Only allows known requirement fields with correct types.
 * Uses .strict() to reject unknown keys at parse time.
 */
export const DeltaModifyChangesSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    priority: PrioritySchema.optional(),
    tags: z.array(z.string()).optional(),
    scenarios: z.array(ScenarioSchema).optional(),
  })
  .strict(); // Reject unknown keys

export type DeltaModifyChanges = z.infer<typeof DeltaModifyChangesSchema>;

export const DeltaModifySchema = z.object({
  id: z.string(),
  operation: z.literal("modify"),
  target_id: z.string(), // Requirement ID to modify
  changes: DeltaModifyChangesSchema, // Typed fields to update
});

export const DeltaRemoveSchema = z.object({
  id: z.string(),
  operation: z.literal("remove"),
  target_id: z.string(),
  reason: z.string(),
});

/**
 * Rename delta - changes a requirement's title and optionally its ID.
 * Applied before remove/modify/add to avoid target-not-found errors.
 */
export const DeltaRenameSchema = z.object({
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

export const ValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const ValidationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

export type ValidationWarning = z.infer<typeof ValidationWarningSchema>;

export const ValidationResultSchema = z.object({
  checked_against_specs: z.array(z.string()),
  conflicts: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationWarningSchema),
  validated_at: z.string().optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

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

export const ChangeClosureReasonSchema = z.enum([
  "cancelled",
  "superseded",
  "not_planned",
]);

export type ChangeClosureReason = z.infer<typeof ChangeClosureReasonSchema>;

export const ChangeClosureSchema = z.object({
  reason: ChangeClosureReasonSchema,
  approved_by_user: z.literal(true),
  approval_evidence: z.string(),
  superseded_by: z.string().optional(),
  approved_at: z.string(),
});

export type ChangeClosure = z.infer<typeof ChangeClosureSchema>;

// =============================================================================
// Quality Gates (6-Gate Checklist)
// =============================================================================

/**
 * Gate IDs for the 6-gate quality checklist.
 * Gates must be completed in sequence before archival/completion.
 */
export const GateIdSchema = z.enum([
  "research", // Research-Done: Context7 docs lookup or /adv-research
  "prep", // Prep-Done: /adv-prep gap analysis
  "implementation", // Implementation-Done: All tasks done (cancelled need approval)
  "review", // Review-Done: /adv-review code review
  "harden", // Harden-Done: /adv-harden hardening
  "signoff", // User-Signoff: Explicit user confirmation
]);

export type GateId = z.infer<typeof GateIdSchema>;

/**
 * Ordered list of gate IDs for sequence enforcement.
 * Gates must be completed in this order.
 */
export const GATE_ORDER: GateId[] = [
  "research",
  "prep",
  "implementation",
  "review",
  "harden",
  "signoff",
];

/**
 * Gate status values.
 * - pending: Not yet completed
 * - done: Actually completed with timestamp + actor evidence
 * - legacy: Predates gate system, counts as "satisfied" but wasn't performed
 * - skipped: Explicitly skipped with documented reason (future use)
 */
export const GateStatusSchema = z.enum([
  "pending",
  "done",
  "legacy",
  "skipped",
]);

export type GateStatus = z.infer<typeof GateStatusSchema>;

/**
 * Single gate completion record.
 * Tracks who completed the gate and when.
 */
export const GateCompletionSchema = z.object({
  /** Current status of this gate */
  status: GateStatusSchema.default("pending"),
  /** ISO8601 timestamp when gate was completed */
  completed_at: z.string().optional(),
  /** Who completed the gate (user, agent, migration) */
  completed_by: z.string().optional(),
});

export type GateCompletion = z.infer<typeof GateCompletionSchema>;

/**
 * Full gates object containing all 6 gate completion records.
 * Each gate tracks its completion status independently.
 */
export const GatesSchema = z.object({
  research: GateCompletionSchema.default({ status: "pending" }),
  prep: GateCompletionSchema.default({ status: "pending" }),
  implementation: GateCompletionSchema.default({ status: "pending" }),
  review: GateCompletionSchema.default({ status: "pending" }),
  harden: GateCompletionSchema.default({ status: "pending" }),
  signoff: GateCompletionSchema.default({ status: "pending" }),
});

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
 */
export const createDefaultGates = (): Gates => ({
  research: { status: "pending" },
  prep: { status: "pending" },
  implementation: { status: "pending" },
  review: { status: "pending" },
  harden: { status: "pending" },
  signoff: { status: "pending" },
});

/**
 * Create legacy gates object for migration.
 * All gates set to 'legacy' except signoff which stays 'pending'.
 */
export const createLegacyGates = (): Gates => {
  const now = new Date().toISOString();
  return {
    research: {
      status: "legacy",
      completed_at: now,
      completed_by: "migration",
    },
    prep: { status: "legacy", completed_at: now, completed_by: "migration" },
    implementation: {
      status: "legacy",
      completed_at: now,
      completed_by: "migration",
    },
    review: { status: "legacy", completed_at: now, completed_by: "migration" },
    harden: { status: "legacy", completed_at: now, completed_by: "migration" },
    signoff: { status: "pending" }, // NEVER auto-marked
  };
};

// =============================================================================
// Change
// =============================================================================

export const ChangeSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string(), // camelCase title
    title: z.string(),
    status: ChangeStatusSchema,
    created_at: z.string(), // ISO8601
    created_by: z.string().optional(),
    tasks: z.array(TaskSchema),
    deltas: z.record(z.array(DeltaSchema)), // Keyed by capability
    validation: ValidationResultSchema.optional(),
    /** Accumulated wisdom/learnings for this change (optional, backwards compatible) */
    wisdom: z.array(WisdomEntrySchema).optional(),
    /** 6-gate quality checklist (optional, backwards compatible with migration) */
    gates: GatesSchema.optional(),
    /** Linked GitHub issue URLs (optional, backwards compatible) */
    github_issues: z.array(z.string().url()).optional(),
    /** Structured closure metadata for retired changes */
    closure: ChangeClosureSchema.optional(),
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
export const RelatedRepoSchema = z.object({
  /** Short identifier used in task metadata (e.g., "backend", "api", "db") */
  id: z.string(),
  /** Absolute path to the repository root */
  path: z.string(),
  /** Human-readable role description (e.g., "Backend API server", "Database migrations") */
  role: z.string().optional(),
});

export type RelatedRepo = z.infer<typeof RelatedRepoSchema>;

// =============================================================================
// Feature Flags
// =============================================================================

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
export const SlopScanConfigSchema = z
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

export type SlopScanConfig = z.infer<typeof SlopScanConfigSchema>;

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
     * - "advisory" (default): Ambiguity findings surfaced as warnings in tool output; no blocking
     * - "strict": Ambiguity findings block the prep gate until resolved via /adv-clarify
     * - "off": Clarify checks skipped entirely; no findings emitted
     */
    clarify_enforcement: z
      .enum(["off", "advisory", "strict"])
      .default("advisory"),
    /**
     * Threshold overrides for /adv-slop-scan detection.
     * All thresholds have smart defaults; override only what differs from project norms.
     */
    slop_scan: SlopScanConfigSchema.default({}),
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
    features: FeatureFlagsSchema.default({}),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

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
    taskCount: number;
    completedTasks: number;
  }>;
}

export interface TaskReadyResponse {
  ready: Task[];
  blocked: Array<{
    task: Task;
    blockedBy: string[];
  }>;
}

export interface ArchiveResult {
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
  ROCKET: "[ADV:ROCKET]", // Active work
  TDD_RED: "[ADV:TDD_RED]", // Red phase
  TDD_GREEN: "[ADV:TDD_GREEN]", // Green phase
  MOON: "[ADV:MOON]", // Sub-agents running (📡)
  EARTH: "[ADV:EARTH]", // Complete / awaiting input
  DOOM_LOOP: "[ADV:DOOM_LOOP]", // Stuck
  MIC: "[ADV:MIC]", // Needs approval
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
    /** 6-gate quality checklist (optional, backwards compatible with migration) */
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
