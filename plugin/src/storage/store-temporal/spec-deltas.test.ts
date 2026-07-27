import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSpecDeltaOps } from "./spec-deltas";
import {
  CHANGE_WORKFLOW_SIGNAL_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
} from "../../temporal/contracts";
import { DiskProjectionPersistError } from "./disk-persist";
import { commitChangeProjectionWithSummary } from "../change-summary-shard";

const { signalMock, queryMock } = vi.hoisted(() => ({
  signalMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("../change-summary-shard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../change-summary-shard")>();
  return {
    ...actual,
    commitChangeProjectionWithSummary: vi.fn(),
  };
});

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
    state_revision: 1,
  };
}

function makeHandle(_stateAfterSignal: unknown) {
  return {
    signal: signalMock,
    query: queryMock,
  };
}

function mockQueries(
  stateAfterSignal: unknown,
  ledgerOutcome: "accepted" | "rejected" = "accepted",
) {
  queryMock.mockImplementation(async (queryDef, queryArg) => {
    if (
      queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
    ) {
      if (ledgerOutcome === "rejected") {
        return { outcome: "rejected" };
      }
      const envelope = signalMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const payload = call[1] as Record<string, unknown> | undefined;
          return payload?.operation_id === queryArg;
        });
      const payload = (envelope?.[1] ?? {}) as Record<string, unknown>;
      return {
        operation_id: queryArg,
        command_kind: payload.command_kind ?? "specDeltaAdded",
        payload_hash: payload.payload_hash ?? "hash",
        outcome: "accepted",
        state_revision: 1,
        accepted_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };
    }
    return stateAfterSignal;
  });
}

function makeDeps(stateAfterSignal: unknown) {
  const handle = makeHandle(stateAfterSignal);
  return {
    input: {
      projectId: "pid-spec-delta",
      legacy: {
        changes: {
          get: vi.fn().mockResolvedValue({ success: true, data: null }),
        },
      },
      temporal: {
        client: {
          workflow: {
            getHandle: vi.fn().mockReturnValue(handle),
          },
        },
      },
    },
    legacy: {
      specDeltas: {},
      paths: {
        changes: "/tmp/spec-delta-changes",
        summariesDir: "/tmp/spec-delta-summaries",
      },
    },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
  };
}

beforeEach(() => {
  signalMock.mockClear();
  queryMock.mockReset();
  vi.mocked(commitChangeProjectionWithSummary).mockReset();
  vi.mocked(commitChangeProjectionWithSummary).mockResolvedValue({
    kind: "committed",
    snapshotRevision: 1,
  });
});

describe("createSpecDeltaOps", () => {
  it("signals specDeltaAdded, refreshes state, persists, and returns the appended delta", async () => {
    const state = makeStateWithDelta();
    const deps = makeDeps(state);
    mockQueries(state);
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
    expect(payload.operation_id).toBeDefined();
    expect(payload.command_kind).toBe("specDeltaAdded");
    expect(payload.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(deps.invalidateChange).toHaveBeenCalledWith("spec-delta-store-test");
    expect(deps.setCachedChange).toHaveBeenCalledWith(state);
    expect(deps.emitChangeSummarySignal).toHaveBeenCalledWith(
      "spec-delta-store-test",
      state,
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
    mockQueries(rejectedState, "rejected");
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.add("spec-delta-store-test", "collection-dashboard", ADD_DELTA),
    ).rejects.toThrow();
    expect(deps.setCachedChange).not.toHaveBeenCalled();
    expect(deps.emitChangeSummarySignal).not.toHaveBeenCalled();
  });

  it("signals specDeltaAmended, replaces the delta in place, and returns the amended delta", async () => {
    const state = makeStateWithDelta();
    state.deltas["collection-dashboard"] = [MODIFY_DELTA];
    const amended = { ...MODIFY_DELTA, changes: { title: "Amended title" } };
    state.deltas["collection-dashboard"][0] = amended;
    const deps = makeDeps(state);
    mockQueries(state);
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
    expect(deps.emitChangeSummarySignal).toHaveBeenCalledWith(
      "spec-delta-store-test",
      state,
    );
  });

  it("signals specDeltaRetracted and asserts the delta is absent on readback", async () => {
    const emptyState = {
      changeId: "spec-delta-store-test",
      deltas: { "collection-dashboard": [] },
      wisdom: [],
      state_revision: 1,
    };
    const deps = makeDeps(emptyState);
    mockQueries(emptyState);
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
    expect(deps.emitChangeSummarySignal).toHaveBeenCalled();
  });

  it("throws a typed error when retract readback still finds the delta", async () => {
    const state = makeStateWithDelta();
    const deps = makeDeps(state);
    mockQueries(state);
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.retract(
        "spec-delta-store-test",
        "collection-dashboard",
        "dl-AAA11111",
      ),
    ).rejects.toThrow(/without removing delta/);
    expect(deps.emitChangeSummarySignal).not.toHaveBeenCalled();
  });

  it("signals specDeltaRemoved, refreshes state, and returns the appended remove delta", async () => {
    const state = makeStateWithDelta();
    state.deltas["collection-dashboard"].push(REMOVE_DELTA);
    const deps = makeDeps(state);
    mockQueries(state);
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
    mockQueries(state);
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

  it("propagates DiskProjectionPersistError when the durable disk write fails (AC1/AC5/AC7)", async () => {
    const state = makeStateWithDelta();
    const deps = makeDeps(state);
    mockQueries(state);
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      new DiskProjectionPersistError(
        "spec-delta-store-test",
        new Error("EACCES: permission denied"),
      ),
    );
    const ops = createSpecDeltaOps(deps as never);

    await expect(
      ops.add("spec-delta-store-test", "collection-dashboard", ADD_DELTA, {
        addedBy: "agent",
      }),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("reports projection failure when the summary shard/pointer commit fails", async () => {
    const state = makeStateWithDelta();
    const deps = makeDeps(state);
    mockQueries(state);
    vi.mocked(commitChangeProjectionWithSummary).mockResolvedValue({
      kind: "error",
      error: "summary pointer readback mismatch",
    });
    const ops = createSpecDeltaOps(deps as never);
    await expect(
      ops.add("spec-delta-store-test", "collection-dashboard", ADD_DELTA, {
        addedBy: "agent",
      }),
    ).rejects.toThrow(/projection_failure/);
  });
});
