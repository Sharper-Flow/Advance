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

/**
 * Content equality for two requirements, excluding provenance `meta` and
 * normalizing tag/scenario order. Used for idempotent delta application
 * (rq-releaseProjectionDurability01): an "add" delta whose requirement already
 * exists with identical content is treated as already-applied, not a conflict.
 */
export function requirementsContentEqual(
  a: Requirement,
  b: Requirement,
): boolean {
  if (a.id !== b.id) return false;
  if (a.title !== b.title) return false;
  if (a.body !== b.body) return false;
  if (a.priority !== b.priority) return false;
  const aTags = [...(a.tags ?? [])].sort().join("\n");
  const bTags = [...(b.tags ?? [])].sort().join("\n");
  if (aTags !== bTags) return false;
  const norm = (s: Scenario) =>
    JSON.stringify({
      id: s.id,
      title: s.title,
      given: s.given,
      when: s.when,
      then: s.then,
    });
  const aScn = [...(a.scenarios ?? [])]
    .sort((x, y) => x.id.localeCompare(y.id))
    .map(norm);
  const bScn = [...(b.scenarios ?? [])]
    .sort((x, y) => x.id.localeCompare(y.id))
    .map(norm);
  return aScn.length === bScn.length && aScn.every((n, i) => n === bScn[i]);
}

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

/**
 * Kebab-case capability key: spec directory name and spec.json `name`.
 * Accepts new capability slugs; rejects malformed identifiers so capability
 * keys stay filesystem- and URL-safe. Single source of truth for both the
 * zod schema and non-zod validation sites (e.g. workflow reducers).
 */
export const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const CapabilityKeySchema = z
  .string()
  .regex(
    CAPABILITY_KEY_PATTERN,
    "Capability must be kebab-case (lowercase letters, digits, single dashes)",
  );

export type CapabilityKey = z.infer<typeof CapabilityKeySchema>;

export const SHA256DigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hex digest");

/**
 * Structural authority captured when a mutating delta is recorded. Optional
 * for legacy bundle compatibility; historical reconciliation fails closed
 * when neither this precondition nor another immutable baseline is available.
 */
export const DeltaPreconditionSchema = z
  .object({
    schema_version: z.literal(1),
    target_requirement_sha256: SHA256DigestSchema,
    new_id_absent: z.boolean().optional(),
  })
  .strict();

export type DeltaPrecondition = z.infer<typeof DeltaPreconditionSchema>;

export const DeltaAddSchema = z.object({
  id: z.string(), // dl-Xt5zW3vB
  operation: z.literal("add"),
  requirement: RequirementSchema,
});

export type DeltaAdd = z.infer<typeof DeltaAddSchema>;

/**
 * Typed partial of RequirementSchema for modify delta changes.
 * Only allows known requirement fields with correct types.
 * Uses .strict() to reject unknown keys at parse time.
 * rq-typedmod: typed modification keys are enforced at this schema boundary.
 */
export const DeltaModifyChangesSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    priority: PrioritySchema.optional(),
    tags: z.array(z.string()).optional(),
    scenarios: z.array(ScenarioSchema).optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "Modify delta changes must contain at least one field",
  });

export type DeltaModifyChanges = z.infer<typeof DeltaModifyChangesSchema>;

export const DeltaModifySchema = z
  .object({
    id: z.string(),
    operation: z.literal("modify"),
    target_id: z.string(), // Requirement ID to modify
    changes: DeltaModifyChangesSchema, // Typed fields to update
    precondition: DeltaPreconditionSchema.optional(),
  })
  .superRefine((delta, ctx) => {
    for (const [index, scenario] of (delta.changes.scenarios ?? []).entries()) {
      if (!scenario.id.startsWith(`${delta.target_id}.`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changes", "scenarios", index, "id"],
          message:
            "Modified scenario IDs must use the target requirement id as their parent",
        });
      }
    }
  });

export type DeltaModify = z.infer<typeof DeltaModifySchema>;

export const DeltaRemoveSchema = z.object({
  id: z.string(),
  operation: z.literal("remove"),
  target_id: z.string(),
  reason: z.string(),
  precondition: DeltaPreconditionSchema.optional(),
});

export type DeltaRemove = z.infer<typeof DeltaRemoveSchema>;

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
  precondition: DeltaPreconditionSchema.optional(),
});

export type DeltaRename = z.infer<typeof DeltaRenameSchema>;

export const DeltaSchema = z.discriminatedUnion("operation", [
  DeltaAddSchema,
  DeltaModifySchema,
  DeltaRemoveSchema,
  DeltaRenameSchema,
]);

export type Delta = z.infer<typeof DeltaSchema>;
