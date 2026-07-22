import { describe, expect, it } from "vitest";

import {
  applySpecDeltaAddedToState,
  applySpecDeltaAmendedToState,
  applySpecDeltaModifiedToState,
  applySpecDeltaRemovedToState,
  applySpecDeltaRenamedToState,
  applySpecDeltaRetractedToState,
  createChangeWorkflowState,
} from "./change-state";
import {
  SpecDeltaAddedSignalPayloadSchema,
  SpecDeltaAmendedSignalPayloadSchema,
  SpecDeltaModifiedSignalPayloadSchema,
} from "../types";
import type {
  SpecDeltaAddedSignalPayload,
  SpecDeltaAmendedSignalPayload,
  SpecDeltaModifiedSignalPayload,
  SpecDeltaRemovedSignalPayload,
  SpecDeltaRenamedSignalPayload,
  SpecDeltaRetractedSignalPayload,
} from "../types";

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

function makeModifyDelta(deltaId = "dl-MOD11111", targetId = "rq-existing01") {
  return {
    id: deltaId,
    operation: "modify" as const,
    target_id: targetId,
    changes: { title: "Updated requirement" },
  };
}

function makeRemoveDelta(deltaId = "dl-RMV11111", targetId = "rq-existing01") {
  return {
    id: deltaId,
    operation: "remove" as const,
    target_id: targetId,
    reason: "obsolete",
  };
}

function makeRenameDelta(
  deltaId = "dl-RNM11111",
  targetId = "rq-existing01",
  newTitle = "Renamed requirement",
) {
  return {
    id: deltaId,
    operation: "rename" as const,
    target_id: targetId,
    new_title: newTitle,
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

function makeModifyPayload(
  overrides: Partial<SpecDeltaModifiedSignalPayload> = {},
): SpecDeltaModifiedSignalPayload {
  return {
    capability: "collection-dashboard",
    delta: makeModifyDelta(),
    modifiedAt: TIMESTAMP,
    modifiedBy: "agent",
    ...overrides,
  };
}

function makeAmendPayload(
  deltaId: string,
  delta: SpecDeltaAmendedSignalPayload["delta"],
  overrides: Partial<SpecDeltaAmendedSignalPayload> = {},
): SpecDeltaAmendedSignalPayload {
  return {
    capability: "collection-dashboard",
    deltaId,
    delta,
    amendedAt: TIMESTAMP,
    amendedBy: "agent",
    ...overrides,
  };
}

function makeRetractPayload(
  deltaId: string,
  overrides: Partial<SpecDeltaRetractedSignalPayload> = {},
): SpecDeltaRetractedSignalPayload {
  return {
    capability: "collection-dashboard",
    deltaId,
    retractedAt: TIMESTAMP,
    retractedBy: "agent",
    ...overrides,
  };
}

function makeRemovePayload(
  overrides: Partial<SpecDeltaRemovedSignalPayload> = {},
): SpecDeltaRemovedSignalPayload {
  return {
    capability: "collection-dashboard",
    delta: makeRemoveDelta(),
    removedAt: TIMESTAMP,
    removedBy: "agent",
    ...overrides,
  };
}

function makeRenamePayload(
  overrides: Partial<SpecDeltaRenamedSignalPayload> = {},
): SpecDeltaRenamedSignalPayload {
  return {
    capability: "collection-dashboard",
    delta: makeRenameDelta(),
    renamedAt: TIMESTAMP,
    renamedBy: "agent",
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

describe("SpecDeltaModifiedSignalPayloadSchema", () => {
  it("accepts a strict non-empty modify payload", () => {
    expect(
      SpecDeltaModifiedSignalPayloadSchema.safeParse(makeModifyPayload())
        .success,
    ).toBe(true);
  });

  it.each([
    { changes: {} },
    { changes: { unknown: "nope" } },
    {
      changes: {
        scenarios: [
          {
            id: "rq-other01.1",
            title: "Wrong parent",
            given: ["a requirement exists"],
            when: "a modification is recorded",
            then: ["validation fails"],
          },
        ],
      },
    },
  ])("rejects invalid modify changes %#", (delta) => {
    expect(
      SpecDeltaModifiedSignalPayloadSchema.safeParse({
        ...makeModifyPayload(),
        delta: { ...makeModifyDelta(), ...delta },
      }).success,
    ).toBe(false);
  });
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

describe("applySpecDeltaModifiedToState", () => {
  it("appends a validated modify delta and records its timestamp", () => {
    const state = makeState();
    const payload = makeModifyPayload();

    const next = applySpecDeltaModifiedToState(state, payload);

    expect(next.deltas["collection-dashboard"]).toEqual([payload.delta]);
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("rejects duplicate ids and conflicting targets without mutating state", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(state, makeModifyPayload());
    const before = structuredClone(state.deltas);

    expect(() =>
      applySpecDeltaModifiedToState(
        state,
        makeModifyPayload({
          delta: makeModifyDelta("dl-OTHER111", "rq-existing01"),
        }),
      ),
    ).toThrow(/Conflicting/);
    expect(state.deltas).toEqual(before);

    expect(() =>
      applySpecDeltaModifiedToState(state, makeModifyPayload()),
    ).toThrow(/Duplicate/);
    expect(state.deltas).toEqual(before);
  });
});

describe("SpecDeltaAmendedSignalPayloadSchema", () => {
  it("accepts a valid amend payload", () => {
    expect(
      SpecDeltaAmendedSignalPayloadSchema.safeParse(
        makeAmendPayload("dl-MOD11111", makeModifyDelta()),
      ).success,
    ).toBe(true);
  });

  it("accepts an amend payload whose delta id differs from deltaId (reducer enforces match)", () => {
    expect(
      SpecDeltaAmendedSignalPayloadSchema.safeParse(
        makeAmendPayload("dl-OTHER111", makeModifyDelta()),
      ).success,
    ).toBe(true);
  });
});

describe("applySpecDeltaAmendedToState", () => {
  it("replaces a modify delta in place and preserves id and position", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(state, makeModifyPayload());
    const replacement = makeModifyDelta("dl-MOD11111", "rq-existing01");
    replacement.changes = { title: "Amended title" };

    const next = applySpecDeltaAmendedToState(
      state,
      makeAmendPayload("dl-MOD11111", replacement),
    );

    expect(next.deltas["collection-dashboard"]).toHaveLength(1);
    expect(next.deltas["collection-dashboard"]?.[0]).toEqual(replacement);
    expect(next.deltas["collection-dashboard"]?.[0]?.id).toBe("dl-MOD11111");
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("allows a second amend of the same delta", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(state, makeModifyPayload());
    const first = makeModifyDelta("dl-MOD11111", "rq-existing01");
    first.changes = { title: "First amendment" };
    applySpecDeltaAmendedToState(state, makeAmendPayload("dl-MOD11111", first));

    const second = makeModifyDelta("dl-MOD11111", "rq-existing01");
    second.changes = { title: "Second amendment" };
    const next = applySpecDeltaAmendedToState(
      state,
      makeAmendPayload("dl-MOD11111", second),
    );

    expect(next.deltas["collection-dashboard"]).toHaveLength(1);
    expect(next.deltas["collection-dashboard"]?.[0]?.id).toBe("dl-MOD11111");
    expect(
      (
        next.deltas["collection-dashboard"]?.[0] as {
          changes: { title: string };
        }
      ).changes.title,
    ).toBe("Second amendment");
  });

  it("throws a typed not-found error for an unknown delta id", () => {
    const state = makeState();
    expect(() =>
      applySpecDeltaAmendedToState(
        state,
        makeAmendPayload("dl-MISSING111", makeModifyDelta()),
      ),
    ).toThrow(
      /spec delta dl-MISSING111 not found under capability collection-dashboard/,
    );
  });

  it("throws a typed id-mismatch error without mutating state", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(state, makeModifyPayload());
    const before = structuredClone(state.deltas);

    expect(() =>
      applySpecDeltaAmendedToState(
        state,
        makeAmendPayload("dl-MOD11111", makeModifyDelta("dl-OTHER111")),
      ),
    ).toThrow(/amend id mismatch/);
    expect(state.deltas).toEqual(before);
  });

  it("rejects a conflicting modify replacement excluding the amended entry", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(
      state,
      makeModifyPayload({
        delta: makeModifyDelta("dl-MOD11111", "rq-existing01"),
      }),
    );
    applySpecDeltaModifiedToState(
      state,
      makeModifyPayload({
        delta: makeModifyDelta("dl-OTHER111", "rq-existing02"),
      }),
    );
    const before = structuredClone(state.deltas);

    const replacement = makeModifyDelta("dl-MOD11111", "rq-existing02");
    expect(() =>
      applySpecDeltaAmendedToState(
        state,
        makeAmendPayload("dl-MOD11111", replacement),
      ),
    ).toThrow(/Conflicting/);
    expect(state.deltas).toEqual(before);
  });
});

describe("applySpecDeltaRetractedToState", () => {
  it("removes an existing delta by id", () => {
    const state = makeState();
    applySpecDeltaModifiedToState(state, makeModifyPayload());

    const next = applySpecDeltaRetractedToState(
      state,
      makeRetractPayload("dl-MOD11111"),
    );

    expect(next.deltas["collection-dashboard"]).toHaveLength(0);
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("throws a typed not-found error for an unknown delta id", () => {
    const state = makeState();
    expect(() =>
      applySpecDeltaRetractedToState(
        state,
        makeRetractPayload("dl-MISSING111"),
      ),
    ).toThrow(
      /spec delta dl-MISSING111 not found under capability collection-dashboard/,
    );
  });
});

describe("applySpecDeltaRemovedToState", () => {
  it("appends a validated remove delta and records its timestamp", () => {
    const state = makeState();
    const payload = makeRemovePayload();

    const next = applySpecDeltaRemovedToState(state, payload);

    expect(next.deltas["collection-dashboard"]).toEqual([payload.delta]);
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("rejects duplicate ids and conflicting remove targets", () => {
    const state = makeState();
    applySpecDeltaRemovedToState(state, makeRemovePayload());
    const before = structuredClone(state.deltas);

    expect(() =>
      applySpecDeltaRemovedToState(
        state,
        makeRemovePayload({
          delta: makeRemoveDelta("dl-RMV11111", "rq-existing02"),
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(state.deltas).toEqual(before);

    expect(() =>
      applySpecDeltaRemovedToState(
        state,
        makeRemovePayload({
          delta: makeRemoveDelta("dl-OTHER111", "rq-existing01"),
        }),
      ),
    ).toThrow(/Conflicting/);
    expect(state.deltas).toEqual(before);
  });
});

describe("applySpecDeltaRenamedToState", () => {
  it("appends a validated rename delta and records its timestamp", () => {
    const state = makeState();
    const payload = makeRenamePayload();

    const next = applySpecDeltaRenamedToState(state, payload);

    expect(next.deltas["collection-dashboard"]).toEqual([payload.delta]);
    expect(next.lastSignalAt).toBe(TIMESTAMP);
  });

  it("rejects duplicate ids but permits multiple rename targets", () => {
    const state = makeState();
    applySpecDeltaRenamedToState(state, makeRenamePayload());
    const before = structuredClone(state.deltas);

    expect(() =>
      applySpecDeltaRenamedToState(state, makeRenamePayload()),
    ).toThrow(/Duplicate/);
    expect(state.deltas).toEqual(before);

    const second = makeRenamePayload({
      delta: makeRenameDelta("dl-RNM22222", "rq-existing02", "Other rename"),
    });
    const next = applySpecDeltaRenamedToState(state, second);
    expect(next.deltas["collection-dashboard"]).toHaveLength(2);
  });
});
