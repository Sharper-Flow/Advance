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
import type { Change, ChangeClosure } from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import { closeChangeSignal } from "../../temporal/messages";

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
  isTemporalReadExpired: vi.fn(),
  raceWithTemporalDeadline: async <T>(op: Promise<T>): Promise<T> => op,
  remainingDeadlineMs: vi.fn(),
  TemporalQueryTimeoutError: Error,
  fallbackOperationId: vi.fn((kind: string) => kind),
  buildSummaryCommitProjection: vi.fn(() => vi.fn()),
  changeCommand: async (options: {
    deps: {
      persistStateToDiskDurable?: (
        changeId: string,
        state: ChangeWorkflowState,
      ) => Promise<void>;
      setCachedChange?: (state: ChangeWorkflowState) => unknown;
    };
    changeId: string;
    signal: unknown;
    signalArgs: unknown[];
    operationId: string;
  }) => {
    await signalMock(options.signal, ...options.signalArgs);
    const ledger = await queryMock(
      { name: "adv.change.getOperationLedgerOutcome" },
      options.operationId,
    );
    if (
      ledger?.outcome !== "accepted" &&
      ledger?.outcome !== "idempotent_replay"
    ) {
      return { kind: "rejected", reason: "mock rejected" };
    }
    const state = (await queryMock({
      name: "adv.change.getState",
    })) as ChangeWorkflowState;
    if (options.deps.persistStateToDiskDurable) {
      await options.deps.persistStateToDiskDurable(options.changeId, state);
    }
    if (options.deps.setCachedChange) {
      options.deps.setCachedChange(state);
    }
    return { kind: "accepted", state };
  },
}));

import {
  abortBatchCloseSignal,
  commitBatchCloseSignal,
  prepareBatchCloseSignal,
} from "../../temporal/messages";
import { stableStringify } from "../../temporal/digest";
import { createHash, randomUUID } from "crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";

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

function makeDraftWorkflowState(
  changeId: string,
  reservation?: {
    batch_id: string;
    phase: "prepared" | "committed" | "aborted";
    closure: ChangeClosure;
  },
  signalRejection?: { signalName: string; errorMessage: string },
): ChangeWorkflowState {
  return {
    ...makeConfirmedState(),
    changeId,
    id: changeId,
    status: reservation?.phase === "committed" ? "closed" : "draft",
    lifecycleState: reservation?.phase === "committed" ? "closed" : "open",
    closure:
      reservation?.phase === "committed" ? reservation.closure : undefined,
    batch_close_reservations: reservation
      ? {
          [reservation.batch_id]: {
            phase: reservation.phase,
            prepared_at: AT,
            closure: reservation.closure,
          },
        }
      : {},
    signal_rejections: signalRejection
      ? [
          {
            signalName: signalRejection.signalName,
            errorMessage: signalRejection.errorMessage,
            errorClass: "SignalRejection",
            payloadDigest: "sha256:test",
            rejectedAt: "2099-01-01T00:00:00.000Z",
          },
        ]
      : [],
  } as ChangeWorkflowState;
}

function computeBatchId(targetIds: string[], closure: ChangeClosure): string {
  const canonicalIds = [...new Set(targetIds)].sort();
  const hash = createHash("sha256");
  for (const id of canonicalIds) hash.update(id);
  hash.update(stableStringify(closure));
  return `batch-close-${hash.digest("hex")}`;
}

function makeDeps(overrides?: {
  getTemporalChange?: ReturnType<typeof vi.fn>;
}) {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockResolvedValue({
    success: true,
    data: draftChange(),
  });
  const changesPath = `/tmp/changes-close-storage-${randomUUID()}`;
  const legacy = {
    paths: {
      changes: changesPath,
      summariesDir: "/tmp/project/.adv/summaries",
      root: "/tmp/project",
    },
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
    queryMock.mockImplementation(async (queryDef) => {
      if (queryDef.name === "adv.change.getOperationLedgerOutcome") {
        return { outcome: "accepted" };
      }
      return makeConfirmedState();
    });

    const ops = createChangeOps(deps as never);
    await ops.close(CHANGE_ID, {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: AT,
      operation_id: "op-close-store-1",
    });

    expect(signalMock).toHaveBeenCalledWith(
      closeChangeSignal,
      expect.objectContaining({
        reason: "cancelled",
        operation_id: "op-close-store-1",
      }),
    );
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "closed" }),
    );
    // The disk projection must be written AFTER the signal has been acknowledged
    // and the reducer readback has confirmed the accepted state.
    expect(saveMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      signalMock.mock.invocationCallOrder[0],
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
    expect(signalMock).not.toHaveBeenCalled();
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
    expect(signalMock).not.toHaveBeenCalled();
  });
});

describe("changes.closeBatch durable coordinator routing (AC5)", () => {
  function baseClosure(): ChangeClosure {
    return {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: AT,
      operation_id: "op-batch-1",
    };
  }

  it("prepares, commits, persists projections, and records a durable operation record", async () => {
    const { deps, persistStateToDiskDurable } = makeDeps();
    let currentBatchId: string | undefined;
    let phase: "prepared" | "committed" = "prepared";

    signalMock.mockImplementation(async (signalDef, payload) => {
      if (signalDef === prepareBatchCloseSignal) {
        currentBatchId = payload.batch_id;
        phase = "prepared";
      } else if (signalDef === commitBatchCloseSignal) {
        phase = "committed";
      }
    });

    queryMock.mockImplementation(async () => {
      const state = makeDraftWorkflowState(
        "any",
        currentBatchId
          ? { batch_id: currentBatchId, phase, closure: baseClosure() }
          : undefined,
      );
      return state;
    });

    const targetIds = ["draft-a", "draft-b"];
    const closure = baseClosure();
    const ops = createChangeOps(deps as never);
    const result = await ops.closeBatch(targetIds, closure);

    expect(result.success).toBe(true);
    expect(result.closed).toBe(2);
    expect(result.results).toEqual(
      targetIds.map((id) => ({
        changeId: id,
        success: true,
        state: "committed",
      })),
    );

    expect(signalMock).toHaveBeenCalledWith(
      prepareBatchCloseSignal,
      expect.objectContaining({ batch_id: expect.any(String), closure }),
    );
    expect(signalMock).toHaveBeenCalledWith(
      commitBatchCloseSignal,
      expect.objectContaining({ batch_id: expect.any(String) }),
    );
    expect(persistStateToDiskDurable).toHaveBeenCalledTimes(2);

    const batchOpsDir = `${deps.input.legacy.paths.changes}/.batch-operations`;
    const files = await readdir(batchOpsDir);
    expect(files).toHaveLength(1);
    const record = JSON.parse(
      await readFile(`${batchOpsDir}/${files[0]}`, "utf-8"),
    ) as {
      batch_id: string;
      overall_state: string;
      per_target: Record<string, { phase: string }>;
    };
    expect(record.overall_state).toBe("committed_all");
    for (const id of targetIds) {
      expect(record.per_target[id].phase).toBe("committed");
    }
  });

  it("fail-alls when a target is unknown before sending any signal", async () => {
    const { deps, saveMock } = makeDeps({
      getTemporalChange: vi.fn().mockImplementation(async (id: string) => {
        if (id === "missing") {
          return { success: false, error: "Change not found" };
        }
        return { success: true, data: { ...draftChange(), id } as Change };
      }),
    });

    const ops = createChangeOps(deps as never);
    const result = await ops.closeBatch(["draft-a", "missing"], baseClosure());

    expect(result.success).toBe(false);
    expect(result.closed).toBe(0);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeId: "missing",
          success: false,
          error: expect.stringMatching(/not found|unknown/i),
        }),
      ]),
    );
    expect(signalMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("aborts prepared targets when the reducer rejects a prepare", async () => {
    const { deps } = makeDeps();
    let currentBatchId: string | undefined;
    let prepareCount = 0;
    let mode: "prepare" | "abort" = "prepare";

    signalMock.mockImplementation(async (signalDef, payload) => {
      if (signalDef === prepareBatchCloseSignal) {
        currentBatchId = payload.batch_id;
        prepareCount++;
      } else if (signalDef === abortBatchCloseSignal) {
        mode = "abort";
      }
    });

    queryMock.mockImplementation(async () => {
      if (mode === "abort") {
        return makeDraftWorkflowState(
          "any",
          currentBatchId
            ? {
                batch_id: currentBatchId,
                phase: "aborted",
                closure: baseClosure(),
              }
            : undefined,
        );
      }
      const rejected = prepareCount >= 2;
      return makeDraftWorkflowState(
        "any",
        rejected
          ? undefined
          : currentBatchId
            ? {
                batch_id: currentBatchId,
                phase: "prepared",
                closure: baseClosure(),
              }
            : undefined,
        rejected
          ? {
              signalName: "prepareBatchClose",
              errorMessage:
                "LIFECYCLE_INELIGIBLE: prepareBatchClose rejected because change is not in an eligible state",
            }
          : undefined,
      );
    });

    const targetIds = ["draft-a", "draft-b"];
    const ops = createChangeOps(deps as never);
    const result = await ops.closeBatch(targetIds, baseClosure());

    expect(result.success).toBe(false);
    expect(result.closed).toBe(0);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ success: false, state: "aborted" }),
        expect.objectContaining({ success: false, state: "rejected" }),
      ]),
    );

    expect(signalMock).toHaveBeenCalledWith(
      prepareBatchCloseSignal,
      expect.anything(),
    );
    expect(signalMock).toHaveBeenCalledWith(
      abortBatchCloseSignal,
      expect.anything(),
    );
    expect(signalMock).not.toHaveBeenCalledWith(
      commitBatchCloseSignal,
      expect.anything(),
    );
  });

  it("reuses the durable operation record on a second call with the same inputs", async () => {
    const { deps, persistStateToDiskDurable } = makeDeps();
    let currentBatchId: string | undefined;
    let phase: "prepared" | "committed" = "prepared";

    signalMock.mockImplementation(async (signalDef, payload) => {
      if (signalDef === prepareBatchCloseSignal) {
        currentBatchId = payload.batch_id;
        phase = "prepared";
      } else if (signalDef === commitBatchCloseSignal) {
        phase = "committed";
      }
    });

    queryMock.mockImplementation(async () =>
      makeDraftWorkflowState(
        "any",
        currentBatchId
          ? { batch_id: currentBatchId, phase, closure: baseClosure() }
          : undefined,
      ),
    );

    const targetIds = ["draft-a", "draft-b"];
    const closure = baseClosure();
    const ops = createChangeOps(deps as never);

    const first = await ops.closeBatch(targetIds, closure);
    expect(first.success).toBe(true);
    expect(first.closed).toBe(2);

    const signalCallsAfterFirst = signalMock.mock.calls.length;

    const second = await ops.closeBatch(targetIds, closure);
    expect(second.success).toBe(true);
    expect(second.closed).toBe(2);

    // The second invocation should load the already-committed operation record
    // and not re-send prepare/commit signals.
    expect(signalMock.mock.calls.length).toBe(signalCallsAfterFirst);
    expect(persistStateToDiskDurable).toHaveBeenCalledTimes(4);
  });

  it("returns a typed schema error when the durable operation record is corrupt", async () => {
    const { deps } = makeDeps();
    const closure = baseClosure();
    const targetIds = ["draft-a", "draft-b"];
    const batchId = computeBatchId(targetIds, closure);

    const recordPath = `${deps.input.legacy.paths.changes}/.batch-operations/${batchId}.json`;
    await mkdir(`${deps.input.legacy.paths.changes}/.batch-operations`, {
      recursive: true,
    });
    await writeFile(recordPath, "{not valid json", "utf-8");

    const ops = createChangeOps(deps as never);
    const result = await ops.closeBatch(targetIds, closure);

    expect(result.success).toBe(false);
    expect(result.closed).toBe(0);
    expect(result.results).toEqual(
      targetIds.map((changeId) => ({
        changeId,
        success: false,
        error: expect.stringMatching(/corrupt|unreadable|Unexpected/i),
      })),
    );
    expect(result.message).toMatch(/corrupt|unreadable/i);
    expect(signalMock).not.toHaveBeenCalled();
  });

  it("canonicalizes target IDs so equivalent orders and duplicates reuse the same batch id", async () => {
    const { deps } = makeDeps();
    let currentBatchId: string | undefined;
    let phase: "prepared" | "committed" = "prepared";

    signalMock.mockImplementation(async (signalDef, payload) => {
      if (signalDef === prepareBatchCloseSignal) {
        currentBatchId = payload.batch_id;
        phase = "prepared";
      } else if (signalDef === commitBatchCloseSignal) {
        phase = "committed";
      }
    });

    queryMock.mockImplementation(async () =>
      makeDraftWorkflowState(
        "any",
        currentBatchId
          ? { batch_id: currentBatchId, phase, closure: baseClosure() }
          : undefined,
      ),
    );

    const ops = createChangeOps(deps as never);
    const closure = baseClosure();

    const first = await ops.closeBatch(
      ["draft-b", "draft-a", "draft-a"],
      closure,
    );
    expect(first.success).toBe(true);
    expect(first.closed).toBe(2);
    expect(first.results.map((r) => r.changeId)).toEqual([
      "draft-b",
      "draft-a",
      "draft-a",
    ]);

    const signalCallsAfterFirst = signalMock.mock.calls.length;

    // Equivalent canonical set: different order and with a duplicate.
    const second = await ops.closeBatch(
      ["draft-a", "draft-b", "draft-a"],
      closure,
    );
    expect(second.success).toBe(true);
    expect(second.closed).toBe(2);

    // Same batch id means no new signals were sent.
    expect(signalMock.mock.calls.length).toBe(signalCallsAfterFirst);
  });

  it("serializes concurrent same-batch invocations so the second observes the committed outcome", async () => {
    const { deps } = makeDeps();
    const knownBatches = new Map<string, "prepared" | "committed">();

    signalMock.mockImplementation(async (signalDef, payload) => {
      const batchId = payload.batch_id as string;
      if (signalDef === prepareBatchCloseSignal) {
        knownBatches.set(batchId, "prepared");
        // Slow enough that a second concurrent invocation would overlap
        // if it were not serialized by the per-batch file lock.
        await new Promise((resolve) => setTimeout(resolve, 30));
      } else if (signalDef === commitBatchCloseSignal) {
        knownBatches.set(batchId, "committed");
      }
    });

    queryMock.mockImplementation(async () => {
      const reservations = Object.fromEntries(
        [...knownBatches.entries()].map(([batchId, phase]) => [
          batchId,
          { phase, prepared_at: AT, closure: baseClosure() },
        ]),
      );
      const state = makeDraftWorkflowState("any");
      state.batch_close_reservations = reservations;
      state.status = knownBatches.size > 0 ? "closed" : "draft";
      state.lifecycleState = state.status;
      state.closure = knownBatches.size > 0 ? baseClosure() : undefined;
      return state;
    });

    const ops = createChangeOps(deps as never);
    const closure = baseClosure();

    const [first, second] = await Promise.all([
      ops.closeBatch(["draft-a", "draft-b"], closure),
      ops.closeBatch(["draft-b", "draft-a"], closure),
    ]);

    expect(first.success).toBe(true);
    expect(first.closed).toBe(2);
    expect(second.success).toBe(true);
    expect(second.closed).toBe(2);

    // Only one of the two concurrent invocations actually drove prepare+commit;
    // the second loaded the committed operation record.
    expect(signalMock.mock.calls.length).toBe(4);
  });

  it("does not serialize concurrent invocations for different batches", async () => {
    const { deps } = makeDeps();
    const knownBatches = new Map<string, "prepared" | "committed">();

    signalMock.mockImplementation(async (signalDef, payload) => {
      const batchId = payload.batch_id as string;
      if (signalDef === prepareBatchCloseSignal) {
        knownBatches.set(batchId, "prepared");
        await new Promise((resolve) => setTimeout(resolve, 30));
      } else if (signalDef === commitBatchCloseSignal) {
        knownBatches.set(batchId, "committed");
      }
    });

    queryMock.mockImplementation(async () => {
      const reservations = Object.fromEntries(
        [...knownBatches.entries()].map(([batchId, phase]) => [
          batchId,
          { phase, prepared_at: AT, closure: baseClosure() },
        ]),
      );
      const state = makeDraftWorkflowState("any");
      state.batch_close_reservations = reservations;
      state.status = knownBatches.size > 0 ? "closed" : "draft";
      state.lifecycleState = state.status;
      state.closure = knownBatches.size > 0 ? baseClosure() : undefined;
      return state;
    });

    const ops = createChangeOps(deps as never);

    const [first, second] = await Promise.all([
      ops.closeBatch(["draft-a"], baseClosure()),
      ops.closeBatch(["draft-b"], baseClosure()),
    ]);

    expect(first.success).toBe(true);
    expect(first.closed).toBe(1);
    expect(second.success).toBe(true);
    expect(second.closed).toBe(1);

    // Different batch locks mean both coordinators ran prepare+commit.
    expect(signalMock.mock.calls.length).toBe(4);
  });
});
