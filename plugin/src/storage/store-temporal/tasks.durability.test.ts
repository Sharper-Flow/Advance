import { describe, expect, it, vi, beforeEach } from "vitest";

import { createTaskOps } from "./tasks";
import { DiskProjectionPersistError } from "./disk-persist";

// AC6 (tasks are durability-critical): task mutations must persist their
// confirmed post-mutation state via persistAndRefreshDurable (not the
// best-effort dualWriteAfterMutation re-query), and must propagate a
// DiskProjectionPersistError when the disk projection write fails so
// success never outruns disk durability.

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

const CHANGE_ID = "task-store-test";
const TASK = { id: "tk-1", title: "t", status: "done", priority: 0 };

function makeStateWithTask() {
  return { changeId: CHANGE_ID, tasks: [TASK], deltas: {}, wisdom: [] };
}

function persistError() {
  return new DiskProjectionPersistError(CHANGE_ID, new Error("EACCES"));
}

function makeDeps(stateAfterSignal: unknown) {
  queryMock.mockResolvedValue(stateAfterSignal);
  return {
    input: { projectId: "pid-task" },
    legacy: { tasks: {} },
    taskChangeIndex: new Map<string, string>(),
    resolveChangeId: vi.fn(async () => CHANGE_ID),
    invalidateChange: vi.fn(),
    persistAndRefreshDurable: vi.fn(async () => {}),
    indexTasksFromState: vi.fn(),
  };
}

describe("createTaskOps durability wiring (AC6)", () => {
  beforeEach(() => {
    signalMock.mockClear();
    queryMock.mockReset();
  });

  it("update persists the confirmed post-mutation state durably and returns the task", async () => {
    const state = makeStateWithTask();
    const deps = makeDeps(state);
    const ops = createTaskOps(deps as never);

    const result = await ops.update("tk-1", "done");

    expect(result).toEqual(TASK);
    // Uses the confirmed state directly — no redundant readback that could
    // yield a false-negative — and gates success on a durable disk write.
    expect(deps.persistAndRefreshDurable).toHaveBeenCalledWith(
      CHANGE_ID,
      state,
    );
  });

  it("update propagates DiskProjectionPersistError when the durable persist fails (AC1/AC6)", async () => {
    const deps = makeDeps(makeStateWithTask());
    deps.persistAndRefreshDurable = vi
      .fn()
      .mockRejectedValue(
        new DiskProjectionPersistError(CHANGE_ID, new Error("ENOSPC")),
      );
    const ops = createTaskOps(deps as never);

    await expect(ops.update("tk-1", "done")).rejects.toBeInstanceOf(
      DiskProjectionPersistError,
    );
  });

  it("add persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6)", async () => {
    const state = makeStateWithTask();
    const ok = makeDeps(state);
    await createTaskOps(ok as never).add(CHANGE_ID, "new task");
    expect(ok.persistAndRefreshDurable).toHaveBeenCalledWith(CHANGE_ID, state);

    const deps = makeDeps(makeStateWithTask());
    deps.persistAndRefreshDurable = vi.fn().mockRejectedValue(persistError());
    await expect(
      createTaskOps(deps as never).add(CHANGE_ID, "new task"),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("cancel persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6)", async () => {
    const state = makeStateWithTask();
    const ok = makeDeps(state);
    await createTaskOps(ok as never).cancel("tk-1", {
      reason: "obsolete",
      approval_evidence: "user approved",
    });
    expect(ok.persistAndRefreshDurable).toHaveBeenCalledWith(CHANGE_ID, state);

    const deps = makeDeps(makeStateWithTask());
    deps.persistAndRefreshDurable = vi.fn().mockRejectedValue(persistError());
    await expect(
      createTaskOps(deps as never).cancel("tk-1", {
        reason: "obsolete",
        approval_evidence: "user approved",
      }),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("reclassifyTdd persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6)", async () => {
    const state = makeStateWithTask();
    const ok = makeDeps(state);
    await createTaskOps(ok as never).reclassifyTdd("tk-1", {
      to_intent: "inline",
    } as never);
    expect(ok.persistAndRefreshDurable).toHaveBeenCalledWith(CHANGE_ID, state);

    const deps = makeDeps(makeStateWithTask());
    deps.persistAndRefreshDurable = vi.fn().mockRejectedValue(persistError());
    await expect(
      createTaskOps(deps as never).reclassifyTdd("tk-1", {
        to_intent: "inline",
      } as never),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });
});
