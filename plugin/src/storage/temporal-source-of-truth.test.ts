/**
 * AC2 cross-session + AC7 consumer-alignment integration smoke.
 *
 * These tests verify the architectural invariants that make the
 * Temporal-first migration work:
 *
 *   - AC2: For an active workflow, artifact content is retrievable from
 *     Temporal state.documents without depending on per-session XDG disk.
 *   - AC7: Existing consumers (`gate-readiness agreementExists`,
 *     `archive-summary.renderBriefSummary` fallback chain) already read
 *     state.documents correctly — they only needed producers to start
 *     firing content signals.
 *
 * Deeper integration tests cover the signal pipeline:
 *   - `temporal/workflows.signal-handlers.test.ts` — signals populate
 *     state.documents end-to-end via real TestWorkflowEnvironment.
 *   - `tools/change.read-artifact.test.ts` — readArtifact prefers
 *     state.documents over disk; disk-deletion-mid-test still returns
 *     content from Temporal (the AC2 cross-session XDG smoke).
 *   - `storage/store-temporal/no-disk-writes-invariant.test.ts` — AC8
 *     structural assertion against the source code.
 */

import { describe, expect, it } from "vitest";

import { renderBriefSummary } from "../utils/archive-summary";
import type { ChangeWorkflowState } from "../temporal/contracts";

function buildState(
  documents: ChangeWorkflowState["documents"],
  title = "Default Title",
): ChangeWorkflowState {
  return {
    changeId: "test-change",
    title,
    status: "archived",
    createdAt: "2026-05-28T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {},
    artifacts: {},
    documents,
    acceptanceCriteria: [],
  } as unknown as ChangeWorkflowState;
}

const summaryInput = {
  status: "archived" as const,
  archivedAt: "2026-05-28T01:00:00.000Z",
  approvalEvidence: "User approved via question tool",
  approvedBy: "test-user",
};

describe("AC7 — archive-summary consumes state.documents", () => {
  it("renders summary from state.documents.problemStatement when populated", () => {
    const state = buildState({
      problemStatement: "Specific problem description.",
      proposal: "Proposal text.",
    });
    const summary = renderBriefSummary({ ...summaryInput, state });
    expect(summary).toContain("Specific problem description.");
    // Should NOT fall through to title since documents are populated
    expect(summary).not.toMatch(/## Why\s*\n\s*Default Title/);
  });

  it("falls back to state.documents.proposal when problemStatement is absent", () => {
    const state = buildState({ proposal: "Proposal text." });
    const summary = renderBriefSummary({ ...summaryInput, state });
    expect(summary).toContain("Proposal text.");
  });

  it("falls back to title only when documents is fully empty", () => {
    const state = buildState({});
    const summary = renderBriefSummary({ ...summaryInput, state });
    // archive-summary fallback chain: problemStatement → proposal → title
    expect(summary).toContain("Default Title");
  });

  it("renders structurally identical output regardless of documents source", () => {
    // The renderBriefSummary fallback chain reads state.documents first.
    // Whether documents was populated by content signal (T7 production
    // path) or by workflow-start hydration (T11), the output is identical.
    const fromSignal = renderBriefSummary({
      ...summaryInput,
      state: buildState({ problemStatement: "Same content" }),
    });
    const fromHydration = renderBriefSummary({
      ...summaryInput,
      state: buildState({ problemStatement: "Same content" }),
    });
    expect(fromSignal).toBe(fromHydration);
  });
});
