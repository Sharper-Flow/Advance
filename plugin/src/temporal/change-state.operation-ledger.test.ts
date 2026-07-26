/**
 * RED→GREEN tests: operation ledger + monotonic workflow state revision.
 *
 * These tests exercise AC3/AC12/AC13 for the selected document-update reducer
 * paths: stable `operation_id` identity, per-command `state_revision` increment,
 * idempotent replay, typed payload conflict detection, and seed-state
 * preservation across Continue-As-New.
 */
import { describe, expect, it } from "vitest";
import {
  applyAcceptanceUpdatedToState,
  applyDesignUpdatedToState,
  changeSeedStateFromChange,
  createChangeWorkflowState,
} from "./change-state";
import type {
  AcceptanceUpdatedSignalPayload,
  Change,
  DesignUpdatedSignalPayload,
} from "../types";
import type { OperationLedgerEntry } from "./contracts";

const at = "2026-01-01T00:00:00.000Z";

function baseState() {
  const state = createChangeWorkflowState({
    changeId: "chg-1",
    title: "T",
    createdAt: at,
  });
  state.projectId = "proj-1";
  return state;
}

describe("operation identity and state revision (AC3)", () => {
  it("operation identity is stable across retries with different mutationReceiptId", () => {
    const state = baseState();

    applyDesignUpdatedToState(state, {
      text: "# design",
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-stable",
      mutationReceiptId: "mrec-retry-1",
    } as DesignUpdatedSignalPayload);
    applyDesignUpdatedToState(state, {
      text: "# design",
      updatedAt: "2026-01-01T00:00:02.000Z",
      operation_id: "op-stable",
      mutationReceiptId: "mrec-retry-2",
    } as DesignUpdatedSignalPayload);

    // The same logical operation should advance workflow state exactly once.
    expect(state.state_revision).toBe(1);
    expect(Object.keys(state.operation_ledger ?? {})).toEqual(["op-stable"]);
    expect(state.operation_ledger?.["op-stable"].outcome).toBe(
      "idempotent_replay",
    );
    // Only the first accepted signal records a mutation receipt; the retry is a
    // logical no-op.
    expect(state.mutationReceipts).toHaveLength(1);
  });

  it("accepted behavior-changing transitions increment state_revision exactly once", () => {
    const state = baseState();

    expect(state.state_revision).toBe(0);

    applyDesignUpdatedToState(state, {
      text: "# design",
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-design",
    } as DesignUpdatedSignalPayload);
    expect(state.state_revision).toBe(1);

    applyAcceptanceUpdatedToState(state, {
      text: "# acceptance",
      updatedAt: "2026-01-01T00:00:02.000Z",
      operation_id: "op-acceptance",
    } as AcceptanceUpdatedSignalPayload);
    expect(state.state_revision).toBe(2);
  });

  it("same operation_id + same payload returns prior result instead of reapplying", () => {
    const state = baseState();

    applyDesignUpdatedToState(state, {
      text: "# design",
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);
    applyDesignUpdatedToState(state, {
      text: "# design",
      updatedAt: "2026-01-01T00:00:02.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);

    expect(state.state_revision).toBe(1);
    expect(state.operation_ledger?.["op-1"].outcome).toBe("idempotent_replay");
    expect(state.documents?.design).toBe("# design");
  });

  it("same operation_id + different payload produces a typed conflict without erasing accepted result", () => {
    const state = baseState();

    applyDesignUpdatedToState(state, {
      text: "# first",
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);
    applyDesignUpdatedToState(state, {
      text: "# second",
      updatedAt: "2026-01-01T00:00:02.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);

    // State must not be silently overwritten by the conflicting payload.
    expect(state.documents?.design).toBe("# first");
    expect(state.state_revision).toBe(1);
    // Accepted ledger identity/result must survive the conflict.
    expect(state.operation_ledger?.["op-1"].outcome).toBe("accepted");
    expect(state.operation_ledger?.["op-1"].payload_hash).toBeTruthy();
    // Typed conflict is observable in the bounded signal rejection channel.
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0].errorMessage).toMatch(
      /OPERATION_PAYLOAD_CONFLICT/,
    );
  });

  it("regression: accepted → conflict → original retry stays idempotent", () => {
    const state = baseState();

    applyDesignUpdatedToState(state, {
      text: "# original",
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);
    applyDesignUpdatedToState(state, {
      text: "# conflicting",
      updatedAt: "2026-01-01T00:00:02.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);
    applyDesignUpdatedToState(state, {
      text: "# original",
      updatedAt: "2026-01-01T00:00:03.000Z",
      operation_id: "op-1",
    } as DesignUpdatedSignalPayload);

    expect(state.documents?.design).toBe("# original");
    expect(state.state_revision).toBe(1);
    expect(state.operation_ledger?.["op-1"].outcome).toBe("idempotent_replay");
    expect(state.operation_ledger?.["op-1"].last_seen_at).toBe(
      "2026-01-01T00:00:03.000Z",
    );
    expect(state.signal_rejections).toHaveLength(1);
  });

  it("size-guard rejection does not increment state_revision or mutate documents", () => {
    const state = baseState();

    applyDesignUpdatedToState(state, {
      text: "x".repeat(2_000_000),
      updatedAt: "2026-01-01T00:00:01.000Z",
      operation_id: "op-oversized",
    } as DesignUpdatedSignalPayload);

    expect(state.state_revision).toBe(0);
    expect(state.documents?.design).toBeUndefined();
    expect(state.operation_ledger?.["op-oversized"]).toBeUndefined();
  });

  it("changeSeedStateFromChange preserves state_revision and operation_ledger for Continue-As-New", () => {
    const change = {
      id: "legacy",
      title: "Legacy",
      status: "draft",
      created_at: at,
      tasks: [],
      state_revision: 7,
      operation_ledger: {
        "op-legacy": {
          operation_id: "op-legacy",
          command_kind: "designUpdated",
          payload_hash: "sha256:legacy",
          outcome: "accepted",
          accepted_at: at,
          last_seen_at: at,
        } satisfies OperationLedgerEntry,
      },
    } as unknown as Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.state_revision).toBe(7);
    expect(seed.operation_ledger?.["op-legacy"].outcome).toBe("accepted");
  });
});
