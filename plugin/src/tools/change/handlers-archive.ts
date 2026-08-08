/** Disk-backed archive and origin-repair handlers. */
import { z } from "zod";
import { rm } from "fs/promises";
import { basename, join, relative } from "path";
import type { Change, ProjectConfig } from "../../types";
import type { Store } from "../../storage/store";
import { loadAllSpecs, removeChangeDir } from "../../storage/json";
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
  verifyReleaseEvidenceFromMain,
  type ArchiveReleaseGateResult,
  verifyReleaseGateDurableForArchive,
  completeReleaseGateAfterFinalization,
} from "./archive-gate";
import { loadSpecsMap, closeLinkedIssue } from "./recovery";
import {
  getPluginBundleDistDir,
  getPluginBundleReleasePreflightError,
} from "../../plugin-bundle-manifest";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
  readProjectionManifest,
  verifyProjectionAtGitCommit,
  canonicalSha256,
} from "../../archive";
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
  type GitFinalizeOutcome,
} from "../archive-helpers/git-finalize";
import { logger } from "./helpers";
import { coordinateChangeMutation } from "../change-mutation-coordinator";

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
    if (
      !dryRun &&
      !worktreePath &&
      Object.values(change.deltas).some((deltas) => deltas.length > 0)
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
    if (!dryRun && worktreePath) {
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
    if (!dryRun && change.status === "archived" && existingBundlePath) {
      if (Object.values(change.deltas).some((deltas) => deltas.length > 0)) {
        const manifest = await readProjectionManifest(existingBundlePath);
        const release = verifyReleaseEvidenceFromMain({
          store: activeStore,
          changeId,
          archiveMode,
          change,
        });
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
        }
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
        if (!proof.ok) {
          return formatToolOutput({
            success: false,
            error: `Archived retry projection proof failed: ${proof.code}: ${proof.message}`,
            requirement: "rq-archiveDeltaReconciliation01",
            changeId,
            archivePath: existingBundlePath,
            projectionFailure: proof,
          });
        }
      }
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
          archivePaths.inRepoArchive,
          archivePaths.changes
            ? join(archivePaths.changes, changeId)
            : undefined,
        );
      }
      archiveResult = Object.values(change.deltas).some(
        (deltas) => deltas.length > 0,
      )
        ? await archiveChange({
            change,
            specs,
            paths: archivePaths,
            dryRun,
            productId: activeStore.productContext?.productId,
            reuseExistingBundlePath: existingBundlePath,
          })
        : {
            success: true,
            changeId,
            specsUpdated: [],
            docsGenerated: [],
            commitPaths: reconciledInRepoPath ? [reconciledInRepoPath] : [],
            archivePath: existingBundlePath,
            errors: [],
            archivedAt: new Date().toISOString(),
          };
    } else {
      archiveResult = Object.values(change.deltas).some(
        (deltas) => deltas.length > 0,
      )
        ? await archiveChange({
            change,
            specs,
            paths: archivePaths,
            dryRun,
            productId: activeStore.productContext?.productId,
          })
        : {
            success: true,
            changeId,
            specsUpdated: [],
            docsGenerated: [],
            commitPaths: [],
            archivePath: join(archivePaths.archive, changeId),
            errors: [],
            archivedAt: new Date().toISOString(),
          };
    }
    if (!archiveResult.success)
      return formatToolOutput({
        success: false,
        changeId,
        archivePath: archiveResult.archivePath,
        errors: archiveResult.errors,
      });

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
          ...openOpsObligationsPayload,
        });
      releaseGateCompletion = { ...releaseResult, gate: proof.gate };
    }

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
      change.archive_projection_proof = projectionProof.receipt;
    }

    if (!dryRun) {
      const archivedAt = new Date().toISOString();
      const outcome = await coordinateChangeMutation<Change>({
        authority: {
          reason: "archive shipped change",
          evidence: finalization
            ? buildReleaseCompletionEvidence(finalization)
            : "archive gate and durable bundle proof",
        },
        changesDir: activeStore.paths.changes,
        intent: {
          changeId,
          mutationKind: "archive_transition",
          mutateLatestProjection: (latest) => ({
            ...latest,
            status: "archived",
            lifecycleState: "archived",
            ...(change.archive_projection_proof
              ? { archive_projection_proof: change.archive_projection_proof }
              : {}),
            ...(releaseGateCompletion
              ? {
                  gates: {
                    ...(latest.gates ?? {}),
                    release: releaseGateCompletion.gate,
                  },
                  phase9_status: preservePhase9Evidence(latest.phase9_status, {
                    status: "done",
                    startedAt: latest.phase9_status?.startedAt ?? archivedAt,
                    completedAt: archivedAt,
                    changeTipSha: finalization?.changeTipSha,
                    repo: finalization?.repo,
                    prNumber: finalization?.prNumber,
                    prUrl: finalization?.prUrl,
                    route: finalization?.route,
                    prHeadSha: finalization?.prHeadSha,
                    defaultBranchSha: finalization?.defaultBranchSha,
                    ...(finalization?.mergeCommitSha
                      ? { mergeCommitSha: finalization.mergeCommitSha }
                      : {}),
                  }),
                }
              : {}),
          }),
          verifyProjection: (readback) =>
            readback.status === "archived" &&
            readback.lifecycleState === "archived" &&
            (releaseGateCompletion === undefined ||
              (readback.gates?.release?.status === "done" &&
                readback.phase9_status?.status === "done")),
        },
      });
      if (outcome.kind !== "verified")
        return formatToolOutput({
          success: false,
          error:
            outcome.kind === "unverified"
              ? outcome.reason
              : "Archive status transition was not verified.",
          code: "ARCHIVE_MUTATION_OPERATOR_REQUIRED",
          changeId,
          archivePath: archiveResult.archivePath,
        });
      const epicProjection = await projectEpicTerminalSummaryAfterArchive({
        store: activeStore,
        change: outcome.value,
        completedAt: archivedAt,
      });
      if (epicProjection.status === "warning")
        archiveResult.errors.push(
          `Epic terminal projection warning: ${epicProjection.error}`,
        );
      let targetedWorktreeDeleteResult:
        | Awaited<ReturnType<typeof advWorktreeDelete>>
        | undefined;
      if (worktreePath) {
        try {
          const deletionDeps = {
            projectRoot: activeStore.paths.root,
            database: await initWorktreeStateDb(activeStore.paths.root),
            log: logger,
            store: activeStore,
            worktreePath,
          };
          const deletionPlan = await advWorktreeDelete(
            `change/${change.id}`,
            { force: false, dryRun: true },
            deletionDeps,
          );
          targetedWorktreeDeleteResult =
            deletionPlan.ok && deletionPlan.planToken
              ? await advWorktreeDelete(
                  `change/${change.id}`,
                  {
                    force: false,
                    planToken: deletionPlan.planToken,
                    approvalEvidence: `archive sign-off and release finalization approved change ${change.id}`,
                  },
                  deletionDeps,
                )
              : deletionPlan;
        } catch (error) {
          archiveResult.errors.push(
            `Targeted worktree cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      try {
        await removeChangeDir(activeStore.paths.changes, change.id);
      } catch (error) {
        archiveResult.errors.push(
          `Source cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (
        finalization?.status === "shipped" &&
        finalization.repoRoot &&
        finalization.route !== "pr_auto_merge" &&
        archiveMode === "direct" &&
        (targetedWorktreeDeleteResult?.ok ||
          targetedWorktreeDeleteResult?.error === "WORKTREE_NOT_FOUND")
      ) {
        try {
          deleteChangeBranch(finalization.repoRoot, change.id);
        } catch (error) {
          archiveResult.errors.push(
            `Branch cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    const issueClosure = await closeLinkedIssue({
      change,
      store: activeStore,
      noCloseIssue,
      dryRun,
      existingBundlePath: existingBundlePath ?? undefined,
      worktreePath,
    });
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
      ...(releaseGateCompletion
        ? {
            releaseGate: releaseGateCompletion.gate,
            releaseGateAlreadyDone: releaseGateCompletion.alreadyDone,
          }
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
  adv_archive_purge: {
    description: "Purge an archived change",
    args: {
      changeId: z.string(),
      includeDiskBundle: z.boolean().optional(),
      approvedByUser: z.literal(true),
      approvalEvidence: z.string(),
    },
    execute: advArchivePurgeHandler,
  },
};
