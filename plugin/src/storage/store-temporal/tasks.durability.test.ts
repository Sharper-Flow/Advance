import { describe, expect, it, vi, beforeEach } from "vitest";

import { createTaskOps } from "./tasks";
import { DiskProjectionPersistError } from "./disk-persist";
import { commitChangeProjectionWithSummary } from "../change-summary-shard";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../temporal/contracts";
import {
  createToolOperationContext,
  withToolOperationContext,
} from "../../utils/tool-operation-context";

// AC6 (tasks are durability-critical): task mutations must persist their
// confirmed post-mutation state via the changeCommand primitive and
// commitChangeProjectionWithSummary (not the best-effort dualWriteAfterMutation
// re-query), and must propagate a DiskProjectionPersistError when the disk
// projection write fails so success never outruns disk durability.

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

const CHANGE_ID = "task-store-test";
const TASK = { id: "tk-1", title: "t", status: "done", priority: 0 };

function makeStateWithTask() {
  return {
    changeId: CHANGE_ID,
    tasks: [TASK],
    deltas: {},
    wisdom: [],
    state_revision: 1,
  };
}

function persistError() {
  return new DiskProjectionPersistError(CHANGE_ID, new Error("EACCES"));
}

function makeHandle(stateAfterSignal: unknown) {
  queryMock.mockImplementation(async (queryDef, queryArg) => {
    if (
      queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
    ) {
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
        command_kind: payload.command_kind ?? "taskUpdated",
        payload_hash: payload.payload_hash ?? "hash",
        outcome: "accepted",
        state_revision: 1,
        accepted_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };
    }
    return stateAfterSignal;
  });
  return {
    signal: signalMock,
    query: queryMock,
  };
}

function makeDeps(stateAfterSignal: unknown) {
  const handle = makeHandle(stateAfterSignal);
  return {
    input: {
      projectId: "pid-task",
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
      tasks: {},
      paths: {
        changes: "/tmp/task-changes",
        summariesDir: "/tmp/task-summaries",
      },
    },
    taskChangeIndex: new Map<string, string>(),
    resolveChangeId: vi.fn(async () => CHANGE_ID),
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

describe("createTaskOps durability wiring (AC6)", () => {
  it("update persists the confirmed post-mutation state durably and returns the task", async () => {
    const state = makeStateWithTask();
    const deps = makeDeps(state);
    const ops = createTaskOps(deps as never);

    const result = await ops.update("tk-1", "done");

    expect(result).toEqual(TASK);
    expect(commitChangeProjectionWithSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        changeId: CHANGE_ID,
        mutateLatest: expect.any(Function),
      }),
    );
  });

  it("update propagates DiskProjectionPersistError when the durable persist fails (AC1/AC6)", async () => {
    const deps = makeDeps(makeStateWithTask());
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
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
    expect(commitChangeProjectionWithSummary).toHaveBeenCalled();

    const deps = makeDeps(makeStateWithTask());
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      persistError(),
    );
    await expect(
      createTaskOps(deps as never).add(CHANGE_ID, "new task"),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("uses one task-add operation id for a same-message retry and a new id for the next message", async () => {
    const ops = createTaskOps(makeDeps(makeStateWithTask()) as never);
    const firstContext = createToolOperationContext(
      "adv_task_add",
      { changeId: CHANGE_ID, content: "same task" },
      { sessionID: "session-1", messageID: "message-1" },
    );
    const nextMessageContext = createToolOperationContext(
      "adv_task_add",
      { changeId: CHANGE_ID, content: "same task" },
      { sessionID: "session-1", messageID: "message-2" },
    );

    await withToolOperationContext(firstContext, () =>
      ops.add(CHANGE_ID, "same task"),
    );
    await withToolOperationContext(firstContext, () =>
      ops.add(CHANGE_ID, "same task"),
    );
    await withToolOperationContext(nextMessageContext, () =>
      ops.add(CHANGE_ID, "same task"),
    );

    const operationIds = signalMock.mock.calls.map(
      (call) => (call[1] as { operation_id: string }).operation_id,
    );
    expect(operationIds[1]).toBe(operationIds[0]);
    expect(operationIds[2]).not.toBe(operationIds[0]);
  });

  it("cancel persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6)", async () => {
    const state = makeStateWithTask();
    const ok = makeDeps(state);
    await createTaskOps(ok as never).cancel("tk-1", {
      reason: "obsolete",
      approval_evidence: "user approved",
    });
    expect(commitChangeProjectionWithSummary).toHaveBeenCalled();

    const deps = makeDeps(makeStateWithTask());
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      persistError(),
    );
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
    expect(commitChangeProjectionWithSummary).toHaveBeenCalled();

    const deps = makeDeps(makeStateWithTask());
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      persistError(),
    );
    await expect(
      createTaskOps(deps as never).reclassifyTdd("tk-1", {
        to_intent: "inline",
      } as never),
    ).rejects.toBeInstanceOf(DiskProjectionPersistError);
  });

  it("reports projection failure when the summary shard/pointer commit fails", async () => {
    const state = makeStateWithTask();
    const deps = makeDeps(state);
    vi.mocked(commitChangeProjectionWithSummary).mockResolvedValue({
      kind: "error",
      error: "summary pointer readback mismatch",
    });
    await expect(
      createTaskOps(deps as never).update("tk-1", "done"),
    ).rejects.toThrow(/projection_failure/);
  });
});
