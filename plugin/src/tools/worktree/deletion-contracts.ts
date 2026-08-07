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
  })
  .strict();

export type WorktreeDeletionFacts = z.infer<typeof WorktreeDeletionFactsSchema>;

const WorktreeDeletionTokenPayloadSchema = z
  .object({
    version: z.literal("wdp1"),
    facts: WorktreeDeletionFactsSchema,
    expiresAt: z.number().int().positive(),
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
    expiresAt: z.number().int().positive(),
    token: NonEmptyTextSchema,
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
          hashWorktreeDeletionFacts(plan.facts)
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
  });

export type WorktreeDeletionPlan = z.infer<typeof WorktreeDeletionPlanSchema>;

const DeletionFailureStatusSchema = z.enum([
  "invalid_plan",
  "expired",
  "drifted",
  "blocked",
  "deadline_exceeded",
  "already_absent",
]);

export const WorktreeDeletionResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      status: z.literal("deleted"),
      repository: NonEmptyTextSchema.optional(),
      worktree: NonEmptyTextSchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      status: DeletionFailureStatusSchema,
      reason: NonEmptyTextSchema,
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
  expiresAt: number;
}): string {
  const payload = WorktreeDeletionTokenPayloadSchema.parse({
    version: "wdp1",
    facts: input.facts,
    expiresAt: input.expiresAt,
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
  options: { now?: number; facts?: WorktreeDeletionFacts } = {},
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
  return { ok: true, payload };
}
