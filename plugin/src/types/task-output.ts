/**
 * Task Structured Output Types
 *
 * Schema for structured output extracted from agent task completion text.
 * Agents MAY emit `<adv-output>` JSON blocks alongside prose summaries.
 * Extraction is optional and non-blocking.
 */

import { z } from "zod";

/** Maximum allowed size for structured output JSON (10KB). */
export const STRUCTURED_OUTPUT_MAX_BYTES = 10 * 1024;

/** Schema for a single file change record. */
export const FileChangeSchema = z.object({
  path: z.string(),
  linesAdded: z.number().int().nonnegative().optional(),
  linesRemoved: z.number().int().nonnegative().optional(),
});

/** Schema for a single decision record. */
export const DecisionSchema = z.object({
  decision: z.string(),
  why: z.string(),
});

/**
 * Schema for structured task output extracted from `<adv-output>` tags.
 *
 * All fields have safe defaults — agent emits what it knows.
 * Passthrough allows extra agent fields that survive extraction
 * but are NOT contractual until promoted to named fields.
 */
export const TaskStructuredOutputSchema = z
  .object({
    filesChanged: z.array(FileChangeSchema).default([]),
    testsAdded: z.number().int().nonnegative().default(0),
    testsModified: z.number().int().nonnegative().default(0),
    decisions: z.array(DecisionSchema).default([]),
    followUps: z.array(z.string()).default([]),
  })
  .passthrough();

export type TaskStructuredOutput = z.infer<typeof TaskStructuredOutputSchema>;
