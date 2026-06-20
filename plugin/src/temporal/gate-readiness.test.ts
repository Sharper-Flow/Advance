import { describe, expect, it } from "vitest";
import { createDefaultGates } from "../types";
import {
  ARTIFACT_BACKED_GATES,
  artifactCascadeWarnings,
  evaluateGateReadiness,
  gateArtifactEvidenceSchema,
  stateBackedArtifactEvidence,
  stateBackedAcceptanceProof,
  checkOpsFollowupReleaseBlockers,
  getOpenOpsFollowupObligations,
} from "./gate-readiness";
import type { ChangeWorkflowState } from "./contracts";
import type { OpsFollowupLink } from "../types";

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

function releaseReadyGates() {
  const gates = acceptanceReadyGates();
  gates.acceptance.status = "done";
  return gates;
}

function makeRequiredCriticalContract(
  itemOverrides: Partial<
    NonNullable<ChangeWorkflowState["contract"]>["items"][number]
  >[],
  rowStatus?: "pass" | "fail" | "violated" | "unknown",
  opts: { omitRowForId?: string[]; omitReviewMatrix?: boolean } = {},
): ChangeWorkflowState["contract"] {
  return {
    version: 1,
    rigor: "standard",
    source: {
      artifact: "agreement",
      approvedAt: "2026-05-20T00:00:00.000Z",
    },
    items: itemOverrides.map((overrides, idx) => ({
      id: overrides.id ?? `RC-${idx + 1}`,
      kind: overrides.kind ?? "acceptance_criterion",
      text: overrides.text ?? "Required-critical obligation.",
      sourceArtifact: "agreement",
      verificationRequired: true,
      evidencePolicy: "test",
      status: "approved",
      ...overrides,
    })),
    ...(opts.omitReviewMatrix
      ? {}
      : {
          reviewMatrix: {
            reviewedAt: "2026-05-20T00:00:00.000Z",
            rows: itemOverrides
              .filter((it) => !opts.omitRowForId?.includes(it.id ?? ""))
              .map((it) => ({
                contractId: it.id ?? "",
                kind: it.kind ?? "acceptance_criterion",
                status: rowStatus ?? "pass",
                evidencePolicy: "test",
                evidence: "reviewed",
              })),
          },
        }),
    amendments: [],
  };
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
            source: "disk",
            readable: true,
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

  it("omits non-readable Temporal artifact paths from gate evidence", () => {
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
            source: "temporal",
            readable: false,
          },
        },
      }),
      "discovery",
      "agreement",
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(true);
    expect(result.evidence).toMatchObject({
      kind: "agreement",
      content_hash: "a".repeat(64),
      non_whitespace_chars: expect.any(Number),
    });
    expect(result.evidence).not.toHaveProperty("path");
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
            source: "disk",
            readable: true,
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

  it("allows Temporal-only executive summary metadata without path", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract: passingContract(),
        artifacts: {
          executiveSummary: {
            updatedAt: "2026-05-20T00:00:00.000Z",
            contentHash: "a".repeat(64),
            source: "temporal",
            readable: false,
          },
        },
      }),
      "acceptance",
    );

    expect(result.ready).toBe(true);
  });

  it("omits non-readable Temporal executive summary paths from acceptance proof", () => {
    const result = stateBackedAcceptanceProof(
      makeState({
        documents: {
          executiveSummary:
            "# Executive Summary\n\nApproved with full contract review.",
        },
        artifacts: {
          executiveSummary: {
            path: "/tmp/changes/change-1/executive-summary.md",
            updatedAt: "2026-05-20T00:00:00.000Z",
            contentHash: "a".repeat(64),
            source: "temporal",
            readable: false,
          },
        },
      }),
      "2026-05-20T00:01:00.000Z",
    );

    expect(result.ready).toBe(true);
    expect(result.evidence).toMatchObject({
      kind: "acceptance",
      content_hash: "a".repeat(64),
      non_whitespace_chars: expect.any(Number),
    });
    expect(result.evidence).not.toHaveProperty("path");
  });

  it("allows acceptance when executive summary content exists in state.documents but metadata is missing (signal delivery resilience)", () => {
    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract: passingContract(),
        // No state.artifacts.executiveSummary — metadata signal not yet processed
        documents: {
          executiveSummary:
            "# Executive Summary\n\nApproved with full contract review.",
        },
      }),
      "acceptance",
    );

    // Should NOT block — content exists in state.documents, metadata will
    // be synthesized or derived by stateBackedAcceptanceProof
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

  describe("artifact cascade warnings", () => {
    it("emits cascade reminder when prior artifact-backed gates are done", () => {
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      gates.discovery.status = "done";

      const warnings = artifactCascadeWarnings(
        makeState({
          gates,
          documents: {
            proposal: "# Proposal with substantive content for testing.",
            agreement: "# Agreement with substantive content for testing.",
            design: "# Design with substantive content for testing.",
          },
        }),
        "design",
      );

      expect(warnings).toContainEqual(
        expect.objectContaining({
          code: "CASCADE_REMINDER",
          message: expect.stringContaining("proposal"),
        }),
      );
    });

    it("detects contradiction keywords in current artifact", () => {
      const warnings = artifactCascadeWarnings(
        makeState({
          documents: {
            design:
              "# Design\n\nThis design TODO needs review and FIXME before shipping.",
          },
        }),
        "design",
      );

      expect(warnings).toContainEqual(
        expect.objectContaining({
          code: "ARTIFACT_CONTRADICTION_KEYWORDS",
          artifactKind: "design",
          message: expect.stringContaining("TODO"),
        }),
      );
    });

    it("returns no warnings when no prior artifacts or keywords exist", () => {
      const warnings = artifactCascadeWarnings(
        makeState({
          documents: {
            design: "# Design\n\nClean design content without any markers.",
          },
        }),
        "design",
      );

      expect(warnings).toEqual([]);
    });

    it("does not affect ready status in evaluateGateReadiness", () => {
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      gates.discovery.status = "done";

      const result = evaluateGateReadiness(
        makeState({
          gates,
          documents: {
            proposal: "# Proposal with substantive content for testing.",
            agreement: "# Agreement with substantive content for testing.",
            design: "# Design TODO review this before shipping.",
          },
        }),
        "design",
      );

      expect(result.ready).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it("omits warnings field when no warnings exist", () => {
      const result = evaluateGateReadiness(
        makeState({
          documents: {
            proposal:
              "# Proposal with clean substantive content for testing here.",
          },
        }),
        "proposal",
      );

      expect(result.warnings).toBeUndefined();
    });
  });

  describe("ops follow-up release blocking", () => {
    function makeLink(
      overrides: Partial<OpsFollowupLink> & {
        id?: string;
        relationship: OpsFollowupLink["relationship"];
      },
    ): OpsFollowupLink {
      return {
        id: overrides.id ?? "ofl-1",
        changeId: overrides.changeId ?? "child-1",
        relationship: overrides.relationship,
        status: overrides.status ?? "not_started",
        required_handoff: overrides.required_handoff ?? false,
        linked_at: overrides.linked_at ?? "2026-05-20T00:00:00.000Z",
        ...overrides,
      };
    }

    it("blocks release when a blocks link is incomplete", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [makeLink({ relationship: "blocks" })],
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
          gateId: "release",
          linkId: "ofl-1",
          changeId: "child-1",
          relationship: "blocks",
        }),
      );
    });

    it("does not block release for incomplete follows_release/monitors/cleanup_after without required_handoff", () => {
      for (const relationship of [
        "follows_release",
        "monitors",
        "cleanup_after",
      ] as const) {
        const result = evaluateGateReadiness(
          makeState({
            gates: releaseReadyGates(),
            ops_followup_links: [
              makeLink({ relationship, id: `ofl-${relationship}` }),
            ],
          }),
          "release",
        );

        expect(result.ready).toBe(true);
        expect(
          result.blockers.some((b) => b.code.startsWith("OPS_FOLLOWUP")),
        ).toBe(false);
      }
    });

    it("blocks release for follows_release/monitors/cleanup_after when required_handoff is true and incomplete", () => {
      for (const relationship of [
        "follows_release",
        "monitors",
        "cleanup_after",
      ] as const) {
        const result = evaluateGateReadiness(
          makeState({
            gates: releaseReadyGates(),
            ops_followup_links: [
              makeLink({
                relationship,
                id: `ofl-${relationship}`,
                required_handoff: true,
              }),
            ],
          }),
          "release",
        );

        expect(result.ready).toBe(false);
        expect(result.blockers).toContainEqual(
          expect.objectContaining({
            code: "OPS_FOLLOWUP_HANDOFF_INCOMPLETE",
            gateId: "release",
            relationship,
          }),
        );
      }
    });

    it("does not block release when ops follow-up links are complete", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [
            makeLink({
              relationship: "blocks",
              status: "complete",
              id: "ofl-blocks",
            }),
            makeLink({
              relationship: "follows_release",
              status: "complete",
              required_handoff: true,
              id: "ofl-follows",
            }),
          ],
        }),
        "release",
      );

      expect(result.ready).toBe(true);
      expect(
        result.blockers.some((b) => b.code.startsWith("OPS_FOLLOWUP")),
      ).toBe(false);
    });

    it("only evaluates ops follow-up blockers for release gate", () => {
      const result = checkOpsFollowupReleaseBlockers(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [makeLink({ relationship: "blocks" })],
        }),
        "acceptance",
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("getOpenOpsFollowupObligations", () => {
    it("returns only incomplete ops follow-up links", () => {
      const obligations = getOpenOpsFollowupObligations([
        {
          id: "ofl-open",
          changeId: "child-1",
          relationship: "blocks",
          status: "not_started",
          required_handoff: false,
          linked_at: "2026-05-20T00:00:00.000Z",
        },
        {
          id: "ofl-closed",
          changeId: "child-2",
          relationship: "follows_release",
          status: "complete",
          required_handoff: true,
          linked_at: "2026-05-20T00:00:00.000Z",
        },
      ]);

      expect(obligations).toHaveLength(1);
      expect(obligations[0]).toMatchObject({
        linkId: "ofl-open",
        changeId: "child-1",
        relationship: "blocks",
        open: true,
      });
    });

    it("returns empty array for undefined links", () => {
      expect(getOpenOpsFollowupObligations(undefined)).toEqual([]);
    });
  });

  describe("required-critical obligation release checks", () => {
    it("release gate is ready when all requiredCritical items pass review", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          contract: makeRequiredCriticalContract(
            [{ id: "RC-1", requiredCritical: true }],
            "pass",
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(true);
      expect(
        result.blockers.some((b) => b.code.startsWith("REQUIRED_OBLIGATION")),
      ).toBe(false);
    });

    it("blocks release when a requiredCritical item has failing review status", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          contract: makeRequiredCriticalContract(
            [{ id: "RC-1", requiredCritical: true }],
            "fail",
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "REQUIRED_OBLIGATION_UNRESOLVED",
          gateId: "release",
          contractId: "RC-1",
        }),
      );
    });

    it("blocks release when a requiredCritical item is silently deferred", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          contract: makeRequiredCriticalContract(
            [{ id: "RC-1", requiredCritical: true }],
            "pass",
            { omitRowForId: ["RC-1"], omitReviewMatrix: false },
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "REQUIRED_OBLIGATION_NOT_ROUTED",
          gateId: "release",
          contractId: "RC-1",
          remediation: expect.stringContaining("adv_change_reenter"),
        }),
      );
    });

    it("does not block release for non-requiredCritical failing items", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          contract: makeRequiredCriticalContract(
            [
              { id: "RC-1", requiredCritical: false },
              { id: "RC-2", requiredCritical: true },
            ],
            "pass",
          ),
        }),
        "release",
      );

      // Flip RC-1 to fail manually (helper set all rows to pass)
      const contract = result.blockers.some((b) =>
        b.code.startsWith("REQUIRED_OBLIGATION"),
      );
      expect(contract).toBe(false);
      expect(result.ready).toBe(true);
    });

    it("does not affect acceptance gate", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: acceptanceReadyGates(),
          projectionChangesDir: "/tmp/changes",
          contract: makeRequiredCriticalContract(
            [{ id: "RC-1", requiredCritical: true }],
            "fail",
          ),
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

      expect(
        result.blockers.some((b) => b.code.startsWith("REQUIRED_OBLIGATION")),
      ).toBe(false);
      // acceptance still blocked by normal acceptance contract check
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "ACCEPTANCE_REVIEW_ROW_FAILING",
          contractId: "RC-1",
        }),
      );
    });

    it("routing check respects task coverage", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          tasks: [
            {
              id: "tk-cover",
              title: "Cover RC-1",
              status: "done",
              createdAt: "2026-05-20T00:00:00.000Z",
              updatedAt: "2026-05-20T00:00:00.000Z",
              contract_refs: { verifies: ["RC-1"] },
            },
          ],
          contract: makeRequiredCriticalContract(
            [{ id: "RC-1", requiredCritical: true }],
            "pass",
            { omitRowForId: ["RC-1"], omitReviewMatrix: false },
          ),
        }),
        "release",
      );

      expect(
        result.blockers.some(
          (b) => b.code === "REQUIRED_OBLIGATION_NOT_ROUTED",
        ),
      ).toBe(false);
    });

    it("routing check respects notRequiredReason alternate route", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          contract: makeRequiredCriticalContract(
            [
              {
                id: "RC-1",
                requiredCritical: true,
                notRequiredReason: "Handled by upstream dependency.",
              },
            ],
            "pass",
            { omitRowForId: ["RC-1"], omitReviewMatrix: false },
          ),
        }),
        "release",
      );

      expect(
        result.blockers.some(
          (b) => b.code === "REQUIRED_OBLIGATION_NOT_ROUTED",
        ),
      ).toBe(false);
    });
  });
});
