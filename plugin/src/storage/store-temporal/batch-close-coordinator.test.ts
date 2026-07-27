/**
 * RED tests for the durable fail-all batch-close coordinator.
 *
 * These tests prove the coordinator-level defects before GREEN implementation:
 *   - no durable BatchCloseOperation record is created/persisted;
 *   - prepare rejection does not drive abort of already-prepared targets;
 *   - commit is attempted without matching reservations or idempotency;
 *   - crash recovery cannot resume from a durable record;
 *   - partial convergence is reported as success instead of in_progress/repair_required;
 *   - fail-all contracts for approval, protected, and unknown targets are broken.
 *
 * GREEN must implement coordinateBatchClose with reducer-backed prepare/commit/abort
 * and durable operation persistence.
 */
import { describe, expect, it, vi } from "vitest";

import {
  coordinateBatchClose,
  type BatchCloseCoordinationDeps,
  type BatchCloseOperation,
} from "./batch-close-coordinator";
import {
  commitBatchCloseInChangeState,
  createChangeWorkflowState,
  prepareBatchCloseInChangeState,
  abortBatchCloseInChangeState,
} from "../../temporal/change-state";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import type { ChangeClosure } from "../../types";

const at = "2026-01-01T00:00:00.000Z";

function validClosure(overrides?: Partial<ChangeClosure>): ChangeClosure {
  return {
    reason: "cancelled",
    approved_by_user: true,
    approval_evidence: "user approved",
    approved_at: at,
    operation_id: "op-batch-close-1",
    ...overrides,
  };
}

function makeState(
  changeId: string,
  status: "draft" | "archived" = "draft",
): ChangeWorkflowState {
  const state = createChangeWorkflowState({
    changeId,
    title: "Batch target",
    createdAt: at,
  });
  state.status = status;
  state.lifecycleState = status === "archived" ? "archived" : "open";
  return state;
}

function buildDeps(
  states: Record<string, ChangeWorkflowState>,
  initialOperation?: BatchCloseOperation,
): {
  deps: BatchCloseCoordinationDeps;
  persisted: { op?: BatchCloseOperation };
  signals: Array<{
    changeId: string;
    signal: "prepare" | "commit" | "abort";
    payload: unknown;
  }>;
} {
  const persisted: { op?: BatchCloseOperation } = { op: initialOperation };
  const signals: Array<{
    changeId: string;
    signal: "prepare" | "commit" | "abort";
    payload: unknown;
  }> = [];

  const deps: BatchCloseCoordinationDeps = {
    loadOperation: vi.fn(async (batch_id: string) => {
      void batch_id;
      return persisted.op;
    }),
    persistOperation: vi.fn(async (op: BatchCloseOperation) => {
      persisted.op = op;
    }),
    resolveChange: vi.fn(async (changeId: string) => {
      const state = states[changeId];
      if (!state) return { notFound: true, reason: "Change not found" };
      return { state };
    }),
    sendSignal: vi.fn(async (changeId, signal, payload) => {
      signals.push({ changeId, signal, payload });
      // Delegate to the real reducer functions so coordinator-level tests exercise
      // the same lifecycle/rejection semantics as the production signal path.
      const state = states[changeId];
      if (!state) return;
      if (signal === "prepare") {
        prepareBatchCloseInChangeState(
          state,
          payload as { batch_id: string; closure: ChangeClosure },
        );
      } else if (signal === "commit") {
        commitBatchCloseInChangeState(state, payload as { batch_id: string });
      } else if (signal === "abort") {
        abortBatchCloseInChangeState(
          state,
          payload as { batch_id: string; reason: string },
        );
      }
    }),
    queryState: vi.fn(async (changeId: string) => {
      const state = states[changeId];
      if (!state) throw new Error(`Change ${changeId} not found`);
      return JSON.parse(JSON.stringify(state)) as ChangeWorkflowState;
    }),
    now: vi.fn(() => at),
  };

  return { deps, persisted, signals };
}

describe("BatchCloseOperation durable record", () => {
  it("creates a record carrying target IDs, reason, approval, per-target phase/outcome, and overall state", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    const { deps, persisted } = buildDeps(states);

    await coordinateBatchClose(deps, {
      batch_id: "batch-record-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(persisted.op).toMatchObject({
      batch_id: "batch-record-1",
      target_ids: ["chg-a", "chg-b"],
      overall_state: expect.any(String),
      closure: expect.objectContaining({ reason: "cancelled" }),
      per_target: expect.objectContaining({
        "chg-a": expect.objectContaining({
          changeId: "chg-a",
          phase: expect.any(String),
        }),
        "chg-b": expect.objectContaining({
          changeId: "chg-b",
          phase: expect.any(String),
        }),
      }),
    });
  });
});

describe("Prepare phase and fail-all abort", () => {
  it("prepare validates each target and records prepared phase before closing", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    const { deps, signals } = buildDeps(states);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-prepare-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ changeId: "chg-a", signal: "prepare" }),
        expect.objectContaining({ changeId: "chg-b", signal: "prepare" }),
      ]),
    );
    expect(result.kind).toBe("committed_all");
  });

  it("any prepare rejection aborts all prepared targets and closes zero targets", async () => {
    const states = {
      "chg-ok": makeState("chg-ok"),
      "chg-bad": makeState("chg-bad", "archived"),
    };
    const { deps, signals } = buildDeps(states);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-fail-all-1",
      target_ids: ["chg-ok", "chg-bad"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("aborted");
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ changeId: "chg-ok", signal: "abort" }),
      ]),
    );
    expect(signals.some((s) => s.signal === "commit")).toBe(false);
    expect(states["chg-ok"].status).not.toBe("closed");
    expect(states["chg-bad"].status).not.toBe("closed");
  });
});

describe("Commit phase", () => {
  it("commits all targets idempotently after successful prepare", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    const { deps, signals } = buildDeps(states);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-commit-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("committed_all");
    expect(
      signals.filter((s) => s.signal === "commit" && s.changeId === "chg-a"),
    ).toHaveLength(1);
    expect(
      signals.filter((s) => s.signal === "commit" && s.changeId === "chg-b"),
    ).toHaveLength(1);
    expect(states["chg-a"].status).toBe("closed");
    expect(states["chg-b"].status).toBe("closed");
  });

  it("rejects commit without matching prepare reservation", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
    };
    // Simulate a target that lost its reservation after prepare (e.g. conflicting
    // lifecycle command). Seed the durable record as prepared_all so the coordinator
    // enters commit without re-preparing.
    states["chg-a"].batch_close_reservations = {};
    const initialOp: BatchCloseOperation = {
      batch_id: "batch-commit-no-reservation",
      target_ids: ["chg-a"],
      closure: validClosure(),
      overall_state: "prepared_all",
      per_target: {
        "chg-a": { changeId: "chg-a", phase: "prepared" },
      },
      created_at: at,
      updated_at: at,
    };
    const { deps, signals } = buildDeps(states, initialOp);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-commit-no-reservation",
      target_ids: ["chg-a"],
      closure: validClosure(),
    });

    expect(result.kind).not.toBe("committed_all");
    expect(
      signals.some((s) => s.signal === "commit" && s.changeId === "chg-a"),
    ).toBe(true);
  });
});

describe("Crash recovery and idempotency", () => {
  it("resumes from durable record and converges all targets", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    // Pretend chg-a was already prepared and committed in a crashed run.
    states["chg-a"].status = "closed";
    states["chg-a"].lifecycleState = "closed";
    states["chg-a"].batch_close_reservations = {
      "batch-resume-1": { phase: "committed", prepared_at: at, closed_at: at },
    };
    states["chg-b"].batch_close_reservations = {
      "batch-resume-1": { phase: "prepared", prepared_at: at },
    };
    const initialOp: BatchCloseOperation = {
      batch_id: "batch-resume-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
      overall_state: "committing",
      per_target: {
        "chg-a": { changeId: "chg-a", phase: "committed" },
        "chg-b": { changeId: "chg-b", phase: "prepared" },
      },
      created_at: at,
      updated_at: at,
    };
    const { deps, signals } = buildDeps(states, initialOp);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-resume-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("committed_all");
    expect(signals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ changeId: "chg-a", signal: "prepare" }),
      ]),
    );
    expect(
      signals.filter((s) => s.signal === "commit" && s.changeId === "chg-b"),
    ).toHaveLength(1);
  });

  it("stable batch ID makes prepare/commit/abort replay idempotent", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
    };
    const { deps, signals } = buildDeps(states);

    const input = {
      batch_id: "batch-idempotent-1",
      target_ids: ["chg-a"],
      closure: validClosure(),
    };
    await coordinateBatchClose(deps, input);
    const firstCommitCount = signals.filter(
      (s) => s.signal === "commit" && s.changeId === "chg-a",
    ).length;

    await coordinateBatchClose(deps, input);
    const secondCommitCount = signals.filter(
      (s) => s.signal === "commit" && s.changeId === "chg-a",
    ).length;

    expect(secondCommitCount).toBe(firstCommitCount);
  });
});

describe("Partial convergence and safety", () => {
  it("never reports success while partial; returns typed in_progress/repair_required", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    // Force chg-b to never show committed status, simulating a stuck target.
    const { deps } = buildDeps(states);
    const originalQuery = deps.queryState;
    deps.queryState = vi.fn(async (changeId: string) => {
      const s = await originalQuery(changeId);
      if (changeId === "chg-b" && s.status === "closed") {
        // Revert the prepared reservation so commit cannot be confirmed.
        s.status = "draft";
        s.lifecycleState = "open";
        s.batch_close_reservations = {};
      }
      return s;
    });

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-partial-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(result.kind).not.toBe("committed_all");
    expect(["in_progress", "repair_required"]).toContain(result.kind);
    expect(
      Object.values(result.operation.per_target).every(
        (r) => r.phase === "committed",
      ),
    ).toBe(false);
  });

  it("conflicting lifecycle command while reserved is reducer-rejected and aborts the batch", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-b": makeState("chg-b"),
    };
    // Simulate a conflicting single close that removed chg-b's reservation.
    const { deps, signals } = buildDeps(states);
    const originalQuery = deps.queryState;
    deps.queryState = vi.fn(async (changeId: string) => {
      const s = await originalQuery(changeId);
      if (changeId === "chg-b") {
        s.batch_close_reservations = {};
        s.signal_rejections = [
          ...(s.signal_rejections ?? []),
          {
            signalName: "prepareBatchClose",
            errorMessage: "LIFECYCLE_CONFLICT: closeChange already in flight",
            errorClass: "Error",
            payloadDigest: { kind: "json", preview: "" },
            rejectedAt: at,
          },
        ];
      }
      return s;
    });

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-conflict-1",
      target_ids: ["chg-a", "chg-b"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("aborted");
    expect(
      signals.some((s) => s.signal === "abort" && s.changeId === "chg-a"),
    ).toBe(true);
    expect(signals.some((s) => s.signal === "commit")).toBe(false);
  });
});

describe("Abort and rejection hardening", () => {
  it("does not falsely report aborted when an abort signal leaves a prepared reservation", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
      "chg-bad": makeState("chg-bad", "archived"),
    };
    const { deps, signals } = buildDeps(states);
    const originalQuery = deps.queryState;
    deps.queryState = vi.fn(async (changeId: string) => {
      const s = await originalQuery(changeId);
      if (
        changeId === "chg-a" &&
        s.batch_close_reservations?.["batch-abort-fail-1"]?.phase === "aborted"
      ) {
        // Simulate an abort that did not durably clear the reservation.
        s.batch_close_reservations["batch-abort-fail-1"].phase = "prepared";
      }
      return s;
    });

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-abort-fail-1",
      target_ids: ["chg-a", "chg-bad"],
      closure: validClosure(),
    });

    expect(result.kind).not.toBe("aborted");
    expect(["in_progress", "repair_required"]).toContain(result.kind);
    expect(
      signals.some((s) => s.signal === "abort" && s.changeId === "chg-a"),
    ).toBe(true);
  });

  it("ignores unrelated historical prepareBatchClose rejection", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
    };
    // Historical rejection predating this batch operation.
    states["chg-a"].signal_rejections = [
      {
        signalName: "prepareBatchClose",
        errorMessage: "old unrelated rejection",
        errorClass: "Error",
        payloadDigest: { kind: "json", preview: "" },
        rejectedAt: "2025-01-01T00:00:00.000Z",
      },
    ];
    const { deps } = buildDeps(states);
    const originalQuery = deps.queryState;
    deps.queryState = vi.fn(async (changeId: string) => {
      const s = await originalQuery(changeId);
      // Simulate a prepare whose reservation is not yet query-visible.
      s.batch_close_reservations = {};
      return s;
    });

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-old-rejection-1",
      target_ids: ["chg-a"],
      closure: validClosure(),
    });

    expect(result.kind).not.toBe("aborted");
    expect(["in_progress", "repair_required"]).toContain(result.kind);
  });
});

describe("Fail-all contracts", () => {
  it("unknown target fails all and closes zero targets", async () => {
    const states = {
      "chg-a": makeState("chg-a"),
    };
    const { deps, signals } = buildDeps(states);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-unknown-1",
      target_ids: ["chg-a", "chg-missing"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("rejected");
    expect(result.operation.per_target["chg-missing"].phase).toBe("rejected");
    expect(signals.some((s) => s.signal === "commit")).toBe(false);
    expect(states["chg-a"].status).not.toBe("closed");
  });

  it("approval/protected target rejection fails all and closes zero targets", async () => {
    const states = {
      "chg-ok": makeState("chg-ok"),
      "chg-protected": makeState("chg-protected", "archived"),
    };
    const { deps, signals } = buildDeps(states);

    const result = await coordinateBatchClose(deps, {
      batch_id: "batch-protected-1",
      target_ids: ["chg-ok", "chg-protected"],
      closure: validClosure(),
    });

    expect(result.kind).toBe("aborted");
    expect(result.operation.per_target["chg-protected"].phase).toBe("rejected");
    expect(signals.some((s) => s.signal === "commit")).toBe(false);
    expect(states["chg-ok"].status).not.toBe("closed");
    expect(states["chg-protected"].status).not.toBe("closed");
  });
});
