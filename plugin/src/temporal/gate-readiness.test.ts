import { describe, expect, it } from "vitest";
import { createDefaultGates } from "../types";
import {
  ARTIFACT_BACKED_GATES,
  evaluateGateReadiness,
  gateArtifactEvidenceSchema,
  stateBackedArtifactEvidence,
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

function acceptanceReadyGates() {
  const gates = createDefaultGates();
  gates.proposal.status = "done";
  gates.discovery.status = "done";
  gates.design.status = "done";
  gates.planning.status = "done";
  gates.execution.status = "done";
  return gates;
}

function passingContract(): ChangeWorkflowState["contract"] {
  return {
    version: 1,
    rigor: "standard",
    source: {
      artifact: "agreement",
      approvedAt: "2026-05-20T00:00:00.000Z",
    },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Gate artifacts are enforced.",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "test",
        status: "approved",
      },
    ],
    reviewMatrix: {
      reviewedAt: "2026-05-20T00:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "workflow tests pass",
        },
      ],
    },
    amendments: [],
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

  it("builds artifact evidence from workflow state content and metadata", () => {
    const result = stateBackedArtifactEvidence(
      makeState({
        documents: {
          agreement:
            "# Agreement\n\nThis agreement has enough substantive content.",
        },
        artifacts: {
          agreement: {
            path: "/tmp/changes/change-1/agreement.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
            contentHash: "a".repeat(64),
          },
        },
      }),
      "discovery",
      "agreement",
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(true);
    expect(result.evidence).toEqual({
      kind: "agreement",
      path: "/tmp/changes/change-1/agreement.md",
      content_hash: "a".repeat(64),
      non_whitespace_chars: expect.any(Number),
      checked_at: "2026-05-20T00:01:00.000Z",
    });
  });

  it("omits content_hash when workflow metadata lacks hash", () => {
    const result = stateBackedArtifactEvidence(
      makeState({
        documents: {
          design: "# Design\n\nDesign content is present and long enough.",
        },
        artifacts: {
          design: {
            path: "/tmp/changes/change-1/design.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
          },
        },
      }),
      "design",
      "design",
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(true);
    expect(result.evidence).toMatchObject({
      kind: "design",
      path: "/tmp/changes/change-1/design.md",
      non_whitespace_chars: expect.any(Number),
    });
    expect(result.evidence).not.toHaveProperty("content_hash");
  });

  it("blocks missing workflow state artifact content", () => {
    const result = stateBackedArtifactEvidence(
      makeState(),
      "discovery",
      "agreement",
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ARTIFACT_MISSING",
        gateId: "discovery",
        artifactKind: "agreement",
      }),
    );
  });

  it("blocks undersized workflow state artifact content", () => {
    const result = stateBackedArtifactEvidence(
      makeState({ documents: { proposal: "tiny" } }),
      "proposal",
      "proposal",
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ARTIFACT_UNDERSIZED",
        gateId: "proposal",
        artifactKind: "proposal",
      }),
    );
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

  it("does not require artifact store for state-backed proposal discovery or design gates", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    const result = evaluateGateReadiness(
      makeState({
        gates,
        projectionChangesDir: undefined,
        documents: {
          design: "# Design\n\nState-backed design content is enough.",
        },
      }),
      "design",
    );

    expect(result.blockers).not.toContainEqual(
      expect.objectContaining({ code: "ARTIFACT_STORE_UNAVAILABLE" }),
    );
  });

  it("still requires artifact store for acceptance", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: undefined,
        contract: passingContract(),
        artifacts: {
          executiveSummary: {
            path: "/tmp/changes/change-1/executive-summary.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
            contentHash: "a".repeat(64),
          },
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ARTIFACT_STORE_UNAVAILABLE",
        gateId: "acceptance",
        artifactKind: "acceptance",
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

  it("blocks discovery completion when agreement exists but contract is missing", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";

    const result = evaluateGateReadiness(
      makeState({
        gates,
        projectionChangesDir: "/tmp/changes",
        documents: {
          agreement: "# Agreement\n\n## Acceptance Criteria\n- AC1: Works",
        },
      }),
      "discovery",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "DISCOVERY_CONTRACT_MISSING",
        gateId: "discovery",
        artifactKind: "agreement",
      }),
    );
  });

  it("allows discovery completion before agreement exists", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";

    const result = evaluateGateReadiness(
      makeState({ gates, projectionChangesDir: "/tmp/changes" }),
      "discovery",
    );

    expect(result.ready).toBe(true);
  });

  it("allows discovery completion when agreement and contract exist", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";

    const result = evaluateGateReadiness(
      makeState({
        gates,
        projectionChangesDir: "/tmp/changes",
        documents: { agreement: "# Agreement" },
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-05-20T00:00:00.000Z",
          },
          items: [],
          amendments: [],
        },
      }),
      "discovery",
    );

    expect(result.ready).toBe(true);
  });

  it("reports missing acceptance review matrix rows", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    gates.design.status = "done";
    gates.planning.status = "done";
    gates.execution.status = "done";

    const result = evaluateGateReadiness(
      makeState({
        gates,
        projectionChangesDir: "/tmp/changes",
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-05-20T00:00:00.000Z",
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Gate artifacts are enforced.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          reviewMatrix: { reviewedAt: "2026-05-20T00:00:00.000Z", rows: [] },
          amendments: [],
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTANCE_REVIEW_ROW_MISSING",
        contractId: "AC1",
      }),
    );
  });

  it("reports failing acceptance review matrix rows", () => {
    const gates = createDefaultGates();
    gates.proposal.status = "done";
    gates.discovery.status = "done";
    gates.design.status = "done";
    gates.planning.status = "done";
    gates.execution.status = "done";

    const result = evaluateGateReadiness(
      makeState({
        gates,
        projectionChangesDir: "/tmp/changes",
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-05-20T00:00:00.000Z",
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Gate artifacts are enforced.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          reviewMatrix: {
            reviewedAt: "2026-05-20T00:00:00.000Z",
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "fail",
                evidencePolicy: "test",
                evidence: "missing proof",
              },
            ],
          },
          amendments: [],
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTANCE_REVIEW_ROW_FAILING",
        contractId: "AC1",
      }),
    );
  });

  it("blocks acceptance when workflow-visible executive summary metadata is missing", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract: passingContract(),
      }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
        artifactKind: "acceptance",
      }),
    );
  });

  it("blocks acceptance when executive summary metadata lacks content hash", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract: passingContract(),
        artifacts: {
          executiveSummary: {
            path: "/tmp/changes/change-1/executive-summary.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
          },
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTANCE_EXECUTIVE_SUMMARY_HASH_MISSING",
        artifactKind: "acceptance",
      }),
    );
  });

  it("allows acceptance when review matrix and executive summary hash metadata exist", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract: passingContract(),
        artifacts: {
          executiveSummary: {
            path: "/tmp/changes/change-1/executive-summary.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
            contentHash: "a".repeat(64),
          },
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(true);
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
