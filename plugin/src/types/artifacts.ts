/**
 * Change Artifact Types — canonical source of truth
 *
 * Single canonical definition for `ArtifactKind` and `ArtifactPayload`.
 * Replaces previous local definitions in `temporal/contracts.ts`,
 * `temporal/activities.ts`, and the gate-subset in `types/gates.ts`.
 *
 * Naming standard: **camelCase at type/payload/signal layers**.
 * Filesystem kebab-case (problem-statement.md, executive-summary.md)
 * lives only inside the `ARTIFACT_FILENAME` map below.
 *
 * Compile-time invariant: `keyof ArtifactPayload === ArtifactKind`.
 * See `types/artifacts.test.ts` for the structural test.
 */

import { z } from "zod";

// =============================================================================
// Canonical ArtifactKind
// =============================================================================

/**
 * The six change artifact kinds. Order is significant — it defines the
 * deterministic signal-fan-out order in `store-temporal/changes.ts`
 * (`ARTIFACT_SIGNAL_ORDER`) so workflow histories diff cleanly across runs.
 */
export const ArtifactKindSchema = z.enum([
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
  "acceptance",
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

/** Canonical disk filename for each artifact kind at filesystem boundaries. */
export const ARTIFACT_FILENAME: Record<ArtifactKind, string> = {
  proposal: "proposal.md",
  problemStatement: "problem-statement.md",
  agreement: "agreement.md",
  design: "design.md",
  executiveSummary: "executive-summary.md",
  acceptance: "acceptance.md",
};

// =============================================================================
// ArtifactPayload — typed shape carried by Store.changes.create() and
// Store.changes.updateArtifacts(). Replaces the positional 7-arg content
// parameter API. Every defined field flows through one content-bearing
// Temporal signal; undefined fields are no-ops.
// =============================================================================

export const ArtifactPayloadSchema = z.object({
  proposal: z.string().optional(),
  problemStatement: z.string().optional(),
  agreement: z.string().optional(),
  design: z.string().optional(),
  executiveSummary: z.string().optional(),
  acceptance: z.string().optional(),
});

export type ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>;

// =============================================================================
// Compile-time invariant lock
//
// Enforces `keyof ArtifactPayload === ArtifactKind`. If either side drifts
// (e.g. a new ArtifactKind is added but ArtifactPayload is not extended),
// the `_check` assignment fails to compile.
// =============================================================================

type _PayloadKeysMatchArtifactKind = keyof ArtifactPayload extends ArtifactKind
  ? ArtifactKind extends keyof ArtifactPayload
    ? true
    : never
  : never;

const _check: _PayloadKeysMatchArtifactKind = true;
void _check;

// =============================================================================
// Size caps
//
// Validated against Temporal limits (per-payload 2 MB, history 50 MB) by
// adv-researcher report `removePositionalArtifactApi|change:researcher:
// temporal-signal-payload-history-limits|adv-researcher|1`.
//
// Per-artifact caps protect individual signal payload size.
// Aggregate caps protect the `continueAsNew` seed, which is also subject to
// the 2 MB payload ceiling.
// =============================================================================

/** Warn when a single artifact content exceeds this size. */
export const ARTIFACT_SOFT_CAP = 64 * 1024; // 64 KB

/**
 * Reject (signal-handler state-mutation rejection per KD-8) when a single
 * artifact content exceeds this size. Well below the 2 MB per-payload cap.
 */
export const ARTIFACT_HARD_CAP = 256 * 1024; // 256 KB

/** Warn when total state.documents size approaches the continueAsNew ceiling. */
export const AGGREGATE_SOFT_CAP = 1024 * 1024; // 1 MB

/**
 * Reject when aggregate state.documents would exceed this size. Leaves
 * comfortable headroom under the 2 MB continueAsNew seed payload cap.
 */
export const AGGREGATE_HARD_CAP = Math.floor(1.8 * 1024 * 1024); // ~1.8 MB
