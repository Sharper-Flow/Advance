import { describe, expect, test } from "vitest";
import { ChangeSchema, WorkerBundleProvenanceSchema } from "./changes";

/**
 * `workerBundleProvenance` is the receipt recorded by
 * `workerBundleProvenanceRecordedSignal` and read by the release-readiness
 * evaluator. It must be a declared, typed field on `Change` — not an
 * undeclared passenger riding `.passthrough()` — because
 * `TEMPORAL_OWNED_PROJECTION_FIELDS` is constrained to `keyof Change` and
 * cannot list a field the type does not know about.
 *
 * Shape mirrors the stored declaration on `ChangeWorkflowState`
 * (`temporal/contracts.ts`), which uses plain `string` / `number`. Format
 * validation of `recorded_at` happens at the signal boundary
 * (`types/signals.ts` uses `IsoTimestampSchema`); duplicating it here would
 * risk rejecting state the workflow considers valid.
 */

const validProvenance = {
  source_sha: "b170f70b254c26e89126f3ce6c604e7bc9547836",
  build_run_id: "tr_msdg9prb_c5993ed3",
  replay_run_id: "tr_msdgbi6x_4cf7b1b1",
  recorded_at: "2026-08-03T16:37:32.551Z",
};

const minimalChange = {
  id: "fixWorkerBundleProvenanceGate",
  title: "Fix worker bundle provenance gate",
  status: "draft",
  created_at: "2026-08-03T19:33:39.970Z",
};

describe("WorkerBundleProvenanceSchema", () => {
  test("accepts a complete receipt", () => {
    const parsed = WorkerBundleProvenanceSchema.parse(validProvenance);
    expect(parsed.source_sha).toBe(validProvenance.source_sha);
    expect(parsed.build_run_id).toBe(validProvenance.build_run_id);
    expect(parsed.replay_run_id).toBe(validProvenance.replay_run_id);
    expect(parsed.recorded_at).toBe(validProvenance.recorded_at);
  });

  test("accepts the optional worker_manifest_generation", () => {
    const parsed = WorkerBundleProvenanceSchema.parse({
      ...validProvenance,
      worker_manifest_generation: 12,
    });
    expect(parsed.worker_manifest_generation).toBe(12);
  });

  test("rejects a receipt missing source_sha", () => {
    const { source_sha: _omitted, ...withoutSha } = validProvenance;
    expect(() => WorkerBundleProvenanceSchema.parse(withoutSha)).toThrow();
  });

  test("rejects a receipt missing run ids", () => {
    const { build_run_id: _b, replay_run_id: _r, ...withoutRuns } =
      validProvenance;
    expect(() => WorkerBundleProvenanceSchema.parse(withoutRuns)).toThrow();
  });
});

describe("ChangeSchema workerBundleProvenance field", () => {
  test("is a declared optional field that survives a parse round trip", () => {
    const parsed = ChangeSchema.parse({
      ...minimalChange,
      workerBundleProvenance: validProvenance,
    });
    expect(parsed.workerBundleProvenance).toEqual(validProvenance);
  });

  test("remains optional for changes that never recorded provenance", () => {
    const parsed = ChangeSchema.parse(minimalChange);
    expect(parsed.workerBundleProvenance).toBeUndefined();
  });

  test("is typed, not merely passed through", () => {
    // `.passthrough()` would preserve an arbitrarily-shaped value. A declared
    // field rejects a malformed receipt, which is what makes the field usable
    // as release evidence rather than opaque cargo.
    expect(() =>
      ChangeSchema.parse({
        ...minimalChange,
        workerBundleProvenance: { source_sha: 12345 },
      }),
    ).toThrow();
  });
});
