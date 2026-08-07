/** Disk-backed archive gate helpers. */
import {
  createDefaultGates,
  getIncompleteGates,
  isGateSatisfied,
  GATE_ORDER,
  type GateCompletion,
  type Gates,
  type Change,
  type Phase9FinalizationStatus,
} from "../../types";
import { basename, dirname } from "node:path";
import type { Store } from "../../storage/store";
import { loadChange } from "../../storage/json";
import { createLogger } from "../../utils/debug-log";
import { formatToolOutput } from "../../utils/tool-output";
import { readChangeProjectionState } from "../../storage/read-change-projection";
import { hasGateRecoveryAudit } from "../recovery-audit";
import {
  detectDefaultBranch,
  classifyFinalizationRoute,
  resolveReleaseReachability,
  coercePrWorkflowRoute,
  type GitFinalizeOutcome,
  type GitFinalizeDeps,
} from "../archive-helpers/git-finalize";
import { coordinateChangeMutation } from "../change-mutation-coordinator";

const logger = createLogger("change");

export function getArchiveTaskPreflightError(change: {
  tasks: { id: string; title: string; status: string }[];
}): string | null {
  const incompleteTasks = change.tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  return incompleteTasks.length === 0
    ? null
    : formatToolOutput({
        error: "Cannot archive: incomplete tasks",
        incompleteTasks: incompleteTasks.map(({ id, title }) => ({
          id,
          title,
        })),
      });
}

export type ArchiveGateState = {
  effectiveGates: Gates;
  storeGates: Gates;
  source: "store";
  liveGates?: Gates;
  liveQueryError?: string;
};

export async function resolveArchiveGateState(
  store: Store,
  changeId: string,
  change: { gates?: Gates },
): Promise<ArchiveGateState> {
  const storeGates = change.gates ?? createDefaultGates();
  const diskGates = readChangeProjectionState(
    store.paths.changes,
    changeId,
  )?.gates;
  return {
    effectiveGates:
      diskGates && typeof diskGates === "object" ? diskGates : storeGates,
    storeGates,
    source: "store",
  };
}

export function getArchiveGatePreflightError(
  changeId: string,
  gateState: ArchiveGateState,
  allowReleasePending: boolean,
  _divergenceHint?: string | null,
): string | null {
  const incompleteGates = allowReleasePending
    ? GATE_ORDER.filter(
        (gateId) =>
          gateId !== "release" &&
          !isGateSatisfied(gateState.effectiveGates[gateId]),
      )
    : getIncompleteGates(gateState.effectiveGates);
  if (incompleteGates.length === 0) return null;
  return formatToolOutput({
    error:
      "Cannot archive: incomplete gates. Complete all quality gates before archiving.",
    incompleteGates,
    gateStateSource: gateState.source,
    storeIncompleteGates: getIncompleteGates(gateState.storeGates),
    ...(gateState.liveGates
      ? { liveIncompleteGates: getIncompleteGates(gateState.liveGates) }
      : {}),
    ...(gateState.liveQueryError
      ? { liveQueryError: gateState.liveQueryError }
      : {}),
    hint: `Run /adv-gate-status ${changeId} to see gate details`,
  });
}

export function buildReleaseCompletionEvidence(
  finalization: GitFinalizeOutcome,
): string {
  const details = [
    `defaultBranch=${finalization.defaultBranch}`,
    `repoRoot=${finalization.repoRoot}`,
    `pushStatus=${finalization.pushStatus}`,
    finalization.releasedCommitSha
      ? `releasedCommitSha=${finalization.releasedCommitSha}`
      : null,
    finalization.mergeCommitSha
      ? `mergeCommitSha=${finalization.mergeCommitSha}`
      : null,
    finalization.prBranch ? `prBranch=${finalization.prBranch}` : null,
    finalization.prNumber ? `prNumber=${finalization.prNumber}` : null,
    finalization.prUrl ? `prUrl=${finalization.prUrl}` : null,
    finalization.route ? `route=${finalization.route}` : null,
  ].filter(Boolean);
  return `Phase 9 finalization ${finalization.status}; ${details.join("; ")}`;
}

export function preservePhase9Evidence(
  previous: Phase9FinalizationStatus | undefined,
  next: Phase9FinalizationStatus,
): Phase9FinalizationStatus {
  if (!previous) return next;
  return {
    ...next,
    ...(previous.repo !== undefined && next.repo === undefined
      ? { repo: previous.repo }
      : {}),
    ...(previous.prNumber !== undefined && next.prNumber === undefined
      ? { prNumber: previous.prNumber }
      : {}),
    ...(previous.prUrl !== undefined && next.prUrl === undefined
      ? { prUrl: previous.prUrl }
      : {}),
    ...(previous.route !== undefined && next.route === undefined
      ? { route: previous.route }
      : {}),
    ...(previous.changeTipSha !== undefined && next.changeTipSha === undefined
      ? { changeTipSha: previous.changeTipSha }
      : {}),
    ...(previous.autoMergeArmed !== undefined &&
    next.autoMergeArmed === undefined
      ? { autoMergeArmed: previous.autoMergeArmed }
      : {}),
  };
}

export function buildPendingMergePhase9Status(input: {
  finalization: GitFinalizeOutcome;
  startedAt: string;
  previous?: Phase9FinalizationStatus;
}): Phase9FinalizationStatus {
  return preservePhase9Evidence(input.previous, {
    status: "pending_merge",
    startedAt: input.startedAt,
    prNumber: input.finalization.prNumber,
    prUrl: input.finalization.prUrl,
    autoMergeArmed: input.finalization.autoMergeArmed,
    route: input.finalization.route,
    changeTipSha: input.finalization.changeTipSha,
  });
}

export function buildFailedPhase9Classification(input: {
  change: Change;
  finalization: GitFinalizeOutcome;
}): Record<string, unknown> {
  if (input.change.phase9_status?.status !== "failed") return {};
  return {
    phase9Failure: {
      status: "failed",
      error: input.change.phase9_status.error,
      blocker:
        input.finalization.status === "blocked"
          ? input.finalization.blocked?.reason
          : undefined,
      recoverable: false,
      remediation:
        input.finalization.status === "blocked"
          ? input.finalization.blocked?.remediation
          : undefined,
      details:
        input.finalization.status === "blocked"
          ? input.finalization.blocked?.details
          : undefined,
    },
  };
}

export async function recordPhase9Status(input: {
  store: Store;
  changeId: string;
  status: Phase9FinalizationStatus;
}): Promise<void> {
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      reason: "record Phase 9 finalization status",
      evidence: input.status.error ?? input.status.status,
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.changeId,
      mutationKind: "phase9_status",
      mutateLatestProjection: (latest) => ({
        ...latest,
        phase9_status: input.status,
      }),
      verifyProjection: (readback) =>
        readback.phase9_status?.status === input.status.status,
    },
  });
  if (outcome.kind !== "verified") {
    throw new Error(
      outcome.kind === "unverified"
        ? outcome.reason
        : "Phase 9 status projection was not verified.",
    );
  }
}

export async function projectEpicTerminalSummaryAfterArchive(input: {
  store: Store;
  change: Change;
  completedAt: string;
}): Promise<
  | { status: "not_applicable" }
  | { status: "recorded"; epicId: string; entryId: string }
  | { status: "warning"; epicId: string; entryId: string; error: string }
> {
  const membership = input.change.epic_membership;
  if (!membership) return { status: "not_applicable" };
  try {
    await input.store.epics.setEntryTerminalSummary(membership.epic_id, {
      entryId: membership.entry_id,
      status: "archived",
      completedAt: input.completedAt,
    });
    return {
      status: "recorded",
      epicId: membership.epic_id,
      entryId: membership.entry_id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `archive epic terminal projection failed for ${input.change.id}: ${message}`,
    );
    return {
      status: "warning",
      epicId: membership.epic_id,
      entryId: membership.entry_id,
      error: message,
    };
  }
}

export function verifyReleaseEvidenceFromMain(input: {
  store: Store;
  changeId: string;
  archiveMode: "direct" | "pr";
  change?: Change;
  deps?: Pick<GitFinalizeDeps, "runGit" | "runGh">;
}): GitFinalizeOutcome {
  const repoRoot = input.store.paths.root;
  const { branch: defaultBranch } = detectDefaultBranch(repoRoot, input.deps);
  const classifiedRoute = classifyFinalizationRoute(
    repoRoot,
    defaultBranch,
    input.deps,
  );
  const route =
    input.archiveMode === "pr" ||
    input.change?.phase9_status?.status === "pending_merge"
      ? coercePrWorkflowRoute(classifiedRoute)
      : classifiedRoute;
  const reachability = resolveReleaseReachability(
    {
      repoRoot,
      defaultBranch,
      changeId: input.changeId,
      route,
      prNumber: input.change?.phase9_status?.prNumber,
      changeTipSha: input.change?.phase9_status?.changeTipSha,
      repo: input.change?.phase9_status?.repo,
    },
    input.deps,
  );
  if (reachability.reachable) {
    return {
      status: "shipped",
      repoRoot,
      defaultBranch,
      route: route.route,
      releasedCommitSha: reachability.releasedCommitSha,
      mergeCommitSha:
        reachability.proof === "pr_merged"
          ? reachability.mergeCommitOid
          : undefined,
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: false,
      pushStatus: route.route === "no_remote" ? "skipped" : "pushed",
      changeTipSha: input.change?.phase9_status?.changeTipSha,
    };
  }
  if (reachability.proof === "origin_push_unverified")
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "failed",
      pushFailureReason: reachability.details?.join("; "),
      blocked: {
        reason: "DEFAULT_BRANCH_PUSH_NOT_VERIFIED",
        remediation: `Default branch ${defaultBranch} must be pushed before release completion (rq-releaseFinalization01).`,
        details: reachability.details,
      },
    };
  if (reachability.proof === "pr_unmerged")
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "pushed",
      prBranch: `change/${input.changeId}`,
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: reachability.autoMergeArmed,
      blocked: {
        reason: reachability.autoMergeArmed
          ? "PR_PENDING_AUTO_MERGE"
          : "PR_NOT_MERGED",
        remediation: `PR for change/${input.changeId} must be merged before release completion (rq-releaseFinalization01).`,
        details: reachability.details,
      },
    };
  if (reachability.proof === "pr_missing_merge_proof")
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "pushed",
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: false,
      blocked: {
        reason: "PR_MERGE_PROOF_MISSING",
        remediation: `Unable to verify a merged PR for change/${input.changeId}.`,
        details: reachability.details,
      },
    };
  const reason =
    route.route === "no_remote" && reachability.proof === "blocked"
      ? "NO_REMOTE_RELEASE_AUTHORITY"
      : reachability.proof === "origin_unmerged"
        ? "CHANGE_BRANCH_NOT_REACHABLE_FROM_ORIGIN"
        : "CHANGE_BRANCH_NOT_REACHABLE";
  return {
    status: "blocked",
    repoRoot,
    defaultBranch,
    route: route.route,
    pushStatus: "not_attempted",
    blocked: {
      reason,
      remediation: `Change branch change/${input.changeId} must be reachable from ${route.route === "no_remote" ? defaultBranch : `origin/${defaultBranch}`} before release completion (rq-releaseFinalization01).`,
      details: reachability.details,
    },
  };
}

export type ArchiveReleaseGateResult =
  | {
      ok: true;
      gate: GateCompletion;
      alreadyDone: boolean;
      recoveryMutation?: boolean;
      reconciliationWarning?: string;
    }
  | {
      ok: false;
      error: string;
      workflowGateStatus?: GateCompletion["status"];
      readinessBlockers?: GateCompletion["readiness_blockers"];
      stuckReason?: GateCompletion["stuck_reason"];
      requirement?: string;
    };

function releaseGateEvidenceMatches(
  gate: GateCompletion | undefined,
  evidence: string,
): boolean {
  return (
    (typeof gate?.approval_evidence === "string" &&
      gate.approval_evidence.includes(evidence)) ||
    (typeof gate?.recovery_audit?.evidence === "string" &&
      gate.recovery_audit.evidence.includes(evidence))
  );
}

export async function verifyReleaseGateDurableForArchive(input: {
  store: Store;
  changeId: string;
  evidence: string;
  finalization?: GitFinalizeOutcome;
  bundlePath?: string;
  requireExistingGate?: boolean;
  change?: Change;
}): Promise<
  | { ok: true; gate: GateCompletion; source: "disk" | "shipped-finalization" }
  | {
      ok: false;
      error: string;
      releaseGateStatus?: GateCompletion["status"];
      readinessBlockers?: GateCompletion["readiness_blockers"];
      stuckReason?: GateCompletion["stuck_reason"];
    }
> {
  const changesDir = input.bundlePath
    ? dirname(input.bundlePath)
    : input.store.paths.changes;
  const id = input.bundlePath ? basename(input.bundlePath) : input.changeId;
  const loaded = await loadChange(changesDir, id);
  const gate = loaded.success ? loaded.data?.gates?.release : undefined;
  const shipped = input.finalization?.status === "shipped";
  if (gate?.status !== "done")
    return {
      ok: false,
      error: `Cannot confirm release gate completion from disk projection (status: ${gate?.status ?? "missing"})`,
      releaseGateStatus: gate?.status,
    };
  if (
    !shipped &&
    !hasGateRecoveryAudit(gate) &&
    !releaseGateEvidenceMatches(gate, input.evidence)
  )
    return {
      ok: false,
      error: "Release gate durable proof lacks matching completion evidence.",
      releaseGateStatus: gate.status,
    };
  return {
    ok: true,
    gate,
    source:
      shipped && !hasGateRecoveryAudit(gate) ? "shipped-finalization" : "disk",
  };
}

export async function completeReleaseGateAfterFinalization(input: {
  store: Store;
  change: Change;
  changeId: string;
  finalization: GitFinalizeOutcome;
  existingBundlePath?: string;
}): Promise<ArchiveReleaseGateResult> {
  if (input.finalization.status !== "shipped")
    return {
      ok: false,
      error: `Release gate requires successful Phase 9 finalization, got ${input.finalization.status}`,
    };
  const current = readChangeProjectionState(
    input.store.paths.changes,
    input.changeId,
  )?.gates?.release;
  if (current?.status === "done")
    return { ok: true, gate: current, alreadyDone: true };
  const evidence = buildReleaseCompletionEvidence(input.finalization);
  const completion: GateCompletion = {
    status: "done",
    completed_at: new Date().toISOString(),
    completed_by: "adv-archive",
    approval_evidence: evidence,
  };
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      reason: "complete release gate after verified finalization",
      evidence,
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.changeId,
      mutationKind: "gate_completion",
      mutateLatestProjection: (latest) => ({
        ...latest,
        gates: { ...(latest.gates ?? {}), release: completion },
      }),
      verifyProjection: (readback) =>
        readback.gates?.release?.status === "done" &&
        readback.gates.release.approval_evidence === evidence,
    },
  });
  if (outcome.kind !== "verified")
    return {
      ok: false,
      error:
        outcome.kind === "unverified"
          ? outcome.reason
          : "Release gate projection was not durably verified.",
    };
  return {
    ok: true,
    gate: outcome.value.gates?.release ?? completion,
    alreadyDone: false,
  };
}

export async function reconcileArchivedBundleRetry(input: {
  store: Store;
  change: Change;
  changeId: string;
  archiveMode: "direct" | "pr";
  phase9?: "run" | "skip";
  existingBundlePath: string;
  openOpsObligationsPayload: Record<string, unknown>;
  validationWarnings: Array<{ code: string; message: string; path?: string }>;
}): Promise<string> {
  if (input.phase9 === "skip")
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      archivePath: input.existingBundlePath,
      noOp: true,
      message: `Change ${input.changeId} is already archived with an existing bundle; phase9=skip skipped reconciliation.`,
      ...input.openOpsObligationsPayload,
    });
  const finalization = verifyReleaseEvidenceFromMain({
    store: input.store,
    changeId: input.changeId,
    archiveMode: input.archiveMode,
    change: input.change,
  });
  if (finalization.status === "blocked")
    return formatToolOutput({
      success: false,
      error: `Archive finalization blocked: ${finalization.blocked?.reason}`,
      requirement: "rq-releaseFinalization01",
      remediation: finalization.blocked?.remediation,
      details: finalization.blocked?.details,
      ...buildFailedPhase9Classification({
        change: input.change,
        finalization,
      }),
      ...input.openOpsObligationsPayload,
      finalization,
      continueFrom: {
        path: finalization.repoRoot,
        branch: finalization.defaultBranch,
      },
    });
  const releaseResult = await completeReleaseGateAfterFinalization({
    store: input.store,
    change: input.change,
    changeId: input.changeId,
    finalization,
    existingBundlePath: input.existingBundlePath,
  });
  if (!releaseResult.ok)
    return formatToolOutput({
      success: false,
      error: `Archive release gate completion blocked: ${releaseResult.error}`,
      requirement: "rq-releaseFinalization01",
      ...input.openOpsObligationsPayload,
      finalization,
      continueFrom: {
        path: finalization.repoRoot,
        branch: finalization.defaultBranch,
      },
    });
  if (input.change.phase9_status?.status !== "done")
    await recordPhase9Status({
      store: input.store,
      changeId: input.changeId,
      status: preservePhase9Evidence(input.change.phase9_status, {
        status: "done",
        startedAt:
          input.change.phase9_status?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        changeTipSha: finalization.changeTipSha,
      }),
    });
  return formatToolOutput({
    success: true,
    noOp: true,
    message: `Change ${input.changeId} is already archived; release gate and Phase 9 metadata reconciled without repeating finalization or cleanup.`,
    ...input.openOpsObligationsPayload,
    finalization,
    continueFrom: {
      path: finalization.repoRoot,
      branch: finalization.defaultBranch,
    },
    releaseGate: releaseResult.gate,
    releaseGateAlreadyDone: releaseResult.alreadyDone,
  });
}
