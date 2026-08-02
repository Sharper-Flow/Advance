/**
 * RED tests for durable batch-close prepare/commit/abort reducer semantics.
 *
 * These tests prove the defects before GREEN implementation:
 *   - prepare does not record a reservation or block conflicting single-close;
 *   - commit/abort are not implemented and not idempotent;
 *   - lifecycle eligibility, approval, and operation identity are not enforced
 *     for batch operations.
 *
 * GREEN must implement prepareBatchCloseInChangeState, commitBatchCloseInChangeState,
 * and abortBatchCloseInChangeState with reducer-owned authorization, stable
 * batch ID idempotency, and reservation-based conflict blocking.
 */
import { describe, expect, it } from "vitest";

import {
  abortBatchCloseInChangeState,
  closeChangeInChangeState,
  commitBatchCloseInChangeState,
  createChangeWorkflowState,
  getBatchCloseReservation,
  prepareBatchCloseInChangeState,
} from "./change-state";
import type { ChangeClosure } from "../types";

const at = "2026-01-01T00:00:00.000Z";

function baseState(changeId = "chg-batch-1") {
  const state = createChangeWorkflowState({
    changeId,
    title: "Batch close test",
    createdAt: at,
  });
  state.projectId = "0000100000000000000000000000000000000000";
  return state;
}

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

describe("prepareBatchCloseInChangeState (AC5)", () => {
  it("records a reservation without closing an eligible draft change", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-batch-1" }),
    });

    expect(state.status).toBe("draft");
    expect(state.lifecycleState).toBe("open");
    expect(state.closure).toBeUndefined();
    expect(getBatchCloseReservation(state, "batch-1")?.phase).toBe("prepared");
    expect(state.state_revision).toBe(1);
    expect(state.operation_ledger?.["op-batch-1"].outcome).toBe("accepted");
    expect(state.operation_ledger?.["op-batch-1"].command_kind).toBe(
      "prepareBatchClose",
    );
  });

  it("rejects prepare on an already terminal change without mutating state", () => {
    const state = baseState();
    state.status = "archived";
    state.lifecycleState = "archived";
    state.state_revision = 3;

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-batch-1" }),
    });

    expect(state.status).toBe("archived");
    expect(state.lifecycleState).toBe("archived");
    expect(state.state_revision).toBe(3);
    expect(getBatchCloseReservation(state, "batch-1")).toBeUndefined();
    expect(state.signal_rejections?.[0].signalName).toBe("prepareBatchClose");
    expect(state.operation_ledger?.["op-batch-1"].outcome).toBe("rejected");
  });

  it("rejects prepare that lacks explicit approval", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: {
        reason: "cancelled",
        approved_by_user: false,
        approval_evidence: "",
        approved_at: at,
        operation_id: "op-batch-unapproved",
      } as ChangeClosure,
    });

    expect(state.status).toBe("draft");
    expect(getBatchCloseReservation(state, "batch-1")).toBeUndefined();
    expect(state.state_revision).toBe(0);
    expect(state.signal_rejections?.[0].signalName).toBe("prepareBatchClose");
    expect(state.operation_ledger?.["op-batch-unapproved"].outcome).toBe(
      "rejected",
    );
  });

  it("replaying prepare with the same batch_id is idempotent", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-batch-1" }),
    });
    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-batch-1" }),
    });

    expect(state.state_revision).toBe(1);
    expect(getBatchCloseReservation(state, "batch-1")?.phase).toBe("prepared");
    expect(state.operation_ledger?.["op-batch-1"].outcome).toBe(
      "idempotent_replay",
    );
  });
});

describe("commitBatchCloseInChangeState", () => {
  it("closes a change with a matching prepared reservation", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-prepare-1" }),
    });
    commitBatchCloseInChangeState(state, { batch_id: "batch-1" });

    expect(state.status).toBe("closed");
    expect(state.lifecycleState).toBe("closed");
    expect(state.closure).toMatchObject({ reason: "cancelled" });
    expect(getBatchCloseReservation(state, "batch-1")?.phase).toBe("committed");
    expect(state.state_revision).toBe(2);
    expect(state.operation_ledger?.["op-prepare-1"].outcome).toBe("accepted");
    expect(state.operation_ledger?.["op-commit-batch-1"]?.outcome).toBe(
      "accepted",
    );
  });

  it("is rejected without a matching prepared reservation", () => {
    const state = baseState();
    state.state_revision = 5;

    commitBatchCloseInChangeState(state, { batch_id: "batch-1" });

    expect(state.status).toBe("draft");
    expect(state.lifecycleState).toBe("open");
    expect(state.state_revision).toBe(5);
    expect(state.signal_rejections?.[0].signalName).toBe("commitBatchClose");
  });

  it("replaying commit with the same batch_id is idempotent", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-prepare-1" }),
    });
    commitBatchCloseInChangeState(state, { batch_id: "batch-1" });
    commitBatchCloseInChangeState(state, { batch_id: "batch-1" });

    expect(state.status).toBe("closed");
    expect(state.state_revision).toBe(2);
    expect(getBatchCloseReservation(state, "batch-1")?.phase).toBe("committed");
    expect(state.operation_ledger?.["op-commit-batch-1"]?.outcome).toBe(
      "idempotent_replay",
    );
  });
});

describe("abortBatchCloseInChangeState", () => {
  it("aborts a prepared reservation without closing the change", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-prepare-1" }),
    });
    abortBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      reason: "sibling target rejected",
    });

    expect(state.status).toBe("draft");
    expect(state.lifecycleState).toBe("open");
    expect(state.closure).toBeUndefined();
    expect(getBatchCloseReservation(state, "batch-1")?.phase).toBe("aborted");
    expect(state.state_revision).toBe(2);
    expect(state.operation_ledger?.["op-abort-batch-1"]?.outcome).toBe(
      "accepted",
    );
  });

  it("is rejected without a matching prepared reservation", () => {
    const state = baseState();
    state.state_revision = 5;

    abortBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      reason: "no reservation",
    });

    expect(state.status).toBe("draft");
    expect(state.state_revision).toBe(5);
    expect(state.signal_rejections?.[0].signalName).toBe("abortBatchClose");
  });
});

describe("batch reservations block conflicting single-close commands", () => {
  it("closeChange is reducer-rejected while a batch reservation is prepared", () => {
    const state = baseState();

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure: validClosure({ operation_id: "op-prepare-1" }),
    });

    closeChangeInChangeState(
      state,
      validClosure({ operation_id: "op-single-close" }),
    );

    expect(state.status).toBe("draft");
    expect(state.lifecycleState).toBe("open");
    expect(state.closure).toBeUndefined();
    expect(
      state.signal_rejections?.some((r) => r.signalName === "closeChange"),
    ).toBe(true);
    expect(state.operation_ledger?.["op-single-close"].outcome).toBe(
      "rejected",
    );
  });

  it("operation idempotency differentiates command kind even with identical payload hash", () => {
    const state = baseState();
    const sharedId = "op-shared-1";
    const closure = validClosure({ operation_id: sharedId });

    prepareBatchCloseInChangeState(state, {
      batch_id: "batch-1",
      closure,
    });
    expect(state.operation_ledger?.[sharedId].command_kind).toBe(
      "prepareBatchClose",
    );

    closeChangeInChangeState(state, closure);

    expect(state.status).toBe("draft");
    expect(
      state.signal_rejections?.some((r) =>
        r.errorMessage.includes("OPERATION_KIND_CONFLICT"),
      ),
    ).toBe(true);
    expect(state.operation_ledger?.[sharedId].command_kind).toBe(
      "prepareBatchClose",
    );
    expect(state.operation_ledger?.[sharedId].outcome).toBe("accepted");
  });
});
