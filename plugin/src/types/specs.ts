/**
 * Specs Domain Types
 *
 * Priority, Scenario, Requirement, Spec, Dependency, Delta operations.
 * Plus the internal _ID_PREFIXES constant.
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
    then: z.array(z.string()), // NOSONAR(typescript:S7739): BDD scenario field, not a thenable
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
