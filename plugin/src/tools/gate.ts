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
  type Task,
  type FeatureFlags,
  type Change,
  GATE_ORDER,
  canCompleteGate,
  getIncompleteGates,
  allGatesSatisfied,
  createDefaultGates,
  isMetadataOnlyGate,
  isWorktreeMutationGate,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { runPrepReadinessChecks } from "../validator/prep-readiness";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { loadChange } from "../storage/json";
import { readArtifact } from "./change";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import { COMMAND_MANIFEST } from "../manifest";
import {
  formatTargetProjectContext,
  resolveTargetAwareMutationCwd,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "./target-project";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import {
  fireSignalAndRefresh,
  querySignal,
  getChangeHandle,
} from "./_adapters";
import {
  changeTasksQuery,
  gateCompletedSignal,
  getGateStatusQuery,
} from "../temporal/messages";
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
  resolveMainCheckout,
  classifyFinalizationRoute,
  resolveReleaseReachability,
  verifyChangeBranchPushed,
} from "./archive-helpers/git-finalize";
import type { WorkflowHandleLike } from "../storage/store-temporal/shared";
import {
  evaluateGateReadiness,
  renderAcceptanceProjection,
} from "../temporal/gate-readiness";
import {
  inspectArtifactActivity,
  writeArtifactActivity,
} from "../temporal/activities";
import { changeToWorkflowState } from "../temporal/change-state";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { RECOVERY_RECONCILIATION_WARNING } from "../temporal/recovery-classification";
import {
  classifyCompletedOrPoisonedRecovery,
  workflowHasPoisonedRecoveryEvidence,
} from "./recovery-probe";
import { saveRecoveredGateCompletion } from "./_recovery-writers";

// rq-releaseFinalization01: gate completion confirmation must be durable.
// Temporal signal processing + projection can take several seconds under load.
// 60 attempts × 500ms = 30s total gives adequate headroom for CI and local dev.
const GATE_COMPLETION_POLL_ATTEMPTS = 60;
const GATE_COMPLETION_POLL_DELAY_MS = 500;
const MIN_RECOVERY_ARTIFACT_NON_WHITESPACE_CHARS = 20;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function gateDoneCount(gates: Gates): number {
  return GATE_ORDER.filter((gateId) => gates[gateId]?.status === "done").length;
}

function hasCompatibilityRecoveryEvidence(gates: Gates): boolean {
  return GATE_ORDER.some((gateId) => {
    const evidence = gates[gateId]?.artifact_evidence as
      | { compatibility_reason?: unknown }
      | undefined;
    return typeof evidence?.compatibility_reason === "string";
  });
}

async function preferRecoveredDiskGates(input: {
  store: Store;
  changeId: string;
  current: Gates;
}): Promise<Gates | null> {
  const disk = await loadChange(input.store.paths.changes, input.changeId);
  if (!disk.success || !disk.data?.gates) return null;
  const diskGates = disk.data.gates;
  if (!hasCompatibilityRecoveryEvidence(diskGates)) return null;
  return gateDoneCount(diskGates) > gateDoneCount(input.current)
    ? diskGates
    : null;
}

async function waitForGateCompletionResult(
  handle: WorkflowHandleLike,
  gateId: GateId,
): Promise<GateCompletion | undefined> {
  let latest: GateCompletion | undefined;
  for (let attempt = 0; attempt < GATE_COMPLETION_POLL_ATTEMPTS; attempt++) {
    latest = await querySignal<GateCompletion>(
      handle,
      getGateStatusQuery,
      gateId,
    );
    if (latest?.status === "done" || latest?.status === "stuck") {
      return latest;
    }
    await delay(GATE_COMPLETION_POLL_DELAY_MS);
  }
  return latest;
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

function gateCompletionNotConfirmedResponse(input: {
  changeId: string;
  gateId: GateId;
  gate?: GateCompletion;
}): string {
  return formatToolOutput({
    error: `Cannot confirm ${input.gateId} gate completion from workflow state`,
    changeId: input.changeId,
    gateId: input.gateId,
    workflowGateStatus: input.gate?.status,
    hint: "Retry adv_gate_status to inspect workflow state before retrying adv_gate_complete.",
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

function getReleaseFinalizationBlocker(input: {
  store: Store;
  change: Change;
  changeId: string;
}): string | null {
  const { archiveMode } = detectArchiveMode(input.store.config ?? {});
  const mainCheckout = resolveMainCheckout(input.store.paths.root);
  const { branch: defaultBranch } = detectDefaultBranch(mainCheckout);

  if (archiveMode === "pr") {
    const pushCheck = verifyChangeBranchPushed(mainCheckout, input.changeId);
    if (!pushCheck.pushed) {
      return releaseRequiresPrHandoffResponse({
        changeId: input.changeId,
        reason: pushCheck.reason ?? "change branch not pushed to origin",
      });
    }
    return null;
  }

  const route = classifyFinalizationRoute(mainCheckout, defaultBranch);
  const reachability = resolveReleaseReachability({
    mainCheckout,
    defaultBranch,
    changeId: input.changeId,
    route,
    prNumber: input.change.phase9_status?.prNumber,
  });
  if (reachability.reachable) return null;

  if (reachability.proof === "origin_push_unverified") {
    return releaseRequiresDefaultBranchPushResponse({
      changeId: input.changeId,
      defaultBranch,
      reason:
        reachability.details?.join("; ") ??
        `${defaultBranch} not pushed to origin`,
    });
  }

  if (reachability.proof === "pr_unmerged") {
    return releaseRequiresPrHandoffResponse({
      changeId: input.changeId,
      reason: [
        reachability.autoMergeArmed ? "pending auto-merge" : "PR is not merged",
        ...(reachability.details ?? []),
      ].join("; "),
    });
  }

  return releaseRequiresTrunkMergeResponse({
    changeId: input.changeId,
    defaultBranch:
      route.route === "no_remote" ? defaultBranch : `origin/${defaultBranch}`,
    unmergedCommits: reachability.details ?? [],
  });
}

function buildRecoveryReadinessState(input: {
  change: Change;
  gates: Gates;
  projectionChangesDir: string;
}) {
  return changeToWorkflowState({
    projectId: "recovery-disk-projection",
    change: input.change,
    initializedAt: input.change.created_at,
    projectionChangesDir: input.projectionChangesDir,
    gates: input.gates,
  });
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
async function resolveAcceptanceRecoveryArtifactEvidence(input: {
  store: Store;
  changeId: string;
  recoveryState: ChangeWorkflowState;
  fallbackEvidence: GateArtifactEvidence | undefined;
}): Promise<
  | { ok: true; artifactEvidence: GateArtifactEvidence | undefined }
  | { ok: false; response: string }
> {
  if (!input.recoveryState.contract?.reviewMatrix) {
    return { ok: true, artifactEvidence: input.fallbackEvidence };
  }
  const acceptanceWrite = await writeArtifactActivity({
    changesDir: input.store.paths.changes,
    changeId: input.changeId,
    kind: "acceptance",
    content: renderAcceptanceProjection(input.recoveryState),
  });
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
  const executiveSummary = await inspectArtifactActivity({
    changesDir: input.store.paths.changes,
    changeId: input.changeId,
    kind: "executiveSummary",
  });
  if (
    !executiveSummary.ok ||
    executiveSummary.nonWhitespaceChars <
      MIN_RECOVERY_ARTIFACT_NON_WHITESPACE_CHARS ||
    executiveSummary.contentHash !==
      input.recoveryState.artifacts.executiveSummary?.contentHash
  ) {
    const code = !executiveSummary.ok
      ? executiveSummary.code === "missing"
        ? "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING"
        : "ACCEPTANCE_EXECUTIVE_SUMMARY_UNREADABLE"
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
              message: !executiveSummary.ok
                ? executiveSummary.error
                : "executive-summary proof failed recovery validation",
              remediation:
                "Repair executive-summary.md and workflow metadata before retrying recovery.",
            },
          ],
        },
      }),
    };
  }
  const acceptanceArtifact = await inspectArtifactActivity({
    changesDir: input.store.paths.changes,
    changeId: input.changeId,
    kind: "acceptance",
  });
  if (acceptanceArtifact.ok) {
    return {
      ok: true,
      artifactEvidence: {
        kind: "acceptance",
        path: acceptanceArtifact.path,
        content_hash: acceptanceArtifact.contentHash,
        non_whitespace_chars: acceptanceArtifact.nonWhitespaceChars,
        checked_at: acceptanceArtifact.checkedAt,
      },
    };
  }
  return { ok: true, artifactEvidence: input.fallbackEvidence };
}

/**
 * rq-extend-poisoned-recovery AC4: generalized poisoned-history gate
 * recovery. Supports acceptance and release gates. Each requires
 * `compatibilityReason` and respects prior-gate sequencing + task
 * completeness.
 *
 * Replaces the prior `completeAcceptanceViaRecovery` helper — call sites
 * now use this entrypoint directly. The acceptance-specific artifact-evidence
 * resolution lives in `resolveAcceptanceRecoveryArtifactEvidence` (AC8).
 */
async function completeGateViaRecovery(input: {
  store: Store;
  change: Change;
  changeId: string;
  gateId: GateId;
  gates: Gates;
  completedBy: string;
  notes?: string;
  compatibilityReason?: string;
  boundaryWarning?: string;
  extraPayload?: Record<string, unknown>;
  diskDirect?: boolean;
  recoveryReason?: string;
  recoveryEvidence?: string;
  priorApprovalEvidence?: string;
}): Promise<string> {
  if (input.gateId !== "acceptance" && input.gateId !== "release") {
    return formatToolOutput({
      error:
        "poisoned-history gate recovery is only supported for acceptance and release",
      changeId: input.changeId,
      gateId: input.gateId,
      ...(input.extraPayload ?? {}),
    });
  }
  if (!input.compatibilityReason?.trim()) {
    return formatToolOutput({
      error: `poisoned-history ${input.gateId} recovery requires compatibilityReason`,
      changeId: input.changeId,
      gateId: input.gateId,
      ...(input.extraPayload ?? {}),
    });
  }
  const missingAuditFields = [
    !input.recoveryEvidence?.trim() ? "recoveryEvidence" : undefined,
    !input.recoveryReason?.trim() ? "recoveryReason" : undefined,
    input.gateId === "acceptance" && !input.priorApprovalEvidence?.trim()
      ? "priorApprovalEvidence"
      : undefined,
  ].filter((field): field is string => Boolean(field));
  if (missingAuditFields.length > 0) {
    return formatToolOutput({
      error: `poisoned-history ${input.gateId} recovery requires ${missingAuditFields.join(", ")}`,
      changeId: input.changeId,
      gateId: input.gateId,
      missingAuditFields,
      ...(input.extraPayload ?? {}),
    });
  }
  const recoveryReason = input.recoveryReason?.trim() ?? "";
  const recoveryEvidence = input.recoveryEvidence?.trim() ?? "";
  const priorApprovalEvidence = input.priorApprovalEvidence?.trim();
  if (!canCompleteGate(input.gates, input.gateId)) {
    const blockedBy = GATE_ORDER.slice(
      0,
      GATE_ORDER.indexOf(input.gateId),
    ).filter((gate) => input.gates[gate].status !== "done");
    return formatToolOutput({
      error: `Cannot complete ${input.gateId}: prior gate(s) incomplete`,
      blockedBy,
      ...(input.extraPayload ?? {}),
    });
  }
  let recoveryChange = input.change;
  if (input.diskDirect) {
    const disk = await loadChange(input.store.paths.changes, input.changeId);
    if (disk.success && disk.data) {
      recoveryChange = disk.data;
    }
  }

  // For acceptance: all tasks must be done/cancelled. Release runs after
  // acceptance so this is implicitly true, but we keep the check for
  // defense in depth.
  const incompleteTasks = recoveryChange.tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  if (incompleteTasks.length > 0) {
    return formatToolOutput({
      error: `Cannot complete ${input.gateId}: ${incompleteTasks.length} task(s) not done or cancelled`,
      incompleteTasks: incompleteTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
      })),
      ...(input.extraPayload ?? {}),
    });
  }

  if (input.gateId === "release") {
    const blocker = getReleaseFinalizationBlocker({
      store: input.store,
      change: recoveryChange,
      changeId: input.changeId,
    });
    if (blocker) return blocker;
  }

  const recoveryState = buildRecoveryReadinessState({
    change: recoveryChange,
    gates: input.gates,
    projectionChangesDir: input.store.paths.changes,
  });
  const readiness = evaluateGateReadiness(recoveryState, input.gateId, {
    compatibilityReason: input.compatibilityReason,
  });
  if (!readiness.ready) {
    return workflowReadinessBlockedResponse({
      changeId: input.changeId,
      gateId: input.gateId,
      gate: {
        status: "stuck",
        stuck_reason: readiness.blockers[0]?.code,
        readiness_blockers: readiness.blockers,
      },
    });
  }
  let artifactEvidence = readiness.evidence;
  if (input.gateId === "acceptance") {
    const acceptance = await resolveAcceptanceRecoveryArtifactEvidence({
      store: input.store,
      changeId: input.changeId,
      recoveryState,
      fallbackEvidence: readiness.evidence,
    });
    if (!acceptance.ok) return acceptance.response;
    artifactEvidence = acceptance.artifactEvidence;
  }

  const completedAt = new Date().toISOString();
  const completion = {
    status: "done",
    completed_at: completedAt,
    completed_by: input.completedBy,
    approval_evidence:
      input.gateId === "acceptance"
        ? [input.notes, priorApprovalEvidence].filter(Boolean).join("; ") ||
          undefined
        : input.notes,
    artifact_evidence: artifactEvidence,
  } as Gates[GateId];
  const updatedGates: Gates = {
    ...input.gates,
    [input.gateId]: completion,
  } as Gates;
  if (input.diskDirect) {
    await saveRecoveredGateCompletion({
      store: input.store,
      change: recoveryChange,
      authorization: {
        reason: recoveryReason,
        evidence:
          input.gateId === "acceptance"
            ? `${recoveryEvidence}\nPrior approval evidence: ${priorApprovalEvidence}`
            : recoveryEvidence,
      },
      gateId: input.gateId,
      completion,
    });
  } else {
    await input.store.changes.save({ ...recoveryChange, gates: updatedGates });
  }
  return formatToolOutput({
    success: true,
    changeId: input.changeId,
    gateId: input.gateId,
    status: "done",
    completed_at: completedAt,
    completed_by: input.completedBy,
    boundaryWarning: input.boundaryWarning,
    _recoveryMutation: true,
    reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
    ...(input.extraPayload ?? {}),
  });
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

  // Temporal-first proposal read per KD-6. Falls back to disk/archive via
  // readArtifact; null result means no proposal content yet — pass empty
  // string downstream (gate-completion success output, not validation).
  const proposalText = (await readArtifact(store, changeId, "proposal")) ?? "";

  return formatToolOutput({
    success: true,
    changeId,
    gateId,
    status: "done",
    completed_at: completedAt,
    completed_by: completedBy,
    _contextSnapshot: buildChangeContextSnapshot({
      change,
      proposalText,
      gates: completedGates,
      workdir: store.paths.root,
    }),
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
}): Promise<string> {
  if (!userApproved) {
    return formatToolOutput({
      error:
        "Planning gate requires userApproved: true. The user must explicitly approve the prep contract (via question tool) before this gate can be completed.",
      changeId,
      gateId,
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
    // Temporal-first proposal read for clarify-readiness validator input.
    const proposalText =
      (await readArtifact(store, changeId, "proposal")) ?? "";
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

  // Signal-driven mutation: fire gateCompletedSignal after all validations pass
  const bundle = getService();
  if (!bundle) {
    return formatToolOutput({
      error: "Temporal service not available",
      changeId,
      gateId,
    });
  }
  const projectId = await getProjectId(store.paths.root);
  if (!projectId) {
    return formatToolOutput({
      error: "Could not resolve project ID",
      changeId,
      gateId,
    });
  }
  const handle = getChangeHandle(bundle.client, projectId, changeId);
  // rq-cacheRefresh01: helper fires signal AND refreshes cache so the
  // subsequent completeGateAndBuildResponse builds its response from
  // fresh state (no parallel inline refresh in the helper anymore).
  await fireSignalAndRefresh(handle, store, changeId, gateCompletedSignal, {
    gateId,
    completedBy,
    completedAt: new Date().toISOString(),
    approvalEvidence: notes,
  });

  const postSignalGate = await waitForGateCompletionResult(handle, gateId);
  if (postSignalGate?.status === "stuck") {
    return workflowReadinessBlockedResponse({
      changeId,
      gateId,
      gate: postSignalGate,
    });
  }
  if (postSignalGate?.status !== "done") {
    return gateCompletionNotConfirmedResponse({
      changeId,
      gateId,
      gate: postSignalGate,
    });
  }

  return completeGateAndBuildResponse({
    store,
    change,
    changeId,
    gateId,
    gates: { ...gates, [gateId]: postSignalGate },
    notes,
    completedBy,
    boundaryWarning,
    extraPayload: {
      ...warningsPayload,
      ...clarifyPayload,
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

            // Get or create gates
            let gates = result.data.gates ?? createDefaultGates();
            let poisonedFallback = false;
            const bundle = getService();
            const projectId = bundle
              ? await getProjectId(activeStore.paths.root)
              : null;
            if (bundle && projectId) {
              const handle = getChangeHandle(
                bundle.client,
                projectId,
                changeId,
              );
              try {
                const queriedGates = await querySignal<Gates>(
                  handle,
                  getGateStatusQuery,
                  undefined,
                );
                if (queriedGates && typeof queriedGates === "object") {
                  gates = queriedGates;
                  const recoveredDiskGates = await preferRecoveredDiskGates({
                    store: activeStore,
                    changeId,
                    current: gates,
                  });
                  if (recoveredDiskGates) {
                    gates = recoveredDiskGates;
                    poisonedFallback = true;
                  }
                }
              } catch (queryError) {
                // rq-fix-gate-tools-recovery AC1: poisoned-history fallback.
                // The store's changes.get already returned a disk projection
                // (likely via temporal_query_fallback). Honour that disk
                // projection when the workflow describe carries poisoned
                // evidence, instead of propagating the generic
                // "Failed to query Workflow" error.
                if (await workflowHasPoisonedRecoveryEvidence(handle)) {
                  poisonedFallback = true;
                } else {
                  throw queryError;
                }
              }
            }
            const incomplete = getIncompleteGates(gates);
            const canArchive = allGatesSatisfied(gates);
            const nextGate = incomplete.length > 0 ? incomplete[0] : null;

            return formatToolOutput({
              changeId,
              gates,
              incomplete,
              canArchive,
              nextGate,
              ...(poisonedFallback
                ? { _recovery: { reason: "poisoned_history" } }
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
      compatibilityReason: z
        .string()
        .optional()
        .describe(
          "Legacy/replay compatibility rationale for poisoned-history gate recovery. Required for acceptance and release gate recovery; rejected for other gates.",
        ),
      recoveryReason: z
        .string()
        .optional()
        .describe(
          "Required when acceptance/release gate recovery is invoked. Must explain why disk-projection recovery is appropriate.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when acceptance/release gate recovery is invoked. Must cite precise completed-workflow or poisoned-history evidence.",
        ),
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Required for acceptance gate recovery only. Not required for release gate recovery. Must cite the prior user acceptance approval evidence.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
        userApproved,
        notes,
        compatibilityReason,
        recoveryReason,
        recoveryEvidence,
        priorApprovalEvidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
        userApproved?: boolean;
        notes?: string;
        compatibilityReason?: string;
        recoveryReason?: string;
        recoveryEvidence?: string;
        priorApprovalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
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

        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            error: "Temporal service not available",
            changeId,
            gateId,
          });
        }
        const projectId = await getProjectId(activeStore.paths.root);
        if (!projectId) {
          return formatToolOutput({
            error: "Could not resolve project ID",
            changeId,
            gateId,
          });
        }
        const handle = getChangeHandle(bundle.client, projectId, changeId);
        let queriedGates: Gates | undefined;
        try {
          queriedGates = await querySignal<Gates>(
            handle,
            getGateStatusQuery,
            undefined,
          );
        } catch (error) {
          // rq-fix-gate-tools-recovery AC2 + rq-extend-poisoned-recovery AC4:
          // accept poisoned-history acceptance/release recovery when either
          // the raw error matches the legacy regex OR workflow describe
          // carries poisoned evidence. compatibilityReason is still required
          // inside completeGateViaRecovery.
          if (gateId === "acceptance" || gateId === "release") {
            const { completedWorkflow, recover } =
              await classifyCompletedOrPoisonedRecovery(handle, error);
            if (recover) {
              const boundaryWarning = validateGateBoundary(gateId, completedBy);
              return completeGateViaRecovery({
                store: activeStore,
                change,
                changeId,
                gateId,
                gates,
                completedBy,
                notes,
                compatibilityReason,
                boundaryWarning,
                diskDirect: completedWorkflow,
                recoveryReason,
                recoveryEvidence,
                priorApprovalEvidence,
                extraPayload: projectContext
                  ? { _projectContext: projectContext }
                  : {},
              });
            }
          }
          throw error;
        }
        if (queriedGates && typeof queriedGates === "object") {
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
          });
        }

        if (gateId === "execution") {
          const workflowTasks = await querySignal<Task[]>(
            handle,
            changeTasksQuery,
            undefined,
            undefined,
          );
          const tasks = Array.isArray(workflowTasks)
            ? workflowTasks
            : change.tasks;
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

        if (gateId === "release") {
          const blocker = getReleaseFinalizationBlocker({
            store: activeStore,
            change,
            changeId,
          });
          if (blocker) return blocker;
        }

        // Signal-driven mutation: fire gateCompletedSignal after
        // sequence/task checks pass. rq-cacheRefresh01: helper invalidates
        // the cache so completeGateAndBuildResponse + subsequent reads
        // see the fresh gate-done state.
        try {
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            gateCompletedSignal,
            {
              gateId,
              completedBy,
              completedAt: new Date().toISOString(),
              approvalEvidence: notes,
              compatibilityReason,
            },
          );
        } catch (error) {
          // rq-fix-gate-tools-recovery AC2 + rq-extend-poisoned-recovery AC4:
          // also recover release gate when workflow describe carries
          // poisoned evidence.
          if (gateId === "acceptance" || gateId === "release") {
            const { completedWorkflow, recover } =
              await classifyCompletedOrPoisonedRecovery(handle, error);
            if (recover) {
              return completeGateViaRecovery({
                store: activeStore,
                change,
                changeId,
                gateId,
                gates,
                completedBy,
                notes,
                compatibilityReason,
                boundaryWarning,
                diskDirect: completedWorkflow,
                recoveryReason,
                recoveryEvidence,
                priorApprovalEvidence,
                extraPayload: projectContext
                  ? { _projectContext: projectContext }
                  : {},
              });
            }
          }
          throw error;
        }

        const postSignalGate = await waitForGateCompletionResult(
          handle,
          gateId,
        );
        if (postSignalGate?.status === "stuck") {
          return workflowReadinessBlockedResponse({
            changeId,
            gateId,
            gate: postSignalGate,
          });
        }
        if (postSignalGate?.status !== "done") {
          return gateCompletionNotConfirmedResponse({
            changeId,
            gateId,
            gate: postSignalGate,
          });
        }

        return completeGateAndBuildResponse({
          store: activeStore,
          change,
          changeId,
          gateId,
          gates: { ...gates, [gateId]: postSignalGate },
          notes,
          completedBy,
          boundaryWarning,
          extraPayload: projectContext
            ? { _projectContext: projectContext }
            : {},
        });
      };

      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
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
