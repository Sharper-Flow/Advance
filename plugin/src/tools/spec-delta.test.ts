/**
 * adv_delta_add — append-only spec-delta writer tool tests.
 *
 * TDD RED → GREEN for the addSpecDeltaWriter change (roadmap #64).
 * Mirrors adv_wisdom_add writer tests plus the stronger target_path
 * confirmation and recovery contract from existing change-mutating tools
 * (adv_contract_mint, adv_change_repair_origin, internal status-repair).
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
  const signal = vi.fn(async () => {});
  const query = vi.fn(async () => ({
    deltas: {},
    signal_rejections: [],
  }));
  const close = vi.fn(async () => {});
  const invalidateChange = vi.fn();
  const setCachedChange = vi.fn();
  const emitChangeSummarySignal = vi.fn();
  const persistStateToDisk = vi.fn();
  const specDeltasAdd = vi.fn();
  const specDeltasModify = vi.fn();
  return {
    signal,
    query,
    close,
    invalidateChange,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
    specDeltasAdd,
    specDeltasModify,
    canReachTemporalAddress: vi.fn(async () => true),
    getTemporalWorkerAliveness: vi.fn(() => true),
    getRegisteredTemporalWorkerQueues: vi.fn(() => ["advance-proj123"]),
    getService: vi.fn(() => ({
      connection: { close },
      client: {
        workflow: {
          getHandle: vi.fn(() => ({ signal, query })),
          start: vi.fn(async () => ({ signal, query })),
        },
      },
    })),
  };
});

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return { ...actual, getService: mocks.getService };
});

vi.mock("../temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/runtime-manager")
  >("../temporal/runtime-manager");
  return {
    ...actual,
    canReachTemporalAddress: mocks.canReachTemporalAddress,
  };
});

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
    getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
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
import type { DeltaAdd, DeltaModify } from "../types";
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

describe("adv_delta_add — recovery contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects recoveryMode='poisoned_history' without recoveryEvidence", async () => {
    const store = makeStore();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
        recoveryMode: "poisoned_history",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/recoveryEvidence/i);
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("rejects recoveryMode='poisoned_history' when evidence is not precise poisoned-history evidence", async () => {
    const store = makeStore();
    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
        recoveryMode: "poisoned_history",
        recoveryEvidence: "things are broken",
        recoveryReason: "wanted to recover",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(
      /precise poisoned-history|completed-workflow/i,
    );
    expect(mocks.specDeltasAdd).not.toHaveBeenCalled();
  });

  it("refuses the disk-workaround recovery path even with valid evidence, preserving the no-direct-disk-write constraint", async () => {
    const store = makeStore();
    mocks.specDeltasAdd.mockRejectedValueOnce(
      new Error("WorkflowExecutionAlreadyCompleted"),
    );

    const result = await specDeltaTools.adv_delta_add.execute(
      {
        changeId: "addFeature",
        capability: "test-capability",
        delta: makeValidDelta(),
        recoveryMode: "poisoned_history",
        recoveryEvidence: "WorkflowExecutionAlreadyCompleted",
        recoveryReason: "workflow already completed before delta recorded",
      },
      store,
    );
    const parsed = parse(result);

    expect(parsed.success).not.toBe(true);
    expect(parsed.error).toMatch(/recover|disk|workflow/i);
    expect(mocks.specDeltasAdd).toHaveBeenCalledTimes(1);
  });
});
