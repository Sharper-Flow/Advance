/**
 * Structured Output Extraction Utility
 *
 * NOT importable from temporal/ — tool-layer only.
 * The workflow-bundle-boundary test enforces this boundary.
 *
 * Extracts structured output from `<adv-output>` tags in agent task
 * completion text. Non-blocking: all failures log warnings and return null.
 */

import { createLogger } from "./debug-log";
import {
  STRUCTURED_OUTPUT_MAX_BYTES,
  TaskStructuredOutputSchema,
  type TaskStructuredOutput,
} from "../types/task-output";

const logger = createLogger("extract-structured-output");

// Regex: non-greedy match for <adv-output>...</adv-output>
// Uses lazy *? with fixed-width delimiters — no ReDoS risk
const TAG_REGEX = /<adv-output>([\s\S]*?)<\/adv-output>/g;

// Fence patterns: opening ```json or ``` followed by newline
const OPENING_FENCE = /^\s*```(?:json)?\s*\n?/;
const CLOSING_FENCE = /\n?\s*```\s*$/;

/**
 * Extract structured output from text containing `<adv-output>` tags.
 *
 * Takes the LAST occurrence of the tag (Sandcastle convention).
 * Strips markdown fences, parses JSON, validates schema.
 * Returns null on any failure — non-blocking.
 */
export function extractStructuredOutput(
  text: string,
): TaskStructuredOutput | null {
  if (!text) return null;

  // 1. Find last <adv-output>...</adv-output>
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0; // reset for safety
  while ((match = TAG_REGEX.exec(text)) !== null) {
    lastMatch = match[1];
  }
  if (lastMatch === null) return null;

  // 2. Strip markdown fences
  const stripped = lastMatch
    .replace(OPENING_FENCE, "")
    .replace(CLOSING_FENCE, "")
    .trim();

  if (!stripped) return null;

  // 3. Size check
  if (stripped.length > STRUCTURED_OUTPUT_MAX_BYTES) {
    logger.warn(
      `Structured output exceeds ${STRUCTURED_OUTPUT_MAX_BYTES} bytes (${stripped.length}), skipping`,
    );
    return null;
  }

  // 4. JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    logger.warn("Failed to parse structured output JSON:", err);
    return null;
  }

  // 5. Schema validate (passthrough allows extra fields)
  try {
    return TaskStructuredOutputSchema.parse(parsed);
  } catch (err) {
    logger.warn("Structured output failed schema validation:", err);
    return null;
  }
}
