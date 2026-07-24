/**
 * Idempotent delta application (rq-releaseProjectionDurability01):
 * an "add" delta whose requirement already exists with identical content is
 * treated as already-applied, not a failure. A content-divergent duplicate
 * still fails.
 */
import { describe, expect, it } from "vitest";
import { applyDelta } from "./delta";
import type { Spec, Delta, Requirement } from "../types";

function specWith(requirements: Requirement[]): Spec {
  return {
    name: "cap-a",
    title: "Capability A",
    purpose: "p",
    version: "1.0.0",
    updated_at: "2026-01-01T00:00:00Z",
    requirements,
  };
}

function addDelta(
  requirement: Requirement,
): Extract<Delta, { operation: "add" }> {
  return { id: `dl-${requirement.id}`, operation: "add", requirement };
}

function req(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "rq-X",
    title: "Title X",
    body: "Body X",
    priority: "must",
    tags: ["worker", "recovery"],
    scenarios: [
      {
        id: "rq-X.1",
        title: "scenario one",
        given: ["a precondition"],
        when: "something happens",
        then: ["an outcome"],
      },
    ],
    ...overrides,
  };
}

describe("applyDelta add idempotency (rq-releaseProjectionDurability01)", () => {
  it("accepts a re-apply of an identical requirement (idempotent success, no duplication)", () => {
    const requirement = req();
    const spec = specWith([requirement]);
    const result = applyDelta(spec, addDelta(requirement));
    expect(result.success).toBe(true);
    // The requirement is not duplicated.
    expect(spec.requirements.filter((r) => r.id === "rq-X")).toHaveLength(1);
  });

  it("accepts an idempotent re-apply even when scenario/tag order differs", () => {
    const existing = req();
    const reordered: Requirement = {
      ...req(),
      tags: ["recovery", "worker"], // different order
      scenarios: [{ ...existing.scenarios![0] }].reverse(),
    };
    const spec = specWith([existing]);
    const result = applyDelta(spec, addDelta(reordered));
    expect(result.success).toBe(true);
    expect(spec.requirements.filter((r) => r.id === "rq-X")).toHaveLength(1);
  });

  it("fails on a content-divergent duplicate (same id, different body)", () => {
    const spec = specWith([req({ body: "original body" })]);
    const result = applyDelta(spec, addDelta(req({ body: "divergent body" })));
    expect(result.success).toBe(false);
    expect(result.operation).toBe("add");
  });

  it("fails on a content-divergent duplicate (same id, different title)", () => {
    const spec = specWith([req({ title: "Original" })]);
    const result = applyDelta(spec, addDelta(req({ title: "Different" })));
    expect(result.success).toBe(false);
  });

  it("ignores meta provenance when comparing (merged_from differs but content matches)", () => {
    const spec = specWith([req({ meta: { merged_from: "change-A" } })]);
    const result = applyDelta(
      spec,
      addDelta(req({ meta: { merged_from: "change-B" } })),
    );
    expect(result.success).toBe(true);
  });
});
