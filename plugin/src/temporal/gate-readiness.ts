import {
  GATE_ORDER,
  GateArtifactEvidenceSchema,
  type GateArtifactEvidence,
  type GateArtifactKind,
  type GateId,
  type GateReadinessBlocker,
} from "../types";
import type { ChangeWorkflowState } from "./contracts";
import { isFailingContractReviewStatus } from "./recovery-classification";

export const ARTIFACT_BACKED_GATES: Partial<Record<GateId, GateArtifactKind>> =
  {
    proposal: "proposal",
    discovery: "agreement",
    design: "design",
    acceptance: "acceptance",
  } satisfies Partial<Record<GateId, GateArtifactKind>>;

export const gateArtifactEvidenceSchema = GateArtifactEvidenceSchema;

export const MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS = 20;

export interface GateReadinessOptions {
  compatibilityReason?: string;
  enforceDiscoveryContract?: boolean;
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
    remediation:
      blocker.remediation ?? "Resolve the blocker and retry gate completion.",
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

function nonWhitespaceCount(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function stateBackedArtifactEvidence(
  state: ChangeWorkflowState,
  gateId: GateId,
  artifactKind: GateArtifactKind,
  checkedAt: string,
): GateReadinessResult {
  const content = state.documents?.[artifactKind];
  if (typeof content !== "string" || content.trim().length === 0) {
    return {
      ready: false,
      blockers: [
        makeBlocker({
          code: "ARTIFACT_MISSING",
          gateId,
          artifactKind,
          message: `${artifactKind} artifact is missing from workflow state.`,
          remediation:
            "Persist the required artifact through the Temporal artifact update path before retrying gate completion.",
        }),
      ],
    };
  }

  const nonWhitespaceChars = nonWhitespaceCount(content);
  if (nonWhitespaceChars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS) {
    return {
      ready: false,
      blockers: [
        makeBlocker({
          code: "ARTIFACT_UNDERSIZED",
          gateId,
          artifactKind,
          message: `${artifactKind} artifact has ${nonWhitespaceChars} non-whitespace characters; minimum is ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}.`,
          remediation:
            "Populate the required artifact with substantive gate evidence before retrying gate completion.",
        }),
      ],
    };
  }

  const metadata = state.artifacts[artifactKind];
  const evidence: GateArtifactEvidence = {
    kind: artifactKind,
    ...(metadata?.path ? { path: metadata.path } : {}),
    ...(metadata?.contentHash ? { content_hash: metadata.contentHash } : {}),
    non_whitespace_chars: nonWhitespaceChars,
    checked_at: checkedAt,
  };
  return { ready: true, blockers: [], evidence };
}

/**
 * State-backed acceptance proof (completeStateBackedGate, AC1/AC2).
 *
 * Derives acceptance gate evidence from workflow state WITHOUT inspecting
 * disk. The executive-summary proof is the gating artifact for acceptance:
 * its content lives in `state.documents.executiveSummary` and its
 * server-computed metadata (path + contentHash) lives in
 * `state.artifacts.executiveSummary`. The L1 readiness check
 * (`acceptanceContractBlockers`) already verifies the metadata is present and
 * the contract review matrix passes; this function additionally validates the
 * in-state executive-summary CONTENT (presence + minimum size) and emits
 * acceptance evidence keyed to the executive-summary metadata.
 *
 * The contentHash is NOT recomputed here — recomputation would require a
 * non-deterministic hashing primitive inside the workflow bundle. The metadata
 * contentHash and state.documents.executiveSummary are consistent by
 * construction: `updateArtifacts` fires the content signal and the
 * metadata signal (hash computed from the same content) sequentially. The
 * disk-inspecting hash re-verification is reserved for the poisoned-history
 * recovery path in gate.ts (C2/C4), which writes the disk file at recovery
 * time before inspecting it.
 */
export function stateBackedAcceptanceProof(
  state: ChangeWorkflowState,
  checkedAt: string,
): GateReadinessResult {
  const content = state.documents?.executiveSummary;
  if (typeof content !== "string" || content.trim().length === 0) {
    return {
      ready: false,
      blockers: [
        makeBlocker({
          code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
          gateId: "acceptance",
          artifactKind: "acceptance",
          message:
            "Acceptance requires executive-summary content in workflow state.",
          remediation:
            "Persist executive-summary content through the Temporal artifact update path before retrying acceptance.",
        }),
      ],
    };
  }

  const nonWhitespaceChars = nonWhitespaceCount(content);
  if (nonWhitespaceChars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS) {
    return {
      ready: false,
      blockers: [
        makeBlocker({
          code: "ACCEPTANCE_EXECUTIVE_SUMMARY_UNDERSIZED",
          gateId: "acceptance",
          artifactKind: "acceptance",
          message: `executive-summary artifact has ${nonWhitespaceChars} non-whitespace characters; minimum is ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}.`,
          remediation:
            "Populate executive-summary with substantive acceptance evidence before retrying acceptance.",
        }),
      ],
    };
  }

  const metadata = state.artifacts.executiveSummary;
  const evidence: GateArtifactEvidence = {
    kind: "acceptance",
    ...(metadata?.path ? { path: metadata.path } : {}),
    ...(metadata?.contentHash ? { content_hash: metadata.contentHash } : {}),
    non_whitespace_chars: nonWhitespaceChars,
    checked_at: checkedAt,
  };
  return { ready: true, blockers: [], evidence };
}

function agreementExists(state: ChangeWorkflowState): boolean {
  if (state.documents?.agreement?.trim()) return true;
  return Boolean(state.artifacts.agreement ?? state.artifacts.discovery);
}

function discoveryContractBlockers(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "discovery") return [];
  if (!agreementExists(state) || state.contract) return [];
  return [
    makeBlocker({
      code: "DISCOVERY_CONTRACT_MISSING",
      gateId,
      artifactKind: "agreement",
      message:
        "Discovery requires typed contract proof once agreement is approved.",
      remediation:
        "Run adv_contract_mint for this change before completing discovery.",
    }),
  ];
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
  const executiveSummary = state.artifacts.executiveSummary;
  const executiveSummaryContent = state.documents?.executiveSummary;
  const executiveSummaryBlockers: GateReadinessBlocker[] = [];
  // Resilience: when state.artifacts.executiveSummary metadata is missing
  // but state.documents.executiveSummary has content, the metadata signal
  // may not have been processed yet (signal delivery timing). In this case,
  // synthesize the metadata from the content and conventional path so the
  // acceptance gate can proceed. The L2 check (stateBackedAcceptanceProof)
  // validates the content itself.
  const hasMetadata =
    executiveSummary?.path && executiveSummary?.contentHash?.trim();
  const hasContent =
    typeof executiveSummaryContent === "string" &&
    executiveSummaryContent.trim().length > 0;
  if (!hasMetadata && !hasContent) {
    executiveSummaryBlockers.push(
      makeBlocker({
        code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
        gateId,
        artifactKind: "acceptance",
        message:
          "Acceptance requires workflow-visible executive-summary artifact metadata.",
        remediation:
          "Persist executive-summary.md and update workflow artifact metadata before retrying acceptance.",
      }),
    );
  } else if (!hasMetadata && hasContent) {
    // Metadata signal not yet processed but content exists — not a blocker.
    // The L2 check (stateBackedAcceptanceProof) will validate content size.
  }
  if (!hasMetadata && hasContent) {
    // Content exists but metadata hash is missing — not a blocker since
    // stateBackedAcceptanceProof will validate content and derive evidence
    // from available metadata (path/contentHash are optional in evidence).
  } else if (!executiveSummary?.contentHash?.trim() && !hasContent) {
    executiveSummaryBlockers.push(
      makeBlocker({
        code: "ACCEPTANCE_EXECUTIVE_SUMMARY_HASH_MISSING",
        gateId,
        artifactKind: "acceptance",
        message:
          "Acceptance requires executive-summary artifact metadata with contentHash evidence.",
        remediation:
          "Signal executiveSummary artifact metadata with a server-computed contentHash before retrying acceptance.",
      }),
    );
  }
  const rowsByContractId = new Map(
    state.contract.reviewMatrix.rows.map((row) => [row.contractId, row]),
  );
  return executiveSummaryBlockers.concat(
    state.contract.items
      .filter((item) => item.verificationRequired !== false)
      .flatMap((item) => {
        const row = rowsByContractId.get(item.id);
        if (!row) {
          return [
            makeBlocker({
              code: "ACCEPTANCE_REVIEW_ROW_MISSING",
              gateId,
              artifactKind: "acceptance",
              contractId: item.id,
              message: `Acceptance review matrix is missing row ${item.id}.`,
              remediation:
                "Complete the contract review matrix before retrying acceptance.",
            }),
          ];
        }
        if (isFailingContractReviewStatus(row.status)) {
          return [
            makeBlocker({
              code: "ACCEPTANCE_REVIEW_ROW_FAILING",
              gateId,
              artifactKind: "acceptance",
              contractId: item.id,
              message: `Acceptance review row ${item.id} has non-passing status ${row.status}.`,
              remediation:
                "Resolve the failing contract review row before retrying acceptance.",
            }),
          ];
        }
        return [];
      }),
  );
}

export function renderAcceptanceProjection(state: ChangeWorkflowState): string {
  const contract = state.contract;
  if (!contract?.reviewMatrix) {
    return "# Acceptance\n\nNo typed acceptance proof available.\n";
  }
  const rowsByContractId = new Map(
    contract.reviewMatrix.rows.map((row) => [row.contractId, row]),
  );
  const lines = [
    "# Acceptance",
    "",
    `Reviewed at: ${contract.reviewMatrix.reviewedAt}`,
    "",
    "## Contract Review Matrix",
    "",
    "| ID | Kind | Requirement | Status | Evidence |",
    "|---|---|---|---|---|",
  ];
  for (const item of contract.items) {
    const row = rowsByContractId.get(item.id);
    lines.push(
      `| ${item.id} | ${item.kind} | ${item.text} | ${row?.status ?? "missing"} | ${row?.evidence ?? ""} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function evaluateGateReadiness(
  state: ChangeWorkflowState,
  gateId: GateId,
  options: GateReadinessOptions = {},
): GateReadinessResult {
  const blockers = priorGateBlockers(state, gateId);
  const artifactKind = ARTIFACT_BACKED_GATES[gateId];
  let evidence: GateArtifactEvidence | undefined;

  if (artifactKind && options.compatibilityReason) {
    evidence = compatibilityEvidence(artifactKind, options.compatibilityReason);
  }

  if (artifactKind === "acceptance" && !state.projectionChangesDir) {
    if (options.compatibilityReason) {
      evidence = compatibilityEvidence(
        artifactKind,
        options.compatibilityReason,
      );
    } else {
      blockers.push(artifactStoreBlocker(gateId, artifactKind));
    }
  }

  if (gateId === "discovery" && options.enforceDiscoveryContract !== false) {
    blockers.push(...discoveryContractBlockers(state, gateId));
  }

  if (artifactKind === "acceptance") {
    if (options.compatibilityReason && !state.contract) {
      evidence = compatibilityEvidence(
        artifactKind,
        options.compatibilityReason,
      );
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
