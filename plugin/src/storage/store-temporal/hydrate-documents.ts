/**
 * Workflow-start hydration helper — KD-5.
 *
 * Reads disk artifact files for a pre-migration change and returns a
 * `documents` map suitable for `seedState.documents` so that the very first
 * workflow read sees Temporal-backed content (rather than empty
 * `state.documents` with disk fallback).
 *
 * Runs in the tool process (NOT inside the workflow sandbox) before
 * `client.workflow.start()`. Idempotent: re-running on the same disk state
 * produces the same result.
 *
 * Partial-write robustness:
 *   - Skips files with `nonWhitespaceChars < MIN_HYDRATABLE_CHARS` (treats
 *     empty/whitespace-only files as "no content yet").
 *   - Returns the subset of artifacts actually present on disk; missing
 *     kinds remain `undefined` in `state.documents` until written via signal.
 *
 * Concurrent-start safety:
 *   - Cold-start detection in `ensureChangeWorkflowStarted` is already
 *     exception-driven via `WorkflowExecutionAlreadyStarted`. Hydration runs
 *     in the cold-start branch only (i.e. once per change-workflow lifetime).
 *   - Temporal server `WorkflowIdReusePolicy` guarantees no concurrent-start
 *     race.
 *
 * `inspectArtifactActivity` is intentionally NOT used here — that activity
 * runs inside a worker process via Temporal, and hydration must complete
 * synchronously inline with the workflow start call. We read files directly.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { ARTIFACT_FILENAME, ArtifactKindSchema, type ArtifactKind } from "../../types";
import { createLogger } from "../../utils/debug-log";

const logger = createLogger("hydrate-documents");

/** Per-artifact minimum non-whitespace character count for hydration. */
const MIN_HYDRATABLE_CHARS = 1;

function nonWhitespaceCount(text: string): number {
  return text.replace(/\s/g, "").length;
}

/**
 * Read disk artifacts for a change and return a documents map for
 * `seedState.documents`. Returns `undefined` when the change directory
 * doesn't exist (no hydration needed for a brand-new change).
 *
 * @param changesDir Absolute path to `<project>/.adv/changes/` (or
 *   equivalent project changes directory).
 * @param changeId Change identifier (used as the per-change subdirectory).
 */
export async function readDiskArtifactsForHydration(
  changesDir: string,
  changeId: string,
): Promise<Partial<Record<ArtifactKind, string>> | undefined> {
  const changeDir = join(changesDir, changeId);

  // Check existence: if the change dir doesn't exist, there's nothing to
  // hydrate (brand-new change, or the change hasn't been disk-scaffolded
  // yet). Returning undefined signals "no hydration applied" so callers
  // can pass seedState.documents through unchanged.
  try {
    await stat(changeDir);
  } catch {
    return undefined;
  }

  const result: Partial<Record<ArtifactKind, string>> = {};

  for (const kind of ArtifactKindSchema.options) {
    const filename = ARTIFACT_FILENAME[kind];
    const filePath = join(changeDir, filename);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      // File missing — skip this kind. Common for newer changes that don't
      // have all 6 artifacts on disk.
      continue;
    }

    if (nonWhitespaceCount(content) < MIN_HYDRATABLE_CHARS) {
      // Partial-write robustness: skip empty/truncated files.
      logger.debug(
        `Skipping hydration for ${kind} on change ${changeId}: file present but below minimum (${MIN_HYDRATABLE_CHARS}) non-whitespace chars.`,
      );
      continue;
    }

    result[kind] = content;
  }

  // Return undefined when nothing was hydrated — keeps `seedState.documents`
  // unchanged at the caller and signals "no legacy content to migrate."
  if (Object.keys(result).length === 0) return undefined;
  return result;
}
