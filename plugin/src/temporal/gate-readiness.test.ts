import { describe, expect, it } from "vitest";
import { createDefaultGates } from "../types";
import {
  ARTIFACT_BACKED_GATES,
  evaluateGateReadiness,
  gateArtifactEvidenceSchema,
} from "./gate-readiness";
import type { ChangeWorkflowState } from "./contracts";

function makeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    projectId: "project-1",
    changeId: "change-1",
    title: "Test change",
    initializedAt: "2026-05-20T00:00:00.000Z",
    id: "change-1",
    status: "draft",
    createdAt: "2026-05-20T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    ...overrides,
  };
}

describe("gate readiness", () => {
  it("maps artifact-backed gates to required artifacts", () => {
    expect(ARTIFACT_BACKED_GATES).toEqual({
      proposal: "proposal",
      discovery: "agreement",
      design: "design",
      acceptance: "acceptance",
    });
  });

  it("reports prior incomplete gate blockers", () => {
    const result = evaluateGateReadiness(makeState(), "design");

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "PRIOR_GATE_INCOMPLETE",
        gateId: "design",
        blockingGateId: "proposal",
      }),
    );
  });

  it("reports missing artifact store blocker for artifact-backed gates", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    const result = evaluateGateReadiness(
      makeState({ gates, projectionChangesDir: undefined }),
      "design",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ARTIFACT_STORE_UNAVAILABLE",
        gateId: "design",
        artifactKind: "design",
      }),
    );
  });

  it("allows explicit compatibility rationale when artifact store is unavailable", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    const result = evaluateGateReadiness(
      makeState({ gates, projectionChangesDir: undefined }),
      "design",
      { compatibilityReason: "legacy replay fixture lacks artifact directory" },
    );

    expect(result.ready).toBe(true);
    expect(result.evidence?.compatibility_reason).toContain("legacy replay");
  });

  it("reports missing acceptance contract blocker for new changes", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    gates.design.status = "done";
    gates.planning.status = "done";
    gates.execution.status = "done";

    const result = evaluateGateReadiness(
      makeState({ gates, projectionChangesDir: "/tmp/changes" }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTANCE_CONTRACT_MISSING",
        gateId: "acceptance",
        artifactKind: "acceptance",
      }),
    );
  });

  it("parses backward-compatible gate artifact evidence", () => {
    expect(
      gateArtifactEvidenceSchema.parse({
        kind: "design",
        path: "/tmp/design.md",
        checked_at: "2026-05-20T00:00:00.000Z",
        non_whitespace_chars: 120,
      }),
    ).toMatchObject({ kind: "design", path: "/tmp/design.md" });
  });
});
