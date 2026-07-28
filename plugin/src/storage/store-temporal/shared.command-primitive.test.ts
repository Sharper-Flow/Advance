import { describe, expect, it, vi, beforeEach } from "vitest";
import { changeCommand, type StoreDeps } from "./shared";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../temporal/contracts";

const signalMock = vi.fn();
const queryMock = vi.fn();
const commitProjectionMock = vi.fn();

function makeDeps() {
  return {
    input: {
      projectId: "pid-cmd",
      temporal: {
        client: {
          workflow: {
            getHandle: vi.fn(() => ({
              signal: signalMock,
              query: queryMock,
            })),
          },
        },
      },
    },
    legacy: {
      paths: {
        changes: "/tmp/cmd-changes",
        summariesDir: "/tmp/cmd-summaries",
      },
    },
    setCachedChange: vi.fn(),
  } as StoreDeps;
}

function ledgerEntry(
  queryArg: unknown,
  overrides?: {
    command_kind?: string;
    payload_hash?: string;
    state_revision?: number;
    outcome?: "accepted" | "rejected" | "idempotent_replay";
  },
) {
  return {
    operation_id: queryArg,
    command_kind: overrides?.command_kind ?? "taskUpdated",
    payload_hash: overrides?.payload_hash ?? "payload-hash",
    outcome: overrides?.outcome ?? "accepted",
    state_revision: overrides?.state_revision ?? 1,
    accepted_at: "2026-07-27T00:00:00.000Z",
    last_seen_at: "2026-07-27T00:00:00.000Z",
  };
}

beforeEach(() => {
  signalMock.mockReset();
  queryMock.mockReset();
  commitProjectionMock.mockReset();
  commitProjectionMock.mockResolvedValue({ kind: "committed" });
  signalMock.mockResolvedValue(undefined);
});

describe("changeCommand ledger binding", () => {
  it("rejects when the ledger command_kind does not match", async () => {
    queryMock.mockImplementation(async (queryDef, queryArg) => {
      if (
        queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
      ) {
        return ledgerEntry(queryArg, { command_kind: "gateCompleted" });
      }
      return { state_revision: 1 };
    });

    const outcome = await changeCommand({
      deps: makeDeps(),
      changeId: "c",
      operationId: "op-1",
      commandKind: "taskUpdated",
      payloadHash: "payload-hash",
      signal: "taskUpdatedSignal",
      signalArgs: [{}],
      commitProjection: commitProjectionMock,
    });

    expect(outcome.kind).toBe("rejected");
    expect(commitProjectionMock).not.toHaveBeenCalled();
  });

  it("rejects when the ledger payload_hash does not match", async () => {
    queryMock.mockImplementation(async (queryDef, queryArg) => {
      if (
        queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
      ) {
        return ledgerEntry(queryArg, { payload_hash: "different-hash" });
      }
      return { state_revision: 1 };
    });

    const outcome = await changeCommand({
      deps: makeDeps(),
      changeId: "c",
      operationId: "op-1",
      commandKind: "taskUpdated",
      payloadHash: "payload-hash",
      signal: "taskUpdatedSignal",
      signalArgs: [{}],
      commitProjection: commitProjectionMock,
    });

    expect(outcome.kind).toBe("rejected");
    expect(commitProjectionMock).not.toHaveBeenCalled();
  });

  it("reports projection_failure when the readback state_revision is behind the ledger", async () => {
    queryMock.mockImplementation(async (queryDef, queryArg) => {
      if (
        queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
      ) {
        return ledgerEntry(queryArg, { state_revision: 5 });
      }
      return { state_revision: 3 };
    });

    const outcome = await changeCommand({
      deps: makeDeps(),
      changeId: "c",
      operationId: "op-1",
      commandKind: "taskUpdated",
      payloadHash: "payload-hash",
      signal: "taskUpdatedSignal",
      signalArgs: [{}],
      commitProjection: commitProjectionMock,
    });

    expect(outcome.kind).toBe("projection_failure");
    expect(commitProjectionMock).not.toHaveBeenCalled();
  });
});

describe("changeCommand summary proof", () => {
  it("reports projection_failure when the summary commit returns an error", async () => {
    queryMock.mockImplementation(async (queryDef, queryArg) => {
      if (
        queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
      ) {
        return ledgerEntry(queryArg);
      }
      return { state_revision: 1 };
    });
    commitProjectionMock.mockResolvedValue({
      kind: "error",
      reason: "summary pointer readback failed",
    });

    const outcome = await changeCommand({
      deps: makeDeps(),
      changeId: "c",
      operationId: "op-1",
      commandKind: "taskUpdated",
      payloadHash: "payload-hash",
      signal: "taskUpdatedSignal",
      signalArgs: [{}],
      commitProjection: commitProjectionMock,
    });

    expect(outcome.kind).toBe("projection_failure");
  });
});
