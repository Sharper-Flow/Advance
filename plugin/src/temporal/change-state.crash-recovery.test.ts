/**
 * T14 / C8 — Crash-recovery semantics for mid-batch content-signal failure.
 *
 * Critical invariant: content signals are state-replacement (NOT delta).
 * Re-issuing `updateArtifacts(id, samePayload)` after a mid-batch crash is
 * idempotent — already-applied signals are no-ops, missing signals fire
 * fresh, final state matches a single successful batch.
 *
 * These tests exercise the reducer-level idempotency that makes re-issue
 * safe. The tool-layer fan-out (`fireContentSignalsSequentially`) inherits
 * this property because each signal independently overwrites
 * `state.documents[kind]`.
 *
 * See `docs/temporal-recovery.md § Mid-batch content-signal failure` for
 * the user-facing recovery procedure.
 */

import { describe, expect, it } from "vitest";

import { createDefaultGates } from "../types";
import {
  applyAcceptanceUpdatedToState,
  applyAgreementUpdatedToState,
  applyDesignUpdatedToState,
  applyExecutiveSummaryUpdatedToState,
  applyProblemStatementUpdatedToState,
  applyProposalUpdatedToState,
} from "./change-state";
import type { ChangeWorkflowState } from "./contracts";

function freshState(): ChangeWorkflowState {
  return {
    changeId: "test-change",
    title: "test",
    status: "draft",
    createdAt: "2026-05-28T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    documents: {},
  } as ChangeWorkflowState;
}

describe("Crash recovery — content signal idempotency (C8)", () => {
  it("re-applying the same payload twice produces identical state", () => {
    const state1 = freshState();
    const state2 = freshState();

    const at = "2026-05-28T00:00:01.000Z";

    // state1: single successful batch
    applyProposalUpdatedToState(state1, { text: "proposal", updatedAt: at });
    applyProblemStatementUpdatedToState(state1, {
      text: "problem",
      updatedAt: at,
    });
    applyAgreementUpdatedToState(state1, { text: "agreement", updatedAt: at });
    applyDesignUpdatedToState(state1, { text: "design", updatedAt: at });

    // state2: simulated mid-batch crash + re-issue of the full batch
    // Crash after first 2 signals (proposal + problemStatement applied)
    applyProposalUpdatedToState(state2, { text: "proposal", updatedAt: at });
    applyProblemStatementUpdatedToState(state2, {
      text: "problem",
      updatedAt: at,
    });
    // ... crash, then re-issue the FULL batch ...
    applyProposalUpdatedToState(state2, { text: "proposal", updatedAt: at });
    applyProblemStatementUpdatedToState(state2, {
      text: "problem",
      updatedAt: at,
    });
    applyAgreementUpdatedToState(state2, { text: "agreement", updatedAt: at });
    applyDesignUpdatedToState(state2, { text: "design", updatedAt: at });

    // Final documents identical
    expect(state2.documents).toEqual(state1.documents);
  });

  it("mid-batch failure leaves partial state recoverable via re-issue", () => {
    const state = freshState();
    const at = "2026-05-28T00:00:02.000Z";

    // Signals 1 and 2 apply successfully; signal 3 "crashes" before firing.
    applyProposalUpdatedToState(state, { text: "p", updatedAt: at });
    applyProblemStatementUpdatedToState(state, { text: "ps", updatedAt: at });
    // (signals 3-6 NOT applied yet — simulates mid-batch failure)

    expect(state.documents?.proposal).toBe("p");
    expect(state.documents?.problemStatement).toBe("ps");
    expect(state.documents?.agreement).toBeUndefined();

    // Recovery: re-issue the same updateArtifacts call. Signals 1+2 reapply
    // (idempotent overwrite). Signals 3-6 fire fresh.
    applyProposalUpdatedToState(state, { text: "p", updatedAt: at });
    applyProblemStatementUpdatedToState(state, { text: "ps", updatedAt: at });
    applyAgreementUpdatedToState(state, { text: "ag", updatedAt: at });
    applyDesignUpdatedToState(state, { text: "d", updatedAt: at });
    applyExecutiveSummaryUpdatedToState(state, { text: "es", updatedAt: at });
    applyAcceptanceUpdatedToState(state, { text: "ac", updatedAt: at });

    // Final state has all 6 artifacts; reapplied signals didn't corrupt state.
    expect(state.documents).toEqual({
      proposal: "p",
      problemStatement: "ps",
      agreement: "ag",
      design: "d",
      executiveSummary: "es",
      acceptance: "ac",
    });
  });

  it("re-issue with different content overwrites (last-write-wins)", () => {
    const state = freshState();
    const at1 = "2026-05-28T00:00:03.000Z";
    const at2 = "2026-05-28T00:00:04.000Z";

    // Initial apply
    applyProposalUpdatedToState(state, { text: "v1", updatedAt: at1 });
    expect(state.documents?.proposal).toBe("v1");

    // Re-issue with different content (legitimate update, not crash recovery)
    applyProposalUpdatedToState(state, { text: "v2", updatedAt: at2 });
    expect(state.documents?.proposal).toBe("v2");
  });

  it("re-issue with subset of original payload leaves un-issued kinds untouched", () => {
    const state = freshState();
    const at = "2026-05-28T00:00:05.000Z";

    // Initial full batch
    applyProposalUpdatedToState(state, { text: "p", updatedAt: at });
    applyDesignUpdatedToState(state, { text: "d", updatedAt: at });

    // Subsequent partial re-issue — only proposal
    applyProposalUpdatedToState(state, { text: "p-v2", updatedAt: at });

    // Design retained (not re-issued); proposal updated.
    expect(state.documents?.proposal).toBe("p-v2");
    expect(state.documents?.design).toBe("d");
  });
});
