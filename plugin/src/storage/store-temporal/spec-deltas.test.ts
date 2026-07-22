import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSpecDeltaOps } from "./spec-deltas";
import { CHANGE_WORKFLOW_SIGNAL_NAMES } from "../../temporal/contracts";

const { signalMock, queryMock } = vi.hoisted(() => ({
  signalMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("./shared", () => ({
  runTemporal: async <T>(op: () => Promise<T>): Promise<T> => op(),
  runTemporalQuery: async <T>(op: () => Promise<T>): Promise<T> => op(),
  getGuardedChangeHandle: async () => ({
    signal: signalMock,
    query: queryMock,
  }),
}));

const ADD_DELTA = {
  id: "dl-AAA11111",
  operation: "add" as const,
  requirement: {
    id: "rq-specDelta01",
    title: "Spec delta writer",
    body: "Record change-scoped add deltas durably.",
    priority: "must" as const,
    scenarios: [
      {
        id: "rq-specDelta01.1",
        title: "Record add delta",
        given: ["a draft change exists"],
        when: "the writer is invoked",
        then: ["the delta persists under the capability"],
      },
    ],
  },
};

const MODIFY_DELTA = {
  id: "dl-MOD11111",
  operation: "modify" as const,
  target_id: "rq-existing01",
  changes: { title: "Updated requirement" },
};

const REMOVE_DELTA = {
  id: "dl-RMV11111",
  operation: "remove" as const,
  target_id: "rq-existing01",
  reason: "obsolete",
};

const RENAME_DELTA = {
  id: "dl-RNM11111",
  operation: "rename" as const,
  target_id: "rq-existing01",
  new_title: "Renamed requirement",
};

function makeStateWithDelta() {
  return {
    changeId: "spec-delta-store-test",
    deltas: { "collection-dashboard": [ADD_DELTA] },
    wisdom: [],
  };
}

function makeDeps(stateAfterSignal: unknown) {
  queryMock.mockResolvedValue(stateAfterSignal);
  return {
    input: { projectId: "pid-spec-delta" },
    legacy: { specDeltas: {} },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    persistStateToDisk: vi.fn(),
  };
}

describe("createSpecDeltaOps", () => {
  beforeEach(() => {
    signalMock.mockClear();
    queryMock.mockReset();
  });

  it("signals specDeltaAdded, refreshes state, persists, and returns the appended delta", async () => {
    const deps = makeDeps(makeStateWithDelta());
    const ops = createSpecDeltaOps(deps as never);

    const result = await ops.add(
      "spec-delta-store-test",
      "collection-dashboard",
      ADD_DELTA,
      { addedBy: "agent" },
    );

    expect(result).toEqual(ADD_DELTA);
    expect(signalMock).toHaveBeenCalledTimes(1);
    const [signalDef, payload] = signalMock.mock.calls[0]!;
    expect(signalDef).toMatchObject({
      name: CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaAdded,
    });
    expect(payload).toMatchObject({
      capability: "collection-dashboard",
      delta: ADD_DELTA,
      addedBy: "agent",
    });
    expect(typeof payload.addedAt).toBe("string");
    expect(deps.invalidateChange).toHaveBeenCalledWith("spec-delta-store-test");
    expect(deps.setCachedChange).toHaveBeenCalledWith(makeStateWithDelta());
    expect(deps.emitChangeSummarySignal).toHaveBeenCalledWith(
      "spec-delta-store-test",
      makeStateWithDelta(),
    );
    expect(deps.persistStateToDisk).toHaveBeenCalledWith(
      "spec-delta-store-test",
      makeStateWithDelta(),
    );
  });

  it("throws a typed error when the signal was rejected and the delta never landed", async () => {
    const rejectedState = {
      changeId: "spec-delta-store-test",
      deltas: {},
      wisdom: [],
      signal_rejections: [
        {
          signalName: "specDeltaAdded",
          errorMessage: "Duplicate requirement id rq-specDelta01",
          errorClass: "Error",
          payloadDigest: {
            payload_size: 10,
            payload_sample: "",
            payload_fnv1a: "abc",
          },
          rejectedAt: "2026-07-14T00:00:00.000Z",
        },
      ],
    };
    const deps = makeDeps(rejectedState);
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.add("spec-delta-store-test", "collection-dashboard", ADD_DELTA),
    ).rejects.toThrow(/rq-specDelta01/);
    expect(deps.persistStateToDisk).not.toHaveBeenCalled();
    expect(deps.setCachedChange).not.toHaveBeenCalled();
  });

  it("signals specDeltaAmended, replaces the delta in place, and returns the amended delta", async () => {
    const state = makeStateWithDelta();
    state.deltas["collection-dashboard"] = [MODIFY_DELTA];
    const amended = { ...MODIFY_DELTA, changes: { title: "Amended title" } };
    state.deltas["collection-dashboard"][0] = amended;
    const deps = makeDeps(state);
    const ops = createSpecDeltaOps(deps as never);

    const result = await ops.amend(
      "spec-delta-store-test",
      "collection-dashboard",
      "dl-MOD11111",
      amended,
      { amendedBy: "agent" },
    );

    expect(result).toEqual(amended);
    expect(signalMock).toHaveBeenCalledTimes(1);
    const [signalDef, payload] = signalMock.mock.calls[0]!;
    expect(signalDef).toMatchObject({
      name: CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaAmended,
    });
    expect(payload).toMatchObject({
      capability: "collection-dashboard",
      deltaId: "dl-MOD11111",
      delta: amended,
      amendedBy: "agent",
    });
    expect(deps.setCachedChange).toHaveBeenCalledWith(state);
    expect(deps.persistStateToDisk).toHaveBeenCalledWith(
      "spec-delta-store-test",
      state,
    );
  });

  it("signals specDeltaRetracted and asserts the delta is absent on readback", async () => {
    const emptyState = {
      changeId: "spec-delta-store-test",
      deltas: { "collection-dashboard": [] },
      wisdom: [],
    };
    const deps = makeDeps(emptyState);
    const ops = createSpecDeltaOps(deps as never);

    await ops.retract(
      "spec-delta-store-test",
      "collection-dashboard",
      "dl-AAA11111",
      { retractedBy: "agent" },
    );

    expect(signalMock).toHaveBeenCalledTimes(1);
    const [signalDef, payload] = signalMock.mock.calls[0]!;
    expect(signalDef).toMatchObject({
      name: CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRetracted,
    });
    expect(payload).toMatchObject({
      capability: "collection-dashboard",
      deltaId: "dl-AAA11111",
      retractedBy: "agent",
    });
    expect(deps.setCachedChange).toHaveBeenCalled();
    expect(deps.persistStateToDisk).toHaveBeenCalled();
  });

  it("throws a typed error when retract readback still finds the delta", async () => {
    const deps = makeDeps(makeStateWithDelta());
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.retract(
        "spec-delta-store-test",
        "collection-dashboard",
        "dl-AAA11111",
      ),
    ).rejects.toThrow(/without removing delta/);
    expect(deps.persistStateToDisk).not.toHaveBeenCalled();
  });

  it("signals specDeltaRemoved, refreshes state, and returns the appended remove delta", async () => {
    const state = makeStateWithDelta();
    state.deltas["collection-dashboard"].push(REMOVE_DELTA);
    const deps = makeDeps(state);
    const ops = createSpecDeltaOps(deps as never);

    const result = await ops.remove(
      "spec-delta-store-test",
      "collection-dashboard",
      REMOVE_DELTA,
      { removedBy: "agent" },
    );

    expect(result).toEqual(REMOVE_DELTA);
    expect(signalMock).toHaveBeenCalledTimes(1);
    const [signalDef, payload] = signalMock.mock.calls[0]!;
    expect(signalDef).toMatchObject({
      name: CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRemoved,
    });
    expect(payload).toMatchObject({
      capability: "collection-dashboard",
      delta: REMOVE_DELTA,
      removedBy: "agent",
    });
    expect(deps.setCachedChange).toHaveBeenCalledWith(state);
  });

  it("signals specDeltaRenamed, refreshes state, and returns the appended rename delta", async () => {
    const state = makeStateWithDelta();
    state.deltas["collection-dashboard"].push(RENAME_DELTA);
    const deps = makeDeps(state);
    const ops = createSpecDeltaOps(deps as never);

    const result = await ops.rename(
      "spec-delta-store-test",
      "collection-dashboard",
      RENAME_DELTA,
      { renamedBy: "agent" },
    );

    expect(result).toEqual(RENAME_DELTA);
    expect(signalMock).toHaveBeenCalledTimes(1);
    const [signalDef, payload] = signalMock.mock.calls[0]!;
    expect(signalDef).toMatchObject({
      name: CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRenamed,
    });
    expect(payload).toMatchObject({
      capability: "collection-dashboard",
      delta: RENAME_DELTA,
      renamedBy: "agent",
    });
    expect(deps.setCachedChange).toHaveBeenCalledWith(state);
  });
});
