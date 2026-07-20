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

  it("rejects an add readback whose id matches but normalized payload differs", async () => {
    const mismatched = {
      ...makeStateWithDelta(),
      deltas: {
        "collection-dashboard": [
          {
            ...ADD_DELTA,
            requirement: {
              ...ADD_DELTA.requirement,
              body: "Persisted content differs from the requested delta.",
            },
          },
        ],
      },
    };
    const deps = makeDeps(mismatched);
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.add("spec-delta-store-test", "collection-dashboard", ADD_DELTA),
    ).rejects.toThrow(/payload|mismatch|exact/i);
    expect(deps.setCachedChange).not.toHaveBeenCalled();
    expect(deps.emitChangeSummarySignal).not.toHaveBeenCalled();
    expect(deps.persistStateToDisk).not.toHaveBeenCalled();
  });

  it("rejects a modify readback whose id and operation match but payload differs", async () => {
    const mismatched = {
      changeId: "spec-delta-store-test",
      deltas: {
        "collection-dashboard": [
          {
            ...MODIFY_DELTA,
            changes: { title: "Different persisted title" },
          },
        ],
      },
      wisdom: [],
    };
    const deps = makeDeps(mismatched);
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.modify(
        "spec-delta-store-test",
        "collection-dashboard",
        MODIFY_DELTA,
      ),
    ).rejects.toThrow(/payload|mismatch|exact/i);
    expect(deps.setCachedChange).not.toHaveBeenCalled();
    expect(deps.emitChangeSummarySignal).not.toHaveBeenCalled();
    expect(deps.persistStateToDisk).not.toHaveBeenCalled();
  });
});
