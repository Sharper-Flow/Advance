import { z } from "zod";

/**
 * Shared Zod schema for the `include.snapshot` opt-in arg.
 *
 * Mirrors `adv_change_show`'s existing `include.snapshot` field shape
 * (change.ts:970-975). Spread into tool arg blocks via
 * `...includeSnapshotSchema.shape` — same pattern as `targetPathSchema`.
 *
 * Used by the 8 tools that invert `_contextSnapshot` emission from auto-emit
 * to opt-in: `adv_task_ready`, `adv_task_update` (in_progress/done),
 * `adv_task_add`, `adv_task_cancel`, `adv_change_create`,
 * `adv_change_reenter`, `adv_wisdom_add`, `adv_gate_complete`.
 *
 * `adv_change_show` KEEPS its broader `include` object (snapshot, ledger,
 * readyTasks, etc.) — this shared schema is for the 8 inverted tools only.
 */
export const includeSnapshotSchema = z.object({
  include: z
    .object({
      snapshot: z
        .boolean()
        .optional()
        .describe(
          "When true, attaches the rendered context snapshot as top-level `_contextSnapshot`.",
        ),
    })
    .optional()
    .describe("Optional include flags for extra fields."),
});
