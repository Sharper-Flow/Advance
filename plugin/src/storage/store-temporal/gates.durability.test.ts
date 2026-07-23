import { describe, expect, it, vi, beforeEach } from "vitest";

import { createGateOps } from "./gates";
import { DiskProjectionPersistError } from "./disk-persist";

// AC6 (gates are durability-critical): gate completion + re-entry must gate
// success on a durable disk write and propagate DiskProjectionPersistError
// when the projection write fails after an acknowledged signal.

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

const CHANGE_ID = "gate-durability-test";
const STATE = {
  changeId: CHANGE_ID,
  gates: {},
  tasks: [],
  deltas: {},
  wisdom: [],
};

function makeDeps() {
  queryMock.mockResolvedValue(STATE);
  return {
    input: { projectId: "pid-gate" },
    legacy: { gates: {} },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    persistStateToDiskDurable: vi.fn(async () => {}),
    getTemporalChange: vi.fn(),
  };
}

function persistError() {
  return new DiskProjectionPersistError(CHANGE_ID, new Error("EACCES"));
}

describe("createGateOps durability wiring (AC6)", () => {
  beforeEach(() => {
    signalMock.mockClear();
    queryMock.mockReset();
  });

  it("complete persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6/AC7)", async () => {
    const ok = makeDeps();
    await createGateOps(ok as never).complete(CHANGE_ID, "discovery");
    expect(ok.persistStateToDiskDurable).toHaveBeenCalledWith(CHANGE_ID, STATE);

    const deps = makeDeps();
    deps.persistStateToDiskDurable = vi.fn().mockRejectedValue(persistError());
    await expect(
      createGateOps(deps as never).complete(CHANGE_ID, "discovery"),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("reopenFrom persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6)", async () => {
    const ok = makeDeps();
    await createGateOps(ok as never).reopenFrom(
      CHANGE_ID,
      "design",
      "scope expanded",
      undefined,
      "agent",
      "evidence",
    );
    expect(ok.persistStateToDiskDurable).toHaveBeenCalledWith(CHANGE_ID, STATE);

    const deps = makeDeps();
    deps.persistStateToDiskDurable = vi.fn().mockRejectedValue(persistError());
    await expect(
      createGateOps(deps as never).reopenFrom(
        CHANGE_ID,
        "design",
        "scope expanded",
        undefined,
        "agent",
        "evidence",
      ),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });
});
