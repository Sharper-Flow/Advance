/**
 * T8 KD-8 Layer 2: size-guard structural defense via state-mutation rejection.
 *
 * These tests exercise the reducer-level size enforcement that protects the
 * workflow from oversized payloads even when Layer 1 (tool/store layer)
 * pre-check is bypassed (test fixtures, recovery flows, manual signal
 * injection).
 *
 * Critical invariant: signal handlers MUST NOT throw. Throwing in a Temporal
 * signal handler fails the entire workflow per
 * https://docs.temporal.io/handling-messages#exceptions. The reducers record
 * the rejection in `state.artifacts[kind].rejection` and leave
 * `state.documents[kind]` unchanged.
 */

import { describe, expect, it } from "vitest";

import {
  ARTIFACT_HARD_CAP,
  ARTIFACT_SOFT_CAP,
  createDefaultGates,
} from "../types";
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

describe("Layer 2 size-guard — single-artifact hard cap", () => {
  // Generate content just over the hard cap
  const oversizedText = "x".repeat(ARTIFACT_HARD_CAP + 1024);
  const validText = "small content";

  it.each([
    ["proposal", applyProposalUpdatedToState, "proposal" as const],
    [
      "problemStatement",
      applyProblemStatementUpdatedToState,
      "problemStatement" as const,
    ],
    ["agreement", applyAgreementUpdatedToState, "agreement" as const],
    ["design", applyDesignUpdatedToState, "design" as const],
    [
      "executiveSummary",
      applyExecutiveSummaryUpdatedToState,
      "executiveSummary" as const,
    ],
    ["acceptance", applyAcceptanceUpdatedToState, "acceptance" as const],
  ])(
    "rejects oversized %s without throwing; state.documents.%s unchanged",
    (_name, reducer, kind) => {
      const state = freshState();

      // Reducer does NOT throw — Temporal signal handler semantics require this
      expect(() =>
        reducer(state, {
          text: oversizedText,
          updatedAt: "2026-05-28T00:00:01.000Z",
        }),
      ).not.toThrow();

      // state.documents[kind] remains undefined (no apply)
      expect(state.documents?.[kind]).toBeUndefined();

      // state.artifacts[kind].rejection recorded
      const artifact = state.artifacts[kind];
      expect(artifact).toBeDefined();
      expect(artifact?.rejection).toBeDefined();
      expect(artifact?.rejection?.reason).toBe("ARTIFACT_OVERSIZED");
      expect(artifact?.rejection?.attempted_size).toBe(oversizedText.length);
      expect(artifact?.rejection?.cap).toBe(ARTIFACT_HARD_CAP);
      expect(artifact?.rejection?.rejected_at).toBe("2026-05-28T00:00:01.000Z");

      // state.lastSignalAt updated (signal was handled, just rejected)
      expect(state.lastSignalAt).toBe("2026-05-28T00:00:01.000Z");
    },
  );

  it("applies content within hard cap; clears prior rejection", () => {
    const state = freshState();

    // First apply: oversized — rejected
    applyProposalUpdatedToState(state, {
      text: oversizedText,
      updatedAt: "2026-05-28T00:00:01.000Z",
    });
    expect(state.documents?.proposal).toBeUndefined();
    expect(state.artifacts.proposal?.rejection).toBeDefined();

    // Second apply: valid content — applies, rejection cleared
    applyProposalUpdatedToState(state, {
      text: validText,
      updatedAt: "2026-05-28T00:00:02.000Z",
    });
    expect(state.documents?.proposal).toBe(validText);
    expect(state.artifacts.proposal?.rejection).toBeUndefined();
  });

  it("records sizeWarning when content exceeds soft cap but stays under hard cap", () => {
    const state = freshState();
    const soft_warn_text = "y".repeat(ARTIFACT_SOFT_CAP + 1024);

    applyProposalUpdatedToState(state, {
      text: soft_warn_text,
      updatedAt: "2026-05-28T00:00:03.000Z",
    });

    // Content applied (under hard cap)
    expect(state.documents?.proposal).toBe(soft_warn_text);

    // Soft-cap warning recorded
    const warning = state.artifacts.proposal?.sizeWarning;
    expect(warning).toBeDefined();
    expect(warning?.size).toBe(soft_warn_text.length);
    expect(warning?.soft_cap).toBe(ARTIFACT_SOFT_CAP);
  });

  it("does not record sizeWarning when content is well under soft cap", () => {
    const state = freshState();
    applyProposalUpdatedToState(state, {
      text: "small",
      updatedAt: "2026-05-28T00:00:04.000Z",
    });
    expect(state.documents?.proposal).toBe("small");
    expect(state.artifacts.proposal?.sizeWarning).toBeUndefined();
  });
});

describe("Layer 2 size-guard — aggregate cap projection", () => {
  it("rejects content that would push aggregate over hard cap", () => {
    const state = freshState();

    // Pre-seed state directly (bypassing reducers, simulating data that
    // pre-dates Layer 2 enforcement OR that was loaded from a workflow that
    // had relaxed caps). Per-artifact cap (256 KB) does not apply to
    // pre-existing state; aggregate cap protects continueAsNew seed size.
    //
    // 5 fields × 350 KB = 1.75 MB pre-existing.
    const filler = "z".repeat(350 * 1024);
    state.documents = {
      proposal: filler,
      problemStatement: filler,
      agreement: filler,
      design: filler,
      executiveSummary: filler,
    };

    // Add a 6th field that's within per-artifact cap (200 KB < 256 KB).
    // Projected aggregate: 1.75 MB + 200 KB = ~1.95 MB > 1.8 MB hard cap.
    const newContent = "a".repeat(200 * 1024);
    applyAcceptanceUpdatedToState(state, {
      text: newContent,
      updatedAt: "2026-05-28T00:00:05.000Z",
    });

    // Acceptance NOT applied to documents
    expect(state.documents?.acceptance).toBeUndefined();

    // Aggregate rejection recorded
    const rejection = state.artifacts.acceptance?.rejection;
    expect(rejection).toBeDefined();
    expect(rejection?.reason).toBe("AGGREGATE_OVERSIZED");
  });

  it("applies content when aggregate cap not exceeded", () => {
    const state = freshState();
    state.documents = {
      proposal: "small content",
    };

    applyDesignUpdatedToState(state, {
      text: "design content",
      updatedAt: "2026-05-28T00:00:06.000Z",
    });

    expect(state.documents?.design).toBe("design content");
    expect(state.artifacts.design?.rejection).toBeUndefined();
  });
});

describe("Layer 2 size-guard — workflow continues after rejection", () => {
  it("state remains valid for subsequent signals after a rejection", () => {
    const state = freshState();
    const oversized = "x".repeat(ARTIFACT_HARD_CAP + 1);

    // Reject signal 1
    applyProposalUpdatedToState(state, {
      text: oversized,
      updatedAt: "2026-05-28T00:00:07.000Z",
    });
    expect(state.artifacts.proposal?.rejection).toBeDefined();

    // Subsequent valid signal applies normally
    applyDesignUpdatedToState(state, {
      text: "design ok",
      updatedAt: "2026-05-28T00:00:08.000Z",
    });
    expect(state.documents?.design).toBe("design ok");
    expect(state.artifacts.design?.rejection).toBeUndefined();
  });
});
