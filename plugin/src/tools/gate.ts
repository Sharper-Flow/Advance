/**
 * Gate Tools
 *
 * Tools for 7-gate quality checklist management.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import {
  type GateId,
  type GateCompletion,
  type GateArtifactEvidence,
  type Gates,
  type FeatureFlags,
  type Change,
  GATE_ORDER,
  canCompleteGate,
  getIncompleteGates,
  createDefaultGates,
  isMetadataOnlyGate,
  isWorktreeMutationGate,
  allGatesSatisfied,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { runPrepReadinessChecks } from "../validator/prep-readiness";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { loadChange, loadProjectConfig } from "../storage/json";
import {
  normalizeGateArtifactEvidenceForReadback,
  readArtifact,
} from "./change/artifacts";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import { COMMAND_MANIFEST } from "../manifest";
import {
  formatTargetProjectContext,
  resolveTargetAwareMutationCwd,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "./target-project";
import { includeSnapshotSchema } from "./shared-args";
import { reconcileRecoveredAcceptanceRemediation } from "./acceptance-reconciliation";
import {
  type WorktreeIsolationDeps,
  type WorktreeIsolationResult,
} from "./worktree-isolation-guard";
import {
  ensureWorktreeForMutation,
  buildWorktreeAutoManageDeps,
  type EnsureWorktreeForMutationDeps,
} from "./worktree-auto-manage";
import {
  detectArchiveMode,
  detectDefaultBranch,
  resolveRepoRoot,
  classifyFinalizationRoute,
  coercePrWorkflowRoute,
  resolveReleaseReachability,
  verifyChangeBranchPushed,
  type ReleaseReachabilityProof,
} from "./archive-helpers/git-finalize";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import { renderAcceptanceProjection } from "../gates/gate-readiness";
import {
  isRequiredOpsFollowupLink,
  reconcileOpsFollowupLinks,
} from "./ops-followup-reconciliation";
import { changeToDirectiveState } from "../types/change-state-helpers";
import { deriveDirectiveSafe } from "../utils/workflow-directive";
import {
  degradedPhasePlan,
  derivePhasePlanSafe,
  type DegradedPhasePlan,
} from "../utils/phase-plan";
import { checkPlanRoutingGuard } from "../migration/routing-guard";
import { createLogger } from "../utils/debug-log";
import type { ChangeState } from "../types/change-state";
import { hasGateRecoveryAudit } from "./recovery-audit";
import { evaluateLightweightProfileAndSignal } from "./lightweight-profile";
import type { LightweightProfilePhase } from "../types";
import {
  PublicRootPolicy,
  PublicRootPolicySchema,
} from "../utils/lightweight-change-profile-evidence";
import {
  CRITERION_ORDER,
  type LightweightProfileCriterionRecord,
  type LightweightProfileEvaluation,
  type LightweightProfileResult,
} from "../types/lightweight-change-profile";
import { inspectArtifactContent } from "./change/artifacts";

const logger = createLogger("gate");

interface LightweightProfileBoundaryResult {
  phase: LightweightProfilePhase;
  result: string;
  evaluationKey?: string;
  downgradeReason?: string;
}

// rq-smallChangeProfile01: re-evaluate lightweight profile at gate boundaries.
// Errors are best-effort logged; gate completion must not fail because the
// optional profile evaluation encountered a transient host-side issue.
//
// When a boundary evaluation cannot be completed (collector/service/signal
// failure), we durably record a non-qualifying result so a previously qualified
// profile cannot remain directive state while the host is unable to revalidate
// it. A prior qualified result is downgraded (no-reset semantics); otherwise it
// is recorded as ineligible.
async function evaluateLightweightProfileAtPhases(
  store: Store,
  change: Change,
  changeId: string,
  phases: LightweightProfilePhase[],
  apiCompatibilityPolicy?: PublicRootPolicy,
): Promise<LightweightProfileBoundaryResult[]> {
  if (!change.lightweight_profile) return [];
  const results: LightweightProfileBoundaryResult[] = [];
  for (const phase of phases) {
    try {
      const evalResult = await evaluateLightweightProfileAndSignal({
        store,
        changeId,
        phase,
        apiCompatibilityPolicy,
      });
      if (evalResult.success && evalResult.evaluation) {
        results.push({
          phase,
          result: evalResult.evaluation.result,
          evaluationKey: evalResult.evaluation.evaluationKey,
          downgradeReason: evalResult.evaluation.downgradeReason,
        });
      } else if (!evalResult.success) {
        logger.warn(
          `Lightweight profile evaluation skipped at ${phase} for ${changeId}: ${evalResult.error}`,
        );
        results.push(
          await recordLightweightProfileBoundaryFailure(
            store,
            change,
            changeId,
            phase,
            evalResult.error ?? "evaluation failed",
          ),
        );
      }
    } catch (error) {
      logger.warn(
        `Lightweight profile evaluation failed at ${phase} for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      results.push(
        await recordLightweightProfileBoundaryFailure(
          store,
          change,
          changeId,
          phase,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  return results;
}

/**
 * Resolve a validated public-root API compatibility policy from project
 * configuration. The policy is read from project.json (passthrough field) and
 * validated centrally so it can be passed to every boundary evaluation.
 */
async function resolveApiCompatibilityPolicy(
  store: Store,
): Promise<PublicRootPolicy | undefined> {
  try {
    const config = store.config ?? (await loadProjectConfig(store.paths.root));
    const raw = (config as Record<string, unknown> | null)?.public_root_policy;
    if (!raw) return undefined;

    const validated = PublicRootPolicySchema.safeParse(raw);
    if (!validated.success) {
      logger.warn(
        `project.json public_root_policy failed validation: ${validated.error.message}`,
      );
      return undefined;
    }
    return validated.data;
  } catch (error) {
    logger.warn(
      `Failed to resolve public-root API compatibility policy: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Durably record a non-qualifying boundary evaluation result. Keeps the profile
 * from retaining a directive qualified state while the current boundary
 * evaluation cannot be confirmed. Honors no-reset downgrade semantics: a prior
 * qualified result becomes downgraded, not reset to ineligible.
 */
async function recordLightweightProfileBoundaryFailure(
  store: Store,
  change: Change,
  changeId: string,
  phase: LightweightProfilePhase,
  error: string,
): Promise<LightweightProfileBoundaryResult> {
  const profile = change.lightweight_profile;
  if (!profile) {
    return { phase, result: "ineligible", downgradeReason: error };
  }

  const priorQualified = profile.evaluations.some(
    (entry) => entry.result === "qualified",
  );
  const result: LightweightProfileResult = priorQualified
    ? "downgraded"
    : "ineligible";

  const evaluationKey = `${profile.request.requestId}:${phase}:boundary_failure:${Date.now()}`;
  const evaluatedAt = new Date().toISOString();
  const criteria: LightweightProfileCriterionRecord[] = CRITERION_ORDER.map(
    (criterion) => ({
      criterion,
      status: "unknown",
      reason: `Boundary evaluation failed: ${error}`,
    }),
  );

  const evaluation: LightweightProfileEvaluation = {
    evaluationKey,
    phase,
    result,
    criteria,
    evidenceFingerprint: "boundary_failure",
    observedRevision: "unknown",
    evaluatedAt,
    downgradeReason: priorQualified
      ? `Boundary evaluation failed after prior qualification: ${error}`
      : undefined,
  };

  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      reason: "record lightweight profile boundary failure",
      evidence: evaluationKey,
    },
    changesDir: store.paths.changes,
    intent: {
      changeId,
      mutationKind: "lightweight_profile_boundary_failure",
      mutateLatestProjection: (latest) => ({
        ...latest,
        lightweight_profile: latest.lightweight_profile
          ? {
              ...latest.lightweight_profile,
              evaluations: [
                ...latest.lightweight_profile.evaluations,
                evaluation,
              ],
            }
          : undefined,
      }),
      verifyProjection: (readback) =>
        readback.lightweight_profile?.evaluations.some(
          (entry) => entry.evaluationKey === evaluationKey,
        ) ?? false,
    },
  });
  if (outcome.kind !== "verified") {
    logger.warn(
      `Failed to record lightweight profile boundary failure for ${changeId}`,
    );
  }

  return {
    phase,
    result,
    evaluationKey,
    downgradeReason: evaluation.downgradeReason,
  };
}

// rq-releaseFinalization01: gate completion confirmation must be durable.
const MIN_RECOVERY_ARTIFACT_NON_WHITESPACE_CHARS = 20;

function gateDoneCount(gates: Gates): number {
  return GATE_ORDER.filter((gateId) => gates[gateId]?.status === "done").length;
}

function hasCompatibilityRecoveryEvidence(gates: Gates): boolean {
  return GATE_ORDER.some((gateId) => hasGateRecoveryAudit(gates[gateId]));
}

function releaseGateHasPhase9Evidence(
  gate: GateCompletion | undefined,
): boolean {
  const evidence = gate?.approval_evidence ?? gate?.recovery_audit?.evidence;
  if (typeof evidence !== "string") return false;
  // Canonical Phase 9 evidence is built by `buildReleaseCompletionEvidence`
  // and includes the finalization phrase plus at least one durable detail
  // (defaultBranch, pushStatus, mergeCommitSha). Avoid matching prose that
  // merely mentions "Phase 9" without carrying the structured proof.
  return (
    evidence.includes("Phase 9 finalization shipped;") &&
    (evidence.includes("defaultBranch=") ||
      evidence.includes("pushStatus=") ||
      evidence.includes("mergeCommitSha="))
  );
}

export async function reconcileRecoveredGates(input: {
  store: Store;
  changeId: string;
  current: Gates;
}): Promise<{ gates: Gates; recovered: boolean }> {
  const disk = await loadChange(input.store.paths.changes, input.changeId);
  if (!disk.success || !disk.data?.gates) {
    return { gates: input.current, recovered: false };
  }
  const diskGates = disk.data.gates;
  if (!hasCompatibilityRecoveryEvidence(diskGates)) {
    return { gates: input.current, recovered: false };
  }

  const currentDone = gateDoneCount(input.current);
  const diskDone = gateDoneCount(diskGates);
  if (diskDone > currentDone) {
    return { gates: diskGates, recovered: true };
  }
  if (diskDone < currentDone) {
    return { gates: input.current, recovered: false };
  }

  // Equal done-count: evidence-aware release tiebreak. Prefer audited disk
  // release when the current projection is not done, or when it is done but
  // lacks recovery/Phase 9 evidence while disk carries audited recovery.
  const diskRelease = diskGates.release;
  if (diskRelease?.status === "done" && hasGateRecoveryAudit(diskRelease)) {
    const currentRelease = input.current.release;
    if (currentRelease?.status !== "done") {
      return { gates: diskGates, recovered: true };
    }
    if (!releaseGateHasPhase9Evidence(currentRelease)) {
      return { gates: diskGates, recovered: true };
    }
  }

  return { gates: input.current, recovered: false };
}

async function commitGateCompletion(
  store: Store,
  changeId: string,
  gateId: GateId,
  completion: GateCompletion,
  evidence: string,
): Promise<GateCompletion> {
  const outcome = await coordinateChangeMutation<Change>({
    authority: { reason: "complete gate", evidence },
    changesDir: store.paths.changes,
    intent: {
      changeId,
      mutationKind: "gate_completion",
      mutateLatestProjection: (latest) => ({
        ...latest,
        gates: {
          ...(latest.gates ?? createDefaultGates()),
          [gateId]: completion,
        },
      }),
      verifyProjection: (readback) => {
        const gate = readback.gates?.[gateId];
        return (
          gate?.status === "done" &&
          gate.completed_at === completion.completed_at
        );
      },
    },
  });
  if (outcome.kind !== "verified") {
    throw new Error(
      outcome.kind === "unverified" || outcome.kind === "operator_required"
        ? outcome.reason
        : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
    );
  }
  return outcome.value.gates?.[gateId] ?? completion;
}

function workflowReadinessBlockedResponse(input: {
  changeId: string;
  gateId: GateId;
  gate: GateCompletion;
}): string {
  return formatToolOutput({
    error: `Cannot complete ${input.gateId}: workflow readiness blocked gate completion`,
    changeId: input.changeId,
    gateId: input.gateId,
    workflowGateStatus: input.gate.status,
    stuckReason: input.gate.stuck_reason,
    readinessBlockers: input.gate.readiness_blockers ?? [],
    hint: "Fix the workflow readiness blockers listed above, then retry adv_gate_complete.",
  });
}

function releaseRequiresTrunkMergeResponse(input: {
  changeId: string;
  defaultBranch: string;
  unmergedCommits: string[];
}): string {
  return formatToolOutput({
    error: `RELEASE_REQUIRES_TRUNK_MERGE: change/${input.changeId} is not reachable from ${input.defaultBranch}`,
    code: "RELEASE_REQUIRES_TRUNK_MERGE",
    requirement: "rq-releaseFinalization01",
    changeId: input.changeId,
    defaultBranch: input.defaultBranch,
    unmergedCommits: input.unmergedCommits,
    remediation: `Run /adv-archive ${input.changeId} to complete Phase 9 (merge + push + verify), then retry release gate completion.`,
  });
}

function releaseRequiresPrHandoffResponse(input: {
  changeId: string;
  reason: string;
}): string {
  return formatToolOutput({
    error: `RELEASE_REQUIRES_PR_HANDOFF: ${input.reason}`,
    code: "RELEASE_REQUIRES_PR_HANDOFF",
    requirement: "rq-releaseFinalization01",
    changeId: input.changeId,
    remediation: `Run /adv-archive ${input.changeId} to complete Phase 9 (push change branch + PR workflow handoff), then retry release gate completion.`,
  });
}

function releaseRequiresDefaultBranchPushResponse(input: {
  changeId: string;
  defaultBranch: string;
  reason: string;
}): string {
  return formatToolOutput({
    error: `RELEASE_REQUIRES_DEFAULT_BRANCH_PUSH: ${input.reason}`,
    code: "RELEASE_REQUIRES_DEFAULT_BRANCH_PUSH",
    requirement: "rq-releaseFinalization01",
    changeId: input.changeId,
    remediation: `Run /adv-archive ${input.changeId} to complete Phase 9 (merge + push ${input.defaultBranch} + verify), then retry release gate completion.`,
  });
}

function releaseRequiresDurableProofResponse(input: {
  changeId: string;
  reason: string;
}): string {
  return formatToolOutput({
    error: `RELEASE_REQUIRES_DURABLE_PROOF: ${input.reason}`,
    code: "RELEASE_REQUIRES_DURABLE_PROOF",
    requirement: "rq-releaseFinalization01",
    changeId: input.changeId,
    remediation: `Run /adv-archive ${input.changeId} to record durable Phase 9 reachability evidence, then retry release gate completion.`,
  });
}

interface ReleaseFinalizationCheck {
  blocker?: string;
  evidence?: string;
}

function durableReleaseProofEvidence(input: {
  changeId: string;
  repoRoot: string;
  defaultBranch: string;
  route: { route: string };
  reachability: Extract<ReleaseReachabilityProof, { reachable: true }>;
}): ReleaseFinalizationCheck {
  const releasedCommitSha = input.reachability.releasedCommitSha?.trim();
  if (!releasedCommitSha) {
    return {
      blocker: releaseRequiresDurableProofResponse({
        changeId: input.changeId,
        reason:
          "release reachability was reported without a released commit SHA",
      }),
    };
  }

  return {
    evidence: [
      "Phase 9 finalization shipped",
      `defaultBranch=${input.defaultBranch}`,
      `repoRoot=${input.repoRoot}`,
      "pushStatus=verified",
      `proof=${input.reachability.proof}`,
      `releasedCommitSha=${releasedCommitSha}`,
      `route=${input.route.route}`,
      ...(input.reachability.prNumber
        ? [`prNumber=${input.reachability.prNumber}`]
        : []),
      ...(input.reachability.prHeadSha
        ? [`prHeadSha=${input.reachability.prHeadSha}`]
        : []),
      ...(input.reachability.mergeCommitOid
        ? [`mergeCommitOid=${input.reachability.mergeCommitOid}`]
        : []),
      ...(input.reachability.defaultBranchSha
        ? [
            `defaultBranchReachability=origin/${input.defaultBranch}@${input.reachability.defaultBranchSha}`,
          ]
        : []),
    ].join("; "),
  };
}

function getReleaseFinalizationBlocker(input: {
  store: Store;
  change: Change;
  changeId: string;
}): ReleaseFinalizationCheck {
  const { archiveMode } = detectArchiveMode(input.store.config ?? {});
  const repoRoot = resolveRepoRoot(input.store.paths.root);
  const { branch: defaultBranch } = detectDefaultBranch(repoRoot);

  if (archiveMode === "pr") {
    const classifiedRoute = classifyFinalizationRoute(repoRoot, defaultBranch);
    const route = coercePrWorkflowRoute(classifiedRoute);
    const reachability = resolveReleaseReachability({
      repoRoot,
      defaultBranch,
      changeId: input.changeId,
      route,
      prNumber: input.change.phase9_status?.prNumber,
      prHeadSha: input.change.phase9_status?.prHeadSha,
      repo: input.change.phase9_status?.repo,
      changeTipSha: input.change.phase9_status?.changeTipSha,
      preArchiveTipSha: input.change.phase9_status?.preArchiveTipSha,
    });
    if (reachability.reachable) {
      return durableReleaseProofEvidence({
        changeId: input.changeId,
        repoRoot,
        defaultBranch,
        route,
        reachability,
      });
    }

    // No merged PR/default proof; surface branch push failure as actionable
    // detail without making the live branch a hard requirement.
    const pushCheck = verifyChangeBranchPushed(repoRoot, input.changeId);
    const details = reachability.details ?? [];
    if (!pushCheck.pushed && pushCheck.reason) {
      details.unshift(`change branch not pushed: ${pushCheck.reason}`);
    }

    return {
      blocker: releaseRequiresPrHandoffResponse({
        changeId: input.changeId,
        reason:
          details.length > 0
            ? details.join("; ")
            : "merged PR proof not found and change branch not pushed to origin",
      }),
    };
  }

  const route = classifyFinalizationRoute(repoRoot, defaultBranch);
  const reachability = resolveReleaseReachability({
    repoRoot,
    defaultBranch,
    changeId: input.changeId,
    route,
    prNumber: input.change.phase9_status?.prNumber,
    prHeadSha: input.change.phase9_status?.prHeadSha,
    repo: input.change.phase9_status?.repo,
    changeTipSha: input.change.phase9_status?.changeTipSha,
    preArchiveTipSha: input.change.phase9_status?.preArchiveTipSha,
  });
  if (reachability.reachable) {
    return durableReleaseProofEvidence({
      changeId: input.changeId,
      repoRoot,
      defaultBranch,
      route,
      reachability,
    });
  }

  if (reachability.proof === "origin_push_unverified") {
    return {
      blocker: releaseRequiresDefaultBranchPushResponse({
        changeId: input.changeId,
        defaultBranch,
        reason:
          reachability.details?.join("; ") ??
          `${defaultBranch} not pushed to origin`,
      }),
    };
  }

  if (reachability.proof === "pr_unmerged") {
    return {
      blocker: releaseRequiresPrHandoffResponse({
        changeId: input.changeId,
        reason: [
          reachability.autoMergeArmed
            ? "pending auto-merge"
            : "PR is not merged",
          ...(reachability.details ?? []),
        ].join("; "),
      }),
    };
  }

  return {
    blocker: releaseRequiresTrunkMergeResponse({
      changeId: input.changeId,
      defaultBranch:
        route.route === "no_remote" ? defaultBranch : `origin/${defaultBranch}`,
      unmergedCommits: reachability.details ?? [],
    }),
  };
}

/**
 * Acceptance-specific recovery artifact-evidence resolution, extracted from
 * `completeGateViaRecovery` so the acceptance path is independently testable
 * (AC8). When the recovered state carries a contract review matrix, this
 * writes the acceptance projection, verifies the executive-summary proof, and
 * returns acceptance artifact evidence; on any failure it returns a blocked
 * response string. With no review matrix it is a no-op that returns
 * `fallbackEvidence` unchanged — preserving the original
 * `gateId === "acceptance" && recoveryState.contract?.reviewMatrix` guard.
 */
export async function resolveAcceptanceRecoveryArtifactEvidence(input: {
  store: Store;
  changeId: string;
  recoveryState: ChangeState;
  fallbackEvidence: GateArtifactEvidence | undefined;
}): Promise<
  | { ok: true; artifactEvidence: GateArtifactEvidence | undefined }
  | { ok: false; response: string }
> {
  if (!input.recoveryState.contract?.reviewMatrix) {
    return { ok: true, artifactEvidence: input.fallbackEvidence };
  }
  // KD6: the acceptance projection is persisted into change.documents — the
  // live artifact authority — not materialized as active-dir acceptance.md.
  const acceptanceContent = renderAcceptanceProjection(input.recoveryState);
  const acceptanceWrite = await persistAcceptanceProjection(
    input.store,
    input.changeId,
    acceptanceContent,
  );
  if (!acceptanceWrite.ok) {
    return {
      ok: false,
      response: workflowReadinessBlockedResponse({
        changeId: input.changeId,
        gateId: "acceptance",
        gate: {
          status: "stuck",
          stuck_reason: "ACCEPTANCE_PROJECTION_WRITE_FAILED",
          readiness_blockers: [
            {
              code: "ACCEPTANCE_PROJECTION_WRITE_FAILED",
              gateId: "acceptance",
              artifactKind: "acceptance",
              message: acceptanceWrite.error,
              remediation:
                "Fix acceptance projection generation before retrying recovery.",
            },
          ],
        },
      }),
    };
  }
  const executiveSummary = await inspectArtifactContent(
    input.store,
    input.changeId,
    "executiveSummary",
  );
  if (
    executiveSummary === null ||
    executiveSummary.nonWhitespaceChars <
      MIN_RECOVERY_ARTIFACT_NON_WHITESPACE_CHARS ||
    executiveSummary.contentHash !==
      input.recoveryState.artifacts.executiveSummary?.contentHash
  ) {
    const code =
      executiveSummary === null
        ? "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING"
        : executiveSummary.nonWhitespaceChars <
            MIN_RECOVERY_ARTIFACT_NON_WHITESPACE_CHARS
          ? "ACCEPTANCE_EXECUTIVE_SUMMARY_UNDERSIZED"
          : "ACCEPTANCE_EXECUTIVE_SUMMARY_HASH_STALE";
    return {
      ok: false,
      response: workflowReadinessBlockedResponse({
        changeId: input.changeId,
        gateId: "acceptance",
        gate: {
          status: "stuck",
          stuck_reason: code,
          readiness_blockers: [
            {
              code,
              gateId: "acceptance",
              artifactKind: "acceptance",
              message:
                executiveSummary === null
                  ? `No executive-summary content available for change ${input.changeId}`
                  : "executive-summary proof failed recovery validation",
              remediation:
                "Repair the executive-summary artifact and workflow metadata before retrying recovery.",
            },
          ],
        },
      }),
    };
  }
  const acceptanceArtifact = await inspectArtifactContent(
    input.store,
    input.changeId,
    "acceptance",
  );
  if (acceptanceArtifact !== null) {
    return {
      ok: true,
      artifactEvidence: {
        kind: "acceptance",
        content_hash: acceptanceArtifact.contentHash,
        non_whitespace_chars: acceptanceArtifact.nonWhitespaceChars,
        checked_at: acceptanceArtifact.checkedAt,
      },
    };
  }
  return {
    ok: false,
    response: workflowReadinessBlockedResponse({
      changeId: input.changeId,
      gateId: "acceptance",
      gate: {
        status: "stuck",
        stuck_reason: "ACCEPTANCE_PROJECTION_READBACK_FAILED",
        readiness_blockers: [
          {
            code: "ACCEPTANCE_PROJECTION_READBACK_FAILED",
            gateId: "acceptance",
            artifactKind: "acceptance",
            message: `Acceptance projection unreadable after persistence for change ${input.changeId}`,
            remediation:
              "Repair acceptance projection persistence before retrying recovery.",
          },
        ],
      },
    }),
  };
}

/**
 * Persist the acceptance projection into the change's durable documents.
 * KD6: replaces the legacy `writeArtifact` active-directory materialization —
 * `change.documents` is the sole live artifact authority, and the archive
 * boundary is the only place narrative `.md` is produced.
 */
async function persistAcceptanceProjection(
  store: Store,
  changeId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const outcome = await coordinateChangeMutation<Change>({
      authority: {
        kind: "recovery",
        reason:
          "persist acceptance recovery artifact in the durable projection",
        evidence: `acceptance-recovery:${changeId}`,
      },
      changesDir: store.paths.changes,
      intent: {
        changeId,
        mutationKind: "acceptance_projection_persist",
        mutateLatestProjection: (latest) => ({
          ...latest,
          documents: { ...latest.documents, acceptance: content },
        }),
        verifyProjection: (readback) =>
          readback.documents?.acceptance === content,
      },
    });
    if (outcome.kind === "verified") return { ok: true };
    const error =
      outcome.kind === "stale_revision"
        ? `Acceptance projection revision was stale: expected ${outcome.expected}, actual ${outcome.actual}`
        : outcome.kind === "unverified"
          ? `Acceptance projection persistence could not be verified: ${outcome.reason}`
          : outcome.reason;
    return { ok: false, error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Acceptance projection write failed: ${message}`,
    };
  }
}

/**
 * Gate-completion worktree-isolation guard (rq-autoManageAdvWorktrees AC5).
 *
 * Per-change marker + global flag activation matrix lives in
 * `evaluateWorktreeGuardActivation`. The proposal gate is exempt regardless
 * of activation (C5 + DONT2): a change must be creatable from main before
 * any worktree can exist for it.
 *
 * When `change` is provided AND `change.worktree_auto_managed === true`,
 * this delegates to `ensureWorktreeForMutation` which attempts to
 * auto-create the worktree before BLOCKing. When `change` is omitted (e.g.,
 * in legacy crosscut tests), the function preserves the pre-Block-B
 * behavior: block_only when the global flag is true, ALLOW when off.
 *
 * The function is async because the auto-manage path awaits
 * `advWorktreeResume`. Block-only and off paths remain effectively sync
 * (no I/O); the caller just awaits for uniformity.
 */
export async function evaluateGateWorktreeIsolation(input: {
  gateId: GateId;
  features: unknown;
  cwd: string;
  /** Optional Change for per-change-marker conditioning (AC5). */
  change?: Change;
  /** Optional auto-create runtime deps; required for the auto_manage path. */
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): Promise<WorktreeIsolationResult> {
  if (isMetadataOnlyGate(input.gateId)) return { decision: "ALLOW" };

  // Delegate to the unified helper. It handles the activation matrix,
  // session-context detection, existing-worktree lookup, auto-create,
  // and AC6 structured failures. When `change` is undefined, the helper
  // routes through block_only / off based on the global flag.
  return ensureWorktreeForMutation({
    change: input.change,
    cwd: input.cwd,
    features: input.features,
    deps: {
      ...input.autoManageDeps,
      getSessionContext:
        input.autoManageDeps?.getSessionContext ?? input.getSessionContext,
    },
  });
}

function getContextMismatchFields(error: Error): {
  owningProjectId?: unknown;
  currentProjectId?: unknown;
} {
  return {
    owningProjectId:
      "owningProjectId" in error ? error.owningProjectId : undefined,
    currentProjectId:
      "currentProjectId" in error ? error.currentProjectId : undefined,
  };
}

async function completeGateAndBuildResponse({
  store,
  change,
  changeId,
  gateId,
  gates,
  notes,
  completedBy,
  boundaryWarning,
  extraPayload = {},
  includeSnapshot = false,
}: {
  store: Store;
  change: Change;
  changeId: string;
  gateId: GateId;
  gates: Gates;
  notes?: string;
  completedBy: string;
  boundaryWarning?: string;
  extraPayload?: Record<string, unknown>;
  includeSnapshot?: boolean;
}): Promise<string> {
  // rq-cacheRefresh01: cache invalidation now happens at the call sites
  // via fireSignalAndRefresh (which fires the signal AND refreshes the
  // cache atomically). The previous inline `await store.changes.refresh(changeId)`
  // here was a parallel implementation of the rule — removed in T10 of
  // change centralizemutationcacherefresh to keep a single helper-based
  // path. Both gate.ts call sites (planning gate path and generic gate
  // path) now use fireSignalAndRefresh before invoking this helper.

  const completedAt = new Date().toISOString();
  const completedGates: Gates = {
    ...gates,
    [gateId]: {
      ...gates[gateId],
      status: "done",
      completed_at: completedAt,
      completed_by: completedBy,
      ...(notes ? { notes } : {}),
    },
  };

  // Persisted proposal read per KD-6. Falls back to disk/archive via
  // readArtifact; null result means no proposal content yet — pass empty
  // string downstream (gate-completion success output, not validation).
  const proposalText =
    (await readArtifact(store, changeId, "proposal"))?.content ?? "";

  // AC5: gate-completion snapshot carries the `Next:` orientation line so the
  // agent knows which gate/command follows the just-completed gate. Best
  // effort: a derivation failure must not break gate completion; the snapshot
  // simply omits the `Next:` line.
  const directive = deriveDirectiveSafe(
    changeToDirectiveState({
      projectId: change.adv_project_id ?? "unknown",
      change,
      gates: completedGates,
    }),
    Date.now(),
  );
  if (!directive) {
    logger.warn(
      `deriveWorkflowDirective failed in gate-completion for ${changeId}; snapshot omits Next line`,
    );
  }

  return formatToolOutput({
    success: true,
    changeId,
    gateId,
    status: "done",
    completed_at: completedAt,
    completed_by: completedBy,
    ...(includeSnapshot
      ? {
          _contextSnapshot: buildChangeContextSnapshot({
            change,
            proposalText,
            gates: completedGates,
            workdir: store.paths.root,
            directive,
          }),
        }
      : {}),
    ...(boundaryWarning ? { boundaryWarning } : {}),
    ...extraPayload,
  });
}

async function handlePlanningGateCompletion({
  store,
  change,
  changeId,
  gateId,
  gates,
  userApproved,
  notes,
  completedBy,
  boundaryWarning,
  includeSnapshot = false,
}: {
  store: Store;
  change: Change;
  changeId: string;
  gateId: GateId;
  gates: Gates;
  userApproved?: boolean;
  notes?: string;
  completedBy: string;
  boundaryWarning?: string;
  includeSnapshot?: boolean;
}): Promise<string> {
  if (!userApproved) {
    return formatToolOutput({
      error:
        "Planning gate requires userApproved: true. The user must explicitly approve the prep contract (via question tool) before this gate can be completed.",
      changeId,
      gateId,
      userApproved: false,
      requiredUserApproval: true,
      hint: "Present the vision document to the user, obtain approval via question tool, then call adv_gate_complete with userApproved: true.",
    });
  }

  const readiness = runPrepReadinessChecks(change);
  if (!readiness.passed) {
    return formatToolOutput({
      error: `Prep gate blocked: ${readiness.mustFailures.length} readiness failure(s) must be resolved`,
      changeId,
      gateId,
      readinessFailures: readiness.mustFailures.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
        path: f.path,
        remediation: (f.details as Record<string, unknown> | undefined)
          ?.remediation,
      })),
      hint: "Fix all readiness failures listed above, then retry adv_gate_complete.",
    });
  }

  const warningsPayload =
    readiness.warnings.length > 0
      ? {
          readinessWarnings: readiness.warnings.map((w) => ({
            code: w.code,
            message: w.message,
            path: w.path,
          })),
        }
      : {};

  const features = store.config?.features as FeatureFlags | undefined;
  const clarifyMode = features?.clarify_enforcement ?? "advisory";
  let clarifyPayload: Record<string, unknown> = {};

  if (clarifyMode !== "off") {
    // Persisted proposal read for clarify-readiness validator input.
    const proposalText =
      (await readArtifact(store, changeId, "proposal"))?.content ?? "";
    const clarifyResult = runClarifyReadinessChecks(change, proposalText);

    if (clarifyResult.findings.length > 0) {
      if (clarifyMode === "strict") {
        return formatToolOutput({
          error: `Prep gate blocked: ${clarifyResult.findings.length} ambiguity finding(s) must be resolved via /adv-clarify`,
          changeId,
          gateId,
          clarifyFindings: clarifyResult.findings.map((f) => ({
            code: f.code,
            severity: f.severity,
            message: f.message,
            questionCategory: f.details?.questionCategory,
          })),
          hint: `Run /adv-clarify ${changeId} to resolve ambiguity findings, then retry adv_gate_complete.`,
        });
      }

      clarifyPayload = {
        clarifyWarnings: clarifyResult.findings.map((f) => ({
          code: f.code,
          message: f.message,
          questionCategory: f.details?.questionCategory,
        })),
      };
    }
  }

  const completedAt = new Date().toISOString();
  const completion: GateCompletion = {
    status: "done",
    completed_at: completedAt,
    completed_by: completedBy,
    approval_evidence: notes,
  };
  const postSignalGate = await commitGateCompletion(
    store,
    changeId,
    gateId,
    completion,
    notes ?? `gate ${gateId} completed by ${completedBy}`,
  );

  const apiCompatibilityPolicy = await resolveApiCompatibilityPolicy(store);
  const profileEvaluations = await evaluateLightweightProfileAtPhases(
    store,
    change,
    changeId,
    ["initial", "execution_boundary"],
    apiCompatibilityPolicy,
  );

  const profilePayload =
    profileEvaluations.length > 0
      ? { lightweightProfileEvaluations: profileEvaluations }
      : {};

  return completeGateAndBuildResponse({
    store,
    change,
    changeId,
    gateId,
    gates: { ...gates, [gateId]: postSignalGate },
    notes,
    completedBy,
    boundaryWarning,
    includeSnapshot,
    extraPayload: {
      ...warningsPayload,
      ...clarifyPayload,
      ...profilePayload,
    },
  });
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const gateTools = {
  adv_gate_status: {
    description:
      "Get gate status for a change. Returns all 7 gates with completion status, timestamps, and next gate to complete.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Returns the full gate map (proposal, discovery, design, planning, execution, acceptance, release) plus `nextGate` and `canArchive` flags.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
    },
    execute: async (
      { changeId, target_path }: { changeId: string; target_path?: string },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          try {
            const result = await activeStore.changes.get(changeId);
            if (!result.success) {
              return formatToolOutput({ error: result.error });
            }
            if (!result.data) {
              return formatToolOutput({
                error: `Change not found: ${changeId}`,
              });
            }

            // AC1: gate status is a durable-projection read. Do not construct a
            // workflow handle for routine status.
            const gates = result.data.gates ?? createDefaultGates();
            const normalizedGates =
              (await normalizeGateArtifactEvidenceForReadback(gates)) ?? gates;
            const incomplete = getIncompleteGates(normalizedGates);

            // Single directive projection: next-action (nextGate/canArchive)
            // is derived from the persisted projection, matching the same
            // derivation the workflow's getDirectiveQuery consumes.
            //
            // AC9/DDC7 fail-closed: after an active build-bound cutover
            // receipt, a degraded plan instead stops plan-dependent consumer
            // routing — no gate-derived next action (DONT4), typed degraded
            // diagnostics only, with no mutation or external execution (DONT5).
            const directiveState = changeToDirectiveState({
              projectId: result.data.adv_project_id ?? "unknown",
              change: result.data,
              gates: normalizedGates,
            });
            const directive = deriveDirectiveSafe(directiveState, Date.now());
            let failClosedPlan: DegradedPhasePlan | undefined;
            let failClosedBasis: string | undefined;
            if (!directive) {
              const routingGuard = checkPlanRoutingGuard();
              if (routingGuard.failClosed) {
                const plan = derivePhasePlanSafe(directiveState, Date.now());
                failClosedPlan =
                  plan.kind === "degraded"
                    ? plan
                    : degradedPhasePlan(
                        changeId,
                        "derivation_error",
                        "directive derivation failed while plan derivation succeeded; treating projections as conflicting",
                      );
                failClosedBasis = routingGuard.basis;
                logger.warn(
                  `deriveWorkflowDirective failed in gate-status for ${changeId}; plan routing fail-closed (${routingGuard.basis}) — next-action routing stopped`,
                );
              } else {
                logger.warn(
                  `deriveWorkflowDirective failed in gate-status for ${changeId}; falling back to gate-derived next-action`,
                );
              }
            }
            const fallbackNextGate =
              incomplete.length > 0 ? incomplete[0] : null;
            const canArchive = directive
              ? directive.canArchive
              : failClosedPlan
                ? false
                : allGatesSatisfied(normalizedGates);
            const nextGate = directive
              ? directive.canArchive
                ? null
                : ((directive.action.gateId as GateId | undefined) ??
                  fallbackNextGate)
              : failClosedPlan
                ? null
                : fallbackNextGate;

            // AC2: gateCriteria and acceptanceCriteriaProjection are not
            // durably represented in the per-change projection. Report them as
            // explicitly unavailable rather than deriving a false pass or
            // silently omitting them.
            const unavailable = [
              {
                scope: "gateCriteria",
                status: "unavailable",
                reason:
                  "workflow-only projection; not persisted in durable change snapshot",
              },
              {
                scope: "acceptanceCriteriaProjection",
                status: "unavailable",
                reason:
                  "workflow-only projection; not persisted in durable change snapshot",
              },
            ];

            return formatToolOutput({
              changeId,
              gates: normalizedGates,
              incomplete,
              canArchive,
              nextGate,
              _unavailable: unavailable,
              ...(directive ? { _directive: directive } : {}),
              ...(failClosedPlan
                ? {
                    _phasePlan: failClosedPlan,
                    _routingStopped: {
                      reason: failClosedPlan.reason,
                      basis: failClosedBasis,
                    },
                  }
                : {}),
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          } catch (error) {
            const err = error as Error;
            if (err.name === "AdvProjectContextMismatch") {
              const context = getContextMismatchFields(err);
              return formatToolOutput({
                error: err.message,
                changeId,
                errorClass: "AdvProjectContextMismatch",
                owningProjectId: context.owningProjectId,
                currentProjectId: context.currentProjectId,
                hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
              });
            }
            throw error;
          }
        },
      );
    },
  },

  adv_gate_complete: {
    description:
      "Mark a gate as complete for a change. Enforces sequence - prior gates must be complete first.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Sequence is strict: proposal → discovery → design → planning → execution → acceptance → release. Prior gates must all be `done`.",
        ),
      gateId: z
        .enum([
          "proposal",
          "discovery",
          "design",
          "planning",
          "execution",
          "acceptance",
          "release",
        ])
        .describe(
          "Gate to mark complete. Valid values: proposal, discovery, design, planning, execution, acceptance, release. Each gate is owned by a specific `/adv-*` command — complete it only after the owning workflow has run.",
        ),
      completedBy: z
        .string()
        .optional()
        .describe(
          "Who completed the gate (default: agent). Values matching `user` or starting with `user:` are treated as human actors with explicit authority and bypass the manifest-driven boundary check; agent values are validated against the command manifest's gate ownership.",
        ),
      userApproved: z
        .boolean()
        .optional()
        .describe(
          "Required for planning gate. Must be true — planning is the only machine-enforced HITL gate and the last human checkpoint before autonomous execution. Confirms the user explicitly approved the prep contract. Ignored for other gates.",
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about the gate completion"),
      // rq-internalMonotonicRecovery01 / AC5 / D4: public recoveryMode /
      // recoveryEvidence / recoveryReason removed. Acceptance/release gate
      // recovery is classified internally from machine evidence
      // (classifyMutationRecoveryDecision); routine callers no longer
      // transcribe poisoned-history evidence. compatibilityReason and
      // priorApprovalEvidence remain — they are human-checkpoint / audit
      // fields (AC6), not poisoned-history ceremony.
      compatibilityReason: z
        .string()
        .optional()
        .describe(
          "Optional legacy/replay compatibility rationale recorded on acceptance/release gate recovery. Auto-defaulted when omitted.",
        ),
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Required for acceptance gate recovery only (human checkpoint, AC6). Not required for release gate recovery. Must cite the prior user acceptance approval evidence.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project's disk-backed store.",
        ),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
        userApproved,
        notes,
        compatibilityReason,
        priorApprovalEvidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
        include,
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
        userApproved?: boolean;
        notes?: string;
        compatibilityReason?: string;
        priorApprovalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      const runComplete = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        // Validate gate ID
        if (!GATE_ORDER.includes(gateId)) {
          return formatToolOutput({
            error: `Invalid gate ID: ${gateId}. Valid gates: ${GATE_ORDER.join(", ")}`,
          });
        }

        let change: Change;
        try {
          const result = await activeStore.changes.get(changeId);
          if (!result.success) {
            return formatToolOutput({ error: result.error });
          }
          if (!result.data) {
            return formatToolOutput({ error: `Change not found: ${changeId}` });
          }
          change = result.data;
        } catch (error) {
          const err = error as Error;
          if (err.name === "AdvProjectContextMismatch") {
            const context = getContextMismatchFields(err);
            return formatToolOutput({
              error: err.message,
              changeId,
              errorClass: "AdvProjectContextMismatch",
              owningProjectId: context.owningProjectId,
              currentProjectId: context.currentProjectId,
              hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
            });
          }
          throw error;
        }

        const apiCompatibilityPolicy =
          await resolveApiCompatibilityPolicy(activeStore);

        let gates: Gates = change.gates ?? createDefaultGates();

        if (
          compatibilityReason?.trim() &&
          gateId !== "acceptance" &&
          gateId !== "release"
        ) {
          // rq-extend-poisoned-recovery AC4: release-gate recovery joins
          // acceptance as a supported compatibilityReason target.
          return formatToolOutput({
            error:
              "compatibilityReason is only supported for acceptance and release gate recovery",
            changeId,
            gateId,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }

        const projectedResult = await loadChange(
          activeStore.paths.changes,
          changeId,
        );
        if (!projectedResult.success) {
          return formatToolOutput({
            error: projectedResult.error,
            code: "CHANGE_PROJECTION_LOAD_FAILED",
            projectionFailureType: projectedResult.type,
            changeId,
            gateId,
          });
        }
        const projectedState = projectedResult.data;
        const queriedGates = projectedState?.gates;
        if (queriedGates) {
          gates = queriedGates;
        }

        // Check sequence enforcement
        if (!canCompleteGate(gates, gateId)) {
          const blockedBy = GATE_ORDER.slice(
            0,
            GATE_ORDER.indexOf(gateId),
          ).filter((g) => gates[g].status !== "done");
          return formatToolOutput({
            error: `Cannot complete ${gateId}: prior gate(s) incomplete`,
            blockedBy,
          });
        }

        const isolation = await evaluateGateWorktreeIsolation({
          gateId,
          features: activeStore.config?.features,
          cwd: resolveTargetAwareMutationCwd({
            store: activeStore,
            target_path,
          }),
          change,
          // Build the auto-manage deps bundle whenever this is a worktree-mutation
          // gate with a known change — not only for auto_managed changes — so the
          // existing-worktree ALLOW probe (rq-worktreeMutationGuard01.4) is
          // reachable for non-auto-managed (block_only) changes too. This
          // broadening is low-regression: buildWorktreeAutoManageDeps wires only
          // resumeRuntime (no onAttached/lookupExistingPath), so fireAttachment
          // stays a no-op and no new attachment signals fire. For target_path,
          // deps derive from the target activeStore, so the probe queries the
          // target namespace (GFD-7).
          autoManageDeps: isWorktreeMutationGate(gateId)
            ? await buildWorktreeAutoManageDeps(activeStore)
            : undefined,
        });
        if (isolation.decision === "BLOCK") {
          return formatToolOutput({
            error: isolation.reason,
            errorClass: isolation.errorClass,
            code: isolation.code,
            changeId,
            gateId,
            mainCheckoutPath: isolation.mainCheckoutPath,
            expectedWorktreePath: isolation.expectedWorktreePath,
            underlying_error: isolation.underlying_error,
            remediation: isolation.remediation,
          });
        }

        // Boundary validation: check if the completing command owns this gate
        const boundaryWarning = validateGateBoundary(gateId, completedBy);

        if (gateId === "planning") {
          return handlePlanningGateCompletion({
            store: activeStore,
            change,
            changeId,
            gateId,
            gates,
            userApproved,
            notes,
            completedBy,
            boundaryWarning,
            includeSnapshot: include?.snapshot ?? false,
          });
        }

        if (gateId === "execution") {
          const projectedResult = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          if (!projectedResult.success) {
            return formatToolOutput({
              error: projectedResult.error,
              code: "CHANGE_PROJECTION_LOAD_FAILED",
              projectionFailureType: projectedResult.type,
              changeId,
              gateId,
            });
          }
          const projectedState = projectedResult.data;
          const tasks = projectedState?.tasks ?? change.tasks;
          const incompleteTasks = tasks.filter(
            (t) => t.status !== "done" && t.status !== "cancelled",
          );
          if (incompleteTasks.length > 0) {
            return formatToolOutput({
              error: `Cannot complete execution: ${incompleteTasks.length} task(s) not done or cancelled`,
              incompleteTasks: incompleteTasks.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
              })),
            });
          }
          // All tasks done/cancelled (or empty list) — fall through
        }

        let releaseEvidence: string | undefined;
        if (gateId === "release") {
          try {
            const reconciled = await reconcileOpsFollowupLinks({
              parent: change,
              store: activeStore,
            });
            change = reconciled.parent;
          } catch (error) {
            logger.warn(
              `Release gate ops follow-up reconciliation failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
            );
            if (change.ops_followup_links?.some(isRequiredOpsFollowupLink)) {
              return formatToolOutput({
                error:
                  "Cannot verify required ops follow-up obligations because reconciliation is unavailable",
                code: "OPS_FOLLOWUP_RECONCILIATION_UNAVAILABLE",
                changeId,
                gateId,
              });
            }
          }
          const releaseCheck = getReleaseFinalizationBlocker({
            store: activeStore,
            change,
            changeId,
          });
          if (releaseCheck.blocker) return releaseCheck.blocker;
          releaseEvidence = releaseCheck.evidence;
        }

        // Reconcile any recovered acceptance-affecting dispositions in the
        // durable projection before completing acceptance.
        if (gateId === "acceptance") {
          const reconciliation = await reconcileRecoveredAcceptanceRemediation({
            store: activeStore,
            changeId,
          });
          if (reconciliation.kind === "blocked") {
            return formatToolOutput({
              error: reconciliation.message,
              code: reconciliation.code,
              changeId,
              gateId,
              failedItems: reconciliation.failedItems,
              remediation: reconciliation.remediation,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          change = reconciliation.change;
        }

        const completedAt = new Date().toISOString();
        const completion: GateCompletion = {
          status: "done",
          completed_at: completedAt,
          completed_by: completedBy,
          approval_evidence:
            gateId === "acceptance"
              ? [notes, priorApprovalEvidence].filter(Boolean).join("; ") ||
                undefined
              : gateId === "release"
                ? [notes, releaseEvidence].filter(Boolean).join("; ") ||
                  undefined
                : notes,
        };
        const postSignalGate = await commitGateCompletion(
          activeStore,
          changeId,
          gateId,
          completion,
          priorApprovalEvidence ?? notes ?? `gate ${gateId} completion`,
        );

        const profileEvaluations =
          gateId === "execution"
            ? await evaluateLightweightProfileAtPhases(
                activeStore,
                change,
                changeId,
                ["acceptance_boundary"],
                apiCompatibilityPolicy,
              )
            : [];
        const profilePayload =
          profileEvaluations.length > 0
            ? { lightweightProfileEvaluations: profileEvaluations }
            : {};

        return completeGateAndBuildResponse({
          store: activeStore,
          change,
          changeId,
          gateId,
          gates: { ...gates, [gateId]: postSignalGate },
          notes,
          completedBy,
          boundaryWarning,
          includeSnapshot: include?.snapshot ?? false,
          extraPayload: {
            ...profilePayload,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          },
        });
      };

      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "authoritative",
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runComplete(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runComplete(store);
    },
  },
};

// =============================================================================
// Boundary Validation
// =============================================================================

/**
 * Check if the completing command is authorized to complete this gate.
 * Returns a warning string if boundary violation detected, undefined otherwise.
 *
 * Uses the manifest scope.gates field to determine which commands own which gates.
 * This is advisory (warning) not blocking — the gate still completes.
 */
export function validateGateBoundary(
  gateId: GateId,
  completedBy: string,
): string | undefined {
  if (completedBy === "user" || completedBy.startsWith("user:")) {
    return undefined;
  }

  // Find all commands that claim this gate in their scope
  const authorizedCommands: string[] = [];
  for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
    if (def.scope?.gates.includes(gateId)) {
      authorizedCommands.push(name);
    }
  }

  // If no commands claim this gate, skip validation
  if (authorizedCommands.length === 0) return undefined;

  // Extract command name from completedBy (may contain extra context like "adv-task LBP validation: ...")
  const commandName = completedBy.split(/\s/)[0];

  // "agent" is the default — no boundary check possible.
  // ADV runtime/provider actors are not slash-command IDs. Boundary validation
  // only applies when completedBy explicitly starts with a known command from
  // COMMAND_MANIFEST.
  if (commandName === "agent") return undefined;
  if (!Object.hasOwn(COMMAND_MANIFEST, commandName)) return undefined;

  // Check if the completing command (or its prefix) matches an authorized command
  const isAuthorized = authorizedCommands.some(
    (cmd) => commandName === cmd || commandName.startsWith(`${cmd} `),
  );

  if (!isAuthorized) {
    return `Gate '${gateId}' is owned by [${authorizedCommands.join(", ")}] but was completed by '${completedBy}'. This may indicate a command boundary violation. See specs adv-proposal, adv-discover, adv-prep for gate ownership rules.`;
  }

  return undefined;
}
