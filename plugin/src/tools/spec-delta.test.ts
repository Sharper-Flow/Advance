/**
 * adv_delta_add — append-only spec-delta writer tool tests.
 *
 * TDD RED → GREEN for the addSpecDeltaWriter change (roadmap #64).
 * Mirrors adv_wisdom_add writer tests plus the stronger target_path
 * confirmation and recovery contract from existing change-mutating tools
 * (adv_contract_mint and other retained change mutations).
 *
 * Acceptance criteria exercised:
 * - AC1: valid existing/new capability + add delta + scenario persists under
 *   capability key.
 * - AC2: malformed capability / malformed requirement / duplicate delta id /
 *   duplicate requirement id refuse with typed error and no state mutation.
 * - AC4: target_path mutations require explicit target confirmation.
 * - AC5: poisoned-history recovery either follows audited semantics or
 *   refuses without modifying state (this tool refuses disk workarounds).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const specDeltasAdd = vi.fn();
  const specDeltasModify = vi.fn();
  const specDeltasAmend = vi.fn();
  const specDeltasRetract = vi.fn();
  const specDeltasRemove = vi.fn();
  const specDeltasRename = vi.fn();
  return {
    specDeltasAdd,
    specDeltasModify,
    specDeltasAmend,
    specDeltasRetract,
    specDeltasRemove,
    specDeltasRename,
  };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(async () => "proj123"),
  };
});

import { specDeltaTools } from "./spec-delta";
import type {
  Delta,
  DeltaAdd,
  DeltaModify,
  DeltaRemove,
  DeltaRename,
} from "../types";
import type { Store } from "../storage/store-types";

function makeValidDelta(overrides: Partial<DeltaAdd> = {}): DeltaAdd {
  return {
    id: "dl-AAA11111",
    operation: "add",
    requirement: {
      id: "rq-specDelta01",
      title: "Spec delta writer",
      body: "Record append-only spec deltas through the supported tool boundary.",
      priority: "must",
      scenarios: [
        {
          id: "rq-specDelta01.1",
          title: "Valid add delta persists",
          given: ["a draft change exists"],
          when: "adv_delta_add is called with a valid add delta",
          then: ["the delta is appended under the capability key"],
        },
      ],
    },
    ...overrides,
  };
}

function makeValidModifyDelta(
  overrides: Partial<DeltaModify> = {},
): DeltaModify {
  return {
    id: "dl-MOD11111",
    operation: "modify",
    target_id: "rq-existing01",
    changes: { title: "Updated requirement" },
    ...overrides,
  };
}

function makeStore(overrides: Record<string, unknown> = {}): Store {
  return {
    paths: { root: "/repo", changes: "/repo/.adv/changes" } as Store["paths"],
    productContext: undefined,
    specDeltas: {
      add: mocks.specDeltasAdd,
      modify: mocks.specDeltasModify,
      amend: mocks.specDeltasAmend,
      retract: mocks.specDeltasRetract,
      remove: mocks.specDeltasRemove,
      rename: mocks.specDeltasRename,
    },
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          id: "addFeature",
          title: "Add feature",
          status: "draft",
          deltas: {},
        },
      })),
    },
    specs: {
      get: vi.fn(async () => ({ success: true, data: null })),
    },
    ...overrides,
  } as unknown as Store;
}

function parse(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}

describe("adv_delta_add — schema + happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasAdd.mockImplementation(
      async (_changeId: string, _capability: string, delta: DeltaAdd) => delta,
    );
  });

  it("records a valid add-only delta under an existing capability and returns a typed readback", async () => {
    const store = makeStore();
    const delta = makeValidDelta();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta,
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe("addFeature");
    expect(parsed.capability).toBe("test-capability");
    expect((parsed.delta as DeltaAdd).id).toBe("dl-AAA11111");
    expect((parsed.delta as DeltaAdd).operation).toBe("add");
    expect(mocks.specDeltasAdd).toHaveBeenCalledTimes(1);
    const callArgs = mocks.specDeltasAdd.mock.calls[0];
    expect(callArgs[0]).toBe("addFeature");
    expect(callArgs[1]).toBe("test-capability");
    expect(callArgs[2]).toEqual(delta);
  });

  it("accepts a valid new kebab-case capability slug not present in existing specs", async () => {
    const store = makeStore();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "collection-dashboard",
        delta: makeValidDelta({ id: "dl-NEWCAP01" }),
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.capability).toBe("collection-dashboard");
    expect(mocks.specDeltasAdd).toHaveBeenCalledTimes(1);
  });

  it("records optional addedBy audit identity when provided", async () => {
    const store = makeStore();
    await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
        addedBy: "adv-engineer",
      },
      store,
    );

    const callArgs = mocks.specDeltasAdd.mock.calls[0];
    expect(callArgs[3]).toEqual({ addedBy: "adv-engineer" });
  });

  it("refuses success when the store returns a structurally mismatched add receipt", async () => {
    const requested = makeValidDelta();
    mocks.specDeltasAdd.mockResolvedValueOnce({
      ...requested,
      requirement: {
        ...requested.requirement,
        body: "Mismatched persisted receipt",
      },
    });

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: requested,
      },
      makeStore(),
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/receipt|payload|mismatch|exact/i);
  });
});

describe("adv_delta_modify — schema + target validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasModify.mockImplementation(
      async (_changeId: string, _capability: string, delta: DeltaModify) =>
        delta,
    );
  });

  it("records a typed modification for an existing requirement", async () => {
    const store = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            name: "test-capability",
            requirements: [{ id: "rq-existing01" }],
          },
        })),
      },
    });
    const delta = makeValidModifyDelta();
    const result = await specDeltaTools.adv_delta_modify.execute(
      { changeId: "addFeature", capability: "test-capability", delta },
      store,
    );

    expect(parse(result).success).toBe(true);
    expect(mocks.specDeltasModify).toHaveBeenCalledWith(
      "addFeature",
      "test-capability",
      delta,
      undefined,
    );
  });

  it("refuses success when the store returns a structurally mismatched modify receipt", async () => {
    const requested = makeValidModifyDelta();
    mocks.specDeltasModify.mockResolvedValueOnce({
      ...requested,
      changes: { title: "Mismatched persisted receipt" },
    });
    const store = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            name: "test-capability",
            requirements: [{ id: "rq-existing01" }],
          },
        })),
      },
    });

    const result = await specDeltaTools.adv_delta_modify.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: requested,
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/receipt|payload|mismatch|exact/i);
  });

  it.each([
    ["empty changes", { changes: {} }],
    ["unknown change key", { changes: { unknown: "nope" } }],
    ["invalid target", { target_id: "bad-target" }],
  ])("rejects %s without calling the store", async (_label, overrides) => {
    const result = await specDeltaTools.adv_delta_modify.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: { ...makeValidModifyDelta(), ...overrides } as DeltaModify,
      },
      makeStore(),
    );

    expect(parse(result).success).not.toBe(true);
    expect(mocks.specDeltasModify).not.toHaveBeenCalled();
  });

  it("rejects unknown and conflicting targets before calling the store", async () => {
    const unknownTarget = await specDeltaTools.adv_delta_modify.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidModifyDelta(),
      },
      makeStore(),
    );
    expect(parse(unknownTarget).success).not.toBe(true);
    expect(mocks.specDeltasModify).not.toHaveBeenCalled();

    const conflictStore = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: { requirements: [{ id: "rq-existing01" }] },
        })),
      },
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "addFeature",
            status: "draft",
            deltas: {
              "test-capability": [makeValidModifyDelta({ id: "dl-OTHER111" })],
            },
          },
        })),
      },
    });
    const conflict = await specDeltaTools.adv_delta_modify.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidModifyDelta(),
      },
      conflictStore,
    );
    expect(parse(conflict).error).toMatch(/Conflicting/);
    expect(mocks.specDeltasModify).not.toHaveBeenCalled();
  });
});

describe("adv_delta_add — validation refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasAdd.mockImplementation(
      async (_changeId: string, _capability: string, delta: DeltaAdd) => delta,
    );
  });

  it.each([
    ["Bad_Caps"],
    ["bad caps"],
    [""],
    ["-leading-dash"],
    ["trailing-"],
    ["a--b"],
    ["A"],
    ["1abc"],
  ])(
    "rejects malformed capability key %j without calling the store",
    async (capability) => {
      const store = makeStore();
      const result = await specDeltaTools.adv_delta_add.execute(
        {
          changeId: "addFeature",
          capability,
          delta: makeValidDelta(),
        },
        store,
      );
      const parsed = parse(result);

      expect(parsed.success).not.toBe(true);
      expect(parsed.error).toMatch(/capability/i);
      expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
    },
  );

  it.each(["modify", "remove", "rename"])(
    "rejects delta operation %j without calling the store",
    async (operation) => {
      const store = makeStore();
      const result = await specDeltaTools.adv_delta_add.execute(
        {
          changeId: "addFeature",
          capability: "test-capability",
          delta: {
            id: "dl-NONADD01",
            operation,
            ...(operation === "modify"
              ? { target_id: "rq-existing01", changes: { title: "x" } }
              : {}),
            ...(operation === "remove"
              ? { target_id: "rq-existing01", reason: "obsolete" }
              : {}),
            ...(operation === "rename"
              ? { target_id: "rq-existing01", new_title: "renamed" }
              : {}),
          } as unknown as DeltaAdd,
        },
        store,
      );
      const parsed = parse(result);

      expect(parsed.success).not.toBe(true);
      expect(parsed.error).toMatch(/operation|add/i);
      expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
    },
  );

  it("rejects a delta with no scenarios (scenarios undefined) without calling the store", async () => {
    const store = makeStore();
    const delta = makeValidDelta();
    const noScenarios = { ...delta.requirement };
    delete (noScenarios as { scenarios?: unknown }).scenarios;
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: { ...delta, requirement: noScenarios },
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/scenario/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects a delta with an empty scenarios array without calling the store", async () => {
    const store = makeStore();
    const delta = makeValidDelta();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: {
          ...delta,
          requirement: { ...delta.requirement, scenarios: [] },
        },
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/scenario/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects a blank delta id without calling the store", async () => {
    const store = makeStore();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: { ...makeValidDelta(), id: "  " },
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects a blank requirement id without calling the store", async () => {
    const store = makeStore();
    const delta = makeValidDelta();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: {
          ...delta,
          requirement: { ...delta.requirement, id: "" },
        },
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["dl-invalid-id", "rq-specDelta01", "rq-specDelta01.1"],
    ["dl-AAA11111", "invalid-requirement", "rq-specDelta01.1"],
    ["dl-AAA11111", "rq-specDelta01", "invalid-scenario"],
  ])(
    "rejects malformed structured IDs (%s, %s, %s) without calling the store",
    async (deltaId, requirementId, scenarioId) => {
      const store = makeStore();
      const delta = makeValidDelta({
        id: deltaId,
        requirement: {
          ...makeValidDelta().requirement,
          id: requirementId,
          scenarios: [
            { ...makeValidDelta().requirement.scenarios![0]!, id: scenarioId },
          ],
        },
      });

      const result = await specDeltaTools.adv_delta_add.execute(
        { changeId: "addFeature", capability: "test-capability", delta },
        store,
      );

      expect(parse(result).success).not.toBe(true);
      expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
    },
  );

  it("rejects a scenario whose parent ID differs from its added requirement", async () => {
    const store = makeStore();
    const delta = makeValidDelta({
      requirement: {
        ...makeValidDelta().requirement,
        scenarios: [
          {
            ...makeValidDelta().requirement.scenarios![0]!,
            id: "rq-otherRequirement01.1",
          },
        ],
      },
    });

    const result = await specDeltaTools.adv_delta_add.execute(
      { changeId: "addFeature", capability: "test-capability", delta },
      store,
    );

    expect(parse(result).success).not.toBe(true);
    expect(parse(result).error).toMatch(/parent/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects an add for a non-draft change before calling the store", async () => {
    const store = makeStore({
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: { id: "addFeature", status: "archived", deltas: {} },
        })),
      },
    });

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
      },
      store,
    );

    expect(parse(result).success).not.toBe(true);
    expect(parse(result).error).toMatch(/draft/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects an add whose requirement already exists in the target spec before calling the store", async () => {
    const store = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            name: "test-capability",
            requirements: [{ id: "rq-specDelta01" }],
          },
        })),
      },
    });

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
      },
      store,
    );

    expect(parse(result).success).not.toBe(true);
    expect(parse(result).error).toMatch(/already exists/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("surfaces a typed error when the store rejects a duplicate delta id and does not report success", async () => {
    const store = makeStore();
    mocks.specDeltasAdd.mockRejectedValueOnce(
      new Error(
        "Duplicate spec delta id dl-AAA11111 under capability test-capability",
      ),
    );

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/Duplicate spec delta id dl-AAA11111/);
  });

  it("surfaces a typed error when the store rejects a duplicate requirement id and does not report success", async () => {
    const store = makeStore();
    mocks.specDeltasAdd.mockRejectedValueOnce(
      new Error(
        "Duplicate requirement id rq-specDelta01 under capability test-capability",
      ),
    );

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/Duplicate requirement id rq-specDelta01/);
  });
});

describe("adv_delta_add — target_path confirmation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses target_path mutations without explicit target_confirmed", async () => {
    const store = makeStore();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
        target_path: "/other/project",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/target/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });
});

function makeScenarios(parentId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${parentId}.${i + 1}`,
    title: `Scenario ${i + 1}`,
    given: ["a requirement exists"],
    when: "the scenario is recorded",
    then: [`scenario ${i + 1} is captured`],
  }));
}

function makeValidModifyDeltaWithScenarios(
  overrides: Partial<DeltaModify> = {},
): DeltaModify {
  return {
    id: "dl-MOD11111",
    operation: "modify",
    target_id: "rq-activeChangePointer01",
    changes: {
      scenarios: makeScenarios("rq-activeChangePointer01", 7),
    },
    ...overrides,
  };
}

function makeStoreWithDelta(delta: Delta) {
  return makeStore({
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          id: "addFeature",
          status: "draft",
          deltas: { "advance-workflow": [delta] },
        },
      })),
    },
    specs: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          name: "advance-workflow",
          requirements: [{ id: "rq-activeChangePointer01" }],
        },
      })),
    },
  });
}

describe("adv_delta_amend — schema + target validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasAmend.mockImplementation(
      async (
        _changeId: string,
        _capability: string,
        _deltaId: string,
        delta: Delta,
      ) => delta,
    );
  });

  it("amends a staged modify delta, preserving id and array position", async () => {
    const original = makeValidModifyDeltaWithScenarios();
    const store = makeStoreWithDelta(original);
    const amended = makeValidModifyDeltaWithScenarios({
      changes: {
        scenarios: [
          {
            ...makeScenarios("rq-activeChangePointer01", 7)[0]!,
            title: "Changed 1",
          },
          {
            ...makeScenarios("rq-activeChangePointer01", 7)[1]!,
            title: "Changed 2",
          },
          makeScenarios("rq-activeChangePointer01", 7)[2]!,
          makeScenarios("rq-activeChangePointer01", 7)[3]!,
          makeScenarios("rq-activeChangePointer01", 7)[4]!,
          {
            ...makeScenarios("rq-activeChangePointer01", 7)[5]!,
            title: "Changed 6",
          },
          makeScenarios("rq-activeChangePointer01", 7)[6]!,
        ],
      },
    });

    const result = await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
        delta: amended,
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.deltaId).toBe("dl-MOD11111");
    expect((parsed.delta as DeltaModify).id).toBe("dl-MOD11111");
    expect(mocks.specDeltasAmend).toHaveBeenCalledWith(
      "addFeature",
      "advance-workflow",
      "dl-MOD11111",
      amended,
      undefined,
    );
  });

  it("allows a second amend of the same delta", async () => {
    const original = makeValidModifyDeltaWithScenarios();
    const store = makeStoreWithDelta(original);
    const first = makeValidModifyDeltaWithScenarios({
      changes: { title: "First amendment" },
    });
    const second = makeValidModifyDeltaWithScenarios({
      changes: { title: "Second amendment" },
    });

    mocks.specDeltasAmend.mockImplementation(
      async (
        _changeId: string,
        _capability: string,
        _deltaId: string,
        delta: Delta,
      ) => delta,
    );

    await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
        delta: first,
      },
      store,
    );
    const result = await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
        delta: second,
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).toBe(true);
    expect((parsed.delta as DeltaModify).changes.title).toBe(
      "Second amendment",
    );
    expect(mocks.specDeltasAmend).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid delta payload without calling the store", async () => {
    const store = makeStoreWithDelta(makeValidModifyDeltaWithScenarios());
    const result = await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
        delta: { id: "dl-MOD11111", operation: "modify" } as unknown as Delta,
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(mocks.specDeltasAmend).not.toHaveBeenCalled();
  });

  it("rejects an unknown delta id with a typed not-found error", async () => {
    const store = makeStoreWithDelta(makeValidModifyDeltaWithScenarios());
    const result = await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MISSING111",
        delta: makeValidModifyDeltaWithScenarios({ id: "dl-MISSING111" }),
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/not found/);
    expect(mocks.specDeltasAmend).not.toHaveBeenCalled();
  });

  it("rejects a delta id mismatch without calling the store", async () => {
    const store = makeStoreWithDelta(makeValidModifyDeltaWithScenarios());
    const result = await specDeltaTools.adv_delta_amend.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
        delta: makeValidModifyDeltaWithScenarios({ id: "dl-OTHER111" }),
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/delta.id .* does not match deltaId/);
    expect(mocks.specDeltasAmend).not.toHaveBeenCalled();
  });
});

describe("adv_delta_retract — schema + validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasRetract.mockImplementation(async () => {});
  });

  it("retracts an existing staged delta", async () => {
    const store = makeStoreWithDelta(makeValidModifyDeltaWithScenarios());
    const result = await specDeltaTools.adv_delta_retract.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MOD11111",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.specDeltasRetract).toHaveBeenCalledWith(
      "addFeature",
      "advance-workflow",
      "dl-MOD11111",
      undefined,
    );
  });

  it("rejects an unknown delta id with a typed not-found error", async () => {
    const store = makeStoreWithDelta(makeValidModifyDeltaWithScenarios());
    const result = await specDeltaTools.adv_delta_retract.execute(
      {
        changeId: "addFeature",
        capability: "advance-workflow",
        deltaId: "dl-MISSING111",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/not found/);
    expect(mocks.specDeltasRetract).not.toHaveBeenCalled();
  });
});

function makeValidRemoveDelta(
  overrides: Partial<DeltaRemove> = {},
): DeltaRemove {
  return {
    id: "dl-RMV11111",
    operation: "remove",
    target_id: "rq-activeChangePointer01",
    reason: "obsolete",
    ...overrides,
  };
}

function makeValidRenameDelta(
  overrides: Partial<DeltaRename> = {},
): DeltaRename {
  return {
    id: "dl-RNM11111",
    operation: "rename",
    target_id: "rq-activeChangePointer01",
    new_title: "Renamed requirement",
    ...overrides,
  };
}

describe("adv_delta_remove — schema + target validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasRemove.mockImplementation(
      async (_changeId: string, _capability: string, delta: DeltaRemove) =>
        delta,
    );
  });

  it("records a remove delta for an existing requirement", async () => {
    const store = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            name: "test-capability",
            requirements: [{ id: "rq-activeChangePointer01" }],
          },
        })),
      },
    });
    const delta = makeValidRemoveDelta();
    const result = await specDeltaTools.adv_delta_remove.execute(
      { changeId: "addFeature", capability: "test-capability", delta },
      store,
    );

    expect(parse(result).success).toBe(true);
    expect(mocks.specDeltasRemove).toHaveBeenCalledWith(
      "addFeature",
      "test-capability",
      delta,
      undefined,
    );
  });

  it("rejects an invalid remove delta without calling the store", async () => {
    const result = await specDeltaTools.adv_delta_remove.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: {
          id: "dl-RMV11111",
          operation: "remove",
        } as unknown as DeltaRemove,
      },
      makeStore(),
    );

    expect(parse(result).success).not.toBe(true);
    expect(mocks.specDeltasRemove).not.toHaveBeenCalled();
  });
});

describe("adv_delta_rename — schema + target validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.specDeltasRename.mockImplementation(
      async (_changeId: string, _capability: string, delta: DeltaRename) =>
        delta,
    );
  });

  it("records a rename delta for an existing requirement", async () => {
    const store = makeStore({
      specs: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            name: "test-capability",
            requirements: [{ id: "rq-activeChangePointer01" }],
          },
        })),
      },
    });
    const delta = makeValidRenameDelta();
    const result = await specDeltaTools.adv_delta_rename.execute(
      { changeId: "addFeature", capability: "test-capability", delta },
      store,
    );

    expect(parse(result).success).toBe(true);
    expect(mocks.specDeltasRename).toHaveBeenCalledWith(
      "addFeature",
      "test-capability",
      delta,
      undefined,
    );
  });

  it("rejects an invalid rename delta without calling the store", async () => {
    const result = await specDeltaTools.adv_delta_rename.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: {
          id: "dl-RNM11111",
          operation: "rename",
        } as unknown as DeltaRename,
      },
      makeStore(),
    );

    expect(parse(result).success).not.toBe(true);
    expect(mocks.specDeltasRename).not.toHaveBeenCalled();
  });
});

describe("adv_delta_list — read staged deltas", () => {
  function storeWithDeltas(): Store {
    return makeStore({
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "addFeature",
            title: "Add feature",
            status: "draft",
            deltas: {
              "cap-one": [
                {
                  id: "dl-AAA11111",
                  operation: "add",
                  requirement: {
                    id: "rq-one01",
                    title: "One",
                    body: "b",
                    priority: "must",
                  },
                },
                {
                  id: "dl-MOD11111",
                  operation: "modify",
                  target_id: "rq-existing01",
                  changes: { title: "Updated" },
                },
              ],
              "cap-two": [
                {
                  id: "dl-REM11111",
                  operation: "remove",
                  target_id: "rq-two01",
                  reason: "obsolete",
                },
              ],
            },
          },
        })),
      },
    });
  }

  it("lists staged deltas across capabilities with ids, operation, target, title", async () => {
    const result = await specDeltaTools.adv_delta_list.execute(
      { changeId: "addFeature" },
      storeWithDeltas(),
    );
    const parsed = parse(result);
    expect(parsed.success).toBe(true);
    const rows = parsed.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["dl-AAA11111"]).toMatchObject({
      operation: "add",
      capability: "cap-one",
      target: "rq-one01",
      title: "One",
    });
    expect(byId["dl-MOD11111"]).toMatchObject({
      operation: "modify",
      target: "rq-existing01",
      title: "Updated",
    });
    expect(byId["dl-REM11111"]).toMatchObject({
      operation: "remove",
      capability: "cap-two",
      target: "rq-two01",
    });
    expect((parsed.pagination as Record<string, unknown>).total).toBe(3);
  });

  it("filters by capability", async () => {
    const result = await specDeltaTools.adv_delta_list.execute(
      { changeId: "addFeature", capability: "cap-two" },
      storeWithDeltas(),
    );
    const parsed = parse(result);
    const rows = parsed.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("dl-REM11111");
  });

  it("paginates with offset + limit and reports hasMore", async () => {
    const result = await specDeltaTools.adv_delta_list.execute(
      { changeId: "addFeature", offset: 0, limit: 2 },
      storeWithDeltas(),
    );
    const parsed = parse(result);
    expect((parsed.rows as unknown[]).length).toBe(2);
    const pg = parsed.pagination as Record<string, unknown>;
    expect(pg.total).toBe(3);
    expect(pg.returned).toBe(2);
    expect(pg.hasMore).toBe(true);
  });

  it("returns empty rows for a change with no deltas", async () => {
    const result = await specDeltaTools.adv_delta_list.execute(
      { changeId: "addFeature" },
      makeStore(),
    );
    const parsed = parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.rows).toEqual([]);
    expect((parsed.pagination as Record<string, unknown>).total).toBe(0);
  });
});

describe("adv_delta_show — read one staged delta", () => {
  function storeWithDeltas(): Store {
    return makeStore({
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "addFeature",
            title: "Add feature",
            status: "draft",
            deltas: {
              "cap-one": [
                {
                  id: "dl-AAA11111",
                  operation: "add",
                  requirement: {
                    id: "rq-one01",
                    title: "One",
                    body: "b",
                    priority: "must",
                  },
                },
              ],
            },
          },
        })),
      },
    });
  }

  it("returns the full staged delta by id", async () => {
    const result = await specDeltaTools.adv_delta_show.execute(
      { changeId: "addFeature", capability: "cap-one", deltaId: "dl-AAA11111" },
      storeWithDeltas(),
    );
    const parsed = parse(result);
    expect(parsed.success).toBe(true);
    expect((parsed.delta as Record<string, unknown>).id).toBe("dl-AAA11111");
    expect((parsed.delta as Record<string, unknown>).operation).toBe("add");
  });

  it("returns typed not-found for an unknown delta id", async () => {
    const result = await specDeltaTools.adv_delta_show.execute(
      { changeId: "addFeature", capability: "cap-one", deltaId: "dl-UNKNOWN0" },
      storeWithDeltas(),
    );
    const parsed = parse(result);
    expect(parsed.success).not.toBe(true);
    expect(String(parsed.error)).toContain("dl-UNKNOWN0");
  });
});
