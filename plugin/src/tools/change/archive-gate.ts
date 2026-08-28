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
import { loadChange } from "../../storage/change-projection-reader";
import { createLogger } from "../../utils/debug-log";
import { formatToolOutput } from "../../utils/tool-output";
import { hasGateRecoveryAudit } from "../recovery-audit";
import {
  detectDefaultBranch,
  classifyFinalizationRoute,
  resolveReleaseReachability,
  coercePrWorkflowRoute,
  makeBoundedRunGit,
  verifyDirectMergedPrProof,
  type GitFinalizeOutcome,
  type GitFinalizeDeps,
} from "../archive-helpers/git-finalize";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import {
  commitChangeProjection,
  type ProjectionCommitOutcome,
} from "../../storage/change-projection-transaction";
import { canonicalSha256 } from "../../archive/projection";
import { withArchiveProjectionLock } from "../../archive/projection-lock";
import {
  findArchiveBundle,
  refreshArchiveBundleProjectionUnderLock,
} from "../../archive/archive";
import { readProjectionManifest } from "../../archive/projection-proof";

const logger = createLogger("change");

function formatArchiveBundleRefreshError(error: unknown): string {
  return `Archive bundle refresh failed: ${error instanceof Error ? error.message : String(error)}`;
}

async function refreshArchiveBundleProjectionsUnderLock(input: {
  change: Change;
  archivePath: string;
}): Promise<{ terminalSummaryDegradation?: { reason: string } }> {
  const writeResult = await refreshArchiveBundleProjectionUnderLock({
    change: input.change,
    archivePath: input.archivePath,
  });
  return writeResult.terminalSummaryDegradation ? writeResult : {};
}

function getProjectionCommitError(
  outcome: Exclude<ProjectionCommitOutcome, { kind: "committed" }>,
): string {
  switch (outcome.kind) {
    case "committed_unverified":
      return outcome.postconditionError;
    case "state_revision_conflict":
    case "operator_required":
      return outcome.reason;
    case "schema_error":
    case "write_error":
      return outcome.error;
    case "stale_revision":
    case "state_regression":
    case "operation_conflict":
    case "lock_timeout":
      return `Archived bundle projection commit failed: ${outcome.kind}`;
  }
}

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
  projectionLoadFailure?: {
    type: string;
    error: string;
  };
  liveGates?: Gates;
  liveQueryError?: string;
};

export async function resolveArchiveGateState(
  store: Store,
  changeId: string,
  change: { gates?: Gates },
): Promise<ArchiveGateState> {
  const storeGates = change.gates ?? createDefaultGates();
  const projected = await loadChange(store.paths.changes, changeId);
  if (!projected.success) {
    return {
      effectiveGates: storeGates,
      storeGates,
      source: "store",
      projectionLoadFailure: {
        type: projected.type,
        error: projected.error,
      },
    };
  }
  const diskGates = projected.data?.gates;
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
  if (gateState.projectionLoadFailure) {
    return formatToolOutput({
      error: gateState.projectionLoadFailure.error,
      code: "CHANGE_PROJECTION_LOAD_FAILED",
      projectionFailureType: gateState.projectionLoadFailure.type,
      changeId,
    });
  }
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
    finalization.repo ? `repo=${finalization.repo}` : null,
    finalization.prNumber ? `prNumber=${finalization.prNumber}` : null,
    finalization.prHeadSha ? `prHeadSha=${finalization.prHeadSha}` : null,
    finalization.defaultBranchSha
      ? `defaultBranchReachability=origin/${finalization.defaultBranch}@${finalization.defaultBranchSha}`
      : null,
    finalization.prUrl ? `prUrl=${finalization.prUrl}` : null,
    finalization.route ? `route=${finalization.route}` : null,
  ].filter(Boolean);
  return `Phase 9 finalization ${finalization.status}; ${details.join("; ")}`;
}

export async function verifyExistingBundleIdentity(
  existingBundlePath: string,
  change: Change,
): Promise<
  | { ok: true; manifest: Awaited<ReturnType<typeof readProjectionManifest>> }
  | { ok: false; reason: string }
> {
  const manifest = await readProjectionManifest(existingBundlePath);
  if (!manifest) {
    return {
      ok: false,
      reason: "Archive bundle has no valid projection manifest",
    };
  }
  if (manifest.change_id !== change.id) {
    return {
      ok: false,
      reason: `Bundle change_id ${manifest.change_id} does not match ${change.id}`,
    };
  }
  const expectedDeltaSha = canonicalSha256(change.deltas);
  if (manifest.delta_set_sha256 !== expectedDeltaSha) {
    return {
      ok: false,
      reason: "Bundle delta_set_sha256 does not match accepted deltas",
    };
  }
  const expectedCapabilities = Object.entries(change.deltas)
    .filter(([, deltas]) => deltas.length > 0)
    .map(([capability, deltas]) => ({
      capability,
      deltaIds: deltas
        .map((delta) => delta.id)
        .sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
  const manifestCapabilities = [...manifest.capabilities]
    .map((capability) => ({
      capability: capability.capability,
      deltaIds: capability.dispositions
        .map((disposition) => disposition.deltaId)
        .sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
  if (
    manifestCapabilities.length !== expectedCapabilities.length ||
    manifestCapabilities.some(
      (capability, index) =>
        capability.capability !== expectedCapabilities[index]?.capability ||
        capability.deltaIds.length !==
          expectedCapabilities[index]?.deltaIds.length ||
        capability.deltaIds.some(
          (deltaId, deltaIndex) =>
            deltaId !== expectedCapabilities[index]?.deltaIds[deltaIndex],
        ),
    )
  ) {
    return {
      ok: false,
      reason: "Bundle does not account for the exact accepted delta IDs",
    };
  }
  return { ok: true, manifest };
}

type ShippedFinalization = GitFinalizeOutcome & { status: "shipped" };

type MergedArchiveReplay =
  | { kind: "none" }
  | {
      kind: "verified_merged_replay";
      existingBundlePath: string;
      trackedBundlePath: string;
      finalization: ShippedFinalization;
    };

function splitGitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readCommittedBundlePath(input: {
  repoRoot: string;
  releasedCommitSha: string;
  changeId: string;
  expectedBundleName: string;
  runGit: NonNullable<GitFinalizeDeps["runGit"]>;
}): string | undefined {
  const listed = input.runGit(input.repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    input.releasedCommitSha,
    "--",
    ".adv/archive",
  ]);
  if (listed.status !== 0) return undefined;
  const suffix = `-${input.changeId}/change.json`;
  const candidates = splitGitLines(listed.stdout).filter((path) => {
    if (!path.startsWith(".adv/archive/") || !path.endsWith(suffix))
      return false;
    const bundleName = path.slice(
      ".adv/archive/".length,
      -"/change.json".length,
    );
    return !bundleName.includes("/") && bundleName === input.expectedBundleName;
  });
  return candidates.length === 1
    ? candidates[0]!.slice(0, -"/change.json".length)
    : undefined;
}

function hasCommittedPath(
  repoRoot: string,
  releasedCommitSha: string,
  path: string,
  runGit: NonNullable<GitFinalizeDeps["runGit"]>,
): boolean {
  const result = runGit(repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    releasedCommitSha,
    "--",
    path,
  ]);
  return result.status === 0 && splitGitLines(result.stdout).includes(path);
}

function readCommittedJson(
  repoRoot: string,
  releasedCommitSha: string,
  path: string,
  runGit: NonNullable<GitFinalizeDeps["runGit"]>,
): Record<string, unknown> | undefined {
  const result = runGit(repoRoot, ["show", `${releasedCommitSha}:${path}`]);
  if (result.status !== 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function detectMergedArchiveReplay(input: {
  store: Store;
  changeId: string;
  archiveMode: "direct" | "pr";
  change: Change;
  deps?: Pick<GitFinalizeDeps, "runGit" | "runGh">;
}): Promise<MergedArchiveReplay> {
  const phase9 = input.change.phase9_status;
  if (
    !phase9 ||
    !["pending_merge", "failed", "done"].includes(phase9.status) ||
    !phase9.repo ||
    !phase9.prNumber ||
    (!phase9.changeTipSha && !phase9.preArchiveTipSha)
  )
    return { kind: "none" };

  let finalization: GitFinalizeOutcome;
  try {
    finalization = verifyReleaseEvidenceFromMain({
      store: input.store,
      changeId: input.changeId,
      archiveMode: input.archiveMode,
      change: input.change,
      deps: input.deps,
    });
  } catch {
    return { kind: "none" };
  }
  if (
    finalization.status !== "shipped" ||
    !finalization.repo ||
    !finalization.defaultBranch ||
    !finalization.releasedCommitSha
  )
    return { kind: "none" };
  const classifiedRoute = classifyFinalizationRoute(
    finalization.repoRoot,
    finalization.defaultBranch,
    input.deps,
  );
  if (classifiedRoute.repo !== finalization.repo) return { kind: "none" };

  const exactProof = verifyDirectMergedPrProof(
    {
      repoRoot: finalization.repoRoot,
      repo: finalization.repo,
      defaultBranch: finalization.defaultBranch,
      changeId: input.changeId,
      branchName: `change/${input.changeId}`,
      changeTipSha: phase9.changeTipSha,
      preArchiveTipSha: phase9.preArchiveTipSha,
    },
    input.deps,
  );
  if (
    exactProof.kind !== "valid" ||
    exactProof.prNumber !== phase9.prNumber ||
    (phase9.prHeadSha !== undefined &&
      phase9.prHeadSha !== exactProof.prHeadSha) ||
    finalization.releasedCommitSha !== exactProof.mergeCommitOid
  )
    return { kind: "none" };

  const replayFinalization = {
    ...finalization,
    releasedCommitSha: exactProof.mergeCommitOid,
    mergeCommitSha: exactProof.mergeCommitOid,
    prBranch: `change/${input.changeId}`,
    prNumber: exactProof.prNumber,
    prUrl: exactProof.prUrl,
    prHeadSha: exactProof.prHeadSha,
    defaultBranchSha: exactProof.defaultBranchSha,
  } as ShippedFinalization;
  const releasedCommitSha = exactProof.mergeCommitOid;
  const existingBundlePath = await findArchiveBundle(
    input.store.paths.archive,
    input.changeId,
  );
  if (!existingBundlePath) return { kind: "none" };

  const bundle = await loadChange(
    dirname(existingBundlePath),
    basename(existingBundlePath),
  );
  if (
    !bundle.success ||
    !bundle.data ||
    bundle.data.id !== input.changeId ||
    bundle.data.status !== "archived"
  )
    return { kind: "none" };

  const runGit = input.deps?.runGit ?? makeBoundedRunGit(30_000);
  const trackedBundlePath = readCommittedBundlePath({
    repoRoot: replayFinalization.repoRoot,
    releasedCommitSha,
    changeId: input.changeId,
    expectedBundleName: basename(existingBundlePath),
    runGit,
  });
  if (!trackedBundlePath) return { kind: "none" };

  const trackedChange = readCommittedJson(
    replayFinalization.repoRoot,
    releasedCommitSha,
    `${trackedBundlePath}/change.json`,
    runGit,
  );
  if (
    trackedChange?.id !== input.changeId ||
    trackedChange.status !== "archived"
  )
    return { kind: "none" };

  const hasDeltas = Object.values(input.change.deltas).some(
    (deltas) => deltas.length > 0,
  );
  if (hasDeltas) {
    const identity = await verifyExistingBundleIdentity(
      existingBundlePath,
      input.change,
    );
    if (!identity.ok) return { kind: "none" };
    const trackedManifestPath = `${trackedBundlePath}/spec-projection.json`;
    if (
      !hasCommittedPath(
        replayFinalization.repoRoot,
        releasedCommitSha,
        trackedManifestPath,
        runGit,
      )
    )
      return { kind: "none" };
    const trackedManifest = readCommittedJson(
      replayFinalization.repoRoot,
      releasedCommitSha,
      trackedManifestPath,
      runGit,
    );
    if (
      !trackedManifest ||
      canonicalSha256(trackedManifest) !== canonicalSha256(identity.manifest)
    )
      return { kind: "none" };
  }

  return {
    kind: "verified_merged_replay",
    existingBundlePath,
    trackedBundlePath,
    finalization: replayFinalization,
  };
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
    ...(previous.preArchiveTipSha !== undefined &&
    next.preArchiveTipSha === undefined
      ? { preArchiveTipSha: previous.preArchiveTipSha }
      : {}),
    ...(previous.prHeadSha !== undefined && next.prHeadSha === undefined
      ? { prHeadSha: previous.prHeadSha }
      : {}),
    ...(previous.mergeCommitSha !== undefined &&
    next.mergeCommitSha === undefined
      ? { mergeCommitSha: previous.mergeCommitSha }
      : {}),
    ...(previous.defaultBranchSha !== undefined &&
    next.defaultBranchSha === undefined
      ? { defaultBranchSha: previous.defaultBranchSha }
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
    preArchiveTipSha: input.finalization.preArchiveTipSha,
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
      prHeadSha: input.change?.phase9_status?.prHeadSha,
      changeTipSha: input.change?.phase9_status?.changeTipSha,
      preArchiveTipSha: input.change?.phase9_status?.preArchiveTipSha,
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
      prHeadSha: reachability.prHeadSha,
      defaultBranchSha: reachability.defaultBranchSha,
      repo: input.change?.phase9_status?.repo,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: false,
      pushStatus: route.route === "no_remote" ? "skipped" : "pushed",
      changeTipSha: input.change?.phase9_status?.changeTipSha,
      preArchiveTipSha: input.change?.phase9_status?.preArchiveTipSha,
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
      code?: string;
      projectionFailureType?: string;
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

async function completeArchivedBundleRelease(input: {
  store: Store;
  changeId: string;
  finalization: GitFinalizeOutcome;
  existingBundlePath: string;
  skipTerminalRefresh?: boolean;
}): Promise<ArchiveReleaseGateResult> {
  if (input.finalization.status !== "shipped") {
    return {
      ok: false,
      error: `Archived release recovery requires shipped finalization, got ${input.finalization.status}.`,
    };
  }
  const evidence = buildReleaseCompletionEvidence(input.finalization);

  return withArchiveProjectionLock(input.store.paths.root, async () => {
    const changesDir = dirname(input.existingBundlePath);
    const bundleId = basename(input.existingBundlePath);
    const loaded = await loadChange(changesDir, bundleId);
    if (!loaded.success || !loaded.data) {
      return {
        ok: false,
        error: loaded.success
          ? `Archive bundle projection not found: ${input.existingBundlePath}`
          : loaded.error,
        code: "CHANGE_PROJECTION_LOAD_FAILED",
        projectionFailureType: loaded.success ? "not_found" : loaded.type,
      };
    }
    if (loaded.data.id !== input.changeId) {
      return {
        ok: false,
        error: `Archive bundle identity mismatch: expected ${input.changeId}, got ${loaded.data.id}.`,
      };
    }

    const currentGate = loaded.data.gates?.release;
    if (
      loaded.data.status === "archived" &&
      currentGate?.status === "done" &&
      loaded.data.phase9_status?.status === "done" &&
      loaded.data.lifecycleState === "archived"
    ) {
      if (input.skipTerminalRefresh)
        return {
          ok: true,
          gate: currentGate,
          alreadyDone: true,
        };
      try {
        const writeResult = await refreshArchiveBundleProjectionsUnderLock({
          change: loaded.data,
          archivePath: input.existingBundlePath,
        });
        if (writeResult.terminalSummaryDegradation) {
          return {
            ok: false,
            error: writeResult.terminalSummaryDegradation.reason,
          };
        }
      } catch (error) {
        return {
          ok: false,
          error: formatArchiveBundleRefreshError(error),
        };
      }
      return {
        ok: true,
        gate: currentGate,
        alreadyDone: true,
        recoveryMutation: true,
      };
    }

    const completedAt = new Date().toISOString();
    const completion: GateCompletion = {
      status: "done",
      completed_at: completedAt,
      completed_by: "adv-archive",
      approval_evidence: evidence,
    };
    const payload = {
      changeId: input.changeId,
      releaseEvidence: evidence,
      phase9Status: "done",
      lifecycleState: "archived",
    };
    const payloadHash = canonicalSha256(payload);
    const outcome = await commitChangeProjection({
      changesDir,
      changeId: bundleId,
      operationId: `archive-release-recovery:${input.changeId}:${payloadHash}`,
      payloadHash,
      authority: {
        kind: "recovery",
        reason: "reconcile archived release and Phase 9 projection",
        evidence,
      },
      mutationKind: "archive_release_recovery",
      payload,
      mutateLatest: (latest) => {
        if (latest.id !== input.changeId) {
          throw new Error(
            `Archive bundle identity mismatch: expected ${input.changeId}, got ${latest.id}.`,
          );
        }
        return {
          ...latest,
          status: "archived",
          lifecycleState: "archived",
          gates: {
            ...(latest.gates ?? {}),
            release:
              latest.gates?.release?.status === "done"
                ? latest.gates.release
                : completion,
          },
          phase9_status: preservePhase9Evidence(latest.phase9_status, {
            status: "done",
            startedAt: latest.phase9_status?.startedAt ?? completedAt,
            completedAt,
            changeTipSha: input.finalization.changeTipSha,
            preArchiveTipSha: input.finalization.preArchiveTipSha,
            repo: input.finalization.repo,
            prNumber: input.finalization.prNumber,
            prUrl: input.finalization.prUrl,
            route: input.finalization.route,
            prHeadSha: input.finalization.prHeadSha,
            defaultBranchSha: input.finalization.defaultBranchSha,
            ...(input.finalization.mergeCommitSha
              ? { mergeCommitSha: input.finalization.mergeCommitSha }
              : {}),
          }),
        };
      },
      verify: ({ readback }) =>
        readback.id === input.changeId &&
        readback.status === "archived" &&
        readback.lifecycleState === "archived" &&
        readback.gates?.release?.status === "done" &&
        readback.phase9_status?.status === "done",
      afterCommit: async ({ readback }) => {
        try {
          const writeResult = await refreshArchiveBundleProjectionsUnderLock({
            change: readback,
            archivePath: input.existingBundlePath,
          });
          return writeResult.terminalSummaryDegradation
            ? {
                ok: false,
                error: writeResult.terminalSummaryDegradation.reason,
              }
            : { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: formatArchiveBundleRefreshError(error),
          };
        }
      },
    });

    if (outcome.kind !== "committed") {
      return { ok: false, error: getProjectionCommitError(outcome) };
    }
    const gate = outcome.readback.gates?.release;
    if (!gate || gate.status !== "done") {
      return {
        ok: false,
        error: "Archived bundle release gate readback was not complete.",
      };
    }
    return {
      ok: true,
      gate,
      alreadyDone: outcome.idempotent === true,
      recoveryMutation: true,
    };
  });
}

export async function completeMergedArchiveReplay(input: {
  store: Store;
  changeId: string;
  finalization: ShippedFinalization;
  existingBundlePath: string;
}): Promise<ArchiveReleaseGateResult> {
  return completeArchivedBundleRelease({
    store: input.store,
    changeId: input.changeId,
    finalization: input.finalization,
    existingBundlePath: input.existingBundlePath,
    skipTerminalRefresh: true,
  });
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
      code?: string;
      projectionFailureType?: string;
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
  if (!loaded.success)
    return {
      ok: false,
      error: loaded.error,
      code: "CHANGE_PROJECTION_LOAD_FAILED",
      projectionFailureType: loaded.type,
    };
  if (
    input.bundlePath &&
    loaded.data !== null &&
    loaded.data.id !== input.changeId
  )
    return {
      ok: false,
      error: `Archive bundle identity mismatch: expected ${input.changeId}, got ${loaded.data.id}.`,
    };
  const gate = loaded.data?.gates?.release;
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
  const currentProjection = await loadChange(
    input.store.paths.changes,
    input.changeId,
  );
  if (
    currentProjection.success &&
    currentProjection.data === null &&
    input.existingBundlePath !== undefined
  ) {
    return completeArchivedBundleRelease({
      store: input.store,
      changeId: input.changeId,
      finalization: input.finalization,
      existingBundlePath: input.existingBundlePath,
    });
  }
  if (!currentProjection.success) {
    return {
      ok: false,
      error: currentProjection.error,
      code: "CHANGE_PROJECTION_LOAD_FAILED",
      projectionFailureType: currentProjection.type,
    };
  }
  if (!currentProjection.data)
    return {
      ok: false,
      error: `Change projection ${input.changeId} was not found.`,
      code: "CHANGE_PROJECTION_LOAD_FAILED",
      projectionFailureType: "not_found",
    };
  const current = currentProjection.data?.gates?.release;
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
