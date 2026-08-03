import { describe, expect, it } from "vitest";
import { projectTemporalStateOntoLatest } from "./shared";
import { SAMPLE_CHANGE } from "../../__tests__/setup";
import type { Change } from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";

/**
 * Regression coverage for the projection boundary that made
 * `worker_bundle_impact: "required"` changes permanently unreleasable.
 *
 * `adv_worker_bundle_provenance_record` fires a signal, the workflow applies
 * it, and the workflow query returns it — but the archive evaluates a `Change`
 * loaded from the DISK PROJECTION. `projectTemporalStateOntoLatest` rebuilds
 * that projection from `mapTemporalChangeStateToChange` filtered through
 * `TEMPORAL_OWNED_PROJECTION_FIELDS`. While either layer omitted the field, a
 * recorded receipt was silently discarded before reaching disk and the release
 * gate blocked forever.
 *
 * Both fields are covered deliberately. `worker_bundle_impact` only ever
 * reached the archive because its setter direct-saves before signalling, so it
 * rode along on `latest`; it was equally absent from the projection and would
 * have been lost by any future signal-only writer.
 */

const PROVENANCE = {
  source_sha: "b170f70b254c26e89126f3ce6c604e7bc9547836",
  build_run_id: "tr_msdg9prb_c5993ed3",
  replay_run_id: "tr_msdgbi6x_4cf7b1b1",
  recorded_at: "2026-08-03T16:37:32.551Z",
};

const IMPACT = {
  kind: "required" as const,
  rationale: "Touches workflow-bundle reachable code.",
  confirmed_at: "2026-08-03T19:50:39.408Z",
};

function makeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    ...(SAMPLE_CHANGE as unknown as ChangeWorkflowState),
    ...overrides,
  } as ChangeWorkflowState;
}

function makeLatest(overrides: Partial<Change> = {}): Change {
  return { ...(SAMPLE_CHANGE as Change), ...overrides };
}

describe("worker-bundle fields survive the Temporal disk projection", () => {
  it("carries workerBundleProvenance from workflow state onto the projection", () => {
    const projected = projectTemporalStateOntoLatest(
      makeLatest({ workerBundleProvenance: undefined }),
      makeState({ workerBundleProvenance: PROVENANCE }),
    );

    expect(projected.workerBundleProvenance).toEqual(PROVENANCE);
  });

  it("carries worker_bundle_impact from workflow state onto the projection", () => {
    const projected = projectTemporalStateOntoLatest(
      makeLatest({ worker_bundle_impact: undefined }),
      makeState({ worker_bundle_impact: IMPACT }),
    );

    expect(projected.worker_bundle_impact).toEqual(IMPACT);
  });

  it("lets workflow state overwrite a stale provenance receipt on disk", () => {
    // The workflow is authoritative for these fields once projected. A stale
    // disk value must not survive a newer recorded receipt.
    const stale = { ...PROVENANCE, source_sha: "0000000000000000" };

    const projected = projectTemporalStateOntoLatest(
      makeLatest({ workerBundleProvenance: stale }),
      makeState({ workerBundleProvenance: PROVENANCE }),
    );

    expect(projected.workerBundleProvenance?.source_sha).toBe(
      PROVENANCE.source_sha,
    );
  });

  it("projects undefined when the workflow has recorded no receipt", () => {
    // Guards against the inverse failure: a projection that silently preserves
    // a disk value the workflow no longer holds would fabricate release
    // evidence.
    const projected = projectTemporalStateOntoLatest(
      makeLatest({ workerBundleProvenance: PROVENANCE }),
      makeState({ workerBundleProvenance: undefined }),
    );

    expect(projected.workerBundleProvenance).toBeUndefined();
  });
});
