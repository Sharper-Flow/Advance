import { describe, expect, it } from "vitest";
import { createDefaultGates } from "../types";
import {
  deriveAcceptanceCriteriaProjection,
  evaluateGateCriteria,
} from "./gate-readiness";
import {
  applyGateCompletedToState,
  applyDesignConcernDispositionedToState,
  applyVerificationEvidenceDispositionedToState,
} from "./change-state";
import type { ChangeWorkflowState } from "./contracts";
import type { GateCriterion } from "../types";

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
    documents: {},
    ...overrides,
  };
}

function makeContract(opts: {
  itemIds: string[];
  rowIds: string[];
  rowStatus?: "pass" | "fail";
}): NonNullable<ChangeWorkflowState["contract"]> {
  return {
    version: 1,
    rigor: "standard",
    source: {
      artifact: "agreement",
      approvedAt: "2026-05-20T00:00:00.000Z",
    },
    items: opts.itemIds.map((id) => ({
      id,
      kind: "acceptance_criterion" as const,
      text: `Requirement ${id}`,
      sourceArtifact: "agreement",
      verificationRequired: true,
      evidencePolicy: "test" as const,
      status: "approved" as const,
    })),
    reviewMatrix: {
      reviewedAt: "2026-05-20T00:00:00.000Z",
      rows: opts.rowIds.map((contractId) => ({
        contractId,
        kind: "acceptance_criterion" as const,
        status: opts.rowStatus ?? "pass",
        evidencePolicy: "test" as const,
        evidence: "reviewed",
      })),
    },
    amendments: [],
  };
}

function findCriterion(
  criteria: GateCriterion[],
  id: string,
): GateCriterion | undefined {
  return criteria.find((c) => c.id === id);
}

describe("acceptance criteria projection", () => {
  it("returns pending when no snapshot exists", () => {
    const state = makeState({
      acceptanceReadinessRevision: 0,
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(projection.freshness).toBe("pending");
    expect(projection.snapshot).toBeUndefined();
    expect(projection.basisRevision).toBe(0);
    expect(projection.current).toEqual(expect.any(Array));
  });

  it("returns fresh when snapshot basis revision matches current", () => {
    const snapshotCriteria: GateCriterion[] = [
      {
        id: "REVIEW_MATRIX_COMPLETE",
        label: "Review matrix complete",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({
      acceptanceReadinessRevision: 2,
      acceptanceCriteriaSnapshot: {
        criteria: snapshotCriteria,
        basisRevision: 2,
      },
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(projection.freshness).toBe("fresh");
    expect(projection.snapshot).toEqual(snapshotCriteria);
    expect(projection.basisRevision).toBe(2);
    expect(projection.staleReason).toBeUndefined();
  });

  it("returns stale when snapshot basis revision differs from current", () => {
    const snapshotCriteria: GateCriterion[] = [
      {
        id: "REVIEW_MATRIX_COMPLETE",
        label: "Review matrix complete",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({
      acceptanceReadinessRevision: 3,
      acceptanceCriteriaSnapshot: {
        criteria: snapshotCriteria,
        basisRevision: 2,
      },
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(projection.freshness).toBe("stale");
    expect(projection.snapshot).toEqual(snapshotCriteria);
    expect(projection.basisRevision).toBe(3);
    expect(projection.staleReason).toContain("revision 2");
    expect(projection.staleReason).toContain("current revision is 3");
  });

  it("never surfaces a stale passing snapshot as current pass", () => {
    const snapshotCriteria: GateCriterion[] = [
      {
        id: "REVIEW_MATRIX_COMPLETE",
        label: "Review matrix complete",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({
      acceptanceReadinessRevision: 5,
      acceptanceCriteriaSnapshot: {
        criteria: snapshotCriteria,
        basisRevision: 4,
      },
      // No review matrix in current state -> current criteria should fail, not pass.
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
            text: "Requirement AC1",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        reviewMatrix: undefined,
        amendments: [],
      },
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(projection.freshness).toBe("stale");
    const current = projection.current;
    const reviewMatrix = findCriterion(current, "REVIEW_MATRIX_COMPLETE");
    expect(reviewMatrix?.status).toBe("fail");
  });

  it("preserves the persisted snapshot as audit evidence", () => {
    const snapshotCriteria: GateCriterion[] = [
      {
        id: "ALL_ROWS_PASSING",
        label: "All rows passing",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({
      acceptanceReadinessRevision: 1,
      acceptanceCriteriaSnapshot: {
        criteria: snapshotCriteria,
        basisRevision: 0,
      },
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(projection.snapshot).toEqual(snapshotCriteria);
    expect(projection.freshness).toBe("stale");
  });
});

describe("AC4: disposition remediation invalidates prior acceptance readiness evidence", () => {
  function makeSnapshotCriteria(): GateCriterion[] {
    return [
      {
        id: "REVIEW_MATRIX_COMPLETE",
        label: "Review matrix complete",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
  }

  it("marks a previously fresh acceptance snapshot stale after a design-concern disposition", () => {
    const state = makeState({
      acceptanceReadinessRevision: 2,
      acceptanceCriteriaSnapshot: {
        criteria: makeSnapshotCriteria(),
        basisRevision: 2,
      },
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    applyDesignConcernDispositionedToState(state, {
      taskId: "tk-design",
      concernKey: "component_correctness",
      disposition: "fixed",
      evidence: "Re-implemented with a semantic <button>.",
      dispositionedAt: "2026-05-20T00:00:01.000Z",
      mutationReceiptId: "mrec-design",
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(state.acceptanceReadinessRevision).toBe(3);
    expect(projection.basisRevision).toBe(3);
    expect(projection.freshness).toBe("stale");
    expect(projection.snapshot).toEqual(makeSnapshotCriteria());
  });

  it("marks a previously fresh acceptance snapshot stale after a verification-evidence disposition", () => {
    const state = makeState({
      acceptanceReadinessRevision: 4,
      acceptanceCriteriaSnapshot: {
        criteria: makeSnapshotCriteria(),
        basisRevision: 4,
      },
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1"] }),
    });

    applyVerificationEvidenceDispositionedToState(state, {
      taskId: "tk-verify",
      concernKey: "verification_mismatch",
      disposition: "fixed",
      evidence: "Re-ran targeted suite; binding now matches.",
      dispositionedAt: "2026-05-20T00:00:02.000Z",
      mutationReceiptId: "mrec-verify",
    });

    const projection = deriveAcceptanceCriteriaProjection(state);

    expect(state.acceptanceReadinessRevision).toBe(5);
    expect(projection.basisRevision).toBe(5);
    expect(projection.freshness).toBe("stale");
    expect(projection.snapshot).toEqual(makeSnapshotCriteria());
  });
});

describe("acceptance criteria completeness (ID-aware)", () => {
  function evaluateAcceptance(state: ChangeWorkflowState) {
    return evaluateGateCriteria(state, "acceptance");
  }

  it("passes when review matrix rows match contract items exactly", () => {
    const state = makeState({
      contract: makeContract({
        itemIds: ["AC1", "AC2"],
        rowIds: ["AC1", "AC2"],
      }),
    });

    const criteria = evaluateAcceptance(state);
    const complete = findCriterion(criteria, "REVIEW_MATRIX_COMPLETE");
    expect(complete?.status).toBe("pass");
    expect(complete?.evidence).toContain("2 rows");
  });

  it("fails closed when a review row is missing", () => {
    const state = makeState({
      contract: makeContract({ itemIds: ["AC1", "AC2"], rowIds: ["AC1"] }),
    });

    const criteria = evaluateAcceptance(state);
    const complete = findCriterion(criteria, "REVIEW_MATRIX_COMPLETE");
    expect(complete?.status).toBe("fail");
    expect(complete?.evidence).toContain("missing");
    expect(complete?.evidence).toContain("AC2");
  });

  it("fails closed when a review row is duplicated", () => {
    const state = makeState({
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1", "AC1"] }),
    });

    const criteria = evaluateAcceptance(state);
    const complete = findCriterion(criteria, "REVIEW_MATRIX_COMPLETE");
    expect(complete?.status).toBe("fail");
    expect(complete?.evidence).toContain("duplicate");
    expect(complete?.evidence).toContain("AC1");
  });

  it("fails closed when an unknown review row is present", () => {
    const state = makeState({
      contract: makeContract({ itemIds: ["AC1"], rowIds: ["AC1", "AC2"] }),
    });

    const criteria = evaluateAcceptance(state);
    const complete = findCriterion(criteria, "REVIEW_MATRIX_COMPLETE");
    expect(complete?.status).toBe("fail");
    expect(complete?.evidence).toContain("unknown");
    expect(complete?.evidence).toContain("AC2");
  });

  it("fails closed when rows are both missing and unknown", () => {
    const state = makeState({
      contract: makeContract({ itemIds: ["AC1", "AC2"], rowIds: ["AC3"] }),
    });

    const criteria = evaluateAcceptance(state);
    const complete = findCriterion(criteria, "REVIEW_MATRIX_COMPLETE");
    expect(complete?.status).toBe("fail");
    expect(complete?.evidence).toContain("missing");
    expect(complete?.evidence).toContain("AC2");
    expect(complete?.evidence).toContain("unknown");
    expect(complete?.evidence).toContain("AC3");
  });

  it("ALL_ROWS_PASSING fails closed when row set is invalid", () => {
    const state = makeState({
      contract: makeContract({
        itemIds: ["AC1", "AC2"],
        rowIds: ["AC1"],
        rowStatus: "pass",
      }),
    });

    const criteria = evaluateAcceptance(state);
    const allPassing = findCriterion(criteria, "ALL_ROWS_PASSING");
    expect(allPassing?.status).toBe("fail");
  });
});

describe("acceptance criteria snapshot capture", () => {
  it("records acceptanceCriteriaSnapshot with the current basisRevision on acceptance completion", () => {
    const criteria: GateCriterion[] = [
      {
        id: "REVIEW_MATRIX_COMPLETE",
        label: "Review matrix complete",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({ acceptanceReadinessRevision: 4 });

    applyGateCompletedToState(state, {
      gateId: "acceptance",
      completedBy: "agent",
      completedAt: "2026-05-20T00:00:00.000Z",
      approvalEvidence: "accepted",
      criteria,
    });

    expect(state.gateCriteria).toEqual({ acceptance: criteria });
    expect(state.acceptanceCriteriaSnapshot).toEqual({
      criteria,
      basisRevision: 4,
    });
  });

  it("does not capture an acceptance snapshot for non-acceptance gates", () => {
    const criteria: GateCriterion[] = [
      {
        id: "PROPOSAL_ARTIFACT_PRESENT",
        label: "Proposal artifact present",
        status: "pass",
        evaluatedAt: "2026-05-20T00:00:00.000Z",
      },
    ];
    const state = makeState({ acceptanceReadinessRevision: 1 });

    applyGateCompletedToState(state, {
      gateId: "proposal",
      completedBy: "agent",
      completedAt: "2026-05-20T00:00:00.000Z",
      approvalEvidence: "approved",
      criteria,
    });

    expect(state.gateCriteria).toEqual({ proposal: criteria });
    expect(state.acceptanceCriteriaSnapshot).toBeUndefined();
  });
});
