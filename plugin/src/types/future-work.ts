import { z } from "zod";

const MAX_BG = 4096; // 4 KiB
const MAX_DESIGN_SEED = 6144; // 6 KiB
const MAX_ITEM = 512; // per constraint/avoidance string
const MAX_ARRAY = 12; // references, constraints, avoidances

export const FutureWorkContextPacketSchema = z.object({
  background: z.string().max(MAX_BG).optional(),
  references: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        locator: z.string().min(1).max(2048),
      }),
    )
    .max(MAX_ARRAY)
    .optional(),
  constraints: z
    .array(z.string().min(1).max(MAX_ITEM))
    .max(MAX_ARRAY)
    .optional(),
  avoidances: z
    .array(z.string().min(1).max(MAX_ITEM))
    .max(MAX_ARRAY)
    .optional(),
  design_seed: z.string().max(MAX_DESIGN_SEED).optional(),
  cross_project_target: z
    .object({
      project_hint: z.string().max(200).optional(),
      target_path: z.string().max(1024).optional(),
      repo_url: z.string().max(2048).optional(),
    })
    .optional(),
});

export type FutureWorkContextPacket = z.infer<
  typeof FutureWorkContextPacketSchema
>;
