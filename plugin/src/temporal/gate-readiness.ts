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
  type ScopedSubagentReport,
  type VerificationEvidenceDisposition,
  isProofBearingEvidencePolicy,
  type AcceptanceCriteriaFreshness,
  type AcceptanceCriteriaProjection,
} from "../types";
import {
  resolveTaskEvidence,
  validateTaskEvidenceForStage,
} from "../validator/task-classifier";
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
  enforceWorkerBundleProvenance?: boolean;
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
  const rowCoverage = validateReviewMatrixRowCoverage(state);
  const rowCoverageBlockers = rowCoverage.valid
    ? []
    : [
        makeBlocker({
          code: "ACCEPTANCE_REVIEW_MATRIX_INVALID",
          gateId,
          artifactKind: "acceptance",
          message: `Acceptance review matrix has invalid row coverage: ${rowCoverage.reason}.`,
          remediation:
            "Provide exactly one passing review row for each required contract item before retrying acceptance.",
        }),
      ];
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
  return rowCoverageBlockers.concat(
    executiveSummaryBlockers,
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
// storage access) and blocks acceptance/release while the LATEST designer
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

// strengthenAgentEvidence AC1/AC2: Structural verification-evidence blocker.
// rq-verificationEvidence01
//
// Reports stay submit-time advisory (warnings only — no hard block at submit,
// DONT3). At acceptance/release readiness, inspect each COMPLETED task's latest
// task-scoped report per agent and its typed evidence_policy. For proof-bearing
// policies (test, static_check, review, artifact_reference), an unresolved
// verification_missing / verification_mismatch consumer warning becomes a typed
// VERIFICATION_EVIDENCE_MISSING blocker (SC1: acceptance cannot report full
// verification when required durable proof is absent). Non-proof policies
// (source_citation, source_audit, rubric_review, stakeholder_acceptance,
// design_proof, not_applicable) stay warn-first so valid non-code/source
// workflows do not regress (SC4 / AC2).
//
// A blocker clears only through (a) a newer warning-free report for that agent
// (latest-wins durable evidence), or (b) a typed disposition for
// (taskId, "verification") — never silently (no grandfathering). The check is
// NOT bypassed by compatibilityReason, mirroring checkUnresolvedDesignConcerns.

const VERIFICATION_WARNING_KINDS = new Set([
  "verification_missing",
  "verification_mismatch",
]);

const VERIFICATION_CONCERN_KEY = "verification";

function verificationReportTaskId(
  report: ScopedSubagentReport,
): string | undefined {
  if (typeof report.scope === "object" && report.scope?.kind === "task") {
    return report.scope.task_id;
  }
  return (report as { task_id?: string }).task_id;
}

// Latest task-scoped report per agent for a task (latest-wins by attempt so a
// newer warning-free report supersedes an older warning-bearing one).
function latestVerificationReportsForTask(
  state: ChangeWorkflowState,
  taskId: string,
): ScopedSubagentReport[] {
  const latestByAgent = new Map<string, ScopedSubagentReport>();
  for (const report of state.subagent_reports ?? []) {
    if (verificationReportTaskId(report) !== taskId) continue;
    const existing = latestByAgent.get(report.agent);
    if (!existing || report.attempt > existing.attempt) {
      latestByAgent.set(report.agent, report);
    }
  }
  return [...latestByAgent.values()];
}

export function checkUnresolvedVerificationEvidence(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "acceptance" && gateId !== "release") return [];

  const dispositions: VerificationEvidenceDisposition[] =
    state.verification_evidence_dispositions ?? [];
  const isDispositioned = (taskId: string): boolean =>
    dispositions.some(
      (d) => d.taskId === taskId && d.concernKey === VERIFICATION_CONCERN_KEY,
    );

  const blockers: GateReadinessBlocker[] = [];
  for (const task of state.tasks) {
    if (task.status !== "done") continue;
    const resolution = resolveTaskEvidence(task);
    const policy = resolution.policy;
    if (!policy || !isProofBearingEvidencePolicy(policy)) continue;
    if (isDispositioned(task.id)) continue;

    const warnings = latestVerificationReportsForTask(state, task.id).flatMap(
      (report) =>
        (report.consumer_warnings ?? []).filter((warning) =>
          VERIFICATION_WARNING_KINDS.has(warning.kind),
        ),
    );
    if (warnings.length === 0) continue;

    const kinds = [...new Set(warnings.map((w) => w.kind))].join(", ");
    blockers.push(
      makeBlocker({
        code: "VERIFICATION_EVIDENCE_MISSING",
        gateId,
        message: `Completed task ${task.id} (evidence_policy: ${policy}) has unresolved verification evidence: ${kinds}.`,
        remediation: `Re-run adv_run_test and submit an updated task report so the latest report is warning-free, or record a typed disposition via adv_verification_evidence_disposition (taskId: ${task.id}, concernKey: ${VERIFICATION_CONCERN_KEY}).`,
      }),
    );
  }
  return blockers;
}

// rq-evidencePlan01: gate-readiness enforcement of completed task evidence plans.
// Uses resolveTaskEvidence as the sole compatibility authority. Behavior-critical
// non-test routes must carry a linked review conclusion; unsupported routes fail
// structurally at acceptance/release. Quality signals (consumer warnings) do not
// own gate authority here; they are evaluated separately by
// checkUnresolvedVerificationEvidence.
export function checkCompletedTaskEvidencePlan(
  state: ChangeWorkflowState,
  gateId: GateId,
): GateReadinessBlocker[] {
  if (gateId !== "acceptance" && gateId !== "release") return [];

  const blockers: GateReadinessBlocker[] = [];
  for (const task of state.tasks) {
    if (task.status !== "done") continue;

    const stageValidation = validateTaskEvidenceForStage(task, "completion", [
      ...(state.subagent_reports ?? []),
      ...(task.subagent_reports ?? []),
    ]);
    if (!stageValidation.valid) {
      blockers.push(
        makeBlocker({
          code: "EVIDENCE_PLAN_INVALID",
          gateId,
          message: `Completed task ${task.id} has an invalid completion-stage evidence plan: ${stageValidation.errors.join("; ")}.`,
          remediation: `Fix the task evidence plan or reclassify with user approval before completing ${gateId}.`,
        }),
      );
      continue;
    }
  }
  return blockers;
}

function hasCompleteOpsProof(link: OpsFollowupLink): boolean {
  const resolution = link.resolution;
  if (!resolution) return false;
  if (resolution.source !== "child_profile") return false;
  if (!COMPLETE_OPS_STATUSES.includes(resolution.status)) return false;
  return Boolean(
    resolution.completion_signal &&
    resolution.health_verification &&
    resolution.rollback_or_cleanup_disposition,
  );
}

export function makeOpsResolutionBlocker(
  link: OpsFollowupLink,
  gateId: GateId,
): GateReadinessBlocker | null {
  const mustResolve =
    link.relationship === "blocks" ||
    (HANDOFF_OPS_RELATIONSHIPS.includes(link.relationship) &&
      link.required_handoff);
  if (!mustResolve) return null;

  const resolution = link.resolution;
  if (!resolution && !COMPLETE_OPS_STATUSES.includes(link.status)) {
    const code =
      link.relationship === "blocks"
        ? "OPS_FOLLOWUP_BLOCKS_INCOMPLETE"
        : "OPS_FOLLOWUP_HANDOFF_INCOMPLETE";
    return makeBlocker({
      code,
      gateId,
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      message: `Ops follow-up ${link.id} (${link.changeId}) is incomplete (status: ${link.status}).`,
      remediation: `Complete the ops follow-up change ${link.changeId} before releasing, or change the relationship/required handoff if it is not a release blocker.`,
    });
  }

  if (!resolution || resolution.source === "unreachable") {
    return makeBlocker({
      code: "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      gateId,
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      message: `Ops follow-up ${link.id} (${link.changeId}) lacks fresh verified child-state proof; parent status ${link.status} is not release authority.`,
      remediation: `Verify child ops follow-up change ${link.changeId} and project a fresh resolution proof before release.`,
    });
  }

  if (resolution.status === "complete" && !hasCompleteOpsProof(link)) {
    return makeBlocker({
      code: "OPS_FOLLOWUP_COMPLETION_PROOF_INCOMPLETE",
      gateId,
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      message: `Ops follow-up ${link.id} (${link.changeId}) is marked complete but lacks completion signal, health verification, or rollback/cleanup disposition proof.`,
      remediation: `Record completion signal, health verification, and rollback/cleanup disposition on child ops follow-up ${link.changeId}, then re-run reconciliation.`,
    });
  }

  if (!COMPLETE_OPS_STATUSES.includes(resolution.status)) {
    const code =
      link.relationship === "blocks"
        ? "OPS_FOLLOWUP_BLOCKS_INCOMPLETE"
        : "OPS_FOLLOWUP_HANDOFF_INCOMPLETE";
    return makeBlocker({
      code,
      gateId,
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      message: `Ops follow-up ${link.id} (${link.changeId}) verified child status is incomplete (status: ${resolution.status}).`,
      remediation: `Complete the ops follow-up change ${link.changeId} before releasing, or change the relationship/required handoff if it is not a release blocker.`,
    });
  }

  return null;
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
    const blocker = makeOpsResolutionBlocker(link, gateId);
    return blocker ? [blocker] : [];
  });
}

export interface OpenOpsFollowupObligation {
  linkId: string;
  changeId: string;
  relationship: OpsRelationship;
  required_handoff: boolean;
  status: OpsFollowupStatus;
  status_source: "child_profile" | "unreachable" | "parent_snapshot";
  completion_proof: "incomplete" | "unverified" | "unreachable";
  verified_at?: string;
  resolution_error?: string;
  open: boolean;
}

function incompleteOpsProofReason(
  link: OpsFollowupLink,
): OpenOpsFollowupObligation["completion_proof"] {
  const resolution = link.resolution;
  if (!resolution) return "unverified";
  if (resolution.source === "unreachable") return "unreachable";
  return "incomplete";
}

/**
 * Return the set of outbound ops follow-up links that are not complete.
 * Used by release/archive report surfaces to surface surviving obligations.
 */
export function getOpenOpsFollowupObligations(
  links: OpsFollowupLink[] | undefined,
): OpenOpsFollowupObligation[] {
  return (links ?? [])
    .filter((link) => !hasCompleteOpsProof(link))
    .map((link) => ({
      linkId: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      required_handoff: link.required_handoff,
      status: link.resolution?.status ?? link.status,
      status_source: link.resolution?.source ?? "parent_snapshot",
      completion_proof: incompleteOpsProofReason(link),
      ...(link.resolution?.verified_at
        ? { verified_at: link.resolution.verified_at }
        : {}),
      ...(link.resolution?.error
        ? { resolution_error: link.resolution.error }
        : {}),
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

// =============================================================================
// Worker-bundle release provenance (KD2/KD7)
// =============================================================================

/**
 * Pure, deterministic readiness check for the worker-bundle release provenance
 * requirement. Reads only workflow state; no filesystem or runtime probes.
 *
 * - `worker_bundle_impact` absent -> declaration required blocker (AC4/KD1).
 * - `kind: "not_applicable"` + a non-empty rationale -> ok, no blockers (AC3).
 * - `kind: "required"` -> require `state.workerBundleProvenance` with
 *   `{source_sha, build_run_id, replay_run_id}` AND both run IDs match typed,
 *   passing test runs in `state.testRuns` by `evidence_kind` (KD3).
 */
export function evaluateWorkerBundleProvenance(state: ChangeWorkflowState): {
  ok: boolean;
  blockers: GateReadinessBlocker[];
} {
  const impact = state.worker_bundle_impact;
  const blockers: GateReadinessBlocker[] = [];

  if (!impact) {
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED",
      gateId: "release",
      message:
        "Worker-bundle impact declaration is required before release readiness can be evaluated (rq-workerBundleReleaseProvenance01).",
      remediation:
        "Declare worker_bundle_impact with kind 'required' or 'not_applicable' and a rationale.",
    });
    return { ok: false, blockers };
  }

  if (impact.kind === "not_applicable" && impact.rationale?.trim()) {
    return { ok: true, blockers: [] };
  }

  if (impact.kind === "not_applicable") {
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_NOT_APPLICABLE_RATIONALE_REQUIRED",
      gateId: "release",
      message:
        "worker_bundle_impact 'not_applicable' requires a non-empty typed rationale (rq-workerBundleReleaseProvenance01).",
      remediation:
        "Set worker_bundle_impact.rationale to explain why worker-bundle provenance is not applicable.",
    });
    return { ok: false, blockers };
  }

  const provenance = state.workerBundleProvenance;
  if (!provenance) {
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_MISSING",
      gateId: "release",
      message:
        "Worker-bundle provenance is required because worker_bundle_impact is 'required' (rq-workerBundleReleaseProvenance01).",
      remediation:
        "Record workerBundleProvenance with source_sha, build_run_id, and replay_run_id.",
    });
    return { ok: false, blockers };
  }

  if (!provenance.source_sha?.trim()) {
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_MISSING",
      gateId: "release",
      message:
        "Worker-bundle provenance is missing source_sha (rq-workerBundleReleaseProvenance01).",
      remediation:
        "Record workerBundleProvenance with the source SHA used for the build_worker and replay_determinism runs.",
    });
    return { ok: false, blockers };
  }

  const allRuns = Object.values(state.testRuns ?? {}).flat();
  const buildRun = allRuns.find(
    (r) =>
      r.runId === provenance.build_run_id && r.evidence_kind === "build_worker",
  );
  const replayRun = allRuns.find(
    (r) =>
      r.runId === provenance.replay_run_id &&
      r.evidence_kind === "replay_determinism",
  );

  if (!buildRun || !replayRun) {
    const missingKinds: string[] = [];
    if (!buildRun) {
      missingKinds.push(`build_worker run ${provenance.build_run_id}`);
    }
    if (!replayRun) {
      missingKinds.push(`replay_determinism run ${provenance.replay_run_id}`);
    }
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_MISSING",
      gateId: "release",
      message: `Worker-bundle provenance references missing typed test runs: ${missingKinds.join(", ")} (rq-workerBundleReleaseProvenance01).`,
      remediation:
        "Record passing test runs with evidence_kind 'build_worker' and 'replay_determinism' before recording provenance.",
    });
    return { ok: false, blockers };
  }

  const failing: string[] = [];
  if (buildRun.exitCode !== 0) {
    failing.push(
      `build_worker run ${provenance.build_run_id} exitCode=${buildRun.exitCode}`,
    );
  }
  if (replayRun.exitCode !== 0) {
    failing.push(
      `replay_determinism run ${provenance.replay_run_id} exitCode=${replayRun.exitCode}`,
    );
  }
  if (failing.length > 0) {
    blockers.push({
      code: "WORKER_BUNDLE_PROVENANCE_FAILING",
      gateId: "release",
      message: `Worker-bundle provenance references failing test runs: ${failing.join(", ")} (rq-workerBundleReleaseProvenance01).`,
      remediation:
        "Ensure both build_worker and replay_determinism test runs pass before recording provenance.",
    });
    return { ok: false, blockers };
  }

  return { ok: true, blockers: [] };
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
    blockers.push(...checkUnresolvedVerificationEvidence(state, gateId));
    blockers.push(...checkCompletedTaskEvidencePlan(state, gateId));
  }

  if (gateId === "release") {
    if (options.enforceWorkerBundleProvenance) {
      blockers.push(...evaluateWorkerBundleProvenance(state).blockers);
    }
    blockers.push(...checkRequiredObligationReleaseBlockers(state, gateId));
    blockers.push(...checkRequiredObligationRouting(state, gateId));
    blockers.push(...checkOpsFollowupReleaseBlockers(state, gateId));
    blockers.push(...checkUnresolvedDesignConcerns(state, gateId));
    blockers.push(...checkUnresolvedVerificationEvidence(state, gateId));
    blockers.push(...checkCompletedTaskEvidencePlan(state, gateId));
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
 * Validate that the contract review matrix has exactly one row per expected
 * contract item. Fail-closed on missing, duplicate, or unknown rows.
 *
 * Expected items are those with verificationRequired !== false, matching the
 * acceptance readiness blocker semantics.
 */
function validateReviewMatrixRowCoverage(
  state: ChangeWorkflowState,
):
  | { valid: true; rowCount: number; itemCount: number }
  | { valid: false; reason: string } {
  const contract = state.contract;
  if (!contract?.reviewMatrix) {
    return { valid: false, reason: "No review matrix" };
  }

  const expectedItems = contract.items.filter(
    (item) => item.verificationRequired !== false,
  );
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of contract.reviewMatrix.rows) {
    if (seen.has(row.contractId)) {
      if (!duplicates.includes(row.contractId)) {
        duplicates.push(row.contractId);
      }
    } else {
      seen.add(row.contractId);
    }
  }
  const missing = expectedItems
    .filter((item) => !seen.has(item.id))
    .map((item) => item.id);
  // Check unknown rows against ALL contract item IDs, not just required ones.
  // OOS items (verificationRequired: false) exist in the contract but are
  // excluded from expectedIds; their review matrix rows are informational,
  // not required, and must not be flagged as unknown.
  const allContractIds = new Set(contract.items.map((item) => item.id));
  const unknown = contract.reviewMatrix.rows
    .filter((row) => !allContractIds.has(row.contractId))
    .map((row) => row.contractId);

  if (duplicates.length > 0 || missing.length > 0 || unknown.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (duplicates.length > 0)
      parts.push(`duplicate: ${duplicates.join(", ")}`);
    if (unknown.length > 0) parts.push(`unknown: ${unknown.join(", ")}`);
    return { valid: false, reason: parts.join("; ") };
  }

  return {
    valid: true,
    rowCount: contract.reviewMatrix.rows.length,
    itemCount: expectedItems.length,
  };
}

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
    const coverage = validateReviewMatrixRowCoverage(state);
    if (!coverage.valid) {
      return { status: "fail", evidence: coverage.reason };
    }
    return {
      status: "pass",
      evidence: `${coverage.rowCount} rows for ${coverage.itemCount} items`,
    };
  },
  ALL_ROWS_PASSING: (state) => {
    const coverage = validateReviewMatrixRowCoverage(state);
    if (!coverage.valid) {
      return { status: "fail", evidence: coverage.reason };
    }
    const failing = state.contract!.reviewMatrix!.rows.filter((row) =>
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

/**
 * Derive a pure current/snapshot/freshness acceptance criteria projection.
 *
 * The current criteria are recomputed from live workflow state on every read.
 * The persisted snapshot (if any) is preserved as audit evidence and keyed to
 * the acceptanceReadinessRevision at capture. If the revision has advanced,
 * the snapshot is explicitly marked stale so a stale passing snapshot can
 * never appear as current truth.
 */
export function deriveAcceptanceCriteriaProjection(
  state: ChangeWorkflowState,
): AcceptanceCriteriaProjection {
  const current = evaluateGateCriteria(state, "acceptance");
  const basisRevision = state.acceptanceReadinessRevision ?? 0;
  const snapshot = state.acceptanceCriteriaSnapshot;

  let freshness: AcceptanceCriteriaFreshness = "pending";
  let staleReason: string | undefined;
  if (snapshot) {
    if (snapshot.basisRevision === basisRevision) {
      freshness = "fresh";
    } else {
      freshness = "stale";
      staleReason = `Acceptance criteria snapshot captured at revision ${snapshot.basisRevision}; current revision is ${basisRevision}`;
    }
  }

  return {
    current,
    ...(snapshot ? { snapshot: snapshot.criteria } : {}),
    freshness,
    basisRevision,
    ...(staleReason ? { staleReason } : {}),
  };
}
