import { describe, expect, it, vi, beforeEach } from "vitest";

import { createGateOps } from "./gates";
import { DiskProjectionPersistError } from "./disk-persist";
import { commitChangeProjectionWithSummary } from "../change-summary-shard";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../temporal/contracts";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";

// AC6 (gates are durability-critical): gate completion + re-entry must gate
// success on a durable disk write via the changeCommand primitive and
// propagate DiskProjectionPersistError when the projection write fails after
// an acknowledged signal.

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

const CHANGE_ID = "gate-durability-test";
const STATE = {
  changeId: CHANGE_ID,
  gates: {},
  tasks: [],
  deltas: {},
  wisdom: [],
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
        command_kind: payload.command_kind ?? "gateCompleted",
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
    workflowId: `adv/change/pid-gate/${CHANGE_ID}`,
    signal: signalMock,
    query: queryMock,
  };
}

function makeDeps() {
  const handle = makeHandle();
  return {
    input: {
      projectId: "00d0a0e000000000000000000000000000000000",
      legacy: {
        changes: {
          get: vi.fn().mockResolvedValue({ success: true, data: null }),
        },
      },
      temporal: createMockOwnerFromClient({
        workflow: {
          getHandle: vi.fn().mockReturnValue(handle),
        },
      }),
    },
    legacy: {
      gates: {},
      paths: {
        changes: "/tmp/gate-changes",
        summariesDir: "/tmp/gate-summaries",
      },
    },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    getTemporalChange: vi.fn(),
  };
}

function persistError() {
  return new DiskProjectionPersistError(CHANGE_ID, new Error("EACCES"));
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

describe("createGateOps durability wiring (AC6)", () => {
  it("complete persists confirmed state durably and propagates DiskProjectionPersistError on failure (AC1/AC6/AC7)", async () => {
    const ok = makeDeps();
    await createGateOps(ok as never).complete(CHANGE_ID, "discovery");
    expect(commitChangeProjectionWithSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        changeId: CHANGE_ID,
        mutateLatest: expect.any(Function),
      }),
    );

    const deps = makeDeps();
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      persistError(),
    );
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
    expect(commitChangeProjectionWithSummary).toHaveBeenCalled();

    const deps = makeDeps();
    vi.mocked(commitChangeProjectionWithSummary).mockRejectedValue(
      persistError(),
    );
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

  it("reports projection failure when the summary shard/pointer commit fails", async () => {
    const deps = makeDeps();
    vi.mocked(commitChangeProjectionWithSummary).mockResolvedValue({
      kind: "error",
      error: "summary pointer readback mismatch",
    });
    await expect(
      createGateOps(deps as never).complete(CHANGE_ID, "discovery"),
    ).rejects.toThrow(/projection_failure/);
  });
});
