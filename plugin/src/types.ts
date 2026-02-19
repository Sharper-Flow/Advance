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
  /** First 500 chars of test output (truncated for storage) */
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
]);

export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;

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
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Change = z.infer<typeof ChangeSchema>;

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

export interface ProjectStatus {
  specs: {
    count: number;
    capabilities: string[];
  };
  changes: {
    active: number;
    byStatus: Record<ChangeStatus, number>;
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
  MOON: "[ADV:MOON]", // Waiting for sub-agents
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
 * Truncate output to max length for storage.
 */
export const truncateOutput = (output: string, maxLength = 500): string => {
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
