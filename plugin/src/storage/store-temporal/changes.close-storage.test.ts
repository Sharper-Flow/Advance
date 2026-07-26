/**
 * RED storage tests for changes.close / closeBatch lifecycle authority (AC5).
 *
 * Proves current ordering/authorization defects:
 *   - changes.close writes the disk projection before the reducer accepts it;
 *   - a stale host preflight (disk says closed) still authorizes the transition;
 *   - explicit approval/protected/unknown behavior is covered by the reducer path.
 *
 * GREEN must move eligibility validation into the workflow reducer, route the
 * close through fireSignalWithMutationGuard, and persist the projection only
 * after the reducer accepts the signal + readback confirms the outcome.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createChangeOps } from "./changes";
import type { Change } from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";

const fireSignalWithMutationGuardMock = vi.hoisted(() => vi.fn());
const signalMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock("./gates", () => ({
  fireSignalWithMutationGuard: fireSignalWithMutationGuardMock,
}));

vi.mock("./shared", () => ({
  runTemporal: async <T>(op: () => Promise<T>): Promise<T> => op(),
  runTemporalQuery: async <T>(op: () => Promise<T>): Promise<T> => op(),
  getGuardedChangeHandle: async () => ({
    signal: signalMock,
    query: queryMock,
  }),
  getChangeHandle: async () => ({
    signal: signalMock,
    query: queryMock,
  }),
  getTemporalConnection: vi.fn(),
  runTemporalRead: vi.fn(),
  createTemporalReadDeadline: vi.fn(),
  createTemporalReadContext: vi.fn(),
  isTemporalReadExpired: vi.fn(() => false),
  raceWithTemporalDeadline: vi.fn(),
  remainingDeadlineMs: vi.fn(() => 10_000),
  TemporalQueryTimeoutError: class TemporalQueryTimeoutError extends Error {},
}));

const CHANGE_ID = "chg-close-store";
const PROJECT_ID = "pid-close";
const AT = "2026-01-01T00:00:00.000Z";

function draftChange(): Change {
  return {
    id: CHANGE_ID,
    title: "Close store test",
    status: "draft",
    lifecycleState: "open",
    created_at: AT,
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {},
  } as Change;
}

function closedChange(): Change {
  return {
    ...draftChange(),
    status: "closed",
    lifecycleState: "closed",
    closure: {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "prior approval",
      approved_at: AT,
    },
  } as Change;
}

function makeConfirmedState(): ChangeWorkflowState {
  return {
    changeId: CHANGE_ID,
    title: "Close store test",
    status: "closed",
    lifecycleState: "closed",
    createdAt: AT,
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {},
    closure: {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: AT,
      operation_id: "op-close-store-1",
    },
    state_revision: 1,
    operation_ledger: {
      "op-close-store-1": {
        operation_id: "op-close-store-1",
        command_kind: "closeChange",
        payload_hash: "sha256:close",
        outcome: "accepted",
        accepted_at: AT,
        last_seen_at: AT,
      },
    },
  } as ChangeWorkflowState;
}

function makeDeps(overrides?: {
  getTemporalChange?: ReturnType<typeof vi.fn>;
}) {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockResolvedValue({
    success: true,
    data: draftChange(),
  });
  const legacy = {
    paths: { changes: "/tmp/changes", root: "/tmp/project" },
    changes: {
      get: getMock,
      save: saveMock,
    },
  };
  const workflowClient = {
    workflow: { start: vi.fn(), getHandle: vi.fn() },
  };
  const persistStateToDiskDurable = vi.fn(
    async (_changeId: string, state: ChangeWorkflowState) => {
      // Canonical durable path: maps the confirmed workflow state to the
      // legacy change projection and atomically writes it.
      await legacy.changes.save({
        ...state,
        id: state.changeId,
        status: state.status,
        closure: state.closure,
      } as Change);
    },
  );
  const deps = {
    input: {
      projectId: PROJECT_ID,
      legacy,
      temporal: { client: workflowClient },
    },
    legacy,
    invalidateChange: vi.fn(),
    updateOverlay: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    indexTasksFromState: vi.fn(),
    setCachedChange: vi.fn((state: ChangeWorkflowState) => state as Change),
    getTemporalChange: overrides?.getTemporalChange ?? getMock,
    listResolvedChanges: vi.fn(),
    getTemporalWorkflowClient: () => workflowClient,
    dualWriteAfterMutation: vi.fn(),
    persistStateToDiskDurable,
  };
  return { deps, saveMock, getMock, persistStateToDiskDurable };
}

beforeEach(() => {
  fireSignalWithMutationGuardMock.mockReset();
  signalMock.mockReset();
  queryMock.mockReset();
});

describe("changes.close lifecycle storage ordering (AC5)", () => {
  it("persists the disk projection only after signal acknowledgement and readback", async () => {
    const { deps, saveMock } = makeDeps();
    fireSignalWithMutationGuardMock.mockResolvedValue("confirmed");
    queryMock.mockResolvedValue(makeConfirmedState());

    const ops = createChangeOps(deps as never);
    await ops.close(CHANGE_ID, {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: AT,
      operation_id: "op-close-store-1",
    });

    expect(fireSignalWithMutationGuardMock).toHaveBeenCalledWith(
      deps.input,
      CHANGE_ID,
      expect.anything(),
      [
        expect.objectContaining({
          reason: "cancelled",
          operation_id: "op-close-store-1",
        }),
      ],
    );
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "closed" }),
    );
    // The disk projection must be written AFTER the signal has been acknowledged
    // and the reducer readback has confirmed the accepted state.
    expect(saveMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      fireSignalWithMutationGuardMock.mock.invocationCallOrder[0],
    );
  });

  it("refuses to close when host preflight shows an already terminal target", async () => {
    const { deps, saveMock } = makeDeps({
      getTemporalChange: vi.fn().mockResolvedValue({
        success: true,
        data: closedChange(),
      }),
    });
    fireSignalWithMutationGuardMock.mockResolvedValue("confirmed");
    queryMock.mockResolvedValue(makeConfirmedState());

    const ops = createChangeOps(deps as never);

    await expect(
      ops.close(CHANGE_ID, {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "stale approval",
        approved_at: AT,
        operation_id: "op-close-stale-1",
      }),
    ).rejects.toThrow(/already closed|ineligible|lifecycle/i);

    expect(saveMock).not.toHaveBeenCalled();
    expect(fireSignalWithMutationGuardMock).not.toHaveBeenCalled();
  });

  it("throws for unknown targets before any disk write or signal", async () => {
    const { deps, saveMock } = makeDeps({
      getTemporalChange: vi.fn().mockResolvedValue({
        success: false,
        error: "Change not found",
      }),
    });

    const ops = createChangeOps(deps as never);

    await expect(
      ops.close(CHANGE_ID, {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "user approved",
        approved_at: AT,
      }),
    ).rejects.toThrow(/not found/i);

    expect(saveMock).not.toHaveBeenCalled();
    expect(fireSignalWithMutationGuardMock).not.toHaveBeenCalled();
  });
});

describe("changes.closeBatch prevalidation characterization (RED note)", () => {
  it("currently rejects non-draft targets via host prevalidation, not reducer authorization", async () => {
    const { deps, saveMock } = makeDeps({
      getTemporalChange: vi.fn().mockImplementation(async (id: string) => {
        if (id === "archived") {
          return {
            success: true,
            data: {
              ...draftChange(),
              id: "archived",
              status: "archived",
            } as Change,
          };
        }
        return { success: true, data: { ...draftChange(), id } as Change };
      }),
    });

    const ops = createChangeOps(deps as never);
    const result = await ops.closeBatch(["draft", "archived"], {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: AT,
    });

    expect(result.success).toBe(false);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeId: "archived",
          success: false,
          error: expect.stringMatching(/Protected status/),
        }),
      ]),
    );
    // No reducer-driven signal was attempted; the rejection is from the host
    // prevalidation loop. This is the characterization we need to replace with
    // reducer authorization in the batch coordinator task.
    expect(saveMock).not.toHaveBeenCalled();
    expect(fireSignalWithMutationGuardMock).not.toHaveBeenCalled();
  });
});
