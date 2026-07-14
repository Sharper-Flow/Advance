import { describe, expect, it } from "vitest";

import {
  applySpecDeltaAddedToState,
  createChangeWorkflowState,
} from "./change-state";
import { SpecDeltaAddedSignalPayloadSchema } from "../types";
import type { SpecDeltaAddedSignalPayload } from "../types";

const TIMESTAMP = "2026-07-14T00:00:00.000Z";

function makeAddDelta(deltaId: string, requirementId: string, title: string) {
  return {
    id: deltaId,
    operation: "add" as const,
    requirement: {
      id: requirementId,
      title,
      body: `${title} body`,
      priority: "must" as const,
      scenarios: [
        {
          id: `${requirementId}.1`,
          title: `${title} scenario`,
          given: ["a draft change exists"],
          when: "the delta is recorded",
          then: ["the delta persists under the capability"],
        },
      ],
    },
  };
}

function makePayload(
  overrides: Partial<SpecDeltaAddedSignalPayload> = {},
): SpecDeltaAddedSignalPayload {
  return {
    capability: "collection-dashboard",
    delta: makeAddDelta("dl-AAA11111", "rq-specDelta01", "Spec delta writer"),
    addedAt: TIMESTAMP,
    addedBy: "agent",
    ...overrides,
  };
}

function makeState() {
  return createChangeWorkflowState({
    changeId: "spec-delta-test",
    title: "Spec delta test",
    createdAt: TIMESTAMP,
  });
}

describe("SpecDeltaAddedSignalPayloadSchema", () => {
  it("accepts a valid add-only payload for a new capability key", () => {
    const result = SpecDeltaAddedSignalPayloadSchema.safeParse(makePayload());
    expect(result.success).toBe(true);
  });

  it("accepts a payload without optional audit metadata", () => {
    const { addedBy: _addedBy, ...rest } = makePayload();
    const result = SpecDeltaAddedSignalPayloadSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it.each(["modify", "remove", "rename"] as const)(
    "rejects non-add delta operation %s",
    (operation) => {
      const payload = {
        ...makePayload(),
        delta: {
          id: "dl-BBB22222",
          operation,
          target_id: "rq-existing01",
          ...(operation === "modify" ? { changes: { title: "x" } } : {}),
          ...(operation === "remove" ? { reason: "obsolete" } : {}),
          ...(operation === "rename" ? { new_title: "renamed" } : {}),
        },
      };
      const result = SpecDeltaAddedSignalPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    },
  );

  it.each(["Bad_Caps", "bad caps", "", "-leading-dash", "trailing-", "a--b"])(
    "rejects malformed capability key %j",
    (capability) => {
      const result = SpecDeltaAddedSignalPayloadSchema.safeParse(
        makePayload({ capability }),
      );
      expect(result.success).toBe(false);
    },
  );
});

describe("applySpecDeltaAddedToState", () => {
  it("appends an add delta under a new capability key", () => {
    const state = makeState();
    const payload = makePayload();

    const next = applySpecDeltaAddedToState(state, payload);

    expect(next.deltas["collection-dashboard"]).toHaveLength(1);
    expect(next.deltas["collection-dashboard"]?.[0]).toEqual(payload.delta);
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("appends a second delta to an existing capability preserving order", () => {
    const state = makeState();
    applySpecDeltaAddedToState(state, makePayload());

    const second = makePayload({
      delta: makeAddDelta("dl-CCC33333", "rq-specDelta02", "Second law"),
    });
    const next = applySpecDeltaAddedToState(state, second);

    const ids = next.deltas["collection-dashboard"]?.map((d) => d.id);
    expect(ids).toEqual(["dl-AAA11111", "dl-CCC33333"]);
  });

  it("rejects a duplicate delta id without mutating state", () => {
    const state = makeState();
    applySpecDeltaAddedToState(state, makePayload());
    const before = JSON.parse(JSON.stringify(state.deltas)) as unknown;

    expect(() => applySpecDeltaAddedToState(state, makePayload())).toThrow(
      /dl-AAA11111/,
    );
    expect(state.deltas).toEqual(before);
  });

  it("rejects a duplicate requirement id within the same change without mutating state", () => {
    const state = makeState();
    applySpecDeltaAddedToState(state, makePayload());
    const before = JSON.parse(JSON.stringify(state.deltas)) as unknown;

    const duplicateRequirement = makePayload({
      capability: "other-capability",
      delta: makeAddDelta("dl-DDD44444", "rq-specDelta01", "Duplicate law"),
    });
    expect(() =>
      applySpecDeltaAddedToState(state, duplicateRequirement),
    ).toThrow(/rq-specDelta01/);
    expect(state.deltas).toEqual(before);
  });

  it("rejects a malformed capability key without mutating state", () => {
    const state = makeState();
    const before = JSON.parse(JSON.stringify(state.deltas)) as unknown;

    expect(() =>
      applySpecDeltaAddedToState(state, makePayload({ capability: "Bad Key" })),
    ).toThrow(/capability/i);
    expect(state.deltas).toEqual(before);
  });

  it("does not disturb deltas under other capabilities", () => {
    const state = makeState();
    applySpecDeltaAddedToState(state, makePayload());
    applySpecDeltaAddedToState(
      state,
      makePayload({
        capability: "advance-workflow",
        delta: makeAddDelta("dl-EEE55555", "rq-specDelta03", "Third law"),
      }),
    );

    expect(state.deltas["collection-dashboard"]).toHaveLength(1);
    expect(state.deltas["advance-workflow"]).toHaveLength(1);
  });

  it("is deterministic: identical inputs produce identical state", () => {
    const first = makeState();
    const second = makeState();
    const payload = makePayload();

    applySpecDeltaAddedToState(first, payload);
    applySpecDeltaAddedToState(second, payload);

    expect(first.deltas).toEqual(second.deltas);
    expect(first.lastSignalAt).toBe(second.lastSignalAt);
  });
});
