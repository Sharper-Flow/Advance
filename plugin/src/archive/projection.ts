import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DeltaSchema,
  RequirementSchema,
  SHA256DigestSchema,
  SpecSchema,
  type Delta,
  type Requirement,
  type Spec,
} from "../types";

// Global specs intentionally support typed extension fields through the
// authoritative passthrough schemas. Projection must preserve and hash those
// fields rather than narrowing a valid spec to the core shape.
const ProjectionRequirementSchema = RequirementSchema;
const ProjectionSpecSchema = SpecSchema;

export const DeltaProjectionDispositionSchema = z
  .object({
    deltaId: z.string(),
    operation: z.enum(["add", "modify", "remove", "rename"]),
    status: z.enum(["missing", "identical", "conflicting", "unverified"]),
    targetId: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export type DeltaProjectionDisposition = z.infer<
  typeof DeltaProjectionDispositionSchema
>;

export const CapabilityProjectionManifestSchema = z
  .object({
    capability: z.string(),
    base_version: z.string(),
    target_version: z.string(),
    spec_sha256: SHA256DigestSchema,
    document_sha256: SHA256DigestSchema,
    requirement_sha256: z.record(z.string(), SHA256DigestSchema),
    dispositions: z.array(DeltaProjectionDispositionSchema),
  })
  .strict();

export const SpecProjectionManifestSchema = z
  .object({
    schema_version: z.literal(1),
    change_id: z.string(),
    delta_set_sha256: SHA256DigestSchema,
    capabilities: z.array(CapabilityProjectionManifestSchema),
  })
  .strict();

export type SpecProjectionManifest = z.infer<
  typeof SpecProjectionManifestSchema
>;

type ProjectionAuthority =
  | { kind: "current" }
  | { kind: "historical"; baselineSpec?: Spec };

export interface PlanSpecProjectionInput {
  spec: Spec;
  deltas: Delta[];
  authority: ProjectionAuthority;
  projectedAt: string;
}

export interface SpecProjectionPlan {
  status: "safe" | "blocked";
  capability: string;
  baseVersion: string;
  targetVersion: string;
  dispositions: DeltaProjectionDisposition[];
  targetSpec?: Spec;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalBytes(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

export function requirementSha256(requirement: Requirement): string {
  return canonicalSha256(ProjectionRequirementSchema.parse(requirement));
}

export function specSha256(spec: Spec): string {
  return canonicalSha256(ProjectionSpecSchema.parse(spec));
}

const DELTA_ORDER: Record<Delta["operation"], number> = {
  rename: 0,
  remove: 1,
  modify: 2,
  add: 3,
};

function sortDeltas(deltas: Delta[]): Delta[] {
  return [...deltas].sort(
    (left, right) => DELTA_ORDER[left.operation] - DELTA_ORDER[right.operation],
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalBytes(left) === canonicalBytes(right);
}

function changedFieldsMatch(
  requirement: Requirement,
  changes: Extract<Delta, { operation: "modify" }>["changes"],
): boolean {
  return Object.entries(changes).every(([key, expected]) =>
    sameValue(requirement[key], expected),
  );
}

function baselineRequirement(
  authority: ProjectionAuthority,
  targetId: string,
): Requirement | undefined {
  return authority.kind === "historical"
    ? authority.baselineSpec?.requirements.find((row) => row.id === targetId)
    : undefined;
}

function hasPreimageAuthority(
  authority: ProjectionAuthority,
  delta: Extract<Delta, { operation: "modify" | "remove" | "rename" }>,
  current: Requirement,
): boolean {
  if (authority.kind === "current") return true;
  const expectedDigest =
    delta.precondition?.target_requirement_sha256 ??
    (baselineRequirement(authority, delta.target_id)
      ? requirementSha256(baselineRequirement(authority, delta.target_id)!)
      : undefined);
  return (
    expectedDigest !== undefined &&
    expectedDigest === requirementSha256(current)
  );
}

function blockedStatus(
  authorityPresent: boolean,
): "conflicting" | "unverified" {
  return authorityPresent ? "conflicting" : "unverified";
}

function hasAuthoritySource(
  authority: ProjectionAuthority,
  delta: Extract<Delta, { operation: "modify" | "remove" | "rename" }>,
): boolean {
  return (
    authority.kind === "current" ||
    delta.precondition !== undefined ||
    baselineRequirement(authority, delta.target_id) !== undefined
  );
}

function bumpProjectionVersion(
  version: string,
  missing: DeltaProjectionDisposition[],
): string {
  if (missing.length === 0) return version;
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN))
    return `${version}-updated`;
  const [major, minor, patch] = parts;
  return missing.some((row) => row.operation === "add")
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}

export function planSpecProjection(
  input: PlanSpecProjectionInput,
): SpecProjectionPlan {
  const base = ProjectionSpecSchema.parse(structuredClone(input.spec)) as Spec;
  const working = structuredClone(base);
  const deltas = DeltaSchema.array().parse(input.deltas);
  const dispositions: DeltaProjectionDisposition[] = [];

  for (const delta of sortDeltas(deltas)) {
    if (delta.operation === "add") {
      const existing = working.requirements.find(
        (row) => row.id === delta.requirement.id,
      );
      if (existing) {
        dispositions.push({
          deltaId: delta.id,
          operation: "add",
          targetId: delta.requirement.id,
          status: sameValue(
            ProjectionRequirementSchema.parse(existing),
            ProjectionRequirementSchema.parse(delta.requirement),
          )
            ? "identical"
            : "conflicting",
          ...(sameValue(existing, delta.requirement)
            ? {}
            : {
                reason: "same requirement id has different normalized content",
              }),
        });
      } else {
        working.requirements.push(
          ProjectionRequirementSchema.parse(delta.requirement) as Requirement,
        );
        dispositions.push({
          deltaId: delta.id,
          operation: "add",
          targetId: delta.requirement.id,
          status: "missing",
        });
      }
      continue;
    }

    const current = working.requirements.find(
      (row) => row.id === delta.target_id,
    );

    if (delta.operation === "modify") {
      if (!current) {
        dispositions.push({
          deltaId: delta.id,
          operation: "modify",
          targetId: delta.target_id,
          status: "conflicting",
          reason: "modify target is absent",
        });
      } else if (changedFieldsMatch(current, delta.changes)) {
        dispositions.push({
          deltaId: delta.id,
          operation: "modify",
          targetId: delta.target_id,
          status: "identical",
        });
      } else if (hasPreimageAuthority(input.authority, delta, current)) {
        Object.assign(current, delta.changes);
        dispositions.push({
          deltaId: delta.id,
          operation: "modify",
          targetId: delta.target_id,
          status: "missing",
        });
      } else {
        dispositions.push({
          deltaId: delta.id,
          operation: "modify",
          targetId: delta.target_id,
          status: blockedStatus(hasAuthoritySource(input.authority, delta)),
          reason:
            "current requirement does not match an authoritative preimage",
        });
      }
      continue;
    }

    if (delta.operation === "remove") {
      if (!current) {
        dispositions.push({
          deltaId: delta.id,
          operation: "remove",
          targetId: delta.target_id,
          status: "identical",
        });
      } else if (hasPreimageAuthority(input.authority, delta, current)) {
        working.requirements = working.requirements.filter(
          (row) => row.id !== delta.target_id,
        );
        dispositions.push({
          deltaId: delta.id,
          operation: "remove",
          targetId: delta.target_id,
          status: "missing",
        });
      } else {
        dispositions.push({
          deltaId: delta.id,
          operation: "remove",
          targetId: delta.target_id,
          status: blockedStatus(hasAuthoritySource(input.authority, delta)),
          reason: "remove target does not match an authoritative preimage",
        });
      }
      continue;
    }

    const targetId = delta.new_id ?? delta.target_id;
    if (!current) {
      const renamed = working.requirements.find((row) => row.id === targetId);
      dispositions.push({
        deltaId: delta.id,
        operation: "rename",
        targetId: delta.target_id,
        status:
          renamed?.title === delta.new_title ? "identical" : "conflicting",
        ...(renamed?.title === delta.new_title
          ? {}
          : {
              reason:
                "rename source is absent and expected postimage is missing",
            }),
      });
      continue;
    }
    if (targetId === delta.target_id && current.title === delta.new_title) {
      dispositions.push({
        deltaId: delta.id,
        operation: "rename",
        targetId: delta.target_id,
        status: "identical",
      });
      continue;
    }
    if (
      targetId !== delta.target_id &&
      working.requirements.some((row) => row.id === targetId)
    ) {
      dispositions.push({
        deltaId: delta.id,
        operation: "rename",
        targetId: delta.target_id,
        status: "conflicting",
        reason: "rename destination id already exists",
      });
      continue;
    }
    if (!hasPreimageAuthority(input.authority, delta, current)) {
      dispositions.push({
        deltaId: delta.id,
        operation: "rename",
        targetId: delta.target_id,
        status: blockedStatus(hasAuthoritySource(input.authority, delta)),
        reason: "rename target does not match an authoritative preimage",
      });
      continue;
    }
    current.title = delta.new_title;
    current.id = targetId;
    dispositions.push({
      deltaId: delta.id,
      operation: "rename",
      targetId: delta.target_id,
      status: "missing",
    });
  }

  const blocked = dispositions.some(
    (row) => row.status === "conflicting" || row.status === "unverified",
  );
  const missing = dispositions.filter((row) => row.status === "missing");
  const targetVersion = bumpProjectionVersion(base.version, missing);
  if (blocked) {
    return {
      status: "blocked",
      capability: base.name,
      baseVersion: base.version,
      targetVersion: base.version,
      dispositions,
    };
  }

  if (missing.length > 0) {
    working.version = targetVersion;
    working.updated_at = input.projectedAt;
  }

  return {
    status: "safe",
    capability: base.name,
    baseVersion: base.version,
    targetVersion,
    dispositions,
    targetSpec: working,
  };
}
