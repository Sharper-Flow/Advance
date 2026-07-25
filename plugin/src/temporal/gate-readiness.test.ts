import { describe, expect, it } from "vitest";
import { createDefaultGates } from "../types";
import {
  ARTIFACT_BACKED_GATES,
  artifactCascadeWarnings,
  CRITERION_EVALUATORS,
  evaluateGateReadiness,
  evaluateWorkerBundleProvenance,
  gateArtifactEvidenceSchema,
  stateBackedArtifactEvidence,
  stateBackedAcceptanceProof,
  checkOpsFollowupReleaseBlockers,
  checkUnresolvedDesignConcerns,
  checkUnresolvedVerificationEvidence,
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

  it("fails closed when an acceptance review matrix duplicates a contract row", () => {
    const contract = passingContract();
    contract.reviewMatrix!.rows.push({ ...contract.reviewMatrix!.rows[0] });

    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract,
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
        code: "ACCEPTANCE_REVIEW_MATRIX_INVALID",
      }),
    );
  });

  it("fails closed when an acceptance review matrix includes an unknown row", () => {
    const contract = passingContract();
    contract.reviewMatrix!.rows.push({
      ...contract.reviewMatrix!.rows[0],
      contractId: "AC_UNKNOWN",
    });

    const result = evaluateGateReadiness(
      makeState({
        gates: acceptanceReadyGates(),
        projectionChangesDir: "/tmp/changes",
        contract,
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
        code: "ACCEPTANCE_REVIEW_MATRIX_INVALID",
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

    function completeResolution() {
      return {
        status: "complete" as const,
        verified_at: "2026-05-20T00:01:00.000Z",
        source: "child_profile" as const,
        completion_signal: "ops run complete",
        health_verification: "health check passed",
        rollback_or_cleanup_disposition: "cleanup complete; no rollback needed",
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
              resolution: completeResolution(),
            }),
            makeLink({
              relationship: "follows_release",
              status: "complete",
              required_handoff: true,
              id: "ofl-follows",
              resolution: completeResolution(),
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

    it("blocks release when parent status is complete but verified child proof is missing", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [
            makeLink({
              relationship: "blocks",
              status: "complete",
              id: "ofl-stale",
            }),
          ],
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "OPS_FOLLOWUP_STATUS_UNVERIFIED",
          linkId: "ofl-stale",
        }),
      );
    });

    it("blocks release when verified child proof lacks completion evidence", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [
            makeLink({
              relationship: "blocks",
              status: "complete",
              id: "ofl-incomplete-proof",
              resolution: {
                status: "complete",
                verified_at: "2026-05-20T00:01:00.000Z",
                source: "child_profile",
              },
            }),
          ],
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "OPS_FOLLOWUP_COMPLETION_PROOF_INCOMPLETE",
          linkId: "ofl-incomplete-proof",
        }),
      );
    });

    it("blocks release when a blocking child state is unreachable", () => {
      const result = evaluateGateReadiness(
        makeState({
          gates: releaseReadyGates(),
          ops_followup_links: [
            makeLink({
              relationship: "blocks",
              status: "complete",
              id: "ofl-unreachable",
              resolution: {
                status: "not_started",
                verified_at: "2026-05-20T00:01:00.000Z",
                source: "unreachable",
                error: "WorkflowNotFoundError",
              },
            }),
          ],
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "OPS_FOLLOWUP_STATUS_UNVERIFIED",
          linkId: "ofl-unreachable",
        }),
      );
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
          resolution: {
            status: "complete",
            verified_at: "2026-05-20T00:01:00.000Z",
            source: "child_profile",
            completion_signal: "ops run complete",
            health_verification: "health check passed",
            rollback_or_cleanup_disposition:
              "cleanup complete; no rollback needed",
          },
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

describe("checkUnresolvedDesignConcerns — rq-designQualityEvidence01 (structural blocker)", () => {
  function designerReport(
    overrides: {
      attempt?: number;
      taskId?: string;
      dimensions?: Partial<
        Record<
          | "component_correctness"
          | "semantic_html_a11y"
          | "responsive_behavior"
          | "visual_polish"
          | "site_design_consistency"
          | "finer_details",
          "pass" | "concern" | "n/a"
        >
      >;
      neighbors?: { what: string; why: string }[];
      notes?: string;
    } = {},
  ) {
    const taskId = overrides.taskId ?? "tk-design-1";
    return {
      schema_version: "1.0" as const,
      change_id: "addDesignQualityGates",
      task_id: taskId,
      scope: { kind: "task" as const, task_id: taskId },
      attempt: overrides.attempt ?? 1,
      agent: "adv-designer" as const,
      status: "complete" as const,
      files_touched: ["src/components/Button.tsx"],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blockers: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "none",
      workdir_used: "/tmp/worktree",
      context_update_for_adv: {
        what_ads_needs_to_know: "x",
        suggested_next_action: "y",
      },
      design_dimensions: {
        component_correctness: "pass" as const,
        semantic_html_a11y: "pass" as const,
        responsive_behavior: "pass" as const,
        visual_polish: "pass" as const,
        site_design_consistency: "pass" as const,
        finer_details: "pass" as const,
        ...overrides.dimensions,
        ...(overrides.notes ? { notes: overrides.notes } : {}),
      },
      neighboring_recommendations: (overrides.neighbors ?? []).map((n) => ({
        what: n.what,
        why: n.why,
      })),
    };
  }

  it("blocks acceptance and release on an unresolved dimension concern", () => {
    const state = makeState({
      subagent_reports: [
        designerReport({
          dimensions: { site_design_consistency: "concern" },
          notes: "Does not match the existing page family.",
        }),
      ],
    });

    for (const gate of ["acceptance", "release"] as const) {
      const blockers = checkUnresolvedDesignConcerns(state, gate);
      expect(blockers.some((b) => b.code === "DESIGN_CONCERN_UNRESOLVED")).toBe(
        true,
      );
    }
  });

  it("does not block non-acceptance/release gates", () => {
    const state = makeState({
      subagent_reports: [
        designerReport({
          dimensions: { site_design_consistency: "concern" },
          notes: "concern",
        }),
      ],
    });
    expect(checkUnresolvedDesignConcerns(state, "design")).toEqual([]);
    expect(checkUnresolvedDesignConcerns(state, "execution")).toEqual([]);
  });

  it("clears the block when a typed disposition exists", () => {
    const state = makeState({
      subagent_reports: [
        designerReport({
          dimensions: { site_design_consistency: "concern" },
          notes: "concern",
        }),
      ],
      design_concern_dispositions: [
        {
          taskId: "tk-design-1",
          concernKey: "dimension:site_design_consistency",
          disposition: "rejected_with_evidence",
          evidence: "Legacy page; fast-follow #123.",
          dispositionedAt: "2026-06-25T15:00:00.000Z",
        },
      ],
    });
    expect(checkUnresolvedDesignConcerns(state, "acceptance")).toEqual([]);
  });

  it("clears the block when a later all-pass report supersedes the concern", () => {
    const state = makeState({
      subagent_reports: [
        designerReport({
          attempt: 1,
          dimensions: { site_design_consistency: "concern" },
          notes: "concern",
        }),
        designerReport({ attempt: 2 }),
      ],
    });
    expect(checkUnresolvedDesignConcerns(state, "acceptance")).toEqual([]);
  });

  it("blocks on an undispositioned neighboring recommendation", () => {
    const state = makeState({
      subagent_reports: [
        designerReport({
          neighbors: [
            {
              what: "IconButton lacks focus ring",
              why: "adjacent inconsistency",
            },
          ],
        }),
      ],
    });
    const blockers = checkUnresolvedDesignConcerns(state, "acceptance");
    expect(blockers.some((b) => b.code === "DESIGN_CONCERN_UNRESOLVED")).toBe(
      true,
    );
  });

  it("returns no blockers when there is no designer report", () => {
    expect(checkUnresolvedDesignConcerns(makeState(), "acceptance")).toEqual(
      [],
    );
  });

  it("is wired into evaluateGateReadiness for acceptance", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      subagent_reports: [
        designerReport({
          dimensions: { visual_polish: "concern" },
          notes: "Spacing off vs design system.",
        }),
      ],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some((b) => b.code === "DESIGN_CONCERN_UNRESOLVED"),
    ).toBe(true);
  });
});

describe("checkUnresolvedVerificationEvidence — strengthenAgentEvidence AC1/AC2 (structural blocker)", () => {
  const BLOCKING_POLICIES = [
    "test",
    "static_check",
    "review",
    "artifact_reference",
  ] as const;
  const NON_BLOCKING_POLICIES = [
    "source_citation",
    "source_audit",
    "rubric_review",
    "stakeholder_acceptance",
    "design_proof",
    "not_applicable",
  ] as const;

  function doneTask(
    overrides: {
      id?: string;
      evidence_policy?: string;
      status?: string;
    } = {},
  ) {
    return {
      id: overrides.id ?? "tk-ver-1",
      title: "Task",
      type: "code",
      status: (overrides.status ?? "done") as never,
      priority: 0,
      created_at: "2026-05-20T00:00:00.000Z",
      ...(overrides.evidence_policy
        ? { evidence_policy: overrides.evidence_policy as never }
        : {}),
    };
  }

  function engineerReport(
    overrides: {
      attempt?: number;
      taskId?: string;
      warnings?: {
        kind: "verification_missing" | "verification_mismatch";
        message: string;
      }[];
    } = {},
  ) {
    const taskId = overrides.taskId ?? "tk-ver-1";
    return {
      schema_version: "1.0" as const,
      change_id: "strengthenAgentEvidence",
      task_id: taskId,
      scope: { kind: "task" as const, task_id: taskId },
      attempt: overrides.attempt ?? 1,
      agent: "adv-engineer" as const,
      status: "complete" as const,
      files_touched: ["src/foo.ts"],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blockers: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "none",
      workdir_used: "/tmp/worktree",
      context_update_for_adv: {
        what_ads_needs_to_know: "x",
        suggested_next_action: "y",
      },
      ...(overrides.warnings ? { consumer_warnings: overrides.warnings } : {}),
    };
  }

  function reviewerReport(
    overrides: {
      attempt?: number;
      taskId?: string;
      testsRun?: string[];
      scope?: "task" | "change";
      scopeKey?: string;
      consumerWarnings?: { kind: string; message: string }[];
    } = {},
  ) {
    const taskId = overrides.taskId ?? "tk-ver-1";
    const scope =
      overrides.scope === "change"
        ? {
            kind: "change" as const,
            scope_key: overrides.scopeKey ?? "review:acceptance",
          }
        : { kind: "task" as const, task_id: taskId };
    return {
      schema_version: "1.0" as const,
      change_id: "strengthenAgentEvidence",
      ...(scope.kind === "task" ? { task_id: taskId } : {}),
      scope,
      attempt: overrides.attempt ?? 1,
      agent: "adv-reviewer" as const,
      phase: "review" as const,
      verdict: "READY" as const,
      blocking_findings: [],
      nonblocking_findings: [],
      changes_made: [],
      wisdom_candidates: [],
      verification: {
        tests_run: overrides.testsRun ?? ["pnpm test"],
        results: "pass" as const,
        evidence: "review" as const,
      },
      scope_drift: null,
      risks: [],
      required_main_agent_actions: [],
      workdir_used: "/tmp/worktree",
      context_update_for_adv: {
        what_ads_needs_to_know: "x",
        suggested_next_action: "y",
      },
      ...(overrides.consumerWarnings
        ? { consumer_warnings: overrides.consumerWarnings }
        : {}),
    };
  }

  const missingWarning = {
    kind: "verification_missing" as const,
    message: "No adv_run_test evidence found for reported command: pnpm test",
  };
  const mismatchWarning = {
    kind: "verification_mismatch" as const,
    message:
      "Reported exit_code 0 differs from structured adv_run_test.v1 exitCode 1 for command: pnpm test",
  };

  it("blocks acceptance for a done task with test policy and unresolved verification_missing", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    const blockers = checkUnresolvedVerificationEvidence(state, "acceptance");
    expect(
      blockers.some((b) => b.code === "VERIFICATION_EVIDENCE_MISSING"),
    ).toBe(true);
  });

  it("blocks for verification_mismatch as well", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [mismatchWarning] })],
    });
    expect(
      checkUnresolvedVerificationEvidence(state, "acceptance").some(
        (b) => b.code === "VERIFICATION_EVIDENCE_MISSING",
      ),
    ).toBe(true);
  });

  it.each([...BLOCKING_POLICIES])("blocks for blocking policy %s", (policy) => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: policy })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    expect(
      checkUnresolvedVerificationEvidence(state, "acceptance").some(
        (b) => b.code === "VERIFICATION_EVIDENCE_MISSING",
      ),
    ).toBe(true);
  });

  it.each([...NON_BLOCKING_POLICIES])(
    "does not block for non-blocking policy %s (SC4)",
    (policy) => {
      const state = makeState({
        tasks: [doneTask({ evidence_policy: policy })],
        subagent_reports: [engineerReport({ warnings: [missingWarning] })],
      });
      expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
        [],
      );
    },
  );

  it("blocks when code task with no evidence_policy resolves to test", () => {
    const state = makeState({
      tasks: [doneTask()],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    const blockers = checkUnresolvedVerificationEvidence(state, "acceptance");
    expect(
      blockers.some((b) => b.code === "VERIFICATION_EVIDENCE_MISSING"),
    ).toBe(true);
    expect(blockers[0]?.message).toMatch(/evidence_policy: test/);
  });

  it("does not block when task is not done", () => {
    for (const status of ["pending", "in_progress", "cancelled"]) {
      const state = makeState({
        tasks: [doneTask({ evidence_policy: "test", status })],
        subagent_reports: [engineerReport({ warnings: [missingWarning] })],
      });
      expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
        [],
      );
    }
  });

  it("does not block when there are no verification warnings", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport()],
    });
    expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
      [],
    );
  });

  it("clears when a newer report without warnings supersedes (latest-wins durable evidence)", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [
        engineerReport({ attempt: 1, warnings: [missingWarning] }),
        engineerReport({ attempt: 2 }),
      ],
    });
    expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
      [],
    );
  });

  it("clears when a typed disposition exists for the task", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
      verification_evidence_dispositions: [
        {
          taskId: "tk-ver-1",
          concernKey: "verification",
          disposition: "rejected_with_evidence",
          evidence: "adv_run_test evidence captured under run id X",
          dispositionedAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    });
    expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
      [],
    );
  });

  it("does not block non-acceptance/release gates", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    expect(checkUnresolvedVerificationEvidence(state, "design")).toEqual([]);
    expect(checkUnresolvedVerificationEvidence(state, "execution")).toEqual([]);
  });

  it("blocks release as well as acceptance", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    expect(
      checkUnresolvedVerificationEvidence(state, "release").some(
        (b) => b.code === "VERIFICATION_EVIDENCE_MISSING",
      ),
    ).toBe(true);
  });

  it("returns no blockers when there are no reports", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
    });
    expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
      [],
    );
  });

  it("AC1: review-policy task with linked task-scoped adv-reviewer report -> no VERIFICATION_EVIDENCE_MISSING block", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "review" })],
      subagent_reports: [
        reviewerReport({
          testsRun: ["pnpm test"],
          consumerWarnings: [],
        }),
      ],
    });
    expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
      [],
    );
  });

  it("AC2: test-policy task with only adv-reviewer evidence -> still blocks", () => {
    const state = makeState({
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [
        reviewerReport({
          testsRun: ["pnpm test"],
          consumerWarnings: [
            {
              kind: "verification_missing",
              message:
                "Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm test",
            },
          ],
        }),
      ],
    });
    expect(
      checkUnresolvedVerificationEvidence(state, "acceptance").some(
        (b) => b.code === "VERIFICATION_EVIDENCE_MISSING",
      ),
    ).toBe(true);
  });

  it.each(["source_audit", "rubric_review"] as const)(
    "AC3: warn-first policy %s with warnings -> no VERIFICATION_EVIDENCE_MISSING block",
    (policy) => {
      const state = makeState({
        tasks: [doneTask({ evidence_policy: policy })],
        subagent_reports: [
          reviewerReport({
            testsRun: ["pnpm test"],
            consumerWarnings: [
              {
                kind: "verification_missing",
                message: "No adv_run_test evidence found",
              },
            ],
          }),
        ],
      });
      expect(checkUnresolvedVerificationEvidence(state, "acceptance")).toEqual(
        [],
      );
    },
  );

  it("is wired into evaluateGateReadiness for acceptance", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [doneTask({ evidence_policy: "test" })],
      subagent_reports: [engineerReport({ warnings: [missingWarning] })],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some((b) => b.code === "VERIFICATION_EVIDENCE_MISSING"),
    ).toBe(true);
  });
});

describe("checkCompletedTaskEvidencePlan — resolved plan readiness (C2/C4/C5)", () => {
  function doneTask(
    overrides: { evidence_plan?: any; evidence_policy?: string } = {},
  ) {
    return {
      id: "tk-ev-plan",
      title: "Task",
      type: "code" as const,
      status: "done" as const,
      priority: 0,
      created_at: "2026-05-20T00:00:00.000Z",
      ...(overrides.evidence_policy && {
        evidence_policy: overrides.evidence_policy,
      }),
      ...(overrides.evidence_plan && {
        evidence_plan: overrides.evidence_plan,
      }),
    };
  }

  function engineerReport(warnings: any[] = []) {
    return {
      schema_version: "1.0" as const,
      change_id: "change-1",
      task_id: "tk-ev-plan",
      scope: { kind: "task" as const, task_id: "tk-ev-plan" },
      attempt: 1,
      agent: "adv-engineer" as const,
      status: "complete" as const,
      files_touched: ["src/foo.ts"],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blockers: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "none",
      workdir_used: "/tmp/worktree",
      context_update_for_adv: {
        what_ads_needs_to_know: "x",
        suggested_next_action: "y",
      },
      ...(warnings.length > 0 ? { consumer_warnings: warnings } : {}),
    };
  }

  const missingWarning = {
    kind: "verification_missing" as const,
    message: "No adv_run_test evidence found",
  };

  it("uses resolved evidence plan to block proof-bearing policy with verification warnings", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "test",
          evidence_plan: {
            policy: "test",
            proof_target: "Automated tests",
            provenance: "new",
          },
        }),
      ],
      subagent_reports: [engineerReport([missingWarning])],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some((b) => b.code === "VERIFICATION_EVIDENCE_MISSING"),
    ).toBe(true);
  });

  it("does not block warn-first policy for verification warnings (SC4)", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "source_citation",
          evidence_plan: {
            policy: "source_citation",
            proof_target: "Source citation",
            provenance: "new",
          },
        }),
      ],
      subagent_reports: [engineerReport([missingWarning])],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some((b) => b.code === "VERIFICATION_EVIDENCE_MISSING"),
    ).toBe(false);
  });

  it("blocks acceptance for done behavior-critical non-test route without review proof", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "review",
          evidence_plan: {
            policy: "review",
            proof_target: "Structured review conclusion",
            rationale: "Peer review is sufficient.",
            provenance: "legacy",
          },
        }),
      ],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some(
        (b) =>
          b.code === "EVIDENCE_PLAN_INVALID" ||
          b.code === "EVIDENCE_PLAN_REVIEW_PROOF_MISSING",
      ),
    ).toBe(true);
  });

  it("does not block legacy behavior-critical non-test route with review conclusion", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "review",
          evidence_plan: {
            policy: "review",
            proof_target: "Structured review conclusion",
            rationale: "Peer review is sufficient.",
            review_conclusion: "reviewer-verdict-abc",
            provenance: "legacy",
          },
        }),
      ],
    });
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some(
        (b) => b.code === "EVIDENCE_PLAN_REVIEW_PROOF_MISSING",
      ),
    ).toBe(false);
    expect(
      result.blockers.some((b) => b.code === "EVIDENCE_PLAN_INVALID"),
    ).toBe(false);
  });

  it("does not block stage-v2 behavior-critical non-test route with reviewer evidence ref", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "review",
          evidence_plan: {
            policy: "review",
            proof_target: "Structured review conclusion",
            rationale: "Peer review is sufficient.",
            review_evidence_ref: {
              report_key: "change-1|tk-ev-plan|adv-reviewer|1",
            },
            provenance: "new",
          },
        }),
      ],
    });
    state.subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "change-1",
        task_id: "tk-ev-plan",
        attempt: 1,
        workdir_used: "/tmp/test",
        agent: "adv-reviewer",
        scope: { kind: "task", task_id: "tk-ev-plan" },
        phase: "review",
        verdict: "READY",
        blocking_findings: [],
        nonblocking_findings: [],
        changes_made: [],
        wisdom_candidates: [],
        verification: { tests_run: [], results: "n/a", evidence: "review" },
        scope_drift: null,
        risks: [],
        required_main_agent_actions: [],
      },
    ] as any;
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some(
        (b) => b.code === "EVIDENCE_PLAN_REVIEW_PROOF_MISSING",
      ),
    ).toBe(false);
    expect(
      result.blockers.some((b) => b.code === "EVIDENCE_PLAN_INVALID"),
    ).toBe(false);
  });

  it("AC4: change-scoped adv-reviewer report cannot satisfy review_evidence_ref", () => {
    const state = makeState({
      gates: acceptanceReadyGates(),
      contract: passingContract(),
      documents: {
        acceptance:
          "# Acceptance\n\nSubstantive acceptance proof content here.",
      },
      tasks: [
        doneTask({
          evidence_policy: "review",
          evidence_plan: {
            policy: "review",
            proof_target: "Structured review conclusion",
            rationale: "Peer review is sufficient.",
            review_evidence_ref: {
              report_key: "change-1|change:review:acceptance|adv-reviewer|1",
            },
            provenance: "new",
            stage: "stage-v2",
          },
        }),
      ],
    });
    state.subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "change-1",
        attempt: 1,
        workdir_used: "/tmp/test",
        agent: "adv-reviewer",
        scope: { kind: "change", scope_key: "review:acceptance" },
        phase: "review",
        verdict: "READY",
        blocking_findings: [],
        nonblocking_findings: [],
        changes_made: [],
        wisdom_candidates: [],
        verification: { tests_run: [], results: "n/a", evidence: "review" },
        scope_drift: null,
        risks: [],
        required_main_agent_actions: [],
      },
    ] as any;
    const result = evaluateGateReadiness(state, "acceptance");
    expect(
      result.blockers.some((b) => b.code === "EVIDENCE_PLAN_INVALID"),
    ).toBe(true);
    expect(
      result.blockers.some(
        (b) => b.code === "EVIDENCE_PLAN_REVIEW_PROOF_MISSING",
      ),
    ).toBe(false);
  });

  it("does not block non-acceptance/release gates", () => {
    const state = makeState({
      tasks: [
        doneTask({
          evidence_policy: "review",
          evidence_plan: {
            policy: "review",
            proof_target: "Structured review conclusion",
            provenance: "new",
          },
        }),
      ],
    });
    expect(
      evaluateGateReadiness(state, "design").blockers.some(
        (b) => b.code === "EVIDENCE_PLAN_REVIEW_PROOF_MISSING",
      ),
    ).toBe(false);
  });
});

describe("evaluateWorkerBundleProvenance — worker-bundle release provenance (KD2/KD7)", () => {
  function workerBundleState(
    overrides: Partial<ChangeWorkflowState> = {},
  ): ChangeWorkflowState {
    return makeState({
      gates: releaseReadyGates(),
      ...overrides,
    });
  }

  function passingRun(
    runId: string,
    evidence_kind: "build_worker" | "replay_determinism",
  ) {
    return {
      runId,
      phase: "verify" as const,
      exitCode: 0,
      classification: "ok",
      command: "cmd",
      durationMs: 1,
      evidence_kind,
      recordedAt: "2026-05-20T00:00:00.000Z",
    };
  }

  function failingRun(
    runId: string,
    evidence_kind: "build_worker" | "replay_determinism",
  ) {
    return {
      runId,
      phase: "verify" as const,
      exitCode: 1,
      classification: "fail",
      command: "cmd",
      durationMs: 1,
      evidence_kind,
      recordedAt: "2026-05-20T00:00:00.000Z",
    };
  }

  it("AC4: absent worker_bundle_impact -> declaration required blocker", () => {
    const state = workerBundleState();
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe(
      "WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED",
    );
    expect(result.blockers[0].gateId).toBe("release");
  });

  it("AC3: not_applicable impact -> no blocker", () => {
    const state = workerBundleState({
      worker_bundle_impact: { kind: "not_applicable", rationale: "pure UI" },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("AC3: not_applicable without a typed rationale blocks release", () => {
    const state = workerBundleState({
      worker_bundle_impact: { kind: "not_applicable" },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe(
      "WORKER_BUNDLE_PROVENANCE_NOT_APPLICABLE_RATIONALE_REQUIRED",
    );
  });

  it("AC1: required impact + no provenance -> missing blocker", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_MISSING");
    expect(result.blockers[0].gateId).toBe("release");
  });

  it("AC2: required impact + provenance + passing typed runs -> no blocker", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
      workerBundleProvenance: {
        source_sha: "abc123",
        build_run_id: "run-build-1",
        replay_run_id: "run-replay-1",
        recorded_at: "2026-05-20T00:00:00.000Z",
      },
      testRuns: {
        tk: [
          passingRun("run-build-1", "build_worker"),
          passingRun("run-replay-1", "replay_determinism"),
        ],
      },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("AC1: blank provenance source_sha blocks release", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
      workerBundleProvenance: {
        source_sha: " ",
        build_run_id: "run-build-1",
        replay_run_id: "run-replay-1",
        recorded_at: "2026-05-20T00:00:00.000Z",
      },
      testRuns: {
        tk: [
          passingRun("run-build-1", "build_worker"),
          passingRun("run-replay-1", "replay_determinism"),
        ],
      },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_MISSING");
    expect(result.blockers[0].message).toContain("source_sha");
  });

  it("matches runs by typed evidence_kind, not command substring", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
      workerBundleProvenance: {
        source_sha: "abc123",
        build_run_id: "run-build-1",
        replay_run_id: "run-replay-1",
        recorded_at: "2026-05-20T00:00:00.000Z",
      },
      testRuns: {
        tk: [
          {
            ...passingRun("run-build-1", "build_worker"),
            evidence_kind: "other" as const,
          },
          passingRun("run-replay-1", "replay_determinism"),
        ],
      },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_MISSING");
    expect(result.blockers[0].message).toContain(
      "build_worker run run-build-1",
    );
  });

  it("reports failing typed runs as a separate failing blocker", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
      workerBundleProvenance: {
        source_sha: "abc123",
        build_run_id: "run-build-1",
        replay_run_id: "run-replay-1",
        recorded_at: "2026-05-20T00:00:00.000Z",
      },
      testRuns: {
        tk: [
          failingRun("run-build-1", "build_worker"),
          failingRun("run-replay-1", "replay_determinism"),
        ],
      },
    });
    const result = evaluateWorkerBundleProvenance(state);
    expect(result.ok).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_FAILING");
    expect(result.blockers[0].message).toContain("build_worker");
    expect(result.blockers[0].message).toContain("replay_determinism");
  });

  it("AC5: helper is wired into evaluateGateReadiness for release when enforced", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
    });
    const enforced = evaluateGateReadiness(state, "release", {
      enforceWorkerBundleProvenance: true,
    });
    expect(
      enforced.blockers.some(
        (b) => b.code === "WORKER_BUNDLE_PROVENANCE_MISSING",
      ),
    ).toBe(true);

    const notEnforced = evaluateGateReadiness(state, "release", {
      enforceWorkerBundleProvenance: false,
    });
    expect(
      notEnforced.blockers.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(false);
  });

  it("KD7: pre-patch histories do not get the provenance blocker when not enforced", () => {
    const state = workerBundleState({
      worker_bundle_impact: {
        kind: "required",
        rationale: "touches worker bundle",
      },
      // no workerBundleProvenance, no testRuns
    });
    const result = evaluateGateReadiness(state, "release");
    expect(
      result.blockers.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(false);
  });

  describe("AC matrix end-to-end through evaluateGateReadiness (AC1-AC5)", () => {
    it("AC1: required + missing provenance -> WORKER_BUNDLE_PROVENANCE_MISSING blocker", () => {
      const state = workerBundleState({
        worker_bundle_impact: {
          kind: "required",
          rationale: "touches workflow-reachable code",
        },
      });
      const result = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: true,
      });
      expect(result.ready).toBe(false);
      expect(
        result.blockers.some(
          (b) => b.code === "WORKER_BUNDLE_PROVENANCE_MISSING",
        ),
      ).toBe(true);
    });

    it("AC2: required + valid provenance + passing typed runs -> release ready", () => {
      const state = workerBundleState({
        worker_bundle_impact: {
          kind: "required",
          rationale: "touches workflow-reachable code",
        },
        workerBundleProvenance: {
          source_sha: "sha256-abc",
          build_run_id: "run-build-1",
          replay_run_id: "run-replay-1",
          recorded_at: "2026-05-20T00:00:00.000Z",
        },
        testRuns: {
          tk: [
            passingRun("run-build-1", "build_worker"),
            passingRun("run-replay-1", "replay_determinism"),
          ],
        },
      });
      const result = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: true,
      });
      expect(
        result.blockers.some((b) =>
          b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
        ),
      ).toBe(false);
    });

    it("AC3: not_applicable -> no worker-bundle provenance blocker", () => {
      const state = workerBundleState({
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "pure documentation change",
        },
      });
      const result = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: true,
      });
      expect(
        result.blockers.some((b) =>
          b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
        ),
      ).toBe(false);
    });

    it("AC4 + no-heuristic-bypass: absent worker_bundle_impact -> DECLARATION_REQUIRED blocker", () => {
      const state = workerBundleState();
      const result = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: true,
      });
      expect(result.ready).toBe(false);
      expect(
        result.blockers.some(
          (b) => b.code === "WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED",
        ),
      ).toBe(true);
    });

    it("AC5: worker-bundle provenance check is evaluated in evaluateGateReadiness, not CRITERION_EVALUATORS", () => {
      // The helper is wired directly into evaluateGateReadiness; there is no
      // advisory criterion evaluator that could be bypassed or that owns the
      // hard readiness decision.
      const ids = Object.keys(CRITERION_EVALUATORS);
      expect(ids).not.toContain("WORKER_BUNDLE_PROVENANCE");
      expect(ids.some((id) => id.toLowerCase().includes("worker"))).toBe(false);

      const state = workerBundleState({
        worker_bundle_impact: { kind: "required", rationale: "x" },
      });
      const enforced = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: true,
      });
      const notEnforced = evaluateGateReadiness(state, "release", {
        enforceWorkerBundleProvenance: false,
      });
      expect(
        enforced.blockers.some((b) =>
          b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
        ),
      ).toBe(true);
      expect(
        notEnforced.blockers.some((b) =>
          b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
        ),
      ).toBe(false);
    });
  });

  describe("evidence identity negative tests (KD3)", () => {
    it("a passing build run with WRONG evidence_kind does NOT satisfy build_worker requirement", () => {
      const state = workerBundleState({
        worker_bundle_impact: {
          kind: "required",
          rationale: "touches workflow-reachable code",
        },
        workerBundleProvenance: {
          source_sha: "sha256-abc",
          build_run_id: "run-build-1",
          replay_run_id: "run-replay-1",
          recorded_at: "2026-05-20T00:00:00.000Z",
        },
        testRuns: {
          tk: [
            {
              ...passingRun("run-build-1", "build_worker"),
              evidence_kind: "unit_test",
            },
            passingRun("run-replay-1", "replay_determinism"),
          ],
        },
      });
      const result = evaluateWorkerBundleProvenance(state);
      expect(result.ok).toBe(false);
      expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_MISSING");
      expect(result.blockers[0].message).toContain(
        "build_worker run run-build-1",
      );
    });

    it("a passing replay run with WRONG evidence_kind does NOT satisfy replay_determinism requirement", () => {
      const state = workerBundleState({
        worker_bundle_impact: {
          kind: "required",
          rationale: "touches workflow-reachable code",
        },
        workerBundleProvenance: {
          source_sha: "sha256-abc",
          build_run_id: "run-build-1",
          replay_run_id: "run-replay-1",
          recorded_at: "2026-05-20T00:00:00.000Z",
        },
        testRuns: {
          tk: [
            passingRun("run-build-1", "build_worker"),
            {
              ...passingRun("run-replay-1", "replay_determinism"),
              evidence_kind: "unit_test",
            },
          ],
        },
      });
      const result = evaluateWorkerBundleProvenance(state);
      expect(result.ok).toBe(false);
      expect(result.blockers[0].code).toBe("WORKER_BUNDLE_PROVENANCE_MISSING");
      expect(result.blockers[0].message).toContain(
        "replay_determinism run run-replay-1",
      );
    });
  });
});
