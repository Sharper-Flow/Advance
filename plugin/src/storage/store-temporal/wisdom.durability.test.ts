import { describe, expect, it, vi, beforeEach } from "vitest";

import { createWisdomOps } from "./wisdom";
import { DiskProjectionPersistError } from "./disk-persist";
import { commitChangeProjectionWithSummary } from "../change-summary-shard";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../temporal/contracts";
import {
  createToolOperationContext,
  withToolOperationContext,
} from "../../utils/tool-operation-context";

// AC6 (wisdom is durability-critical): wisdom.add must gate success on a
// durable disk write via the changeCommand primitive and propagate
// DiskProjectionPersistError when the projection write fails after an
// acknowledged signal.

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

const CHANGE_ID = "wisdom-durability-test";
const WISDOM = { id: "ws-1", type: "pattern", content: "x" };
const STATE = {
  changeId: CHANGE_ID,
  gates: {},
  tasks: [],
  deltas: {},
  wisdom: [WISDOM],
  state_revision: 1,
};

function makeHandle() {
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
        command_kind: payload.command_kind ?? "wisdomAdded",
        payload_hash: payload.payload_hash ?? "hash",
        outcome: "accepted",
        state_revision: 1,
        accepted_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };
    }
    return STATE;
  });
  return {
    signal: signalMock,
    query: queryMock,
  };
}

function makeDeps() {
  const handle = makeHandle();
  return {
    input: {
      projectId: "pid-wisdom",
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
      wisdom: {},
      paths: {
        changes: "/tmp/wisdom-changes",
        summariesDir: "/tmp/wisdom-summaries",
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

describe("createWisdomOps durability wiring (AC6)", () => {
  it("add persists confirmed state durably on success (AC2)", async () => {
    const deps = makeDeps();
    await createWisdomOps(deps as never).add(
      CHANGE_ID,
      "pattern",
      "some learning",
      "tk-1",
    );
    expect(commitChangeProjectionWithSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        changeId: CHANGE_ID,
        mutateLatest: expect.any(Function),
      }),
    );
  });

  it("add propagates DiskProjectionPersistError when the durable persist fails (AC1/AC6/AC7)", async () => {
    const deps = makeDeps();
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
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

  it("uses one wisdom-add operation id for a same-message retry and a new id for the next message", async () => {
    const ops = createWisdomOps(makeDeps() as never);
    const firstContext = createToolOperationContext(
      "adv_wisdom_add",
      { changeId: CHANGE_ID, type: "pattern", content: "same learning" },
      { sessionID: "session-1", messageID: "message-1" },
    );
    const nextMessageContext = createToolOperationContext(
      "adv_wisdom_add",
      { changeId: CHANGE_ID, type: "pattern", content: "same learning" },
      { sessionID: "session-1", messageID: "message-2" },
    );

    await withToolOperationContext(firstContext, () =>
      ops.add(CHANGE_ID, "pattern", "same learning", "tk-1"),
    );
    await withToolOperationContext(firstContext, () =>
      ops.add(CHANGE_ID, "pattern", "same learning", "tk-1"),
    );
    await withToolOperationContext(nextMessageContext, () =>
      ops.add(CHANGE_ID, "pattern", "same learning", "tk-1"),
    );

    const operationIds = signalMock.mock.calls.map(
      (call) => (call[1] as { operation_id: string }).operation_id,
    );
    expect(operationIds[1]).toBe(operationIds[0]);
    expect(operationIds[2]).not.toBe(operationIds[0]);
  });

  it("reports projection failure when the summary shard/pointer commit fails", async () => {
    const deps = makeDeps();
    vi.mocked(commitChangeProjectionWithSummary).mockResolvedValue({
      kind: "error",
      error: "summary pointer readback mismatch",
    });
    await expect(
      createWisdomOps(deps as never).add(
        CHANGE_ID,
        "pattern",
        "some learning",
        "tk-1",
      ),
    ).rejects.toThrow(/projection_failure/);
  });
});
