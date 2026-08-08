import { z } from "zod";

export const ArchiveProjectionProofReceiptSchema = z
  .object({
    schema_version: z.literal(1),
    change_id: z.string().min(1),
    manifest_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hex digest"),
    released_commit_sha: z
      .string()
      .regex(
        /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/,
        "Expected a full Git commit SHA",
      ),
    status: z.literal("verified"),
    verified_at: z.string().datetime({ offset: true }),
    archive_delta_repair: z
      .object({
        kind: z.literal("archive_delta_repair"),
        repair_branch: z.string().min(1),
        repair_head_sha: z.string().regex(/^[a-f0-9]{40,64}$/),
        default_branch: z.string().min(1),
        default_branch_sha: z.string().regex(/^[a-f0-9]{40,64}$/),
        released_commit_sha: z.string().regex(/^[a-f0-9]{40,64}$/),
        delta_set_sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hex digest"),
        delta_ids_by_capability: z.record(z.string(), z.array(z.string())),
        release_proof: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ArchiveProjectionProofReceipt = z.infer<
  typeof ArchiveProjectionProofReceiptSchema
>;
