/**
 * Mutation Receipt — change-state mutator tests
 *
 * RED→GREEN tests for `recordMutationReceipt` / `findMutationReceipt`
 * (rq-readinessMutationReceipt01). The reducer is the authority that
 * records receipts AFTER applying readiness-affecting mutations, so
 * this suite exercises the FIFO ordering, cap behavior, and the
 * signal-name metadata that lets downstream consumers trace which
 * signal produced each mutation.
 */

import { describe, test, expect } from "vitest";
import {
  applyAcceptanceUpdatedToState,
  applyContractReviewMatrixSetToState,
  applyDesignConcernDispositionedToState,
  applyDesignUpdatedToState,
  applyExecutiveSummaryUpdatedToState,
  applyGateCompletedToState,
  applyVerificationEvidenceDispositionedToState,
  createChangeWorkflowState,
  findMutationReceipt,
  recordMutationReceipt,
} from "./change-state";
import type {
  ContractReviewMatrixSetSignalPayload,
  DesignConcernDispositionedSignalPayload,
  DesignUpdatedSignalPayload,
  ExecutiveSummaryUpdatedSignalPayload,
  AcceptanceUpdatedSignalPayload,
  GateCompletedSignalPayload,
  VerificationEvidenceDispositionedSignalPayload,
} from "../types";
import { MUTATION_RECEIPTS_FIFO_LIMIT } from "./contracts";

function baseChangeState(): ReturnType<typeof createChangeWorkflowState> {
  const state = createChangeWorkflowState({
    changeId: "chg-1",
    title: "T",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  state.projectId = "0000100000000000000000000000000000000000";
  state.initializedAt = "2026-01-01T00:00:00.000Z";
  return state;
}

describe("recordMutationReceipt (rq-readinessMutationReceipt01)", () => {
  test("no-ops when mutationReceiptId is undefined", () => {
    const state = baseChangeState();
    recordMutationReceipt(state, {
      signalName: "gateCompleted",
      recordedAt: "2026-07-19T20:00:00.000Z",
    });
    expect(state.mutationReceipts).toBeUndefined();
  });

  test("prepends the receipt to a FIFO (most recent first)", () => {
    const state = baseChangeState();
    recordMutationReceipt(state, {
      signalName: "designConcernDispositioned",
      mutationReceiptId: "mrec_first",
      recordedAt: "2026-07-19T20:00:00.000Z",
    });
    recordMutationReceipt(state, {
      signalName: "gateCompleted",
      mutationReceiptId: "mrec_second",
      recordedAt: "2026-07-19T20:00:01.000Z",
    });
    expect(state.mutationReceipts).toHaveLength(2);
    expect(state.mutationReceipts?.[0]).toEqual({
      id: "mrec_second",
      signalName: "gateCompleted",
      recordedAt: "2026-07-19T20:00:01.000Z",
    });
    expect(state.mutationReceipts?.[1].id).toBe("mrec_first");
  });

  test("caps the FIFO at MUTATION_RECEIPTS_FIFO_LIMIT", () => {
    const state = baseChangeState();
    for (let i = 0; i < MUTATION_RECEIPTS_FIFO_LIMIT + 25; i++) {
      recordMutationReceipt(state, {
        signalName: "gateCompleted",
        mutationReceiptId: `mrec_${i.toString().padStart(4, "0")}`,
        recordedAt: "2026-07-19T20:00:00.000Z",
      });
    }
    expect(state.mutationReceipts).toHaveLength(MUTATION_RECEIPTS_FIFO_LIMIT);
    expect(state.mutationReceipts?.[0].id).toBe(
      `mrec_${(MUTATION_RECEIPTS_FIFO_LIMIT + 24).toString().padStart(4, "0")}`,
    );
    expect(state.mutationReceipts?.some((r) => r.id === "mrec_0000")).toBe(
      false,
    );
  });
});

describe("findMutationReceipt (rq-readinessMutationReceipt01)", () => {
  test("returns the matching receipt when present", () => {
    const state = baseChangeState();
    recordMutationReceipt(state, {
      signalName: "gateCompleted",
      mutationReceiptId: "mrec_target",
      recordedAt: "2026-07-19T20:00:00.000Z",
    });
    expect(findMutationReceipt(state, "mrec_target")).toEqual({
      id: "mrec_target",
      signalName: "gateCompleted",
      recordedAt: "2026-07-19T20:00:00.000Z",
    });
  });

  test("returns undefined when the receipt is absent", () => {
    const state = baseChangeState();
    expect(findMutationReceipt(state, "mrec_missing")).toBeUndefined();
  });
});

describe("readiness-affecting mutators record the receipt (rq-readinessMutationReceipt01)", () => {
  test("applyDesignUpdatedToState records when applied", () => {
    const state = baseChangeState();
    const payload: DesignUpdatedSignalPayload = {
      text: "# design\ncontent",
      updatedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_design",
    };
    applyDesignUpdatedToState(state, payload);
    expect(state.mutationReceipts).toHaveLength(1);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_design",
      signalName: "designUpdated",
    });
  });

  test("applyExecutiveSummaryUpdatedToState records when applied", () => {
    const state = baseChangeState();
    const payload: ExecutiveSummaryUpdatedSignalPayload = {
      text: "# exec summary\ncontent",
      updatedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_es",
    };
    applyExecutiveSummaryUpdatedToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_es",
      signalName: "executiveSummaryUpdated",
    });
  });

  test("applyAcceptanceUpdatedToState records when applied", () => {
    const state = baseChangeState();
    const payload: AcceptanceUpdatedSignalPayload = {
      text: "# acceptance\ncontent",
      updatedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_acc",
    };
    applyAcceptanceUpdatedToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_acc",
      signalName: "acceptanceUpdated",
    });
  });

  test("applyContractReviewMatrixSetToState records the receipt", () => {
    const state = baseChangeState();
    state.contract = {
      items: [{ id: "C1", kind: "acceptance_criterion", text: "x" }],
      reviewMatrix: undefined,
    };
    const payload: ContractReviewMatrixSetSignalPayload = {
      reviewMatrix: {
        reviewedAt: "2026-07-19T20:00:00.000Z",
        rows: [
          {
            contractId: "C1",
            kind: "acceptance_criterion",
            status: "pass",
            evidencePolicy: "test",
            evidence: "ok",
          },
        ],
      },
      updatedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_matrix",
    };
    applyContractReviewMatrixSetToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_matrix",
      signalName: "contractReviewMatrixSet",
    });
  });

  test("applyDesignConcernDispositionedToState records the receipt", () => {
    const state = baseChangeState();
    const payload: DesignConcernDispositionedSignalPayload = {
      taskId: "tk-1",
      concernKey: "dimension:visual_polish",
      disposition: "fixed",
      evidence: "fixed via patch",
      dispositionedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_dc",
    };
    applyDesignConcernDispositionedToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_dc",
      signalName: "designConcernDispositioned",
    });
  });

  test("applyVerificationEvidenceDispositionedToState records the receipt", () => {
    const state = baseChangeState();
    const payload: VerificationEvidenceDispositionedSignalPayload = {
      taskId: "tk-1",
      concernKey: "verification:run-1",
      disposition: "fixed",
      evidence: "new evidence attached",
      dispositionedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_ve",
    };
    applyVerificationEvidenceDispositionedToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_ve",
      signalName: "verificationEvidenceDispositioned",
    });
  });

  test("applyGateCompletedToState records the receipt", () => {
    const state = baseChangeState();
    const payload: GateCompletedSignalPayload = {
      gateId: "proposal",
      completedBy: "agent",
      completedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_gate",
    };
    applyGateCompletedToState(state, payload);
    expect(state.mutationReceipts?.[0]).toMatchObject({
      id: "mrec_gate",
      signalName: "gateCompleted",
    });
  });

  test("applyDesignUpdatedToState does NOT record the receipt on size-guard rejection", () => {
    const state = baseChangeState();
    const payload: DesignUpdatedSignalPayload = {
      text: "x".repeat(2_000_000),
      updatedAt: "2026-07-19T20:00:00.000Z",
      mutationReceiptId: "mrec_design_rejected",
    };
    applyDesignUpdatedToState(state, payload);
    expect(state.mutationReceipts ?? []).toEqual([]);
  });

  test("mutators without a receipt id do not record (legacy compatibility)", () => {
    const state = baseChangeState();
    const payload: DesignUpdatedSignalPayload = {
      text: "# design\ncontent",
      updatedAt: "2026-07-19T20:00:00.000Z",
    };
    applyDesignUpdatedToState(state, payload);
    expect(state.mutationReceipts ?? []).toEqual([]);
  });
});
