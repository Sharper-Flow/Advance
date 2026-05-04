/**
 * Wisdom Domain Types
 *
 * Cross-task learnings accumulated during change execution.
 */

import { z } from "zod";

// =============================================================================
// Wisdom (Cross-Task Learning)
// =============================================================================

/**
 * Type of wisdom entry - categorizes the learning for better retrieval.
 */
export const WisdomTypeSchema = z.enum([
  "pattern", // Reusable code pattern or approach
  "success", // What worked well
  "failure", // What didn't work and why
  "gotcha", // Non-obvious issue or pitfall
  "convention", // Codebase convention to follow
]);

export type WisdomType = z.infer<typeof WisdomTypeSchema>;

/**
 * A single wisdom entry - a learning accumulated during task execution.
 * Stored per-change and injected into subsequent task context.
 */
export const WisdomEntrySchema = z.object({
  /** Unique ID (ws-{nanoid(6)}) */
  id: z.string(),
  /** Category of this learning */
  type: WisdomTypeSchema,
  /** The actual learning content (max 2000 chars) */
  content: z.string().max(2000),
  /** Task that generated this wisdom (optional) */
  source_task: z.string().optional(),
  /** ISO8601 timestamp when recorded */
  recorded_at: z.string(),
});

export type WisdomEntry = z.infer<typeof WisdomEntrySchema>;
