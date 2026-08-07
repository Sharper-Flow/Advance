/**
 * Layer 1 size validation for artifact content writes (tool/store layer
 * pre-check). Fails fast before any signal fires. Layer 2 (signal-handler
 * state-mutation rejection) is the structural defense in T8.
 *
 * Cap values are defined in `types/artifacts.ts`.
 */

import {
  AGGREGATE_HARD_CAP,
  AGGREGATE_SOFT_CAP,
  ARTIFACT_HARD_CAP,
  ARTIFACT_SOFT_CAP,
  type ArtifactKind,
  type ArtifactPayload,
} from "../types";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("artifact-size-validation");

const utf8 = new TextEncoder();
function byteLength(content: string): number {
  return utf8.encode(content).length;
}

/**
 * Validate a single artifact's content size. Throws on hard cap; warns on
 * soft cap.
 */
export function validatePerArtifactSize(
  field: ArtifactKind,
  content: string,
): void {
  const size = byteLength(content);
  if (size > ARTIFACT_HARD_CAP) {
    throw new Error(
      `Artifact '${field}' size ${size} bytes exceeds hard cap ${ARTIFACT_HARD_CAP} bytes (256 KB). Reduce the content before writing.`,
    );
  }
  if (size > ARTIFACT_SOFT_CAP) {
    logger.warn(
      `Artifact '${field}' size ${size} bytes exceeds soft cap ${ARTIFACT_SOFT_CAP} bytes (64 KB). Approaching artifact size hard cap.`,
    );
  }
}

/**
 * Validate aggregate `state.documents` size after applying the proposed
 * artifact payload. Protects the serialized change projection from excessive
 * size.
 *
 * `existingDocuments` is the current state.documents shape (or empty/undefined
 * for `create()` calls). Each field in `proposed` overrides the corresponding
 * field in `existing` for size computation; undefined fields fall through to
 * `existing`.
 */
export function validateAggregateSize(
  proposed: ArtifactPayload,
  existingDocuments?: Partial<Record<ArtifactKind, string | undefined>>,
): void {
  const projected: Record<string, string> = {};
  const allKinds: ArtifactKind[] = [
    "proposal",
    "problemStatement",
    "agreement",
    "design",
    "executiveSummary",
    "acceptance",
  ];

  for (const kind of allKinds) {
    const proposedValue = proposed[kind];
    const existingValue = existingDocuments?.[kind];
    const finalValue =
      proposedValue !== undefined ? proposedValue : existingValue;
    if (typeof finalValue === "string") projected[kind] = finalValue;
  }

  // Use the JSON-serialized form as the proxy for transport size; this is
  // a conservative overestimate of just the raw bytes because JSON adds
  // structural overhead.
  const totalBytes = byteLength(JSON.stringify(projected));

  if (totalBytes > AGGREGATE_HARD_CAP) {
    throw new Error(
      `Aggregate documents size ${totalBytes} bytes exceeds hard cap ${AGGREGATE_HARD_CAP} bytes (~1.8 MB). Reduce one or more artifact contents before writing.`,
    );
  }
  if (totalBytes > AGGREGATE_SOFT_CAP) {
    logger.warn(
      `Aggregate documents size ${totalBytes} bytes exceeds soft cap ${AGGREGATE_SOFT_CAP} bytes (1 MB). Approaching the aggregate projection ceiling.`,
    );
  }
}
