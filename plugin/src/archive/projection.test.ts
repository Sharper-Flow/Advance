import { describe, expect, it } from "vitest";
import type { Delta, Requirement, Spec } from "../types";
import {
  SpecProjectionManifestSchema,
  canonicalSha256,
  planSpecProjection,
} from "./projection";

const requirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  id: "rq-example01",
  title: "Example",
  body: "Example body",
  priority: "must",
  scenarios: [
    {
      id: "rq-example01.1",
      title: "Example scenario",
      given: ["A baseline"],
      when: "The behavior runs",
      then: ["The result is stable"],
    },
  ],
  ...overrides,
});

const spec = (requirements: Requirement[] = []): Spec => ({
  name: "example",
  title: "Example",
  purpose: "Example capability",
  version: "1.2.3",
  updated_at: "2026-01-01T00:00:00.000Z",
  requirements,
});

describe("archive projection planning", () => {
  it("classifies identical adds without changing bytes or version", () => {
    const delta: Delta = {
      id: "dl-add",
      operation: "add",
      requirement: requirement(),
    };

    const input = spec([requirement()]);
    const result = planSpecProjection({
      spec: input,
      deltas: [delta],
      authority: { kind: "current" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(result.status).toBe("safe");
    expect(result.dispositions).toEqual([
      expect.objectContaining({ deltaId: "dl-add", status: "identical" }),
    ]);
    expect(result.targetSpec).toEqual(input);
    expect(result.targetSpec?.version).toBe("1.2.3");
  });

  it("preserves valid spec and requirement extension fields", () => {
    const input: Spec = {
      ...spec([
        requirement({
          extension_policy: { mode: "preserve" },
        }),
      ]),
      delegation_matrix: [{ step: "apply", lane: "engineer" }],
    };
    const result = planSpecProjection({
      spec: input,
      deltas: [
        {
          id: "dl-add-extension",
          operation: "add",
          requirement: requirement({ id: "rq-example02" }),
        },
      ],
      authority: { kind: "current" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(result.status).toBe("safe");
    expect(result.targetSpec?.delegation_matrix).toEqual([
      { step: "apply", lane: "engineer" },
    ]);
    expect(result.targetSpec?.requirements[0].extension_policy).toEqual({
      mode: "preserve",
    });
  });

  it("fails closed when a same-id add has different content", () => {
    const result = planSpecProjection({
      spec: spec([requirement({ body: "Current law" })]),
      deltas: [
        {
          id: "dl-add",
          operation: "add",
          requirement: requirement({ body: "Archived intent" }),
        },
      ],
      authority: { kind: "historical" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(result.status).toBe("blocked");
    expect(result.dispositions[0]).toEqual(
      expect.objectContaining({ status: "conflicting" }),
    );
    expect(result.targetSpec).toBeUndefined();
  });

  it("requires historical preimage proof before applying a modify", () => {
    const delta: Delta = {
      id: "dl-modify",
      operation: "modify",
      target_id: "rq-example01",
      changes: { body: "Desired body" },
    };

    const unverified = planSpecProjection({
      spec: spec([requirement({ body: "Old body" })]),
      deltas: [delta],
      authority: { kind: "historical" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(unverified.dispositions[0]).toEqual(
      expect.objectContaining({ status: "unverified" }),
    );

    const provenDelta: Delta = {
      ...delta,
      precondition: {
        schema_version: 1,
        target_requirement_sha256: canonicalSha256(
          requirement({ body: "Old body" }),
        ),
      },
    };
    const proven = planSpecProjection({
      spec: spec([requirement({ body: "Old body" })]),
      deltas: [provenDelta],
      authority: { kind: "historical" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(proven.status).toBe("safe");
    expect(proven.dispositions[0]).toEqual(
      expect.objectContaining({ status: "missing" }),
    );
    expect(proven.targetSpec?.requirements[0].body).toBe("Desired body");
    expect(proven.targetSpec?.version).toBe("1.2.4");
  });

  it("is a fixed point after applying a safe mixed plan", () => {
    const deltas: Delta[] = [
      {
        id: "dl-modify",
        operation: "modify",
        target_id: "rq-example01",
        changes: { body: "Desired body" },
      },
      {
        id: "dl-add",
        operation: "add",
        requirement: requirement({ id: "rq-added01", title: "Added" }),
      },
    ];

    const first = planSpecProjection({
      spec: spec([requirement()]),
      deltas,
      authority: { kind: "current" },
      projectedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(first.status).toBe("safe");
    expect(first.targetSpec?.version).toBe("1.3.0");

    const second = planSpecProjection({
      spec: first.targetSpec!,
      deltas,
      authority: { kind: "historical" },
      projectedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(second.dispositions.every((row) => row.status === "identical")).toBe(
      true,
    );
    expect(second.targetSpec).toEqual(first.targetSpec);
  });

  it("rejects unknown manifest fields and malformed digests", () => {
    const base = {
      schema_version: 1,
      change_id: "example",
      delta_set_sha256: "a".repeat(64),
      capabilities: [],
    };

    expect(
      SpecProjectionManifestSchema.safeParse({ ...base, unexpected: true })
        .success,
    ).toBe(false);
    expect(
      SpecProjectionManifestSchema.safeParse({
        ...base,
        delta_set_sha256: "not-a-digest",
      }).success,
    ).toBe(false);
  });
});
