/**
 * Completeness markers for the advisory resume projection.
 *
 * The resume projection is allowed to be absent. It is NOT allowed to be
 * absent silently: a consumer must be able to tell "nothing is blocked" from
 * "we could not determine what is blocked". Those two states were previously
 * indistinguishable, which is a large part of why a projection that never
 * resolved went unnoticed — per-change timeouts were swallowed by a bare
 * `catch {}` and surfaced in neither output nor logs.
 *
 * Marker shape follows Google AIP-157 (partial responses) and AIP-158
 * (explicit truncation signalling); this is an application contract.
 *
 * rq-statusCliWorkerFree01 (fixWorkerDependentResume) — AC6, DONT5
 */

import type { EnrichmentOutcome } from "./optional-enrichment";
import type { LiveResumeProjectionResult } from "./resume-projection-live";

export type ResumeProjectionCompleteness =
  | "complete"
  | "partial"
  | "unavailable";

export interface ResumeProjectionState {
  schema_version: 1;
  /** Whether the projection can be trusted as a full answer. */
  completeness: ResumeProjectionCompleteness;
  /** When this state was computed. */
  generated_at: string;
  /** Required whenever completeness is not "complete". Never blank. */
  reason?: string;
  /** Source timestamp of the underlying data, when known. */
  freshness?: string;
  /** Explicit truncation signal — truncation is never silent. */
  truncated?: boolean;
  truncated_count?: number;
}

/**
 * Fallback so `reason` is never empty when completeness is degraded. An
 * unexplained absence is the exact failure mode DONT5 forbids.
 */
const UNREPORTED_REASON =
  "resume projection unavailable for an unreported reason";

/** Map a bounded enrichment outcome onto an explicit, always-present state. */
export function buildResumeProjectionState(
  outcome: EnrichmentOutcome<LiveResumeProjectionResult>,
  now: Date,
): ResumeProjectionState {
  const base = {
    schema_version: 1 as const,
    generated_at: now.toISOString(),
  };

  // Budget expired, or the enrichment threw.
  if (!outcome.settled) {
    return {
      ...base,
      completeness: "unavailable",
      reason: outcome.reason || UNREPORTED_REASON,
    };
  }

  const result = outcome.value;

  if (!result.live || !result.resume_projection) {
    return {
      ...base,
      completeness: "unavailable",
      reason: result.error || UNREPORTED_REASON,
    };
  }

  if (result.truncated) {
    return {
      ...base,
      completeness: "partial",
      reason: `resume projection truncated at ${
        result.truncated_count ?? "an unreported number of"
      } records`,
      truncated: true,
      truncated_count: result.truncated_count,
      freshness: result.freshness,
    };
  }

  return {
    ...base,
    completeness: "complete",
    freshness: result.freshness,
  };
}
