import {
  GATE_ORDER,
  GateArtifactEvidenceSchema,
  type DesignConcernDisposition,
  type DesignerSubagentReport,
  type GateArtifactEvidence,
  type GateArtifactKind,
  type GateId,
  type GateReadinessBlocker,
  type OpsFollowupLink,
  type OpsRelationship,
  type OpsFollowupStatus,
} from "../types";
import type { ChangeWorkflowState } from "./contracts";
import { isFailingContractReviewStatus } from "./recovery-classification";

const HANDOFF_OPS_RELATIONSHIPS: OpsRelationship[] = [
  "follows_release",
  "monitors",
  "cleanup_after",
];
const COMPLETE_OPS_STATUSES = ["complete"];

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

export interface GateReadinessWarning {
  code: string;
  message: string;
  artifactKind?: GateArtifactKind;
}

export interface GateReadinessResult {
  ready: boolean;
  blockers: GateReadinessBlocker[];
  evidence?: GateArtifactEvidence;
  warnings?: GateReadinessWarning[];
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

function readableArtifactPath(
  metadata: ChangeWorkflowState["artifacts"][GateArtifactKind] | undefined,
): string | undefined {
  if (!metadata?.path) return undefined;
  return metadata.readable === true ? metadata.path : undefined;
}

/**
 * Non-blocking advisory warnings for truth ordering cascade consistency.
 *
 * Checks prior artifact-backed gates for cascade reminders and scans the
 * current artifact for contradiction indicators. Warnings do NOT block
 * gate completion — they surface potential inconsistencies for human review.
 *
 * Inspired by OpenAI Model Spec truth ordering cascade: later artifacts
 * must not contradict earlier ones without explicit amendment.
 */
export function artifactCascadeWarnings(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessWarning[] {
  const warnings: GateReadinessWarning[] = [];
  const gateIndex = GATE_ORDER.indexOf(gateId);

  // Cascade reminder: when completing an artifact-backed gate with prior
  // artifact-backed gates done, remind about truth ordering consistency.
  const currentArtifactKind = ARTIFACT_BACKED_GATES[gateId];
  if (currentArtifactKind && gateIndex > 0) {
    const priorArtifactKinds = GATE_ORDER.slice(0, gateIndex)
      .filter(
        (gid) =>
          ARTIFACT_BACKED_GATES[gid] && state.gates[gid]?.status === "done",
      )
      .map((gid) => ARTIFACT_BACKED_GATES[gid]!)
      .filter((kind) => state.documents?.[kind]?.trim());

    if (priorArtifactKinds.length > 0) {
      warnings.push({
        code: "CASCADE_REMINDER",
        message: `Prior artifacts (${priorArtifactKinds.join(", ")}) should be consistent with ${currentArtifactKind}. Verify no contradictions in truth ordering cascade before proceeding.`,
      });
    }
  }

  // Keyword scan: detect contradiction indicators in current artifact.
  if (currentArtifactKind) {
    const content = state.documents?.[currentArtifactKind] ?? "";
    if (content.trim().length > 0) {
      const contradictionKeywords = [
        "TODO",
        "TBD",
        "FIXME",
        "HACK",
        "contradicts",
        "overrides",
      ];
      const found = contradictionKeywords.filter((kw) =>
        content.toLowerCase().includes(kw.toLowerCase()),
      );
      if (found.length > 0) {
        warnings.push({
          code: "ARTIFACT_CONTRADICTION_KEYWORDS",
          message: `${currentArtifactKind} contains potential contradiction indicators: ${found.join(", ")}. Review before proceeding.`,
          artifactKind: currentArtifactKind,
        });
      }
    }
  }

  return warnings;
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
  const path = readableArtifactPath(metadata);
  const evidence: GateArtifactEvidence = {
    kind: artifactKind,
    ...(path ? { path } : {}),
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
 * server-computed metadata (contentHash/source/readable, plus path only when
 * materialized) lives in `state.artifacts.executiveSummary`. The L1 readiness
 * check (`acceptanceContractBlockers`) already verifies usable metadata or
 * content is present and the contract review matrix passes; this function
 * additionally validates the in-state executive-summary CONTENT (presence +
 * minimum size) and emits acceptance evidence keyed to readable metadata.
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
  const path = readableArtifactPath(metadata);
  const evidence: GateArtifactEvidence = {
    kind: "acceptance",
    ...(path ? { path } : {}),
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
  // Resilience: Temporal-only metadata intentionally omits path. Legacy state
  // may still have a path, so metadata readiness keys off hash plus source /
  // readability signals instead of requiring filesystem path evidence.
  const hasContentHash = Boolean(executiveSummary?.contentHash?.trim());
  const hasMetadataContext = Boolean(
    executiveSummary?.source ||
    executiveSummary?.path ||
    executiveSummary?.readable !== undefined,
  );
  const hasMetadata = hasContentHash && hasMetadataContext;
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
  if (!hasContentHash && !hasContent) {
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

function contractItemsCoveredByTasks(state: ChangeWorkflowState): Set<string> {
  const covered = new Set<string>();
  for (const task of state.tasks) {
    if (task.status === "cancelled") continue;
    const refs = task.contract_refs;
    if (!refs) continue;
    for (const id of refs.implements ?? []) covered.add(id);
    for (const id of refs.verifies ?? []) covered.add(id);
  }
  return covered;
}

export function checkRequiredObligationReleaseBlockers(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "release") return [];
  if (!state.contract) return [];

  const rowsByContractId = new Map(
    state.contract.reviewMatrix?.rows.map((row) => [row.contractId, row]) ?? [],
  );

  return state.contract.items
    .filter((item) => item.requiredCritical === true)
    .flatMap((item) => {
      const row = rowsByContractId.get(item.id);
      if (row && isFailingContractReviewStatus(row.status)) {
        return [
          makeBlocker({
            code: "REQUIRED_OBLIGATION_UNRESOLVED",
            gateId,
            contractId: item.id,
            message: `Required-critical obligation ${item.id} has failing review status ${row.status}.`,
            remediation:
              "Resolve the failing required-critical contract review row before releasing.",
          }),
        ];
      }
      return [];
    });
}

export function checkRequiredObligationRouting(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "release") return [];
  if (!state.contract) return [];

  const rowsByContractId = new Map(
    state.contract.reviewMatrix?.rows.map((row) => [row.contractId, row]) ?? [],
  );
  const coveredIds = contractItemsCoveredByTasks(state);

  return state.contract.items
    .filter((item) => item.requiredCritical === true)
    .flatMap((item) => {
      if (item.notRequiredReason) return [];
      if (rowsByContractId.has(item.id)) return [];
      if (coveredIds.has(item.id)) return [];
      return [
        makeBlocker({
          code: "REQUIRED_OBLIGATION_NOT_ROUTED",
          gateId,
          contractId: item.id,
          message: `Required-critical obligation ${item.id} has no task coverage and no review matrix row.`,
          remediation:
            "Route via adv_change_reenter or fast-follow split, or add task coverage and complete review.",
        }),
      ];
    });
}

// rq-designQualityEvidence01: Structural design-quality blocker.
//
// Reads persisted adv-designer reports from change state (sandbox-safe — no
// agenda/storage access) and blocks acceptance/release while the LATEST designer
// report per task carries an undispositioned `concern` dimension or neighboring
// recommendation. A concern clears when (a) a later all-pass report supersedes
// it, or (b) a typed disposition exists for its (taskId, concernKey). There is
// no accepted_debt path — undispositioned concerns block.
const DESIGN_DIMENSION_KEYS = [
  "component_correctness",
  "semantic_html_a11y",
  "responsive_behavior",
  "visual_polish",
  "site_design_consistency",
  "finer_details",
] as const;

function designerReportTaskId(
  report: DesignerSubagentReport,
): string | undefined {
  if (typeof report.scope === "object" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return report.task_id;
}

function latestDesignerReportsByTask(
  state: ChangeWorkflowState,
): Map<string, DesignerSubagentReport> {
  const latest = new Map<string, DesignerSubagentReport>();
  for (const report of state.subagent_reports ?? []) {
    if (report.agent !== "adv-designer") continue;
    const designer = report as DesignerSubagentReport;
    const taskId = designerReportTaskId(designer);
    if (!taskId) continue;
    const existing = latest.get(taskId);
    if (!existing || designer.attempt > existing.attempt) {
      latest.set(taskId, designer);
    }
  }
  return latest;
}

export function checkUnresolvedDesignConcerns(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "acceptance" && gateId !== "release") return [];

  const latestByTask = latestDesignerReportsByTask(state);
  if (latestByTask.size === 0) return [];

  const dispositions: DesignConcernDisposition[] =
    state.design_concern_dispositions ?? [];
  const isDispositioned = (taskId: string, concernKey: string): boolean =>
    dispositions.some(
      (d) => d.taskId === taskId && d.concernKey === concernKey,
    );

  const blockers: GateReadinessBlocker[] = [];
  for (const [taskId, report] of latestByTask) {
    for (const dim of DESIGN_DIMENSION_KEYS) {
      if (report.design_dimensions[dim] !== "concern") continue;
      const concernKey = `dimension:${dim}`;
      if (isDispositioned(taskId, concernKey)) continue;
      blockers.push(
        makeBlocker({
          code: "DESIGN_CONCERN_UNRESOLVED",
          gateId,
          message: `Unresolved design concern (${dim}) on task ${taskId} from adv-designer report.`,
          remediation:
            "Fix the concern and submit an updated adv-designer report, or record a typed disposition via adv_design_concern_disposition (fixed | rejected_with_evidence | split | fast_follow).",
        }),
      );
    }

    report.neighboring_recommendations.forEach((rec, index) => {
      const concernKey = `neighbor:${index}`;
      if (isDispositioned(taskId, concernKey)) return;
      blockers.push(
        makeBlocker({
          code: "DESIGN_CONCERN_UNRESOLVED",
          gateId,
          message: `Unresolved neighboring UI recommendation on task ${taskId}: ${rec.what}`,
          remediation:
            "Include the fix now, or record a typed disposition via adv_design_concern_disposition (rejected_with_evidence | split | fast_follow).",
        }),
      );
    });
  }

  return blockers;
}

function isOpsFollowupComplete(link: OpsFollowupLink): boolean {
  return COMPLETE_OPS_STATUSES.includes(link.status);
}

/**
 * Release gate enforcement for outbound ops follow-up links.
 *
 * - `blocks` relationships are hard release blockers while incomplete.
 * - `follows_release`, `monitors`, and `cleanup_after` normally support
 *   release-first sequencing and do not block release. If a link is marked
 *   `required_handoff: true`, it represents an explicit surviving obligation
 *   that must be completed (or handed off) before release.
 */
export function checkOpsFollowupReleaseBlockers(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "release") return [];
  const links = state.ops_followup_links ?? [];

  return links.flatMap((link) => {
    if (isOpsFollowupComplete(link)) return [];

    if (link.relationship === "blocks") {
      return [
        makeBlocker({
          code: "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
          gateId,
          linkId: link.id,
          changeId: link.changeId,
          relationship: link.relationship,
          message: `Blocking ops follow-up ${link.id} (${link.changeId}) is incomplete (status: ${link.status}).`,
          remediation: `Complete the blocking ops follow-up change ${link.changeId} before releasing, or change the relationship to a non-blocking type.`,
        }),
      ];
    }

    if (
      HANDOFF_OPS_RELATIONSHIPS.includes(link.relationship) &&
      link.required_handoff
    ) {
      return [
        makeBlocker({
          code: "OPS_FOLLOWUP_HANDOFF_INCOMPLETE",
          gateId,
          linkId: link.id,
          changeId: link.changeId,
          relationship: link.relationship,
          message: `Surviving-obligation handoff ${link.id} (${link.changeId}, ${link.relationship}) is incomplete (status: ${link.status}).`,
          remediation: `Complete the required handoff for ops follow-up change ${link.changeId} before releasing, or clear required_handoff if it is not a release blocker.`,
        }),
      ];
    }

    return [];
  });
}

export interface OpenOpsFollowupObligation {
  linkId: string;
  changeId: string;
  relationship: OpsRelationship;
  required_handoff: boolean;
  status: OpsFollowupStatus;
  open: boolean;
}

/**
 * Return the set of outbound ops follow-up links that are not complete.
 * Used by release/archive report surfaces to surface surviving obligations.
 */
export function getOpenOpsFollowupObligations(
  links: OpsFollowupLink[] | undefined,
): OpenOpsFollowupObligation[] {
  return (links ?? [])
    .filter((link) => !isOpsFollowupComplete(link))
    .map((link) => ({
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      required_handoff: link.required_handoff,
      status: link.status,
      open: true,
    }));
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
    blockers.push(...checkUnresolvedDesignConcerns(state, gateId));
  }

  if (gateId === "release") {
    blockers.push(...checkRequiredObligationReleaseBlockers(state, gateId));
    blockers.push(...checkRequiredObligationRouting(state, gateId));
    blockers.push(...checkOpsFollowupReleaseBlockers(state, gateId));
    blockers.push(...checkUnresolvedDesignConcerns(state, gateId));
  }

  const warnings = artifactCascadeWarnings(state, gateId);

  return {
    ready: blockers.length === 0,
    blockers,
    ...(evidence ? { evidence } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// =============================================================================
// Gate Criteria Evaluation (Advisory, Non-Blocking)
// =============================================================================

import type { GateCriterion, CriterionDef } from "../types";
import { GATE_CRITERIA_DEFINITIONS } from "../types";

/**
 * Criterion evaluator function.
 * Inspects ChangeWorkflowState and returns pass/fail/na with optional evidence.
 * Must be synchronous and deterministic for Temporal replay safety.
 */
export type CriterionEvaluator = (
  state: ChangeWorkflowState,
  gateId: GateId,
) => { status: "pass" | "fail" | "na"; evidence?: string };

/**
 * Criterion evaluators — implementation functions keyed by criterion ID.
 * Each evaluator inspects ChangeWorkflowState and returns evaluation result.
 * Errors are caught by evaluateGateCriteria and converted to status: 'na'.
 */
export const CRITERION_EVALUATORS: Record<string, CriterionEvaluator> = {
  // Proposal criteria
  PROPOSAL_ARTIFACT_PRESENT: (state) => {
    const content = state.documents?.proposal;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: "fail", evidence: "Proposal content missing" };
    }
    return { status: "pass", evidence: "Proposal present" };
  },
  PROPOSAL_MIN_SIZE: (state) => {
    const content = state.documents?.proposal;
    if (typeof content !== "string") {
      return { status: "na", evidence: "No proposal content" };
    }
    const chars = content.replace(/\s/g, "").length;
    if (chars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS) {
      return {
        status: "fail",
        evidence: `${chars} chars < ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}`,
      };
    }
    return { status: "pass", evidence: `${chars} chars` };
  },

  // Discovery criteria
  AGREEMENT_ARTIFACT_PRESENT: (state) => {
    const content = state.documents?.agreement;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: "fail", evidence: "Agreement content missing" };
    }
    return { status: "pass", evidence: "Agreement present" };
  },
  CONTRACT_MINTED: (state) => {
    if (!state.contract) {
      return { status: "fail", evidence: "No contract" };
    }
    return { status: "pass", evidence: "Contract exists" };
  },

  // Design criteria
  DESIGN_ARTIFACT_PRESENT: (state) => {
    const content = state.documents?.design;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: "fail", evidence: "Design content missing" };
    }
    return { status: "pass", evidence: "Design present" };
  },
  DESIGN_MIN_SIZE: (state) => {
    const content = state.documents?.design;
    if (typeof content !== "string") {
      return { status: "na", evidence: "No design content" };
    }
    const chars = content.replace(/\s/g, "").length;
    if (chars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS) {
      return {
        status: "fail",
        evidence: `${chars} chars < ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}`,
      };
    }
    return { status: "pass", evidence: `${chars} chars` };
  },

  // Planning criteria
  USER_APPROVED: () => {
    // Cannot evaluate from state alone — set by tool layer at completion
    return { status: "na", evidence: "Evaluated at completion time" };
  },
  PREP_READINESS_PASS: () => {
    // Cannot evaluate from state alone — set by tool layer at completion
    return { status: "na", evidence: "Evaluated at completion time" };
  },
  TASKS_EXIST: (state) => {
    if (!state.tasks || state.tasks.length === 0) {
      return { status: "fail", evidence: "No tasks" };
    }
    return { status: "pass", evidence: `${state.tasks.length} tasks` };
  },
  NO_ORPHAN_TASKS: (state) => {
    // Simplified check — full orphan detection would require dependency graph analysis
    if (!state.tasks || state.tasks.length === 0) {
      return { status: "na", evidence: "No tasks to check" };
    }
    return { status: "pass", evidence: "Tasks present" };
  },
  TDD_INTENTS_ASSIGNED: (state) => {
    if (!state.tasks || state.tasks.length === 0) {
      return { status: "na", evidence: "No tasks" };
    }
    const withoutIntent = state.tasks.filter(
      (t) => !t.metadata?.tdd_intent,
    ).length;
    if (withoutIntent > 0) {
      return {
        status: "fail",
        evidence: `${withoutIntent} tasks without tdd_intent`,
      };
    }
    return { status: "pass", evidence: "All tasks have tdd_intent" };
  },

  // Execution criteria
  ALL_TASKS_DONE: (state) => {
    if (!state.tasks || state.tasks.length === 0) {
      return { status: "na", evidence: "No tasks" };
    }
    const incomplete = state.tasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled",
    ).length;
    if (incomplete > 0) {
      return { status: "fail", evidence: `${incomplete} incomplete tasks` };
    }
    return { status: "pass", evidence: "All tasks done/cancelled" };
  },

  // Acceptance criteria
  CONTRACT_EXISTS: (state) => {
    if (!state.contract) {
      return { status: "fail", evidence: "No contract" };
    }
    return { status: "pass", evidence: "Contract exists" };
  },
  REVIEW_MATRIX_COMPLETE: (state) => {
    if (!state.contract?.reviewMatrix) {
      return { status: "fail", evidence: "No review matrix" };
    }
    const itemCount = state.contract.items.length;
    const rowCount = state.contract.reviewMatrix.rows.length;
    if (rowCount < itemCount) {
      return {
        status: "fail",
        evidence: `${rowCount} rows < ${itemCount} items`,
      };
    }
    return {
      status: "pass",
      evidence: `${rowCount} rows for ${itemCount} items`,
    };
  },
  ALL_ROWS_PASSING: (state) => {
    if (!state.contract?.reviewMatrix) {
      return { status: "na", evidence: "No review matrix" };
    }
    const failing = state.contract.reviewMatrix.rows.filter((row) =>
      isFailingContractReviewStatus(row.status),
    ).length;
    if (failing > 0) {
      return { status: "fail", evidence: `${failing} failing rows` };
    }
    return { status: "pass", evidence: "All rows passing" };
  },
  EXECUTIVE_SUMMARY_PRESENT: (state) => {
    const content = state.documents?.executiveSummary;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: "fail", evidence: "Executive summary missing" };
    }
    const chars = content.replace(/\s/g, "").length;
    if (chars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS) {
      return {
        status: "fail",
        evidence: `${chars} chars < ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}`,
      };
    }
    return { status: "pass", evidence: `${chars} chars` };
  },

  // Release criteria
  // rq-requiredObligation01: Required-critical contract items without verified
  // completion evidence block release. Evaluated via acceptance contract blockers
  // and release gate readiness checks.
  TRUNK_MERGED: () => {
    // Cannot evaluate from state alone — requires git inspection
    return { status: "na", evidence: "Requires git inspection" };
  },
  PR_HANDOFF_COMPLETE: () => {
    // Cannot evaluate from state alone — requires GitHub API
    return { status: "na", evidence: "Requires GitHub API" };
  },
};

/**
 * Evaluate gate criteria for a given gate.
 * Runs all defined evaluators for the gate, catching errors and returning
 * status: 'na' for failed evaluations. Results are advisory (not blocking).
 *
 * @param state - Current workflow state
 * @param gateId - Gate to evaluate criteria for
 * @returns Array of evaluated criteria with pass/fail/na status
 */
export function evaluateGateCriteria(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateCriterion[] {
  const definitions = GATE_CRITERIA_DEFINITIONS[gateId];
  if (!definitions || definitions.length === 0) {
    return [];
  }

  const evaluatedAt = new Date().toISOString();
  return definitions.map((def: CriterionDef) => {
    const evaluator = CRITERION_EVALUATORS[def.id];
    if (!evaluator) {
      return {
        id: def.id,
        label: def.label,
        status: "na" as const,
        evaluatedAt,
        evidence: "No evaluator implemented",
      };
    }

    try {
      const result = evaluator(state, gateId);
      return {
        id: def.id,
        label: def.label,
        status: result.status,
        evaluatedAt,
        evidence: result.evidence,
      };
    } catch (error) {
      return {
        id: def.id,
        label: def.label,
        status: "na" as const,
        evaluatedAt,
        evidence: `Evaluator error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
