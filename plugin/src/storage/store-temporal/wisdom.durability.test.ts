import { describe, expect, it, vi, beforeEach } from "vitest";

import { createWisdomOps } from "./wisdom";
import { DiskProjectionPersistError } from "./disk-persist";

// AC6 (wisdom is durability-critical): wisdom.add must gate success on a
// durable disk write and propagate DiskProjectionPersistError when the
// projection write fails after an acknowledged signal.

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

const CHANGE_ID = "wisdom-durability-test";
const WISDOM = { id: "ws-1", type: "pattern", content: "x" };
const STATE = {
  changeId: CHANGE_ID,
  gates: {},
  tasks: [],
  deltas: {},
  wisdom: [WISDOM],
};

function makeDeps() {
  queryMock.mockResolvedValue(STATE);
  return {
    input: { projectId: "pid-wisdom" },
    legacy: { wisdom: {} },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    persistStateToDiskDurable: vi.fn(async () => {}),
  };
}

describe("createWisdomOps durability wiring (AC6)", () => {
  beforeEach(() => {
    signalMock.mockClear();
    queryMock.mockReset();
  });

  it("add persists confirmed state durably on success (AC2)", async () => {
    const deps = makeDeps();
    await createWisdomOps(deps as never).add(
      CHANGE_ID,
      "pattern",
      "some learning",
      "tk-1",
    );
    expect(deps.persistStateToDiskDurable).toHaveBeenCalledWith(
      CHANGE_ID,
      STATE,
    );
  });

  it("add propagates DiskProjectionPersistError when the durable persist fails (AC1/AC6/AC7)", async () => {
    const deps = makeDeps();
    deps.persistStateToDiskDurable = vi
      .fn()
      .mockRejectedValue(
        new DiskProjectionPersistError(CHANGE_ID, new Error("ENOSPC")),
      );
    await expect(
      createWisdomOps(deps as never).add(
        CHANGE_ID,
        "pattern",
        "some learning",
        "tk-1",
      ),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });
});
