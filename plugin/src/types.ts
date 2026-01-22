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
  change: "", // Changes use kebab-case slug
} as const;

// =============================================================================
// Priority (RFC 2119)
// =============================================================================

export const PrioritySchema = z.enum(["must", "should", "may"]);
export type Priority = z.infer<typeof PrioritySchema>;

// =============================================================================
// Scenario (Given/When/Then)
// =============================================================================

export const ScenarioSchema = z.object({
  id: z.string(), // Hierarchical: rq-V1StGXR8.1
  title: z.string(),
  given: z.array(z.string()),
  when: z.string(),
  then: z.array(z.string()),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// =============================================================================
// Requirement
// =============================================================================

export const RequirementSchema = z.object({
  id: z.string(), // rq-V1StGXR8
  title: z.string(),
  body: z.string(), // Markdown allowed
  priority: PrioritySchema,
  tags: z.array(z.string()).optional(),
  scenarios: z.array(ScenarioSchema).optional(),
});

export type Requirement = z.infer<typeof RequirementSchema>;

// =============================================================================
// Spec (The Law)
// =============================================================================

export const SpecSchema = z.object({
  $schema: z.string().optional(),
  name: z.string(), // kebab-case capability ID
  title: z.string(),
  purpose: z.string(),
  version: z.string(), // Semantic version
  updated_at: z.string(), // ISO8601
  requirements: z.array(RequirementSchema),
});

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
// Task
// =============================================================================

export const TaskSchema = z.object({
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
});

export type Task = z.infer<typeof TaskSchema>;

// =============================================================================
// Delta Operations
// =============================================================================

export const DeltaOperationSchema = z.enum(["add", "modify", "remove"]);
export type DeltaOperation = z.infer<typeof DeltaOperationSchema>;

export const DeltaAddSchema = z.object({
  id: z.string(), // dl-Xt5zW3vB
  operation: z.literal("add"),
  requirement: RequirementSchema,
});

export const DeltaModifySchema = z.object({
  id: z.string(),
  operation: z.literal("modify"),
  target_id: z.string(), // Requirement ID to modify
  changes: z.record(z.unknown()), // Fields to update
});

export const DeltaRemoveSchema = z.object({
  id: z.string(),
  operation: z.literal("remove"),
  target_id: z.string(),
  reason: z.string(),
});

export const DeltaSchema = z.discriminatedUnion("operation", [
  DeltaAddSchema,
  DeltaModifySchema,
  DeltaRemoveSchema,
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
// Change
// =============================================================================

export const ChangeSchema = z.object({
  $schema: z.string().optional(),
  id: z.string(), // kebab-case slug
  title: z.string(),
  status: ChangeStatusSchema,
  created_at: z.string(), // ISO8601
  created_by: z.string().optional(),
  tasks: z.array(TaskSchema),
  deltas: z.record(z.array(DeltaSchema)), // Keyed by capability
  validation: ValidationResultSchema.optional(),
});

export type Change = z.infer<typeof ChangeSchema>;

// =============================================================================
// Project Configuration
// =============================================================================

export const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),
  name: z.string(),
  version: z.string().optional(),
  specs_dir: z.string().default("specs"),
  changes_dir: z.string().default("changes"),
  archive_dir: z.string().default("archive"),
  docs_dir: z.string().default("docs/specs"),
  db_dir: z.string().default(".specdb"),
});

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

export const TAB_COLORS: Record<StatusMarker, string> = {
  ROCKET: "#FF6B6B",
  TDD_RED: "#FF8C42",
  TDD_GREEN: "#4ECDC4",
  MOON: "#6B7FD7",
  EARTH: "#95E1A3",
  DOOM_LOOP: "#E74C3C",
  MIC: "#F39C12",
};
