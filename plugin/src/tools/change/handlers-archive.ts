/** Disk-backed archive and origin-repair handlers. */
import { z } from "zod";
import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "fs/promises";
import { basename, join, relative, resolve, sep } from "path";
import { GATE_ORDER, type Change, type ProjectConfig } from "../../types";
import type { Store } from "../../storage/store";
import { loadAllSpecs, removeChangeDir } from "../../storage/json";
import { loadChange } from "../../storage/change-projection-reader";
import { validateChange } from "../../validator";
import { advWorktreeDelete } from "../worktree";
import { initStateDb as initWorktreeStateDb } from "../worktree/state";
import { loadValidationContext } from "./create-clarify";
import {
  getArchiveTaskPreflightError,
  resolveArchiveGateState,
  getArchiveGatePreflightError,
  buildReleaseCompletionEvidence,
  buildPendingMergePhase9Status,
  preservePhase9Evidence,
  reconcileArchivedBundleRetry,
  buildFailedPhase9Classification,
  recordPhase9Status,
  projectEpicTerminalSummaryAfterArchive,
  detectMergedArchiveReplay,
  completeMergedArchiveReplay,
  verifyExistingBundleIdentity,
  verifyReleaseEvidenceFromMain,
  type ArchiveReleaseGateResult,
  verifyReleaseGateDurableForArchive,
  completeReleaseGateAfterFinalization,
} from "./archive-gate";
import {
  loadSpecsMap,
  closeLinkedIssue,
  type CloseLinkedIssueResult,
} from "./recovery";
import {
  getPluginBundleDistDir,
  getPluginBundleReleasePreflightError,
} from "../../plugin-bundle-manifest";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
  refreshArchiveBundleProjectionUnderLock,
} from "../../archive/archive";
import { withArchiveProjectionLock } from "../../archive/projection-lock";
import {
  readProjectionManifest,
  verifyProjectionAtGitCommit,
  projectionFailureRoutesToReconcile,
} from "../../archive/projection-proof";
import { canonicalSha256 } from "../../archive/projection";
import { formatToolOutput } from "../../utils/tool-output";
import {
  withTargetPathStore,
  appendTargetProjectContextOutput,
} from "../target-project";
import {
  isRequiredOpsFollowupLink,
  overlayOpsResolutionsForRead,
  reconcileOpsFollowupLinks,
  resolveRequiredOpsLinks,
} from "../ops-followup-reconciliation";
import {
  detectArchiveMode,
  deleteChangeBranch,
  finalizeRelease,
  validateChangeWorktree,
  validateArchiveDeltaRepairWorktree,
  type GitFinalizeOutcome,
  type ArchiveDeltaRepairValidation,
  type DeleteChangeBranchResult,
} from "../archive-helpers/git-finalize";
import { logger } from "./helpers";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { execFileGitAsync } from "../../utils/git-binary";
import {
  WorktreeDeletionArchivePathSchema,
  type WorktreeDeletionArchivePath,
  type WorktreeDeletionArchiveRecovery,
} from "../worktree/deletion-contracts";
import { parseGitNameStatusZ } from "../worktree/porcelain-parser";

function outputSpecs(archiveResult: {
  specsUpdated: Array<{
    capability: string;
    originalVersion: string;
    newVersion: string;
    deltaResults: unknown[];
  }>;
}) {
  return archiveResult.specsUpdated.map((spec) => ({
    capability: spec.capability,
    version: `${spec.originalVersion} → ${spec.newVersion}`,
    deltas: spec.deltaResults.length,
  }));
}

function getArchiveDeltaRepairApprovalBlockers(
  gates: Change["gates"],
): string[] {
  if (!gates) return [...GATE_ORDER];
  return GATE_ORDER.filter((gateId) => {
    const gate = gates[gateId];
    const approval = gate.approval_evidence?.trim();
    const recovery = gate.recovery_audit?.evidence?.trim();
    return gate.status !== "done" || (!approval && !recovery);
  });
}

function isClosedLifecycle(change: Change): boolean {
  return change.status === "closed" || change.lifecycleState === "closed";
}

function hasPriorPhase9ArchiveEvidence(change: Change): boolean {
  const status = change.phase9_status?.status;
  return status === "failed" || status === "pending_merge";
}

type ArchiveCleanupDisposition =
  | {
      status: "deleted";
      branch: string;
      path: string;
    }
  | {
      status: "already_absent";
      branch: string;
      evidence: { classification: string; blocker: string };
    }
  | {
      status: "retained";
      branch: string;
      path?: string;
      evidence: { classification: string; blocker: string };
    };

type CompleteShippedChangeInput = {
  store: Store;
  change: Change;
  changeId: string;
  archiveMode: "direct" | "pr";
  archivePath: string;
  trackedBundlePath?: string;
  archivedAt?: string;
  finalization: GitFinalizeOutcome;
  releaseGateCompletion?: Extract<ArchiveReleaseGateResult, { ok: true }>;
  worktreePath?: string;
  sourceBranch?: string;
  existingBundlePath?: string;
  noCloseIssue?: boolean;
  terminalRefreshCompleted?: boolean;
};

type CompleteShippedChangeResult =
  | {
      ok: true;
      change: Change;
      cleanup: ArchiveCleanupDisposition;
      errors: string[];
      issueClosure?: CloseLinkedIssueResult;
      branchCleanup?: DeleteChangeBranchResult;
    }
  | { ok: false; error: string };

function boundedCleanupEvidence(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function hasLinkedIssue(change: Change): boolean {
  const issueNumber = change.origin?.issue_number;
  return (
    typeof issueNumber === "number" &&
    issueNumber > 0 &&
    (change.origin?.kind === "roadmap" || change.origin?.kind === "triage")
  );
}

async function listCanonicalFiles(
  root: string,
  prefix = "",
): Promise<Array<{ path: string; sha256: string }>> {
  const files: Array<{ path: string; sha256: string }> = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCanonicalFiles(root, relativePath)));
      continue;
    }
    if (!entry.isFile()) continue;
    const content = await readFile(join(root, relativePath));
    files.push({
      path: relativePath.split(sep).join("/"),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseCommittedArchivePaths(
  stdout: string,
): WorktreeDeletionArchivePath[] {
  return parseGitNameStatusZ(stdout).map(({ status, path }) =>
    WorktreeDeletionArchivePathSchema.parse({ status, path }),
  );
}

async function buildArchiveOwnedRecovery(input: {
  store: Store;
  changeId: string;
  worktreePath: string;
  branch: string;
  archivePath: string;
  trackedBundlePath?: string;
  finalization: GitFinalizeOutcome;
  terminalChange: Change;
}): Promise<WorktreeDeletionArchiveRecovery | undefined> {
  const {
    worktreePath,
    branch,
    archivePath,
    trackedBundlePath,
    finalization,
    terminalChange,
  } = input;
  const trackedRoot = relative(worktreePath, trackedBundlePath ?? archivePath);
  const normalizedRoot = trackedRoot.split(sep).join("/").replace(/\/$/, "");
  const bundleId = basename(normalizedRoot);
  const terminalStatus =
    terminalChange.status === "archived" &&
    terminalChange.lifecycleState === "archived" &&
    terminalChange.phase9_status?.status === "done"
      ? "archived"
      : terminalChange.status === "closed" &&
          terminalChange.lifecycleState === "closed"
        ? "closed"
        : undefined;
  if (
    !normalizedRoot.startsWith(".adv/archive/") ||
    !bundleId ||
    basename(archivePath) !== bundleId ||
    terminalChange.id !== input.changeId ||
    !terminalStatus
  )
    return undefined;

  const prNumber = finalization.prNumber;
  const prHeadOid = finalization.prHeadSha;
  const mergeCommitOid =
    finalization.mergeCommitSha ?? finalization.releasedCommitSha;
  const defaultBranchSha = finalization.defaultBranchSha;
  const repository = resolve(input.store.paths.root);
  const prRepository = finalization.repo;
  if (
    !prNumber ||
    !prHeadOid ||
    !mergeCommitOid ||
    !defaultBranchSha ||
    !prRepository ||
    resolve(finalization.repoRoot) !== repository ||
    !finalization.defaultBranch
  )
    return undefined;

  try {
    const [{ stdout: localHead }, canonicalFiles, { stdout: diff }] =
      await Promise.all([
        execFileGitAsync(
          ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`],
          {
            cwd: worktreePath,
          },
        ),
        listCanonicalFiles(archivePath),
        execFileGitAsync(
          ["diff", "--name-status", "-z", `${prHeadOid}..refs/heads/${branch}`],
          {
            cwd: worktreePath,
          },
        ),
      ]);
    const changedPaths = parseCommittedArchivePaths(diff);
    const allowedRoot = `.adv/archive/${bundleId}`;
    if (
      !changedPaths.length ||
      changedPaths.some(
        (entry) =>
          !["A", "M"].includes(entry.status) ||
          !entry.path.startsWith(`${allowedRoot}/`),
      )
    )
      return undefined;
    const trackedCanonicalFiles = canonicalFiles.map((file) => ({
      path: `${allowedRoot}/${file.path}`,
      sha256: file.sha256,
    }));
    const canonicalPathSet = new Set(
      trackedCanonicalFiles.map((file) => file.path),
    );
    if (changedPaths.some((entry) => !canonicalPathSet.has(entry.path)))
      return undefined;
    await execFileGitAsync(
      ["merge-base", "--is-ancestor", prHeadOid, localHead.trim()],
      { cwd: worktreePath },
    );
    const canonicalIdentity = canonicalSha256({
      bundleId,
      canonicalFiles: trackedCanonicalFiles,
    });
    return {
      changeId: input.changeId,
      repository,
      branch,
      worktree: worktreePath,
      localHead: localHead.trim(),
      prNumber,
      prRepository,
      prHeadOid,
      mergeCommitOid,
      defaultBranch: finalization.defaultBranch,
      defaultBranchSha,
      ancestry: "pr_head_ancestor_of_local_head",
      bundleId,
      canonicalBundlePath: archivePath,
      changedPaths,
      canonicalFiles: trackedCanonicalFiles,
      canonicalIdentity,
      allowedRoot,
      clean: true,
      locked: false,
      cwd: process.cwd(),
      cwdInsideWorktree: false,
      inUse: false,
      terminal: {
        changeId: input.changeId,
        status: terminalStatus,
        evidence: `durable terminal status: ${terminalStatus}`,
      },
    };
  } catch {
    return undefined;
  }
}

async function cleanupShippedChangeWorktree(input: {
  store: Store;
  changeId: string;
  worktreePath?: string;
  branch: string;
  archivePath: string;
  trackedBundlePath?: string;
  finalization: GitFinalizeOutcome;
  terminalChange: Change;
}): Promise<ArchiveCleanupDisposition> {
  const { branch, worktreePath } = input;
  if (!worktreePath)
    return {
      status: "retained",
      branch,
      evidence: {
        classification: "identity_unproven",
        blocker: "An exact worktree path was not provided.",
      },
    };
  try {
    const archiveRecovery = await buildArchiveOwnedRecovery({
      ...input,
      branch,
      worktreePath,
    });
    const deletionDeps = {
      projectRoot: input.store.paths.root,
      database: await initWorktreeStateDb(input.store.paths.root),
      log: logger,
      store: input.store,
      worktreePath,
      ...(archiveRecovery ? { archiveRecovery } : {}),
    };
    const deletionPlan = await advWorktreeDelete(
      branch,
      { force: false, dryRun: true },
      deletionDeps,
    );
    if (!deletionPlan.ok) {
      if (deletionPlan.error === "WORKTREE_NOT_FOUND")
        return {
          status: "already_absent",
          branch,
          evidence: {
            classification: deletionPlan.error,
            blocker: "Git found no worktree for the exact branch.",
          },
        };
      return {
        status: "retained",
        branch,
        evidence: {
          classification: deletionPlan.error,
          blocker: boundedCleanupEvidence(
            "reason" in deletionPlan
              ? deletionPlan.reason
              : "Deletion plan refused.",
          ),
        },
      };
    }
    if (deletionPlan.path !== worktreePath || !deletionPlan.planToken)
      return {
        status: "retained",
        branch,
        path: deletionPlan.path,
        evidence: {
          classification: "worktree_identity_mismatch",
          blocker: `Git planned ${deletionPlan.path}, not the proven ${worktreePath}.`,
        },
      };
    const deletion = await advWorktreeDelete(
      branch,
      {
        force: false,
        planToken: deletionPlan.planToken,
        approvalEvidence: `archive sign-off and release finalization approved change ${input.changeId}`,
      },
      deletionDeps,
    );
    if (
      deletion.ok &&
      deletion.status === "deleted" &&
      deletion.path === worktreePath
    )
      return { status: "deleted", branch, path: deletion.path };
    if (deletion.ok)
      return {
        status: "retained",
        branch,
        path: deletion.path,
        evidence: {
          classification: "worktree_identity_mismatch",
          blocker: `Deletion returned ${deletion.path} with status ${deletion.status ?? "unknown"}.`,
        },
      };
    if (
      deletion.error === "ALREADY_ABSENT" ||
      deletion.error === "WORKTREE_NOT_FOUND"
    )
      return {
        status: "already_absent",
        branch,
        evidence: {
          classification: deletion.error,
          blocker: "The exact worktree was absent when deletion ran.",
        },
      };
    return {
      status: "retained",
      branch,
      path: "path" in deletion ? deletion.path : worktreePath,
      evidence: {
        classification: deletion.error,
        blocker: boundedCleanupEvidence(
          "reason" in deletion ? deletion.reason : "Deletion was refused.",
        ),
      },
    };
  } catch (error) {
    return {
      status: "retained",
      branch,
      path: worktreePath,
      evidence: {
        classification: "cleanup_exception",
        blocker: boundedCleanupEvidence(error),
      },
    };
  }
}

export async function completeShippedChange(
  input: CompleteShippedChangeInput,
): Promise<CompleteShippedChangeResult> {
  if (input.finalization.status !== "shipped")
    return {
      ok: false,
      error: `Shipped completion requires shipped finalization, got ${input.finalization.status}.`,
    };

  const archivedAt = input.archivedAt ?? new Date().toISOString();
  const terminalAlreadyCommitted =
    input.change.status === "archived" &&
    input.change.lifecycleState === "archived" &&
    input.change.phase9_status?.status === "done" &&
    input.change.gates?.release?.status === "done";
  const branch = input.sourceBranch ?? `change/${input.changeId}`;
  if (terminalAlreadyCommitted && input.terminalRefreshCompleted) {
    return {
      ok: true,
      change: input.change,
      cleanup: {
        status: "retained",
        branch,
        ...(input.worktreePath ? { path: input.worktreePath } : {}),
        evidence: {
          classification: "terminal_replay_cleanup_not_rechecked",
          blocker:
            "Terminal completion already ran, so replay did not repeat cleanup or infer absence.",
        },
      },
      errors: [],
    };
  }
  let terminalChange = input.change;
  if (!terminalAlreadyCommitted) {
    const outcome = await coordinateChangeMutation<Change>({
      authority: {
        reason: "archive shipped change",
        evidence: buildReleaseCompletionEvidence(input.finalization),
      },
      changesDir: input.store.paths.changes,
      intent: {
        changeId: input.changeId,
        mutationKind: "archive_transition",
        mutateLatestProjection: (latest) => ({
          ...latest,
          status: "archived",
          lifecycleState: "archived",
          ...(input.change.archive_projection_proof
            ? {
                archive_projection_proof: input.change.archive_projection_proof,
              }
            : {}),
          gates: {
            ...(latest.gates ?? {}),
            ...(input.releaseGateCompletion
              ? { release: input.releaseGateCompletion.gate }
              : {}),
          },
          phase9_status: preservePhase9Evidence(latest.phase9_status, {
            status: "done",
            startedAt: latest.phase9_status?.startedAt ?? archivedAt,
            completedAt: archivedAt,
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
        }),
        verifyProjection: (readback) =>
          readback.status === "archived" &&
          readback.lifecycleState === "archived" &&
          readback.phase9_status?.status === "done",
      },
    });
    if (outcome.kind !== "verified")
      return {
        ok: false,
        error:
          outcome.kind === "unverified"
            ? outcome.reason
            : "Archive status transition was not verified.",
      };
    terminalChange = outcome.value;
  }

  const errors: string[] = [];
  if (!input.terminalRefreshCompleted) {
    try {
      const refreshResults = await withArchiveProjectionLock(
        input.store.paths.root,
        async () => {
          return [
            await refreshArchiveBundleProjectionUnderLock({
              change: terminalChange,
              archivePath: input.archivePath,
              archivedAt,
            }),
          ];
        },
      );
      const degradedRefresh = refreshResults.find(
        (result) => result.terminalSummaryDegradation,
      );
      if (degradedRefresh?.terminalSummaryDegradation)
        return {
          ok: false,
          error: degradedRefresh.terminalSummaryDegradation.reason,
        };
    } catch (error) {
      return { ok: false, error: boundedCleanupEvidence(error) };
    }
  }

  const epicProjection = await projectEpicTerminalSummaryAfterArchive({
    store: input.store,
    change: terminalChange,
    completedAt: archivedAt,
  });
  if (epicProjection.status === "warning")
    errors.push(`Epic terminal projection warning: ${epicProjection.error}`);

  let issueClosure: CloseLinkedIssueResult | undefined;
  if (hasLinkedIssue(terminalChange)) {
    issueClosure = await closeLinkedIssue({
      change: terminalChange,
      store: input.store,
      noCloseIssue: input.noCloseIssue,
      existingBundlePath: input.existingBundlePath,
      worktreePath: input.worktreePath,
    });
    if (issueClosure.issue_closure_error)
      errors.push(
        `Issue closure warning: ${issueClosure.issue_closure_error.stderr.slice(0, 500)}`,
      );
  }

  const cleanup = await cleanupShippedChangeWorktree({
    store: input.store,
    changeId: input.changeId,
    worktreePath: input.worktreePath,
    branch,
    archivePath: input.archivePath,
    trackedBundlePath: input.trackedBundlePath,
    finalization: input.finalization,
    terminalChange,
  });
  if (cleanup.status === "retained")
    errors.push(
      `Targeted worktree cleanup retained: ${cleanup.evidence.blocker}`,
    );

  try {
    await removeChangeDir(input.store.paths.changes, input.changeId);
  } catch (error) {
    errors.push(`Source cleanup warning: ${boundedCleanupEvidence(error)}`);
  }

  let branchCleanup: DeleteChangeBranchResult | undefined;
  if (
    input.finalization.repoRoot &&
    input.finalization.route !== "pr_auto_merge" &&
    input.finalization.route !== "pr_manual" &&
    input.finalization.route !== "merge_queue" &&
    !input.finalization.prNumber &&
    input.archiveMode === "direct" &&
    (cleanup.status === "deleted" || cleanup.status === "already_absent") &&
    !input.sourceBranch
  ) {
    try {
      branchCleanup = deleteChangeBranch(
        input.finalization.repoRoot,
        input.changeId,
      );
      if (branchCleanup.error)
        errors.push(`Branch cleanup warning: ${branchCleanup.error}`);
    } catch (error) {
      errors.push(`Branch cleanup warning: ${boundedCleanupEvidence(error)}`);
    }
  }

  return {
    ok: true,
    change: terminalChange,
    cleanup,
    errors,
    issueClosure,
    ...(branchCleanup ? { branchCleanup } : {}),
  };
}

export const advChangeArchiveHandler = async (
  {
    changeId,
    dryRun,
    worktreePath,
    noCloseIssue,
    phase9,
    prTitleType,
    target_path,
    target_confirmed,
    confirmationEvidence,
  }: {
    changeId: string;
    dryRun?: boolean;
    worktreePath?: string;
    noCloseIssue?: boolean;
    closeIssue?: boolean;
    phase9?: "run" | "skip";
    prTitleType?:
      | "feat"
      | "fix"
      | "perf"
      | "chore"
      | "docs"
      | "refactor"
      | "test"
      | "build"
      | "ci"
      | "style"
      | "revert";
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
  store: Store,
) => {
  const runArchive = async (activeStore: Store): Promise<string> => {
    const bundlePreflight = await getPluginBundleReleasePreflightError(
      getPluginBundleDistDir(),
    );
    if (bundlePreflight)
      return formatToolOutput({ success: false, changeId, ...bundlePreflight });
    const loaded = await activeStore.changes.get(changeId);
    if (!loaded.success) return formatToolOutput({ error: loaded.error });
    if (!loaded.data)
      return formatToolOutput({ error: `Change not found: ${changeId}` });
    let change = loaded.data;

    const requiredLinks = (change.ops_followup_links ?? []).filter(
      isRequiredOpsFollowupLink,
    );
    if (requiredLinks.length > 0) {
      try {
        if (dryRun) {
          const { resolutionByLinkId } = await resolveRequiredOpsLinks({
            parent: change,
            store: activeStore,
          });
          change = overlayOpsResolutionsForRead(change, resolutionByLinkId);
        } else {
          change = (
            await reconcileOpsFollowupLinks({
              parent: change,
              store: activeStore,
            })
          ).parent;
        }
      } catch (error) {
        return formatToolOutput({
          success: false,
          error: `Cannot archive: required ops follow-up obligations could not be reconciled (${error instanceof Error ? error.message : String(error)})`,
          changeId,
          code: "OPS_FOLLOWUP_RECONCILIATION_UNAVAILABLE",
        });
      }
    }
    const unresolvedLinks = (change.ops_followup_links ?? []).filter(
      (link) =>
        isRequiredOpsFollowupLink(link) &&
        link.resolution?.status !== "complete",
    );
    const openOpsObligations = (change.ops_followup_links ?? [])
      .filter((link) => link.resolution?.status !== "complete")
      .map((link) => link.id);
    const openOpsObligationsPayload =
      openOpsObligations.length > 0 ? { openOpsObligations } : {};
    if (unresolvedLinks.length > 0)
      return formatToolOutput({
        success: false,
        error: "Cannot archive: unresolved required ops follow-up obligations",
        changeId,
        code: "OPS_FOLLOWUP_ARCHIVE_BLOCKED",
        requirement: "rq-releaseFinalization01",
        readinessBlockers: unresolvedLinks.map((link) => ({
          code: "OPS_FOLLOWUP_ARCHIVE_BLOCKED",
          gateId: "release",
          message: `Required ops follow-up ${link.id} is not complete.`,
          remediation: "Resolve the required ops follow-up before archiving.",
        })),
        ...openOpsObligationsPayload,
      });

    const taskPreflight = getArchiveTaskPreflightError(change);
    if (taskPreflight) return taskPreflight;
    const gateState = await resolveArchiveGateState(
      activeStore,
      changeId,
      change,
    );
    const gatePreflight = getArchiveGatePreflightError(
      changeId,
      gateState,
      phase9 !== "skip",
      null,
    );
    if (gatePreflight) return gatePreflight;
    const { archiveMode, autoPush } = detectArchiveMode(
      activeStore.config ?? {},
    );
    let skipFinalization: GitFinalizeOutcome | undefined;
    if (!dryRun && phase9 === "skip") {
      const release = verifyReleaseEvidenceFromMain({
        store: activeStore,
        changeId,
        archiveMode,
        change,
      });
      if (release.status === "blocked")
        return formatToolOutput({
          success: false,
          error: `Phase 9 skip blocked: ${release.blocked?.reason}`,
          requirement: "rq-releaseFinalization01",
          changeId,
          remediation: release.blocked?.remediation,
          details: release.blocked?.details,
          finalization: release,
        });
      skipFinalization = release;
    }

    let validationResult: Awaited<ReturnType<typeof validateChange>>;
    try {
      const context = await loadValidationContext(
        activeStore,
        changeId,
        change.title,
      );
      validationResult = await validateChange(change, {
        specs: context.specs,
        activeChanges: context.activeChanges,
        conflictInventory: context.conflictInventory,
        proposalText: context.proposalText,
        changedSpecFiles: context.changedSpecFiles,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return formatToolOutput({
        success: false,
        error: `Archive blocked: validation could not run: ${message}`,
        validationErrors: [{ code: "VALIDATION_CONTEXT_FAILED", message }],
        changeId,
      });
    }
    if (validationResult.errors.length > 0 || !validationResult.passed)
      return formatToolOutput({
        success: false,
        error:
          validationResult.errors.length > 0
            ? `Archive blocked: ${validationResult.errors.length} validation error(s). Fix errors and retry.`
            : "Archive blocked: validation could not conclude clean. Fix the conflict inventory and retry.",
        validationErrors: validationResult.errors.map((error) => ({
          code: error.code,
          message: error.message,
          path: error.path,
        })),
        authorityDiagnostics: validationResult.authorityDiagnostics,
        changeId,
      });
    const proofErrors = getArchiveContractProofErrors(change);
    if (proofErrors.length > 0)
      return formatToolOutput({
        error: `Archive blocked: ${proofErrors.length} contract proof error(s). Fix proof and retry.`,
        contractProofErrors: proofErrors,
        changeId,
      });

    const mergedReplay = await detectMergedArchiveReplay({
      store: activeStore,
      changeId,
      archiveMode,
      change,
    });
    if (mergedReplay.kind === "verified_merged_replay") {
      if (dryRun)
        return formatToolOutput({
          success: true,
          dryRun: true,
          changeId,
          mergedReplay: true,
          noOp: false,
          canonicalCompletionPending: true,
          archivePath: mergedReplay.existingBundlePath,
          finalization: mergedReplay.finalization,
          cleanup: {
            status: "retained",
            branch: `change/${changeId}`,
            ...(worktreePath ? { path: worktreePath } : {}),
            evidence: {
              classification: "dry_run_cleanup_deferred",
              blocker:
                "Cleanup planning follows the canonical terminal transition, which dry-run does not mutate.",
            },
          },
          message:
            "Merged archive replay is proven; canonical completion and cleanup remain pending while tracked files stay unchanged.",
        });
      const completion = await completeMergedArchiveReplay({
        store: activeStore,
        changeId,
        finalization: mergedReplay.finalization,
        existingBundlePath: mergedReplay.existingBundlePath,
      });
      if (!completion.ok)
        return formatToolOutput({
          success: false,
          error: `Merged archive replay completion blocked: ${completion.error}`,
          requirement: "rq-archiveTerminalDurability01.7",
          changeId,
          archivePath: mergedReplay.existingBundlePath,
          finalization: mergedReplay.finalization,
        });
      const shippedCompletion = await completeShippedChange({
        store: activeStore,
        change,
        changeId,
        archiveMode,
        archivePath: mergedReplay.existingBundlePath,
        trackedBundlePath: worktreePath
          ? ((await findArchiveBundle(
              join(worktreePath, ".adv", "archive"),
              changeId,
            )) ?? undefined)
          : undefined,
        finalization: mergedReplay.finalization,
        releaseGateCompletion: completion,
        worktreePath,
        existingBundlePath: mergedReplay.existingBundlePath,
        noCloseIssue,
        terminalRefreshCompleted:
          completion.recoveryMutation === true || completion.alreadyDone,
      });
      if (!shippedCompletion.ok)
        return formatToolOutput({
          success: false,
          error: `Merged archive replay completion blocked: ${shippedCompletion.error}`,
          requirement: "rq-archiveTerminalDurability01.7",
          changeId,
          archivePath: mergedReplay.existingBundlePath,
          finalization: mergedReplay.finalization,
        });
      return formatToolOutput({
        success: true,
        changeId,
        mergedReplay: true,
        noOp: completion.alreadyDone,
        archivePath: mergedReplay.existingBundlePath,
        finalization: mergedReplay.finalization,
        releaseGate: completion.gate,
        releaseGateAlreadyDone: completion.alreadyDone,
        cleanup: shippedCompletion.cleanup,
        errors: shippedCompletion.errors,
        ...(shippedCompletion.branchCleanup
          ? { branchCleanup: shippedCompletion.branchCleanup }
          : {}),
        ...(shippedCompletion.issueClosure?.issue_closed.length
          ? { issue_closed: shippedCompletion.issueClosure.issue_closed }
          : {}),
        message:
          "Merged archive replay completed canonical terminal state without repeating tracked writers or finalization.",
        ...openOpsObligationsPayload,
      });
    }

    const inRepoBase = worktreePath ?? activeStore.paths.root;
    const inRepoArchive = join(inRepoBase, ".adv", "archive");
    const projectionSpecs = join(inRepoBase, ".adv", "specs");
    const projectionDocs = join(inRepoBase, "docs", "specs");
    const specs = worktreePath
      ? await loadAllSpecs(projectionSpecs)
      : await loadSpecsMap(activeStore);
    const archivePaths = {
      ...activeStore.paths,
      specs: projectionSpecs,
      docs: projectionDocs,
      inRepoArchive,
      ...(activeStore.config?.features?.wisdom_accumulation === false
        ? { wisdom: undefined }
        : {}),
    };
    const existingBundlePath = !dryRun
      ? await findArchiveBundle(archivePaths.archive, changeId)
      : null;
    const hasAcceptedDeltas = Object.values(change.deltas).some(
      (deltas) => deltas.length > 0,
    );
    let archiveDeltaRepair: ArchiveDeltaRepairValidation | undefined;
    if (
      !dryRun &&
      !worktreePath &&
      hasAcceptedDeltas &&
      !(change.status === "archived" && existingBundlePath)
    )
      return formatToolOutput({
        success: false,
        error:
          "Archive delta projection requires worktreePath; tracked specs and docs are never written through the main checkout.",
        requirement: "rq-archiveDeltaReconciliation01",
        changeId,
      });
    if (
      !dryRun &&
      !worktreePath &&
      phase9 !== "skip" &&
      existingBundlePath === null
    )
      return formatToolOutput({
        success: false,
        error:
          "Archive finalization requires worktreePath so archive artifacts are written to the change worktree before merge.",
        requirement: "rq-releaseFinalization01",
        changeId,
      });
    const isArchiveDeltaRepairCandidate =
      !dryRun && existingBundlePath && hasAcceptedDeltas;

    if (isArchiveDeltaRepairCandidate) {
      if (change.status === "archived") {
        const manifest = await readProjectionManifest(existingBundlePath);
        const release = verifyReleaseEvidenceFromMain({
          store: activeStore,
          changeId,
          archiveMode,
          change,
        });
        let projectionFailure: unknown;
        if (
          !manifest ||
          release.status !== "shipped" ||
          !release.releasedCommitSha
        ) {
          return formatToolOutput({
            success: false,
            error:
              "Archived retry cannot prove accepted delta projection; run approved archive delta reconciliation in a trusted repair worktree.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        } else {
          const proof = await verifyProjectionAtGitCommit({
            manifest,
            repo: release.repoRoot,
            releasedCommitSha: release.releasedCommitSha,
            manifestGitPath: `.adv/archive/${basename(existingBundlePath)}/spec-projection.json`,
            expectedChangeId: change.id,
            expectedDeltaSetSha256: canonicalSha256(change.deltas),
            expectedDeltaIdsByCapability: Object.fromEntries(
              Object.entries(change.deltas).map(([capability, deltas]) => [
                capability,
                deltas.map((delta) => delta.id),
              ]),
            ),
          });
          if (proof.ok) {
            return reconcileArchivedBundleRetry({
              store: activeStore,
              change,
              changeId,
              archiveMode,
              phase9,
              existingBundlePath,
              openOpsObligationsPayload,
              validationWarnings: validationResult.warnings,
            });
          }
          projectionFailure = proof;
          if (!projectionFailureRoutesToReconcile(proof.code))
            return formatToolOutput({
              success: false,
              error: `Archived retry projection proof failed: ${proof.code}: ${proof.message}`,
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
              archivePath: existingBundlePath,
              projectionFailure,
            });
        }

        if (phase9 !== "run")
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires phase9=run so the repaired projection is released and re-proven.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            projectionFailure,
          });
        const approvalBlockers = getArchiveDeltaRepairApprovalBlockers(
          gateState.effectiveGates,
        );
        if (approvalBlockers.length > 0)
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires durable sign-off and release approval evidence.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            approvalBlockers,
            projectionFailure,
          });
        if (!confirmationEvidence?.trim())
          return formatToolOutput({
            success: false,
            error:
              "Archive delta repair refused: explicit archived-delta repair approval evidence is required.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            projectionFailure,
          });
        if (!worktreePath)
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires an explicit trusted repair worktree.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            projectionFailure,
          });
        const repairValidation = validateArchiveDeltaRepairWorktree(
          worktreePath,
          changeId,
          activeStore.paths.root,
        );
        if (!repairValidation.valid)
          return formatToolOutput({
            success: false,
            error: "Archived delta repair refused before writes.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            repairValidation,
            projectionFailure,
          });
        archiveDeltaRepair = repairValidation;
      } else {
        if (isClosedLifecycle(change)) {
          return formatToolOutput({
            success: false,
            error:
              "Archive delta repair refused: lifecycle is closed, cancelled, or superseded.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        const identity = await verifyExistingBundleIdentity(
          existingBundlePath,
          change,
        );
        if (!identity.ok) {
          return formatToolOutput({
            success: false,
            error: `Archive delta repair refused: ${identity.reason}`,
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        if (!hasPriorPhase9ArchiveEvidence(change)) {
          return formatToolOutput({
            success: false,
            error:
              "Archive delta repair refused: no prior Phase 9 or archive attempt evidence.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        const approvalBlockers = getArchiveDeltaRepairApprovalBlockers(
          gateState.effectiveGates,
        );
        if (approvalBlockers.length > 0) {
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires durable sign-off and release approval evidence.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            approvalBlockers,
          });
        }
        if (!confirmationEvidence?.trim()) {
          return formatToolOutput({
            success: false,
            error:
              "Archive delta repair refused: explicit archived-delta repair approval evidence is required.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        if (phase9 !== "run") {
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires phase9=run so the repaired projection is released and re-proven.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        if (!worktreePath) {
          return formatToolOutput({
            success: false,
            error:
              "Archived delta repair requires an explicit trusted repair worktree.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
          });
        }
        const repairValidation = validateArchiveDeltaRepairWorktree(
          worktreePath,
          changeId,
          activeStore.paths.root,
        );
        if (!repairValidation.valid) {
          return formatToolOutput({
            success: false,
            error: "Archived delta repair refused before writes.",
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            repairValidation,
          });
        }
        archiveDeltaRepair = repairValidation;
      }
    }
    if (!dryRun && worktreePath && !archiveDeltaRepair) {
      const worktreeValidation = validateChangeWorktree(
        worktreePath,
        changeId,
        { requireCleanWorktree: true },
      );
      if (
        !worktreeValidation.valid ||
        worktreeValidation.repoRoot !== activeStore.paths.root
      )
        return formatToolOutput({
          success: false,
          error: "Archive finalization requires a trusted change worktree.",
          requirement: "rq-releaseFinalization01",
          changeId,
          remediation:
            worktreeValidation.error ??
            `Worktree belongs to ${worktreeValidation.repoRoot}, expected ${activeStore.paths.root}.`,
        });
    }
    // Bundle dominance can synthesize archived status from the surviving bundle.
    // A cleanly absent active projection therefore routes through bundle recovery
    // even when a legacy bundle still carries open or missing lifecycle state.
    if (
      !dryRun &&
      change.status === "archived" &&
      existingBundlePath &&
      !archiveDeltaRepair
    ) {
      const activeProjection = await loadChange(
        activeStore.paths.changes,
        changeId,
      );
      if (!activeProjection.success)
        return formatToolOutput({
          success: false,
          error: activeProjection.error,
          code: "CHANGE_PROJECTION_LOAD_FAILED",
          projectionFailureType: activeProjection.type,
          changeId,
        });
      if (
        activeProjection.data === null ||
        change.lifecycleState === "archived"
      ) {
        return reconcileArchivedBundleRetry({
          store: activeStore,
          change,
          changeId,
          archiveMode,
          phase9,
          existingBundlePath,
          openOpsObligationsPayload,
          validationWarnings: validationResult.warnings,
        });
      }
    }

    let archiveResult: import("../../archive/types").ArchiveOperationResult;
    if (existingBundlePath !== null) {
      let reconciledInRepoPath: string | undefined;
      if (
        !dryRun &&
        archivePaths.inRepoArchive &&
        (worktreePath || phase9 === "skip")
      ) {
        reconciledInRepoPath = await reconcileInRepoArchive(
          change,
          archivePaths.archive,
          archivePaths.inRepoArchive,
          archivePaths.changes
            ? join(archivePaths.changes, changeId)
            : undefined,
        );
      }
      // Every successful archive writes the durable bundle, including zero-delta
      // changes. Skipping this call would discard the archive record.
      archiveResult = await archiveChange({
        change,
        specs,
        paths: archivePaths,
        dryRun,
        productId: activeStore.productContext?.productId,
        reuseExistingBundlePath: existingBundlePath,
      });
      if (
        reconciledInRepoPath &&
        !archiveResult.commitPaths.includes(reconciledInRepoPath)
      ) {
        archiveResult.commitPaths.push(reconciledInRepoPath);
      }
    } else {
      archiveResult = await archiveChange({
        change,
        specs,
        paths: archivePaths,
        dryRun,
        productId: activeStore.productContext?.productId,
      });
    }
    if (!archiveResult.success)
      return formatToolOutput({
        success: false,
        changeId,
        archivePath: archiveResult.archivePath,
        errors: archiveResult.errors,
        ...(archiveResult.requirement
          ? { requirement: archiveResult.requirement }
          : {}),
      });

    const trackedBundlePath = archiveResult.commitPaths.find((path) =>
      relative(inRepoBase, path)
        .replaceAll("\\", "/")
        .startsWith(".adv/archive/"),
    );

    let finalization: GitFinalizeOutcome | undefined;
    let releaseGateCompletion:
      | Extract<ArchiveReleaseGateResult, { ok: true }>
      | undefined;
    if (!dryRun && phase9 !== "skip") {
      try {
        finalization = worktreePath
          ? await finalizeRelease({
              changeId,
              workdir: worktreePath,
              ...(archiveDeltaRepair?.repairBranch
                ? { sourceBranch: archiveDeltaRepair.repairBranch }
                : {}),
              expectedRepoRoot: activeStore.paths.root,
              archiveMode,
              autoPush,
              artifactPaths: (archiveResult.commitPaths ?? []).map((path) =>
                relative(worktreePath, path),
              ),
              changeTitle: change.title,
              prTitleType,
              prTitlePolicy: (activeStore.config as ProjectConfig | undefined)
                ?.archive?.pr_title_policy,
            })
          : verifyReleaseEvidenceFromMain({
              store: activeStore,
              changeId,
              archiveMode,
              change,
            });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordPhase9Status({
          store: activeStore,
          changeId,
          status: preservePhase9Evidence(change.phase9_status, {
            status: "failed",
            startedAt:
              change.phase9_status?.startedAt ?? new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: message,
          }),
        });
        return formatToolOutput({
          success: false,
          error: `Archive finalization failed: ${message}`,
          requirement: "rq-releaseFinalization01",
          changeId,
          archivePath: archiveResult.archivePath,
          phase9Failure: {
            status: "failed",
            error: message,
            recoverable: false,
            remediation:
              "Resolve the git error, then re-run adv_change_archive.",
          },
          ...openOpsObligationsPayload,
        });
      }
      if (finalization.status === "blocked")
        return formatToolOutput({
          success: false,
          error: `Archive finalization blocked: ${finalization.blocked?.reason}`,
          requirement: "rq-releaseFinalization01",
          remediation: finalization.blocked?.remediation,
          details: finalization.blocked?.details,
          ...buildFailedPhase9Classification({ change, finalization }),
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
          ...openOpsObligationsPayload,
        });
      if (finalization.status === "pending_merge") {
        await recordPhase9Status({
          store: activeStore,
          changeId,
          status: buildPendingMergePhase9Status({
            finalization,
            startedAt:
              change.phase9_status?.startedAt ?? new Date().toISOString(),
            previous: change.phase9_status,
          }),
        });
        return formatToolOutput({
          success: true,
          phase9: "pending_merge",
          finalization,
          archivePath: archiveResult.archivePath,
          specsUpdated: outputSpecs(archiveResult),
          ...openOpsObligationsPayload,
        });
      }
      const releaseResult = await completeReleaseGateAfterFinalization({
        store: activeStore,
        change,
        changeId,
        finalization,
        existingBundlePath: archiveResult.archivePath,
      });
      if (!releaseResult.ok)
        return formatToolOutput({
          success: false,
          error: `Archive release gate completion blocked: ${releaseResult.error}`,
          requirement: "rq-releaseFinalization01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
          ...openOpsObligationsPayload,
        });
      const proof = await verifyReleaseGateDurableForArchive({
        store: activeStore,
        changeId,
        evidence: buildReleaseCompletionEvidence(finalization),
        finalization,
        ...(releaseResult.recoveryMutation
          ? { bundlePath: archiveResult.archivePath }
          : {}),
        change,
      });
      if (!proof.ok)
        return formatToolOutput({
          success: false,
          error: `Archive durable release gate proof blocked: ${proof.error}`,
          requirement: "rq-releaseProjectionDurability01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
          ...(proof.code ? { code: proof.code } : {}),
          ...(proof.projectionFailureType
            ? { projectionFailureType: proof.projectionFailureType }
            : {}),
          ...openOpsObligationsPayload,
        });
      releaseGateCompletion = { ...releaseResult, gate: proof.gate };
      if (releaseResult.recoveryMutation)
        return reconcileArchivedBundleRetry({
          store: activeStore,
          change,
          changeId,
          archiveMode,
          phase9,
          existingBundlePath: archiveResult.archivePath,
          openOpsObligationsPayload,
          validationWarnings: validationResult.warnings,
        });
    }

    if (!dryRun && phase9 === "skip") finalization = skipFinalization;

    if (
      !dryRun &&
      archiveResult.projectionManifest &&
      finalization?.status === "shipped" &&
      Object.values(change.deltas).some((deltas) => deltas.length > 0)
    ) {
      const committedBundlePath = archiveResult.commitPaths.find((path) =>
        relative(inRepoBase, path)
          .replaceAll("\\", "/")
          .startsWith(".adv/archive/"),
      );
      if (!committedBundlePath || !finalization.releasedCommitSha)
        return formatToolOutput({
          success: false,
          error:
            "Archive projection proof requires a manifest and immutable released commit SHA.",
          requirement: "rq-archiveDeltaReconciliation01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
        });
      const projectionProof = await verifyProjectionAtGitCommit({
        manifest: archiveResult.projectionManifest,
        repo: finalization.repoRoot,
        releasedCommitSha: finalization.releasedCommitSha,
        manifestGitPath: `${relative(inRepoBase, committedBundlePath).replaceAll("\\", "/")}/spec-projection.json`,
        expectedChangeId: change.id,
        expectedDeltaSetSha256: canonicalSha256(change.deltas),
        expectedDeltaIdsByCapability: Object.fromEntries(
          Object.entries(change.deltas).map(([capability, deltas]) => [
            capability,
            deltas.map((delta) => delta.id),
          ]),
        ),
      });
      if (!projectionProof.ok)
        return formatToolOutput({
          success: false,
          error: `Archive released projection proof failed: ${projectionProof.code}: ${projectionProof.message}`,
          requirement: "rq-archiveDeltaReconciliation01",
          changeId,
          archivePath: archiveResult.archivePath,
          projectionFailure: projectionProof,
        });
      change.archive_projection_proof = {
        ...projectionProof.receipt,
        ...(archiveDeltaRepair
          ? {
              archive_delta_repair: {
                kind: "archive_delta_repair" as const,
                repair_branch:
                  archiveDeltaRepair.repairBranch ??
                  `repair/archive-${change.id}`,
                repair_head_sha:
                  finalization.changeTipSha ??
                  archiveDeltaRepair.repairHeadSha ??
                  "",
                default_branch: finalization.defaultBranch,
                default_branch_sha:
                  finalization.defaultBranchSha ??
                  finalization.releasedCommitSha,
                released_commit_sha: finalization.releasedCommitSha,
                delta_set_sha256: canonicalSha256(change.deltas),
                delta_ids_by_capability: Object.fromEntries(
                  Object.entries(change.deltas).map(([capability, deltas]) => [
                    capability,
                    deltas.map((delta) => delta.id),
                  ]),
                ),
                release_proof: buildReleaseCompletionEvidence(finalization),
              },
            }
          : {}),
      };
    }

    let shippedCompletion: CompleteShippedChangeResult | undefined;
    if (!dryRun && finalization?.status === "shipped") {
      shippedCompletion = await completeShippedChange({
        store: activeStore,
        change,
        changeId,
        archiveMode,
        archivePath: archiveResult.archivePath,
        trackedBundlePath,
        archivedAt: archiveResult.archivedAt,
        finalization,
        releaseGateCompletion,
        worktreePath,
        sourceBranch: archiveDeltaRepair?.repairBranch,
        existingBundlePath: existingBundlePath ?? undefined,
        noCloseIssue,
      });
      if (!shippedCompletion.ok)
        return formatToolOutput({
          success: false,
          error: `Archive shipped completion blocked: ${shippedCompletion.error}`,
          requirement: "rq-archiveTerminalDurability01.1",
          changeId,
          archivePath: archiveResult.archivePath,
        });
      archiveResult.errors.push(...shippedCompletion.errors);
    }
    const completed = shippedCompletion?.ok ? shippedCompletion : undefined;
    const issueClosure =
      completed?.issueClosure ??
      (dryRun && hasLinkedIssue(change)
        ? await closeLinkedIssue({
            change,
            store: activeStore,
            noCloseIssue,
            dryRun,
            existingBundlePath: existingBundlePath ?? undefined,
            worktreePath,
          })
        : { issue_closed: [] });
    return formatToolOutput({
      success: true,
      changeId,
      specsUpdated: outputSpecs(archiveResult),
      docsGenerated: archiveResult.docsGenerated,
      archivePath: archiveResult.archivePath,
      errors: archiveResult.errors,
      dryRun: dryRun ?? false,
      ...(issueClosure.issue_closed.length > 0
        ? { issue_closed: issueClosure.issue_closed }
        : {}),
      ...(finalization
        ? {
            finalization,
            continueFrom: {
              path: finalization.repoRoot,
              branch: finalization.defaultBranch,
            },
          }
        : {}),
      ...(archiveDeltaRepair
        ? {
            archiveDeltaRepair: {
              kind: "archive_delta_repair" as const,
              repairBranch: archiveDeltaRepair.repairBranch,
              repairHeadSha: finalization?.changeTipSha,
              defaultBranch: finalization?.defaultBranch,
              defaultBranchSha:
                finalization?.defaultBranchSha ??
                finalization?.releasedCommitSha,
              releasedCommitSha: finalization?.releasedCommitSha,
              releaseProof: finalization
                ? buildReleaseCompletionEvidence(finalization)
                : undefined,
            },
          }
        : {}),
      ...(releaseGateCompletion
        ? {
            releaseGate: releaseGateCompletion.gate,
            releaseGateAlreadyDone: releaseGateCompletion.alreadyDone,
          }
        : {}),
      ...(completed ? { cleanup: completed.cleanup } : {}),
      ...(completed?.branchCleanup
        ? { branchCleanup: completed.branchCleanup }
        : {}),
      ...openOpsObligationsPayload,
    });
  };
  if (target_path)
    return withTargetPathStore(
      {
        currentProjectPath: store.paths.root,
        target_path,
        stateRequirement: "authoritative",
        mutation: dryRun ? false : undefined,
        target_confirmed,
        confirmationEvidence,
      },
      async ({ context, store: targetStore }) =>
        appendTargetProjectContextOutput(
          await runArchive(targetStore),
          context,
        ),
    );
  return runArchive(store);
};

export const advArchivePurgeHandler = async (
  {
    changeId,
    includeDiskBundle,
    approvedByUser,
    approvalEvidence,
  }: {
    changeId: string;
    includeDiskBundle?: boolean;
    approvedByUser: true;
    approvalEvidence: string;
  },
  store: Store,
) => {
  if (approvedByUser !== true)
    return formatToolOutput({
      success: false,
      error: "approvedByUser must be true for archive purge",
      changeId,
    });
  const evidence = approvalEvidence?.trim() ?? "";
  if (!evidence)
    return formatToolOutput({
      success: false,
      error: "approvalEvidence is required for archive purge",
      changeId,
    });
  const result = await store.changes.get(changeId);
  if (!result.success)
    return formatToolOutput({ success: false, error: result.error });
  if (!result.data)
    return formatToolOutput({
      success: false,
      error: `Change not found: ${changeId}`,
      changeId,
    });
  if (result.data.status !== "archived")
    return formatToolOutput({
      success: false,
      error: `Archive purge refused: change ${changeId} is not archived (status: ${result.data.status}).`,
      changeId,
      currentStatus: result.data.status,
    });
  const archivedPath = await findArchiveBundle(store.paths.archive, changeId);
  if (includeDiskBundle) {
    try {
      if (archivedPath)
        await rm(archivedPath, { recursive: true, force: true });
      await removeChangeDir(store.paths.changes, changeId);
      await rm(join(store.paths.changes, `${changeId}.json`), { force: true });
    } catch (error) {
      return formatToolOutput({
        success: false,
        error: `Archived change disk bundle removal failed: ${error instanceof Error ? error.message : String(error)}`,
        changeId,
        bundleRemoved: false,
        archivedPath,
      });
    }
  }
  return formatToolOutput({
    success: true,
    changeId,
    bundleRemoved: includeDiskBundle === true,
    archivedPath,
    requirement: "rq-archivePurge01",
  });
};

export const archiveChangeTools = {
  adv_change_archive: {
    description: "Archive a completed change",
    args: {
      changeId: z.string(),
      dryRun: z.boolean().optional(),
      worktreePath: z.string().optional(),
      noCloseIssue: z.boolean().optional(),
      phase9: z.enum(["run", "skip"]).optional(),
      prTitleType: z.string().optional(),
      target_path: z.string().optional(),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    },
    execute: advChangeArchiveHandler,
  },
};
