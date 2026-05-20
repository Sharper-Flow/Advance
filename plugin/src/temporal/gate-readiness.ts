import {
  GATE_ORDER,
  GateArtifactEvidenceSchema,
  type GateArtifactEvidence,
  type GateArtifactKind,
  type GateId,
  type GateReadinessBlocker,
} from "../types";
import type { ChangeWorkflowState } from "./contracts";

export const ARTIFACT_BACKED_GATES = {
  proposal: "proposal",
  discovery: "agreement",
  design: "design",
  acceptance: "acceptance",
} satisfies Partial<Record<GateId, GateArtifactKind>>;

export const gateArtifactEvidenceSchema = GateArtifactEvidenceSchema;

export interface GateReadinessOptions {
  compatibilityReason?: string;
}

export interface GateReadinessResult {
  ready: boolean;
  blockers: GateReadinessBlocker[];
  evidence?: GateArtifactEvidence;
}

function makeBlocker(
  blocker: Omit<GateReadinessBlocker, "message" | "remediation"> & {
    message?: string;
    remediation?: string;
  },
): GateReadinessBlocker {
  return {
    message: blocker.message ?? blocker.code,
    remediation: blocker.remediation ?? "Resolve the blocker and retry gate completion.",
    ...blocker,
  };
}

function priorGateBlockers(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  const gateIndex = GATE_ORDER.indexOf(gateId);
  if (gateIndex <= 0) return [];
  return GATE_ORDER.slice(0, gateIndex)
    .filter((priorGateId) => state.gates[priorGateId]?.status !== "done")
    .map((priorGateId) =>
      makeBlocker({
        code: "PRIOR_GATE_INCOMPLETE",
        gateId,
        blockingGateId: priorGateId,
        message: `Prior gate ${priorGateId} must be completed before ${gateId}.`,
        remediation: `Complete the ${priorGateId} gate before retrying ${gateId}.`,
      }),
    );
}

function compatibilityEvidence(
  artifactKind: GateArtifactKind,
  reason: string,
): GateArtifactEvidence {
  return {
    kind: artifactKind,
    checked_at: new Date(0).toISOString(),
    compatibility_reason: reason,
  };
}

function artifactStoreBlocker(
  gateId: GateId,
  artifactKind: GateArtifactKind,
): GateReadinessBlocker {
  return makeBlocker({
    code: "ARTIFACT_STORE_UNAVAILABLE",
    gateId,
    artifactKind,
    message: `Artifact store is unavailable for ${artifactKind}.`,
    remediation:
      "Provide a workflow artifact store or use an explicit compatibility rationale for replay/migration fixtures.",
  });
}

function acceptanceContractBlockers(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "acceptance") return [];
  if (!state.contract) {
    return [
      makeBlocker({
        code: "ACCEPTANCE_CONTRACT_MISSING",
        gateId,
        artifactKind: "acceptance",
        message: "Acceptance requires typed contract proof for new changes.",
        remediation:
          "Mint or migrate the ChangeContract, or record an explicit compatibility rationale for legacy replay.",
      }),
    ];
  }
  if (!state.contract.reviewMatrix) {
    return [
      makeBlocker({
        code: "ACCEPTANCE_REVIEW_MATRIX_MISSING",
        gateId,
        artifactKind: "acceptance",
        message: "Acceptance requires a contract review matrix.",
        remediation:
          "Complete review matrix generation before retrying acceptance.",
      }),
    ];
  }
  return [];
}

export function evaluateGateReadiness(
  state: ChangeWorkflowState,
  gateId: GateId,
  options: GateReadinessOptions = {},
): GateReadinessResult {
  const blockers = priorGateBlockers(state, gateId);
  const artifactKind = ARTIFACT_BACKED_GATES[gateId];
  let evidence: GateArtifactEvidence | undefined;

  if (artifactKind && !state.projectionChangesDir) {
    if (options.compatibilityReason) {
      evidence = compatibilityEvidence(artifactKind, options.compatibilityReason);
    } else {
      blockers.push(artifactStoreBlocker(gateId, artifactKind));
    }
  }

  if (artifactKind === "acceptance") {
    if (options.compatibilityReason && !state.contract) {
      evidence = compatibilityEvidence(artifactKind, options.compatibilityReason);
    } else {
      blockers.push(...acceptanceContractBlockers(state, gateId));
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    ...(evidence ? { evidence } : {}),
  };
}
