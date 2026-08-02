/**
 * RED tests for close lifecycle authority in the workflow reducer (AC5).
 *
 * These tests prove current defects before GREEN implementation:
 *   - closeChangeInChangeState blindly closes archived/closed/ineligible state;
 *   - rejected close lacks stable operation-ledger rejection and mutates state;
 *   - accepted close does not increment state_revision or record operation identity;
 *   - replay is not idempotent and does not return a stable ledger outcome.
 *
 * GREEN must add reducer-side authorization, operation identity, and signal
 * rejection to closeChangeInChangeState.
 */
import { describe, expect, it } from "vitest";

import {
  closeChangeInChangeState,
  createChangeWorkflowState,
} from "./change-state";
import type { ChangeClosure } from "../types";

const at = "2026-01-01T00:00:00.000Z";

function baseState() {
  const state = createChangeWorkflowState({
    changeId: "chg-1",
    title: "T",
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
    approved_at: "2026-01-01T00:00:01.000Z",
    operation_id: "op-close-1",
    ...overrides,
  };
}

describe("closeChangeInChangeState lifecycle authorization (AC5)", () => {
  it("rejects closing an already archived change without mutating state or revision", () => {
    const state = baseState();
    state.status = "archived";
    state.lifecycleState = "archived";
    state.state_revision = 3;

    closeChangeInChangeState(
      state,
      validClosure({ operation_id: "op-close-archived" }),
    );

    expect(state.status).toBe("archived");
    expect(state.lifecycleState).toBe("archived");
    expect(state.closure).toBeUndefined();
    expect(state.state_revision).toBe(3);
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0].signalName).toBe("closeChange");
    expect(state.operation_ledger?.["op-close-archived"]).toMatchObject({
      operation_id: "op-close-archived",
      command_kind: "closeChange",
      outcome: "rejected",
    });
  });

  it("rejects closing an already closed change without mutating state or revision", () => {
    const state = baseState();
    state.status = "closed";
    state.lifecycleState = "closed";
    state.state_revision = 5;
    state.closure = {
      reason: "cancelled",
      approved_by_user: true,
      approval_evidence: "prior approval",
      approved_at: at,
    };

    closeChangeInChangeState(
      state,
      validClosure({ operation_id: "op-close-closed" }),
    );

    expect(state.status).toBe("closed");
    expect(state.lifecycleState).toBe("closed");
    expect(state.state_revision).toBe(5);
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.operation_ledger?.["op-close-closed"].outcome).toBe(
      "rejected",
    );
  });

  it("rejects closing an active / non-open lifecycle state as ineligible", () => {
    const state = baseState();
    state.status = "active";
    state.lifecycleState = "open";
    state.state_revision = 2;

    closeChangeInChangeState(
      state,
      validClosure({ operation_id: "op-close-active" }),
    );

    expect(state.status).toBe("active");
    expect(state.lifecycleState).toBe("open");
    expect(state.state_revision).toBe(2);
    expect(state.signal_rejections?.[0].signalName).toBe("closeChange");
    expect(state.operation_ledger?.["op-close-active"].outcome).toBe(
      "rejected",
    );
  });

  it("rejects a close that lacks explicit approval and records the rejection", () => {
    const state = baseState();
    state.state_revision = 0;

    const unapproved = {
      reason: "cancelled",
      approved_by_user: false,
      approval_evidence: "",
      approved_at: at,
      operation_id: "op-close-unapproved",
    } as ChangeClosure;

    closeChangeInChangeState(state, unapproved);

    expect(state.status).toBe("draft");
    expect(state.closure).toBeUndefined();
    expect(state.state_revision).toBe(0);
    expect(state.signal_rejections?.[0].signalName).toBe("closeChange");
    expect(state.operation_ledger?.["op-close-unapproved"].outcome).toBe(
      "rejected",
    );
  });
});

describe("closeChangeInChangeState operation identity and revision (AC3)", () => {
  it("accepted close increments state_revision once and records accepted operation identity", () => {
    const state = baseState();

    closeChangeInChangeState(state, validClosure());

    expect(state.status).toBe("closed");
    expect(state.lifecycleState).toBe("closed");
    expect(state.state_revision).toBe(1);
    expect(state.closure).toMatchObject({ reason: "cancelled" });
    expect(state.operation_ledger?.["op-close-1"]).toMatchObject({
      operation_id: "op-close-1",
      command_kind: "closeChange",
      outcome: "accepted",
    });
    expect(state.operation_ledger?.["op-close-1"].payload_hash).toBeTruthy();
    expect(state.lastSignalAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("replaying the same close operation_id is idempotent", () => {
    const state = baseState();

    closeChangeInChangeState(state, validClosure());
    closeChangeInChangeState(state, validClosure());

    expect(state.status).toBe("closed");
    expect(state.state_revision).toBe(1);
    expect(state.operation_ledger?.["op-close-1"].outcome).toBe(
      "idempotent_replay",
    );
    expect(state.operation_ledger?.["op-close-1"].last_seen_at).toBe(
      "2026-01-01T00:00:01.000Z",
    );
  });

  it("same operation_id with different closure payload is a typed conflict without overwriting accepted closure", () => {
    const state = baseState();

    closeChangeInChangeState(state, validClosure({ reason: "cancelled" }));
    closeChangeInChangeState(
      state,
      validClosure({ reason: "not_planned", operation_id: "op-close-1" }),
    );

    expect(state.status).toBe("closed");
    expect(state.state_revision).toBe(1);
    expect(state.closure?.reason).toBe("cancelled");
    expect(state.operation_ledger?.["op-close-1"].outcome).toBe("accepted");
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0].errorMessage).toMatch(
      /OPERATION_PAYLOAD_CONFLICT/,
    );
  });

  it("regression: accepted → conflict → original replay stays idempotent", () => {
    const state = baseState();

    closeChangeInChangeState(state, validClosure({ reason: "cancelled" }));
    closeChangeInChangeState(
      state,
      validClosure({ reason: "not_planned", operation_id: "op-close-1" }),
    );
    closeChangeInChangeState(state, validClosure({ reason: "cancelled" }));

    expect(state.status).toBe("closed");
    expect(state.state_revision).toBe(1);
    expect(state.closure?.reason).toBe("cancelled");
    expect(state.operation_ledger?.["op-close-1"].outcome).toBe(
      "idempotent_replay",
    );
    expect(state.operation_ledger?.["op-close-1"].last_seen_at).toBe(
      "2026-01-01T00:00:01.000Z",
    );
    expect(state.signal_rejections).toHaveLength(1);
  });
});
