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
  })
  .strict();

export type ArchiveProjectionProofReceipt = z.infer<
  typeof ArchiveProjectionProofReceiptSchema
>;
