import { createHash } from "node:crypto";
import { z } from "zod";

import { stableStringify } from "../../utils/digest";

const HEX_SHA_RE = /^[0-9a-f]{4,64}$/i;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const NonEmptyTextSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0"), "NUL is not valid in text fields");

export const WorktreeDeletionFactsSchema = z
  .object({
    repository: NonEmptyTextSchema,
    worktree: NonEmptyTextSchema,
    branch: NonEmptyTextSchema.nullable(),
    head: z.string().regex(HEX_SHA_RE),
    detached: z.boolean(),
    bare: z.boolean(),
    locked: z.boolean(),
    prunable: z.boolean(),
    dirty: z.boolean(),
    /** Planner-only safety facts. Optional for compatibility with wdp1 plans. */
    mainWorktree: z.boolean().optional(),
    cwd: NonEmptyTextSchema.optional(),
    cwdInsideWorktree: z.boolean().optional(),
    inUse: z.boolean().optional(),
    gitCorrupt: z.boolean().optional(),
  })
  .strict();

export type WorktreeDeletionFacts = z.infer<typeof WorktreeDeletionFactsSchema>;

export const WorktreeDeletionIntegrationProofSchema = z
  .object({
    kind: z.enum(["merged_to_default", "patch_equivalent", "pr_merged"]),
    branch: NonEmptyTextSchema,
    defaultBranch: NonEmptyTextSchema,
    head: z.string().regex(HEX_SHA_RE),
    evidence: NonEmptyTextSchema,
    /** Exact PR evidence, present for live pr_merged proofs. */
    prNumber: z.number().int().positive().optional(),
    prHeadOid: NonEmptyTextSchema.optional(),
    mergeCommitOid: NonEmptyTextSchema.optional(),
    headRepository: NonEmptyTextSchema.optional(),
    baseRepository: NonEmptyTextSchema.optional(),
  })
  .strict();

export type WorktreeDeletionIntegrationProof = z.infer<
  typeof WorktreeDeletionIntegrationProofSchema
>;

export const WorktreeDeletionTerminalProofSchema = z
  .object({
    changeId: NonEmptyTextSchema,
    status: z.enum(["archived", "closed"]),
    evidence: NonEmptyTextSchema,
  })
  .strict();

export type WorktreeDeletionTerminalProof = z.infer<
  typeof WorktreeDeletionTerminalProofSchema
>;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i);

export const WorktreeDeletionArchivePathSchema = z
  .object({
    path: NonEmptyTextSchema,
    status: z.enum(["A", "M", "D", "R", "C", "U", "?"]),
  })
  .strict();

export type WorktreeDeletionArchivePath = z.infer<
  typeof WorktreeDeletionArchivePathSchema
>;

const WorktreeDeletionCanonicalFileSchema = z
  .object({
    path: NonEmptyTextSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const WorktreeDeletionArchiveRecoverySchema = z
  .object({
    changeId: NonEmptyTextSchema,
    repository: NonEmptyTextSchema,
    branch: NonEmptyTextSchema,
    worktree: NonEmptyTextSchema,
    localHead: z.string().regex(HEX_SHA_RE),
    prNumber: z.number().int().positive(),
    prRepository: NonEmptyTextSchema,
    prHeadOid: z.string().regex(HEX_SHA_RE),
    mergeCommitOid: z.string().regex(HEX_SHA_RE),
    defaultBranch: NonEmptyTextSchema,
    defaultBranchSha: z.string().regex(HEX_SHA_RE),
    ancestry: z.literal("pr_head_ancestor_of_local_head"),
    bundleId: NonEmptyTextSchema,
    canonicalBundlePath: NonEmptyTextSchema,
    changedPaths: z.array(WorktreeDeletionArchivePathSchema),
    canonicalFiles: z.array(WorktreeDeletionCanonicalFileSchema),
    canonicalIdentity: NonEmptyTextSchema,
    allowedRoot: NonEmptyTextSchema,
    clean: z.boolean(),
    locked: z.boolean(),
    cwd: NonEmptyTextSchema,
    cwdInsideWorktree: z.boolean(),
    inUse: z.boolean(),
    terminal: WorktreeDeletionTerminalProofSchema,
  })
  .strict();

export type WorktreeDeletionArchiveRecovery = z.infer<
  typeof WorktreeDeletionArchiveRecoverySchema
>;

const WorktreeDeletionTokenPayloadSchema = z
  .object({
    version: z.literal("wdp1"),
    facts: WorktreeDeletionFactsSchema,
    /** Explicit approval to remove a dirty worktree; bound by the token. */
    force: z.boolean().optional(),
    expiresAt: z.number().int().positive(),
    integration: WorktreeDeletionIntegrationProofSchema.optional(),
    terminal: WorktreeDeletionTerminalProofSchema.optional(),
    removalMode: z.enum(["normal", "archive_owned_projection"]).optional(),
    archiveRecovery: WorktreeDeletionArchiveRecoverySchema.optional(),
  })
  .strict();

export type WorktreeDeletionTokenPayload = z.infer<
  typeof WorktreeDeletionTokenPayloadSchema
>;

export const WorktreeDeletionPlanSchema = z
  .object({
    version: z.literal("wdp1"),
    repository: NonEmptyTextSchema,
    facts: WorktreeDeletionFactsSchema,
    force: z.boolean().optional(),
    expiresAt: z.number().int().positive(),
    token: NonEmptyTextSchema,
    integration: WorktreeDeletionIntegrationProofSchema.optional(),
    terminal: WorktreeDeletionTerminalProofSchema.optional(),
    removalMode: z.enum(["normal", "archive_owned_projection"]).optional(),
    archiveRecovery: WorktreeDeletionArchiveRecoverySchema.optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.repository !== plan.facts.repository) {
      ctx.addIssue({
        code: "custom",
        path: ["repository"],
        message: "plan repository must match deletion facts",
      });
    }

    try {
      const payload = decodeWorktreeDeletionToken(plan.token);
      if (
        payload.expiresAt !== plan.expiresAt ||
        hashWorktreeDeletionFacts(payload.facts) !==
          hashWorktreeDeletionFacts(plan.facts) ||
        stableStringify(payload.integration) !==
          stableStringify(plan.integration) ||
        payload.force !== plan.force ||
        stableStringify(payload.terminal) !== stableStringify(plan.terminal) ||
        payload.removalMode !== plan.removalMode ||
        stableStringify(payload.archiveRecovery) !==
          stableStringify(plan.archiveRecovery)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["token"],
          message: "deletion token must bind the plan facts and expiry",
        });
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["token"],
        message: "deletion token is malformed",
      });
    }
    if (
      (plan.removalMode === "archive_owned_projection") !==
        (plan.archiveRecovery !== undefined) ||
      (plan.removalMode === "normal" && plan.archiveRecovery !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["removalMode"],
        message: "archive recovery requires its explicit removal mode",
      });
    }
    if (
      plan.removalMode === "archive_owned_projection" &&
      (plan.integration?.kind !== "pr_merged" ||
        plan.terminal === undefined ||
        stableStringify(plan.terminal) !==
          stableStringify(plan.archiveRecovery?.terminal))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["archiveRecovery"],
        message: "archive recovery requires PR and terminal proof",
      });
    }
    if (
      plan.removalMode === "archive_owned_projection" &&
      plan.force === true
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["force"],
        message: "archive recovery never permits forced removal",
      });
    }
  });

export type WorktreeDeletionPlan = z.infer<typeof WorktreeDeletionPlanSchema>;

const DeletionFailureStatusSchema = z.enum([
  "refused",
  "busy",
  "indeterminate",
  "repair_required",
  "unsupported",
  "invalid_plan",
  "expired",
  "drifted",
  "blocked",
  "deadline_exceeded",
  "already_absent",
]);

export const WorktreeDeletionPlanResultSchema = z
  .object({
    ok: z.literal(true),
    status: z.literal("planned"),
    branch: NonEmptyTextSchema,
    worktree: NonEmptyTextSchema,
    plan: WorktreeDeletionPlanSchema,
    planToken: NonEmptyTextSchema,
    warnings: z.array(NonEmptyTextSchema),
  })
  .strict();

export type WorktreeDeletionPlanResult = z.infer<
  typeof WorktreeDeletionPlanResultSchema
>;

export const WorktreeDeletionResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      status: z.literal("deleted"),
      repository: NonEmptyTextSchema.optional(),
      worktree: NonEmptyTextSchema.optional(),
      warning: NonEmptyTextSchema.optional(),
      stage: NonEmptyTextSchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      status: DeletionFailureStatusSchema,
      reason: NonEmptyTextSchema,
      stage: NonEmptyTextSchema.optional(),
      warning: NonEmptyTextSchema.optional(),
    })
    .strict(),
]);

export type WorktreeDeletionResult = z.infer<
  typeof WorktreeDeletionResultSchema
>;

function canonicalFacts(facts: WorktreeDeletionFacts): string {
  return stableStringify({
    bare: facts.bare,
    branch: facts.branch,
    detached: facts.detached,
    dirty: facts.dirty,
    head: facts.head,
    locked: facts.locked,
    prunable: facts.prunable,
    repository: facts.repository,
    worktree: facts.worktree,
    mainWorktree: facts.mainWorktree,
    cwd: facts.cwd,
    cwdInsideWorktree: facts.cwdInsideWorktree,
    inUse: facts.inUse,
    gitCorrupt: facts.gitCorrupt,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashWorktreeDeletionFacts(
  facts: WorktreeDeletionFacts,
): string {
  const parsed = WorktreeDeletionFactsSchema.parse(facts);
  return sha256(canonicalFacts(parsed));
}

function encodePayload(payload: WorktreeDeletionTokenPayload): string {
  return Buffer.from(stableStringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): WorktreeDeletionTokenPayload {
  if (!BASE64URL_RE.test(encoded))
    throw new Error("malformed deletion token payload");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length === 0 || bytes.toString("base64url") !== encoded) {
    throw new Error("malformed deletion token payload");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("malformed deletion token payload");
  }
  const payload = WorktreeDeletionTokenPayloadSchema.parse(parsed);
  if (encodePayload(payload) !== encoded) {
    throw new Error("non-canonical deletion token payload");
  }
  return payload;
}

export function encodeWorktreeDeletionToken(input: {
  facts: WorktreeDeletionFacts;
  force?: boolean;
  expiresAt: number;
  integration?: WorktreeDeletionIntegrationProof;
  terminal?: WorktreeDeletionTerminalProof;
  removalMode?: "normal" | "archive_owned_projection";
  archiveRecovery?: WorktreeDeletionArchiveRecovery;
}): string {
  const payload = WorktreeDeletionTokenPayloadSchema.parse({
    version: "wdp1",
    facts: input.facts,
    ...(input.force !== undefined ? { force: input.force } : {}),
    expiresAt: input.expiresAt,
    ...(input.integration ? { integration: input.integration } : {}),
    ...(input.terminal ? { terminal: input.terminal } : {}),
    ...(input.removalMode ? { removalMode: input.removalMode } : {}),
    ...(input.archiveRecovery
      ? { archiveRecovery: input.archiveRecovery }
      : {}),
  });
  const encoded = encodePayload(payload);
  return `wdp1.${encoded}.${sha256(encoded)}`;
}

export function decodeWorktreeDeletionToken(
  token: string,
): WorktreeDeletionTokenPayload {
  if (typeof token !== "string") throw new Error("malformed deletion token");
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== "wdp1" ||
    !BASE64URL_RE.test(parts[1])
  ) {
    throw new Error("malformed deletion token");
  }
  if (!/^[0-9a-f]{64}$/.test(parts[2])) {
    throw new Error("malformed deletion token hash");
  }
  if (parts[2] !== sha256(parts[1]))
    throw new Error("invalid deletion token hash");
  return decodePayload(parts[1]);
}

export type WorktreeDeletionTokenValidation =
  | { ok: true; payload: WorktreeDeletionTokenPayload }
  | { ok: false; reason: "malformed" | "expired" | "facts_changed" };

export function validateWorktreeDeletionToken(
  token: string,
  options: {
    now?: number;
    facts?: WorktreeDeletionFacts;
    integration?: WorktreeDeletionIntegrationProof;
    terminal?: WorktreeDeletionTerminalProof;
  } = {},
): WorktreeDeletionTokenValidation {
  let payload: WorktreeDeletionTokenPayload;
  try {
    payload = decodeWorktreeDeletionToken(token);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if ((options.now ?? Date.now()) >= payload.expiresAt) {
    return { ok: false, reason: "expired" };
  }
  if (
    options.facts !== undefined &&
    hashWorktreeDeletionFacts(options.facts) !==
      hashWorktreeDeletionFacts(payload.facts)
  ) {
    return { ok: false, reason: "facts_changed" };
  }
  if (
    options.integration !== undefined &&
    stableStringify(options.integration) !==
      stableStringify(payload.integration)
  ) {
    return { ok: false, reason: "facts_changed" };
  }
  if (
    options.terminal !== undefined &&
    stableStringify(options.terminal) !== stableStringify(payload.terminal)
  ) {
    return { ok: false, reason: "facts_changed" };
  }
  return { ok: true, payload };
}
