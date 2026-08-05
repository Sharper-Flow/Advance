/** Handler definitions for archive change tools. */
import { z } from "zod";
import { rm } from "fs/promises";
import { basename, join, relative } from "path";
import type { ChangeOrigin } from "../../types";
import {
  createDefaultGates,
  allGatesSatisfied,
  ChangeOriginKindSchema,
  type Change,
} from "../../types";
import type { Store } from "../../storage/store";
import type { ProjectConfig } from "../../types/project";
import { loadAllSpecs } from "../../storage/json";
import { loadChange } from "../../storage/json";
import { getProjectId } from "../../utils/project-id";
import { validateChange } from "../../validator";
import { advWorktreeDelete } from "../worktree";
import { initStateDb as initWorktreeStateDb } from "../worktree/state";
import {
  defaultClaimChecker,
  extractContextMismatch,
  validateCreateOriginLinkage,
  loadValidationContext,
} from "./create-clarify";
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
  ArchiveReleaseGateResult,
  verifyReleaseGateDurableForArchive,
  completeReleaseGateAfterFinalization,
} from "./archive-gate";
import { releaseGateProofToCompletion } from "./release-proof";
import {
  getGateDivergenceHint,
  ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT,
  isSearchAttributeArchiveFailure,
  loadSpecsMap,
  closeLinkedIssue,
  computeShippedTerminalProof,
  type ShippedTerminalProofResult,
} from "./recovery";
import {
  logRecoveryProbeDiagnostics,
  shouldTakeRecoveryBranch,
} from "../recovery-probe";
import { classifyMutationRecoveryDecision } from "../monotonic-recovery";
import {
  getPluginBundleDistDir,
  getPluginBundleReleasePreflightError,
} from "../../plugin-bundle-manifest";
import { removeChangeDir } from "../../storage/json";
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
import { collectErrorText } from "../../temporal/retry-wrapper";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
  targetPathSchema,
  appendTargetProjectContextOutput,
} from "../target-project";
import { getService } from "../../temporal/service";
import { fireSignalAndRefresh, getChangeHandle } from "../_adapters";
import { originRepairedSignal } from "../../temporal/messages";
import {
  getOpenOpsFollowupObligations,
  makeOpsResolutionBlocker,
} from "../../temporal/gate-readiness";
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
import {
  saveRecoveredArchiveConvergence,
  logger,
  WORKFLOW_TERMINATE_SHIPPED_GATES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  TERMINABLE_WORKFLOW_RUN_STATUSES,
  convergeTerminalAuthority,
  verifyArchivedNoWorkflowProof,
  formatConvergeFailure,
  workflowRunPinFromDescription,
  getChangeWorkflowHandleForStore,
  proveArchiveWorkflowTransition,
} from "./helpers";

export const advChangeArchiveHandler = async (
  {
    changeId,
    dryRun,
    worktreePath,
    noCloseIssue,
    closeIssue: _closeIssue,
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
    const store = activeStore;

    // AC4: narrow loaded-bundle release preflight. Block release only when
    // the loaded plugin bundle is strictly stale versus the deployed bundle.
    // Advisory health output is preserved elsewhere; this is a release guard.
    const bundlePreflight = await getPluginBundleReleasePreflightError(
      getPluginBundleDistDir(),
    );
    if (bundlePreflight) {
      return formatToolOutput({
        success: false,
        changeId,
        ...bundlePreflight,
      });
    }

    // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
    // probe describe() to auto-detect poisoned/completed workflows and read
    // the durable disk projection directly, avoiding "Failed to query Workflow"
    // on workflows that are already completed or poisoned.
    const handle = await getChangeWorkflowHandleForStore(store, changeId);
    const internalDecision = await classifyMutationRecoveryDecision({
      handle,
    });
    if (internalDecision.kind === "operator_required") {
      return formatToolOutput({
        error: `Cannot safely archive change: ${internalDecision.detail}`,
        code: "ARCHIVE_MUTATION_OPERATOR_REQUIRED",
        cause: internalDecision.cause,
        changeId,
      });
    }
    const readFromDisk = internalDecision.kind === "recover_via_disk";
    if (readFromDisk) {
      await logRecoveryProbeDiagnostics(handle, changeId);
    }
    // rq-harden-archive-flow AC1: refresh the change from the workflow
    // before reading. Earlier signals (release-gate completion, review
    // matrix set) can leave the store cache stale and surface as false
    // contract-proof failures. Refresh is best-effort; failures fall
    // through to the existing read (which still has its own poisoned-
    // history fallback) so we don't mask real outages.
    //
    // rq-poisonedArchiveRead01: when the classifier detects a completed or
    // poisoned workflow, skip the live Temporal round-trip entirely and read
    // the durable disk projection directly. This prevents "Failed to query
    // Workflow" on workflows that are already completed or poisoned.
    let change: Change;
    if (readFromDisk) {
      const diskResult = await loadChange(store.paths.changes, changeId);
      if (!diskResult.success) {
        return formatToolOutput({ error: diskResult.error });
      }
      if (!diskResult.data) {
        return formatToolOutput({
          error: `Change not found on disk: ${changeId}`,
        });
      }
      change = diskResult.data;
    } else {
      try {
        await store.changes.refresh(changeId);
      } catch {
        // intentionally swallowed; the next get() will surface a real error.
      }
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }
      change = result.data;
    }
    // Reconcile required ops follow-up resolutions from authoritative child
    // state before any archive authority decision. Skip when reading from a
    // completed/poisoned workflow disk projection (signaling is unavailable);
    // otherwise dryRun derives an ephemeral non-aliasing overlay so the
    // blocker/obligation check uses fresh child proof, while wet runs signal
    // the resolution and re-read the parent. Unresolved required links
    // remain fail-closed in both modes.
    const hasRequiredOpsFollowup = change.ops_followup_links?.some(
      isRequiredOpsFollowupLink,
    );
    if (readFromDisk && hasRequiredOpsFollowup) {
      return formatToolOutput({
        success: false,
        error:
          "Cannot archive: required ops follow-up obligations cannot be reconciled from a recovery disk projection",
        changeId,
        code: "OPS_FOLLOWUP_RECONCILIATION_UNAVAILABLE",
      });
    }
    if (!readFromDisk && hasRequiredOpsFollowup) {
      try {
        if (dryRun) {
          const { resolutionByLinkId } = await resolveRequiredOpsLinks({
            parent: change,
            store,
          });
          change = overlayOpsResolutionsForRead(change, resolutionByLinkId);
        } else {
          const reconciled = await reconcileOpsFollowupLinks({
            parent: change,
            store,
          });
          change = reconciled.parent;
        }
      } catch (error) {
        logger.warn(
          `Archive ops follow-up reconciliation failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (hasRequiredOpsFollowup) {
          return formatToolOutput({
            success: false,
            error:
              "Cannot archive: required ops follow-up obligations could not be reconciled",
            changeId,
            code: "OPS_FOLLOWUP_RECONCILIATION_UNAVAILABLE",
          });
        }
      }
    }
    const requiredOpsBlockers = (change.ops_followup_links ?? []).flatMap(
      (link) => {
        const blocker = makeOpsResolutionBlocker(link, "release");
        return blocker ? [blocker] : [];
      },
    );
    const openOpsObligations = getOpenOpsFollowupObligations(
      change.ops_followup_links,
    );
    const openOpsObligationsPayload =
      openOpsObligations.length > 0
        ? { openOpsObligations }
        : ({} as Record<string, unknown>);
    if (requiredOpsBlockers.length > 0) {
      return formatToolOutput({
        success: false,
        error: "Cannot archive: unresolved required ops follow-up obligations",
        changeId,
        code: "OPS_FOLLOWUP_ARCHIVE_BLOCKED",
        requirement: "rq-releaseFinalization01",
        readinessBlockers: requiredOpsBlockers,
        ...openOpsObligationsPayload,
      });
    }
    const taskPreflightError = getArchiveTaskPreflightError(change);
    if (taskPreflightError) {
      return taskPreflightError;
    }
    const gateState = await resolveArchiveGateState(store, changeId, change);
    const divergenceHint =
      gateState.source === "store" && !allGatesSatisfied(gateState.storeGates)
        ? await getGateDivergenceHint(store, changeId, change)
        : null;
    const gatePreflightError = getArchiveGatePreflightError(
      changeId,
      gateState,
      phase9 !== "skip",
      divergenceHint,
      change,
    );
    if (gatePreflightError) {
      return gatePreflightError;
    }
    const { archiveMode, autoPush } = detectArchiveMode(store.config ?? {});
    if (!dryRun && phase9 === "skip") {
      const releaseEvidence = verifyReleaseEvidenceFromMain({
        store,
        changeId,
        archiveMode,
        change,
      });
      if (releaseEvidence.status === "blocked") {
        return formatToolOutput({
          success: false,
          error: `Phase 9 skip blocked: ${releaseEvidence.blocked?.reason}`,
          requirement: "rq-releaseFinalization01",
          changeId,
          remediation: releaseEvidence.blocked?.remediation,
          details: releaseEvidence.blocked?.details,
          finalization: releaseEvidence,
        });
      }
    }
    // rq-archiveValidate01: run completeness validation before bundle creation.
    let validationResult: Awaited<ReturnType<typeof validateChange>>;
    try {
      const validationContext = await loadValidationContext(
        store,
        changeId,
        change.title,
      );
      validationResult = await validateChange(change, {
        specs: validationContext.specs,
        activeChanges: validationContext.activeChanges,
        conflictInventory: validationContext.conflictInventory,
        proposalText: validationContext.proposalText,
        changedSpecFiles: validationContext.changedSpecFiles,
      });
    } catch (validationError) {
      const validationErrorText = collectErrorText(validationError);
      return formatToolOutput({
        success: false,
        error: `Archive blocked: validation could not run: ${validationErrorText}`,
        validationErrors: [
          {
            code: "VALIDATION_CONTEXT_FAILED",
            message: validationErrorText,
          },
        ],
        changeId,
      });
    }
    if (validationResult.errors.length > 0 || !validationResult.passed) {
      return formatToolOutput({
        success: false,
        error:
          validationResult.errors.length > 0
            ? `Archive blocked: ${validationResult.errors.length} validation error(s). Fix errors and retry.`
            : `Archive blocked: validation could not conclude clean. Fix the conflict inventory and retry.`,
        validationErrors: validationResult.errors.map((e) => ({
          code: e.code,
          message: e.message,
          path: e.path,
        })),
        ...(validationResult.warnings.length > 0
          ? {
              validationWarnings: validationResult.warnings.map((w) => ({
                code: w.code,
                message: w.message,
                path: w.path,
              })),
            }
          : {}),
        authorityDiagnostics: validationResult.authorityDiagnostics,
        changeId,
      });
    }
    const contractProofErrors = getArchiveContractProofErrors(change);
    if (contractProofErrors.length > 0) {
      return formatToolOutput({
        error: `Archive blocked: ${contractProofErrors.length} contract proof error(s). Fix proof and retry.`,
        contractProofErrors,
        changeId,
      });
    }
    // Run the archive operation
    // Include in-repo archive path: resolves within the repo at .adv/archive/.
    // When worktreePath is provided (e.g. /adv-archive Phase 9 from a worktree),
    // the bundle lands inside the worktree so it can be staged on the change
    // branch. Without worktreePath, falls back to store.paths.root (main
    // checkout) for backward compatibility.
    const inRepoBase = worktreePath ?? store.paths.root;
    const inRepoArchive = join(inRepoBase, ".adv", "archive");
    const projectionSpecs = join(inRepoBase, ".adv", "specs");
    const projectionDocs = join(inRepoBase, "docs", "specs");
    const specs = worktreePath
      ? await loadAllSpecs(projectionSpecs)
      : await loadSpecsMap(store);
    const archivePaths =
      store.config?.features?.wisdom_accumulation === false
        ? {
            ...store.paths,
            specs: projectionSpecs,
            docs: projectionDocs,
            wisdom: undefined,
            inRepoArchive,
          }
        : {
            ...store.paths,
            specs: projectionSpecs,
            docs: projectionDocs,
            inRepoArchive,
          };
    const existingBundlePath = !dryRun
      ? await findArchiveBundle(archivePaths.archive, changeId)
      : null;
    if (!dryRun) {
      if (
        !worktreePath &&
        !(change.status === "archived" && existingBundlePath !== null) &&
        Object.values(change.deltas).some((deltas) => deltas.length > 0)
      ) {
        return formatToolOutput({
          success: false,
          error:
            "Archive delta projection requires worktreePath; tracked specs and docs are never written through the main checkout.",
          requirement: "rq-archiveDeltaReconciliation01",
          changeId,
        });
      }
      if (!worktreePath && phase9 !== "skip" && existingBundlePath === null) {
        return formatToolOutput({
          success: false,
          error:
            "Archive finalization requires worktreePath so archive artifacts are written to the change worktree before merge.",
          requirement: "rq-releaseFinalization01",
          changeId,
        });
      }
    }
    if (!dryRun && worktreePath) {
      const worktreeValidation = validateChangeWorktree(
        worktreePath,
        changeId,
        { requireCleanWorktree: true },
      );
      if (
        !worktreeValidation.valid ||
        worktreeValidation.repoRoot !== store.paths.root
      ) {
        return formatToolOutput({
          success: false,
          error: "Archive finalization requires a trusted change worktree.",
          requirement: "rq-releaseFinalization01",
          changeId,
          remediation:
            worktreeValidation.error ??
            `Worktree belongs to ${worktreeValidation.repoRoot}, expected ${store.paths.root}.`,
        });
      }
    }
    // rq-archiveRetryIdempotence01 (AC7): If the change is already
    // archived and the archive bundle is present, run a bounded metadata
    // reconciliation only. Do not repeat finalization, branch deletion,
    // issue closure, or cleanup.
    if (
      !dryRun &&
      change.status === "archived" &&
      existingBundlePath !== null
    ) {
      if (Object.values(change.deltas).some((deltas) => deltas.length > 0)) {
        const manifest = await readProjectionManifest(existingBundlePath);
        const release = verifyReleaseEvidenceFromMain({
          store,
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
      const reconciliationResult = await reconcileArchivedBundleRetry({
        store,
        change,
        changeId,
        archiveMode,
        phase9,
        existingBundlePath,
        openOpsObligationsPayload,
        validationWarnings: validationResult.warnings,
      });
      const reconciliationPayload = JSON.parse(reconciliationResult) as {
        success?: boolean;
        _recoveryMutation?: boolean;
      };
      if (!reconciliationPayload.success) {
        return reconciliationResult;
      }
      try {
        await store.changes.save(change);
      } catch (saveError) {
        const saveErrorText = collectErrorText(saveError);
        return formatToolOutput({
          success: false,
          error: `Failed to request archive transition: ${saveErrorText}`,
          archivePath: existingBundlePath,
          changeId,
        });
      }
      // Recovery routes (audited disk proof, terminal/absent workflow)
      // deliberately do not signal: the recovery authority already
      // converged the durable projection, so there is no live transition
      // to prove. The transition proof applies only when a live-workflow
      // transition was actually requested.
      if (!reconciliationPayload._recoveryMutation) {
        const archiveProof = await proveArchiveWorkflowTransition(
          handle,
          store,
          changeId,
        );
        if (!archiveProof.ok) {
          return formatToolOutput({
            success: false,
            error: archiveProof.error,
            code: archiveProof.code,
            requirement: "rq-archiveTerminalDurability01",
            changeId,
            archivePath: existingBundlePath,
            proofAttempts: archiveProof.attempts,
            recoveryDecision: archiveProof.recoveryDecision,
          });
        }
      }
      return reconciliationResult;
    }
    // rq-archiveOrdering01: Archive State Transition Must Be Resilient
    // to Failed Disk Bundle Write. Idempotent retry: if the bundle already
    // exists on disk, skip the disk write. Two sub-cases:
    //   1. status === "archived"  → no-op success (archive already
    //      complete; both disk + state already transitioned).
    //   2. status !== "archived"  → recovery path; previous attempt
    //      wrote the bundle but the status transition failed. Build a
    //      synthetic result without re-writing disk; let the status
    //      transition (below) complete the recovery.
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
            productId: store.productContext?.productId,
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
      archiveResult = await archiveChange({
        change,
        specs,
        paths: archivePaths,
        dryRun,
        productId: store.productContext?.productId,
      });
    }
    // rq-releaseFinalization01 AC1: Phase 9 finalization and release gate
    // completion MUST happen BEFORE archive status transition (change.status =
    // "archived" + store.changes.save). This ordering guarantee ensures that
    // release evidence is durable before the change workflow is retired.
    // If finalization or release gate completion fails, the change stays
    // active so it can be retried.
    let finalization: GitFinalizeOutcome | undefined;
    let releaseGateCompletion:
      | Extract<
          ArchiveReleaseGateResult,
          {
            ok: true;
          }
        >
      | undefined;
    if (!dryRun && archiveResult.success && phase9 !== "skip") {
      // Sync mode (existing behavior) — phase9 === "run" routes through
      // this same awaited finalization path; there is no detached async
      // dispatch, so the call returns a terminal outcome. A THROWN
      // finalization (git op failure) is caught here and recorded as
      // durable phase9_status="failed" with actionable recovery evidence
      // (rq-releaseFinalization01 AC2); the change stays active so the
      // operator can recover and re-run adv_change_archive instead of
      // the failure being swallowed or leaving a residual "pending".
      try {
        finalization = worktreePath
          ? await finalizeRelease({
              changeId,
              workdir: worktreePath,
              expectedRepoRoot: store.paths.root,
              archiveMode,
              autoPush,
              artifactPaths: (archiveResult.commitPaths ?? []).map((path) =>
                relative(worktreePath, path),
              ),
              changeTitle: change.title,
              prTitleType,
              prTitlePolicy: (store.config as ProjectConfig | undefined)
                ?.archive?.pr_title_policy,
            })
          : verifyReleaseEvidenceFromMain({
              store,
              changeId,
              archiveMode,
              change,
            });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const now = new Date().toISOString();
        await recordPhase9Status({
          store,
          changeId,
          status: preservePhase9Evidence(change.phase9_status, {
            status: "failed",
            startedAt: change.phase9_status?.startedAt ?? now,
            completedAt: now,
            error: message,
          }),
        });
        return formatToolOutput({
          success: false,
          error: `Archive finalization failed: ${message}`,
          requirement: "rq-releaseFinalization01",
          remediation:
            "Finalize the release manually (merge the change branch into the default branch and push, or resolve the underlying git error), then re-run adv_change_archive to complete the archive. The change remains active and the archive bundle is preserved for retry.",
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
      if (finalization.status === "blocked") {
        return formatToolOutput({
          success: false,
          error: `Archive finalization blocked: ${finalization.blocked?.reason}`,
          requirement: "rq-releaseFinalization01",
          remediation: finalization.blocked?.remediation,
          details: finalization.blocked?.details,
          ...buildFailedPhase9Classification({ change, finalization }),
          changeId,
          archivePath: archiveResult.archivePath,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          ...openOpsObligationsPayload,
        });
      }
      if (finalization.status === "pending_merge") {
        await recordPhase9Status({
          store,
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
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          docsGenerated: archiveResult.docsGenerated,
          archivePath: archiveResult.archivePath,
          errors: archiveResult.errors,
          dryRun: false,
          ...(archiveResult.multiRepo
            ? { multiRepo: archiveResult.multiRepo }
            : {}),
          phase9: "pending_merge",
          finalization,
          continueFrom: {
            path: finalization.repoRoot,
            branch: finalization.defaultBranch,
          },
          ...openOpsObligationsPayload,
          ...(validationResult.warnings.length > 0
            ? {
                validationWarnings: validationResult.warnings.map((w) => ({
                  code: w.code,
                  message: w.message,
                  path: w.path,
                })),
              }
            : {}),
        });
      }
      const releaseResult = await completeReleaseGateAfterFinalization({
        store,
        change,
        changeId,
        finalization,
        existingBundlePath: archiveResult.archivePath,
      });
      if (!releaseResult.ok) {
        return formatToolOutput({
          success: false,
          error: `Archive release gate completion blocked: ${releaseResult.error}`,
          requirement: "rq-releaseFinalization01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
          continueFrom: {
            path: finalization.repoRoot,
            branch: finalization.defaultBranch,
          },
          workflowGateStatus: releaseResult.workflowGateStatus,
          stuckReason: releaseResult.stuckReason,
          readinessBlockers: releaseResult.readinessBlockers,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          ...openOpsObligationsPayload,
        });
      }
      const releaseEvidence = buildReleaseCompletionEvidence(finalization);
      const durableProof = await verifyReleaseGateDurableForArchive({
        store,
        changeId,
        evidence: releaseEvidence,
        finalization,
        change,
      });
      if (!durableProof.ok) {
        return formatToolOutput({
          success: false,
          error: `Archive durable release gate proof blocked: ${durableProof.error}`,
          requirement: "rq-releaseProjectionDurability01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization,
          continueFrom: {
            path: finalization.repoRoot,
            branch: finalization.defaultBranch,
          },
          releaseGateStatus: durableProof.releaseGateStatus,
          stuckReason: durableProof.stuckReason,
          readinessBlockers: durableProof.readinessBlockers,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          ...openOpsObligationsPayload,
        });
      }
      releaseGateCompletion = {
        ...releaseResult,
        gate:
          durableProof.gate ??
          releaseGateProofToCompletion(
            durableProof as Parameters<typeof releaseGateProofToCompletion>[0],
          ),
      };
    }
    const hasAcceptedDeltas = Object.values(change.deltas).some(
      (deltas) => deltas.length > 0,
    );
    if (!dryRun && archiveResult.success && hasAcceptedDeltas) {
      const committedBundlePath = archiveResult.commitPaths.find((path) =>
        relative(inRepoBase, path)
          .replaceAll("\\", "/")
          .startsWith(".adv/archive/"),
      );
      const proofOutcome =
        finalization ??
        verifyReleaseEvidenceFromMain({
          store,
          changeId,
          archiveMode,
          change,
        });
      if (
        proofOutcome.status !== "shipped" ||
        !proofOutcome.releasedCommitSha ||
        !archiveResult.projectionManifest ||
        !committedBundlePath
      ) {
        return formatToolOutput({
          success: false,
          error:
            "Archive projection proof requires a manifest and immutable released commit SHA.",
          requirement: "rq-archiveDeltaReconciliation01",
          changeId,
          archivePath: archiveResult.archivePath,
          finalization: proofOutcome,
        });
      }
      const projectionProof = await verifyProjectionAtGitCommit({
        manifest: archiveResult.projectionManifest,
        repo: proofOutcome.repoRoot,
        releasedCommitSha: proofOutcome.releasedCommitSha,
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
      if (!projectionProof.ok) {
        return formatToolOutput({
          success: false,
          error: `Archive released projection proof failed: ${projectionProof.code}: ${projectionProof.message}`,
          requirement: "rq-archiveDeltaReconciliation01",
          changeId,
          archivePath: archiveResult.archivePath,
          projectionFailure: projectionProof,
        });
      }
      change.archive_projection_proof = projectionProof.receipt;
    }
    // rq-releaseFinalization01 AC1: Archive status transition happens AFTER
    // release gate completion and durable proof verification. This is the
    // structural ordering guarantee: release evidence → release gate → durable
    // proof → archive status → cleanup. Changing this order breaks AC1.
    // Update change status in store (unless dry run)
    if (!dryRun && archiveResult.success) {
      const archivedAt = new Date().toISOString();
      change.status = "archived";
      // Materialize the confirmed release gate and Phase 9 done state
      // on the local change so store.changes.save can fire the atomic
      // archiveConvergedSignal instead of three separate signals.
      if (releaseGateCompletion) {
        change.gates = {
          ...(change.gates ?? {}),
          release: releaseGateCompletion.gate,
        };
        change.phase9_status = preservePhase9Evidence(change.phase9_status, {
          status: "done",
          startedAt: change.phase9_status?.startedAt ?? archivedAt,
          completedAt: archivedAt,
          changeTipSha: finalization?.changeTipSha,
        });
      }
      try {
        await store.changes.save(change);
        const archiveProof = await proveArchiveWorkflowTransition(
          handle,
          store,
          changeId,
        );
        if (!archiveProof.ok) {
          return formatToolOutput({
            success: false,
            error: archiveProof.error,
            code: archiveProof.code,
            requirement: "rq-archiveTerminalDurability01",
            changeId,
            archivePath: archiveResult.archivePath,
            proofAttempts: archiveProof.attempts,
            recoveryDecision: archiveProof.recoveryDecision,
          });
        }
        const epicProjection = await projectEpicTerminalSummaryAfterArchive({
          store,
          change,
          completedAt: archivedAt,
        });
        if (epicProjection.status === "warning") {
          archiveResult.errors.push(
            `Epic terminal projection warning: failed to update ${epicProjection.epicId}/${epicProjection.entryId}: ${epicProjection.error}`,
          );
        }
      } catch (saveError) {
        const saveErrorText = collectErrorText(saveError);
        const contextMismatch = extractContextMismatch(saveError);
        if (contextMismatch) {
          return formatToolOutput({
            success: false,
            error: `Failed to update change status to archived: ${saveErrorText}`,
            archivePath: archiveResult.archivePath,
            ...contextMismatch,
          });
        }
        // rq-extend-poisoned-recovery AC5: poisoned-workflow / completed-
        // workflow disk fallback for final status. Bundle is already written;
        // only the workflow signal that flips the status field fails.
        // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
        // signal-error recovery is classified internally from the signal
        // error + describe() evidence via the unified classifier — no
        // operator-supplied recoveryMode/evidence.
        const decision = await classifyMutationRecoveryDecision({
          signalError: saveError,
          handle,
        });
        if (decision.kind === "recover_via_disk") {
          const { RECOVERY_RECONCILIATION_WARNING } =
            await import("../../temporal/recovery-classification");
          // AC4/AC6: when the archive flow detected a dead workflow and the
          // change carries shipped proof, converge all four fields in a single
          // disk write instead of only flipping status.
          if (finalization?.status === "shipped") {
            const converge = await saveRecoveredArchiveConvergence({
              store,
              change,
              changeId,
              authorization: {
                reason: decision.reason,
                evidence: decision.evidence,
              },
              finalization,
              releaseGate: releaseGateCompletion?.gate,
              archivedAt,
            });
            if (converge.kind === "converged") {
              return formatToolOutput({
                success: true,
                archivePath: archiveResult.archivePath,
                ...(finalization ? { finalization } : {}),
                ...(finalization
                  ? {
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
                specsUpdated: archiveResult.specsUpdated.map((s) => ({
                  capability: s.capability,
                  version: `${s.originalVersion} → ${s.newVersion}`,
                  deltas: s.deltaResults.length,
                })),
                ...openOpsObligationsPayload,
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                message: `Archived change ${changeId} via disk-projection convergence after workflow completed; release, phase9, status, and lifecycleState are converged.`,
              });
            }
            return formatToolOutput({
              success: false,
              error: `Archive convergence recovery failed: ${converge.kind === "refused" ? `${converge.refusalCode}: ${converge.evidence}` : converge.error}`,
              requirement: "rq-archiveConvergenceRecovery",
              changeId,
              archivePath: archiveResult.archivePath,
              ...(converge.kind === "refused"
                ? { refusalCode: converge.refusalCode }
                : {}),
              ...(converge.kind === "readbackFailed"
                ? { readback: converge.readback }
                : {}),
              ...(converge.kind === "state_unknown"
                ? { recoveryState: converge.kind }
                : {}),
            });
          }
          const { saveRecoveredChangeStatus } =
            await import("../_recovery-writers");
          await saveRecoveredChangeStatus({
            store,
            change,
            authorization: {
              reason: decision.reason,
              evidence: decision.evidence,
            },
            status: "archived",
          });
          return formatToolOutput({
            success: true,
            archivePath: archiveResult.archivePath,
            ...(finalization ? { finalization } : {}),
            ...(finalization
              ? {
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
            specsUpdated: archiveResult.specsUpdated.map((s) => ({
              capability: s.capability,
              version: `${s.originalVersion} → ${s.newVersion}`,
              deltas: s.deltaResults.length,
            })),
            ...openOpsObligationsPayload,
            _recoveryMutation: true,
            reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
          });
        }
        if (decision.kind === "operator_required") {
          return formatToolOutput({
            success: false,
            error: `Failed to update change status to archived: ${saveErrorText}`,
            archivePath: archiveResult.archivePath,
            code: "ARCHIVE_MUTATION_OPERATOR_REQUIRED",
            cause: decision.cause,
            changeId,
            hint: `Archive status transition is unsafe: ${decision.detail}. Run adv_doctor to diagnose the wedged projection.`,
          });
        }
        const searchAttributeRecovery = isSearchAttributeArchiveFailure(
          saveErrorText,
        )
          ? {
              recoveryHint: ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT,
              retrySafe: true,
            }
          : {};
        // Surface the full cause chain (e.g. WorkflowUpdateFailedError →
        // the real reason) so the caller can diagnose the failure.
        return formatToolOutput({
          success: false,
          error: `Failed to update change status to archived: ${saveErrorText}`,
          archivePath: archiveResult.archivePath,
          ...searchAttributeRecovery,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
        });
      }
      // rq-archiveRetirement01: final source cleanup happens AFTER the archived status transition.
      // Cleanup ordering is structural: durable archive + status saved → targeted
      // worktree removal → source dir removal → branch deletion. Source dir removal
      // is deferred until after the targeted worktree deletion has had a chance to
      // read the durable terminal projection, and the change/{id} branch is deleted
      // only when the targeted worktree removal succeeded or verified the worktree
      // is already absent (WORKTREE_NOT_FOUND). Cleanup failures are warning-only
      // after durable archive + status transition; sweep can retry later.
      let targetedWorktreeDeleteResult:
        | Awaited<ReturnType<typeof advWorktreeDelete>>
        | undefined;
      if (worktreePath) {
        try {
          const database = await initWorktreeStateDb(store.paths.root);
          targetedWorktreeDeleteResult = await advWorktreeDelete(
            `change/${change.id}`,
            { force: false },
            {
              projectRoot: store.paths.root,
              database,
              log: logger,
              store,
              worktreePath,
            },
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          targetedWorktreeDeleteResult = {
            ok: false,
            error: "REMOVE_FAILED",
            reason,
          };
          archiveResult.errors.push(
            `Targeted worktree cleanup warning: failed to remove change/${change.id} worktree: ${reason}`,
          );
        }
      }

      // Only remove the change source directory after the targeted worktree
      // deletion has verified terminal state, so the projection it may need is
      // still on disk.
      try {
        await removeChangeDir(store.paths.changes, change.id);
      } catch (err) {
        archiveResult.errors.push(
          `Source cleanup warning: failed to remove changes/${change.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Branch cleanup — delete change/{changeId} from local + remote.
      // Only in direct/merge mode; PR-mode branches must survive for PR creation.
      // Runs after targeted worktree removal; do not delete the branch if the
      // worktree is still present, in use, or otherwise failed removal.
      if (
        finalization?.status === "shipped" &&
        finalization.repoRoot &&
        finalization.route !== "pr_auto_merge" &&
        archiveMode === "direct"
      ) {
        // An omitted worktreePath means targeted cleanup did not run. It
        // is not proof that no managed worktree owns the branch, so retain
        // the branch until a retry supplies the trusted worktree path.
        const worktreeAbsent =
          targetedWorktreeDeleteResult?.ok ||
          targetedWorktreeDeleteResult?.error === "WORKTREE_NOT_FOUND";
        if (worktreeAbsent) {
          try {
            const branchResult = deleteChangeBranch(
              finalization.repoRoot,
              change.id,
            );
            if (!branchResult.localDeleted && branchResult.error) {
              archiveResult.errors.push(
                `Branch cleanup warning: ${branchResult.error}`,
              );
            } else if (
              branchResult.localDeleted &&
              !branchResult.remoteDeleted &&
              branchResult.error
            ) {
              archiveResult.errors.push(
                `Branch cleanup warning (remote): ${branchResult.error}`,
              );
            }
          } catch (err) {
            archiveResult.errors.push(
              `Branch cleanup warning: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } else if (targetedWorktreeDeleteResult) {
          const code =
            "error" in targetedWorktreeDeleteResult
              ? targetedWorktreeDeleteResult.error
              : "UNKNOWN";
          archiveResult.errors.push(
            `Branch cleanup skipped: change/${change.id} worktree deletion returned ${code}`,
          );
        } else {
          archiveResult.errors.push(
            `Branch cleanup skipped: change/${change.id} worktree deletion result unavailable`,
          );
        }
      }
    }
    // Issue closure — after archive state is durable (or previewed in dryRun)
    const issueClosure = await closeLinkedIssue({
      change,
      store,
      noCloseIssue,
      dryRun,
      existingBundlePath: existingBundlePath ?? undefined,
      worktreePath,
    });
    return formatToolOutput({
      success: archiveResult.success,
      changeId: change.id,
      specsUpdated: archiveResult.specsUpdated.map((s) => ({
        capability: s.capability,
        version: `${s.originalVersion} → ${s.newVersion}`,
        deltas: s.deltaResults.length,
      })),
      docsGenerated: archiveResult.docsGenerated,
      archivePath: archiveResult.archivePath,
      errors: archiveResult.errors,
      dryRun: dryRun ?? false,
      authorityDiagnostics: validationResult.authorityDiagnostics,
      ...(archiveResult.multiRepo
        ? { multiRepo: archiveResult.multiRepo }
        : {}),
      ...(issueClosure.issue_closed.length > 0
        ? { issue_closed: issueClosure.issue_closed }
        : {}),
      ...(issueClosure.close_eligible
        ? { close_eligible: issueClosure.close_eligible }
        : {}),
      ...(issueClosure.issue_closure_error
        ? { issue_closure_error: issueClosure.issue_closure_error }
        : {}),
      ...(dryRun
        ? {
            finalization: {
              evaluated: false,
              reason: "dry run does not exercise Phase 9 git finalization",
            },
          }
        : finalization
          ? { finalization }
          : {}),
      ...(finalization
        ? {
            continueFrom: {
              path: finalization.repoRoot,
              branch: finalization.defaultBranch,
            },
          }
        : {}),
      ...openOpsObligationsPayload,
      ...(releaseGateCompletion
        ? {
            releaseGate: releaseGateCompletion.gate,
            releaseGateAlreadyDone: releaseGateCompletion.alreadyDone,
            ...(releaseGateCompletion.recoveryMutation
              ? { _recoveryMutation: true }
              : {}),
            ...(releaseGateCompletion.reconciliationWarning
              ? {
                  reconciliationWarning:
                    releaseGateCompletion.reconciliationWarning,
                }
              : {}),
          }
        : {}),
      ...(validationResult.warnings.length > 0
        ? {
            validationWarnings: validationResult.warnings.map((w) => ({
              code: w.code,
              message: w.message,
              path: w.path,
            })),
          }
        : {}),
    });
  };
  // rq-archiveTargetPathRouting01: route terminal archive through the
  // target project's store and queue when target_path is approved.
  if (target_path) {
    return withTargetPathStore(
      {
        currentProjectPath: store.paths.root,
        target_path,
        stateRequirement: "temporal-required",
        mutation: dryRun ? false : undefined,
        target_confirmed,
        confirmationEvidence,
      },
      async ({ context, store: targetStore }) => {
        const result = await runArchive(targetStore);
        return appendTargetProjectContextOutput(result, context);
      },
    );
  }
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
  // Approval gates first — refuse before any read/mutation work so a
  // misconfigured call can never become a partial purge (C3).
  if (approvedByUser !== true) {
    return formatToolOutput({
      success: false,
      error: "approvedByUser must be true for archive purge",
      changeId,
      hint: "Archive purge is operator-only and requires explicit operator approval.",
    });
  }
  const evidence = approvalEvidence?.trim() ?? "";
  if (evidence.length === 0) {
    return formatToolOutput({
      success: false,
      error: "approvalEvidence is required for archive purge",
      changeId,
      hint: "Cite the operator approval and reason for this purge.",
    });
  }

  // rq-archivePurge01.3 / DDC1: archived-only — refuse unknown or
  // non-archived changes with a structured error and no mutations.
  const result = await store.changes.get(changeId);
  if (!result.success) {
    return formatToolOutput({ success: false, error: result.error });
  }
  if (!result.data) {
    return formatToolOutput({
      success: false,
      error: `Change not found: ${changeId}`,
      changeId,
    });
  }
  const change = result.data;
  if (change.status !== "archived") {
    return formatToolOutput({
      success: false,
      error: `Archive purge refused: change ${changeId} is not archived (status: ${change.status}).`,
      changeId,
      currentStatus: change.status,
      hint: "Only archived changes can be purged. Archive the change first via adv_change_archive, or use adv_change_close for terminal non-archived changes.",
    });
  }

  const removeDiskBundle = includeDiskBundle === true;
  const archivedPath = await findArchiveBundle(store.paths.archive, changeId);

  // Terminate the change workflow via the Temporal client. A missing
  // workflow (already terminated/evicted) is idempotent success; any
  // other failure aborts the purge before disk state is touched so the
  // operator never gets a half-purged change (no live workflow serving
  // reads while the bundle is gone).
  const handle = await getChangeWorkflowHandleForStore(store, changeId);
  if (!handle) {
    return formatToolOutput({
      success: false,
      error:
        "Temporal service not available — cannot terminate the change workflow",
      changeId,
      hint: "Restore the Temporal service (adv_doctor) and retry the purge.",
    });
  }
  let alreadyTerminated = false;
  try {
    await (
      handle as unknown as {
        terminate: (reason?: string) => Promise<unknown>;
      }
    ).terminate(
      `adv_archive_purge: operator-approved purge of archived change ${changeId}`,
    );
  } catch (error) {
    const { isWorkflowCompletedError } =
      await import("../../temporal/recovery-classification");
    if (isWorkflowCompletedError(error)) {
      alreadyTerminated = true;
    } else {
      return formatToolOutput({
        success: false,
        error: `Failed to terminate change workflow: ${error instanceof Error ? error.message : String(error)}`,
        changeId,
        workflowTerminated: false,
      });
    }
  }

  // rq-archivePurge01.2: destructive escalation is strictly opt-in.
  // Remove the archive bundle, the legacy changes/<id>/ snapshot, and
  // the flat workflow projection file so no disk source can re-seed or
  // answer reads after the workflow is gone.
  if (removeDiskBundle) {
    try {
      if (archivedPath) {
        await rm(archivedPath, { recursive: true, force: true });
      }
      await removeChangeDir(store.paths.changes, changeId);
      await rm(join(store.paths.changes, `${changeId}.json`), {
        force: true,
      });
    } catch (error) {
      return formatToolOutput({
        success: false,
        error: `Workflow terminated but disk bundle removal failed: ${error instanceof Error ? error.message : String(error)}`,
        changeId,
        workflowTerminated: true,
        ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
        bundleRemoved: false,
        archivedPath,
      });
    }
  }

  // Drop the local cache/memo entry so subsequent reads in this process
  // fall through to the archive bundle (default) or the not-found path
  // (includeDiskBundle). Best-effort: refresh never throws by contract.
  try {
    await store.changes.refresh(changeId);
  } catch (error) {
    logger.debug(
      `Post-purge cache refresh failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return formatToolOutput({
    success: true,
    changeId,
    workflowTerminated: true,
    ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
    bundleRemoved: removeDiskBundle,
    archivedPath,
    requirement: "rq-archivePurge01",
  });
};
export const advChangeWorkflowTerminateHandler = async (
  {
    changeId,
    approvedByUser,
    approvalEvidence,
    dryRun,
    recoveryMode,
    recoveryEvidence,
  }: {
    changeId: string;
    approvedByUser: true;
    approvalEvidence: string;
    dryRun?: boolean;
    recoveryMode?: "normal" | "poisoned_history";
    recoveryEvidence?: string;
  },
  store: Store,
) => {
  // Approval gates first — refuse before any read/mutation work so a
  // misconfigured call can never become a partial termination (purge C3).
  if (approvedByUser !== true) {
    return formatToolOutput({
      success: false,
      error: "approvedByUser must be true for change workflow termination",
      changeId,
      hint: "Workflow termination is operator-only and requires explicit operator approval.",
    });
  }
  const evidence = approvalEvidence?.trim() ?? "";
  if (evidence.length === 0) {
    return formatToolOutput({
      success: false,
      error: "approvalEvidence is required for change workflow termination",
      changeId,
      hint: "Cite the operator approval and wedged-state reason for this termination.",
    });
  }

  // Operator-supplied poisoned-history recovery branch (fixWedgedWorkflowRecovery).
  // Evaluated BEFORE any Temporal-backed store query so that a poisoned
  // workflow that cannot answer changeStateQuery does not hang the tool.
  // Existence and archived status are read from the authoritative disk
  // projection only; dryRun is fully no-mutation.
  if (
    shouldTakeRecoveryBranch({
      recoveryMode,
      recoveryEvidence,
      approvedByUser,
      approvalEvidence,
    })
  ) {
    const diskResult = await loadChange(store.paths.changes, changeId);
    if (!diskResult.success || !diskResult.data) {
      return formatToolOutput({
        success: false,
        error: `Change not found: ${changeId}`,
        changeId,
      });
    }
    if (diskResult.data.status === "archived") {
      return formatToolOutput({
        success: false,
        error: `Workflow termination refused: change ${changeId} is archived.`,
        changeId,
        currentStatus: diskResult.data.status,
        hint: "Use adv_archive_purge for archived changes — it is the sole archived-change workflow termination lever.",
      });
    }
    if (dryRun) {
      return formatToolOutput({
        success: true,
        dryRun: true,
        wouldTerminate: true,
        changeId,
        eligibilityClass: "poisoned_history",
        message: `Would terminate change ${changeId} via operator-supplied poisoned-history recovery branch (describe skipped).`,
      });
    }

    const { getService } = await import("../../temporal/service");
    const service = getService();
    const projectId = service ? await getProjectId(store.paths.root) : null;
    if (!service || !projectId) {
      return formatToolOutput({
        success: false,
        error:
          "Temporal service not available — cannot terminate the change workflow",
        changeId,
        hint: "Restore the Temporal service (adv_doctor) and retry the termination.",
      });
    }
    const { getChangeHandle } = await import("../_adapters");
    const handle = getChangeHandle(service, projectId, changeId);
    const { isWorkflowCompletedError } =
      await import("../../temporal/recovery-classification");

    let alreadyTerminated = false;
    try {
      await (
        handle as unknown as {
          terminate: (reason?: string) => Promise<unknown>;
        }
      ).terminate(
        `adv_change_workflow_terminate: operator-approved termination of poisoned_history change workflow ${changeId} (unpinned recovery branch)`,
      );
    } catch (error) {
      if (isWorkflowCompletedError(error)) {
        alreadyTerminated = true;
      }
      // Non-completed errors are treated as an unreachable wedged workflow
      // because the operator provided precise recovery evidence; fall
      // through to the disk-projection refresh.
    }

    try {
      await store.changes.refresh(changeId);
    } catch (error) {
      logger.debug(
        `Post-termination cache refresh failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return formatToolOutput({
      success: true,
      changeId,
      workflowTerminated: true,
      ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
      eligibilityClass: "poisoned_history",
      message: `Terminated change ${changeId} workflow via operator-supplied poisoned-history recovery branch (describe skipped). Disk projection remains authoritative; subsequent reads fall through to disk.`,
    });
  }

  const result = await store.changes.get(changeId);
  if (!result.success) {
    return formatToolOutput({ success: false, error: result.error });
  }
  if (!result.data) {
    return formatToolOutput({
      success: false,
      error: `Change not found: ${changeId}`,
      changeId,
    });
  }
  const change = result.data;

  const { getService } = await import("../../temporal/service");
  const service = getService();
  const projectId = service ? await getProjectId(store.paths.root) : null;
  if (!service || !projectId) {
    return formatToolOutput({
      success: false,
      error:
        "Temporal service not available — cannot describe or terminate the change workflow",
      changeId,
      hint: "Restore the Temporal service (adv_doctor) and retry the termination.",
    });
  }
  const { getChangeHandle } = await import("../_adapters");
  const handle = getChangeHandle(service, projectId, changeId);
  const archivedProjection = change.status === "archived";

  // Idempotent completed/not-found handling — reachable here, AFTER
  // approval + existence + archived status eligibility.
  const refreshProjectionCache = async () => {
    try {
      await store.changes.refresh(changeId);
    } catch (error) {
      logger.debug(
        `Post-termination cache refresh failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const { isWorkflowCompletedError } =
    await import("../../temporal/recovery-classification");

  // Shipped proof: acceptance AND release gates done. This must pass
  // BEFORE idempotent completed/not-found handling in the normal path — a
  // gone workflow never masks an ineligible change.
  const gates = change.gates ?? createDefaultGates();
  const incompleteGates = WORKFLOW_TERMINATE_SHIPPED_GATES.filter(
    (gateId) => gates[gateId]?.status !== "done",
  );
  if (incompleteGates.length > 0) {
    return formatToolOutput({
      success: false,
      error: `Workflow termination refused: change ${changeId} has no shipped proof (gate(s) not done: ${incompleteGates.join(", ")}).`,
      changeId,
      incompleteGates,
      hint: "Only shipped changes (acceptance AND release gates done) are eligible — their disk projection is fully authoritative. Complete the gates via the normal workflow.",
    });
  }

  if (typeof handle.describe !== "function") {
    return formatToolOutput({
      success: false,
      error:
        "Change workflow handle does not support describe() — cannot pin an exact run",
      changeId,
    });
  }

  let description: unknown;
  let describeThrewCompleted = false;
  let describeConfirmedAbsent = false;
  try {
    description = await handle.describe();
  } catch (error) {
    if (isWorkflowCompletedError(error)) {
      // rq-shippedWorkflowTermination01 D11: idempotent completed paths
      // require shipped-terminal proof when this could be a shipped-
      // terminal recovery. Poisoned runs that threw not-found have no
      // description to check, but we still must verify structural proof
      // before declaring success on a shipped-terminal-shape change.
      describeThrewCompleted = true;
      describeConfirmedAbsent =
        error instanceof Error &&
        error.name.toLowerCase() === "workflownotfounderror";
      description = null;
    } else {
      return formatToolOutput({
        success: false,
        error: `Failed to describe change workflow: ${error instanceof Error ? error.message : String(error)}`,
        changeId,
        workflowTerminated: false,
      });
    }
  }

  // Archived changes still route to adv_archive_purge while a workflow is
  // reachable. Only a describe-confirmed absent workflow may use this
  // repair path; a RUNNING or already-terminal description must preserve
  // the archived-only purge boundary.
  if (archivedProjection && !describeConfirmedAbsent) {
    return formatToolOutput({
      success: false,
      error: `Workflow termination refused: change ${changeId} is archived.`,
      changeId,
      currentStatus: change.status,
      hint: "Use adv_archive_purge for archived changes — it is the sole archived-change workflow termination lever.",
    });
  }

  const { runId, statusName } = describeThrewCompleted
    ? { runId: undefined, statusName: "COMPLETED" as string | undefined }
    : workflowRunPinFromDescription(description);

  // Determine eligibility class up front so idempotent paths can route
  // correctly: poisoned-history may refresh-only; shipped-terminal must
  // converge authority.
  const { poisonedDescriptionEvidence } = await import("../recovery-probe");
  const wedgedEvidence = describeThrewCompleted
    ? null
    : poisonedDescriptionEvidence(description);
  let shippedTerminalProof: ShippedTerminalProofResult | null = null;
  if (!wedgedEvidence) {
    // Try the alternate eligibility branch: compute structural
    // shipped-terminal proof from disk projection + archive bundle.
    shippedTerminalProof = await computeShippedTerminalProof({
      changesDir: store.paths.changes,
      archiveDir: store.paths.archive,
      changeId,
    });
  }
  const archivedNoWorkflowProof =
    archivedProjection && describeConfirmedAbsent
      ? await verifyArchivedNoWorkflowProof({
          store,
          changeId,
          change,
          shippedTerminalProof: shippedTerminalProof ?? {
            ok: false,
            refusalCode: "PROOF_INVALID_DISK_PROJECTION",
            evidence: "shipped-terminal proof was not computed",
          },
        })
      : undefined;

  // Already-terminal / describe-not-found idempotent paths.
  if (
    describeThrewCompleted ||
    (statusName && TERMINAL_WORKFLOW_RUN_STATUSES.has(statusName))
  ) {
    // Poisoned-history path: refresh + idempotent success (no convergence
    // write — a poisoned run may have never reached archive; this path
    // is the existing behavior, unchanged).
    if (wedgedEvidence) {
      await refreshProjectionCache();
      return formatToolOutput({
        success: true,
        changeId,
        workflowTerminated: true,
        alreadyTerminated: true,
        eligibilityClass: "poisoned_history",
        ...(runId ? { runId } : {}),
        ...(statusName ? { runStatus: statusName } : {}),
        message: `Change ${changeId} workflow run is already gone; nothing to terminate (poisoned-history class).`,
      });
    }

    // No poison evidence available. describe-throws-not-found gives no
    // description to inspect, so we cannot distinguish poisoned-history
    // from shipped-terminal by describe alone. rq-shippedWorkflowTermination01
    // AC3/AC5/AC7: refuse unless the typed shipped-terminal proof is
    // complete. The legacy refresh+idempotent-success path masked
    // half-shipped states and violated terminal-authority convergence;
    // the operator must complete the shipped-terminal proof so the
    // converge path runs. Status-flip recovery is being internalized
    // (design D4); adv_doctor diagnoses the wedged projection.
    if (describeThrewCompleted) {
      if (!shippedTerminalProof?.ok) {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: change ${changeId} describe threw completed/not-found with no poisoned-history evidence, and shipped-terminal proof failed (${shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE"}) — cannot declare converged (IDEMPOTENT_BUT_PROOF_MISSING).`,
          changeId,
          eligibilityClass: "none",
          shippedTerminalProof: shippedTerminalProof?.ok
            ? undefined
            : {
                ok: false,
                refusalCode:
                  shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE",
                evidence:
                  shippedTerminalProof?.evidence ??
                  "no shipped-terminal proof available",
              },
          hint: "Idempotent completed/not-found describe requires complete shipped-terminal proof (all 7 disk gates + phase9 done + valid archive bundle). Complete the proof, run adv_doctor to diagnose a wedged projection (status-flip recovery is being internalized per design D4), or use adv_archive_purge if the change is already archived on disk.",
        });
      }
      if (archivedNoWorkflowProof && !archivedNoWorkflowProof.ok) {
        return formatToolOutput({
          success: false,
          error: `Archived no-workflow repair refused: ${archivedNoWorkflowProof.code}: ${archivedNoWorkflowProof.evidence}`,
          code: archivedNoWorkflowProof.code,
          changeId,
          eligibilityClass: "shipped_terminal",
          shippedTerminalProof: {
            ok: true,
            bundlePath: shippedTerminalProof.bundlePath,
          },
        });
      }
      if (dryRun && archivedNoWorkflowProof?.ok) {
        return formatToolOutput({
          success: true,
          dryRun: true,
          wouldConverge: true,
          changeId,
          eligibilityClass: "shipped_terminal",
          shippedTerminalProof: {
            ok: true,
            bundlePath: shippedTerminalProof.bundlePath,
            bundleSha256: archivedNoWorkflowProof.bundleSha256,
            proofReceipt: archivedNoWorkflowProof.finalization,
          },
        });
      }
      // Proof OK: converge authority (write status+lifecycleState, readback).
      const fromStatus = change.status;
      const converge = await convergeTerminalAuthority({
        store,
        changeId,
        pinnedRunId: runId ?? "unknown",
        authorization: {
          reason: "shipped_terminal_workflow_termination",
          evidence,
        },
        describeUnpinned: async () => {
          if (typeof handle.describe !== "function") {
            throw new Error(
              "Change workflow handle does not support describe()",
            );
          }
          return handle.describe();
        },
      });
      if (converge.kind === "converged") {
        return formatToolOutput({
          success: true,
          changeId,
          workflowTerminated: true,
          alreadyTerminated: true,
          converged: true,
          eligibilityClass: "shipped_terminal",
          fromStatus,
          toStatus: "archived",
          shippedTerminalProof: {
            ok: true,
            bundlePath: shippedTerminalProof.bundlePath,
            ...(archivedNoWorkflowProof?.ok
              ? {
                  bundleSha256: archivedNoWorkflowProof.bundleSha256,
                  proofReceipt: archivedNoWorkflowProof.finalization,
                }
              : {}),
          },
          readback: converge.readback,
          ...(archivedNoWorkflowProof?.ok
            ? {
                convergedCount: 1,
                convergence: {
                  changes: [
                    {
                      changeId,
                      bundleSha256: archivedNoWorkflowProof.bundleSha256,
                      proofReceipt: archivedNoWorkflowProof.finalization,
                    },
                  ],
                },
              }
            : {}),
          message: `Change ${changeId} workflow run was already gone; converged terminal authority (status+lifecycleState=archived).`,
        });
      }
      return formatConvergeFailure({
        converge,
        changeId,
        runId: runId ?? "unknown",
        eligibilityClass: "shipped_terminal",
        fromStatus,
        shippedTerminalProof,
      });
    }

    // describe returned a terminal status (not threw). We have a
    // description but no poison evidence. Per D11, this path requires
    // shipped-terminal proof — half-shipped changes cannot be declared
    // converged without structural proof + convergence write.
    if (!shippedTerminalProof?.ok) {
      return formatToolOutput({
        success: false,
        error: `Workflow termination refused: change ${changeId} run is already ${statusName} but shipped-terminal proof failed (${shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE"}) — cannot declare converged (IDEMPOTENT_BUT_PROOF_MISSING).`,
        changeId,
        eligibilityClass: "none",
        shippedTerminalProof: shippedTerminalProof?.ok
          ? undefined
          : {
              ok: false,
              refusalCode:
                shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE",
              evidence:
                shippedTerminalProof?.evidence ??
                "no shipped-terminal proof available",
            },
        hint: "Idempotent terminal-status requires complete shipped-terminal proof (all 7 disk gates + phase9 done + valid archive bundle). Complete the proof or use adv_archive_purge if the change is already archived on disk.",
      });
    }

    // Proof OK: converge authority.
    {
      const fromStatus = change.status;
      const converge = await convergeTerminalAuthority({
        store,
        changeId,
        pinnedRunId: runId ?? "unknown",
        authorization: {
          reason: "shipped_terminal_workflow_termination",
          evidence,
        },
        describeUnpinned: async () => {
          if (typeof handle.describe !== "function") {
            throw new Error(
              "Change workflow handle does not support describe()",
            );
          }
          return handle.describe();
        },
      });
      if (converge.kind === "converged") {
        return formatToolOutput({
          success: true,
          changeId,
          workflowTerminated: true,
          alreadyTerminated: true,
          converged: true,
          eligibilityClass: "shipped_terminal",
          fromStatus,
          toStatus: "archived",
          shippedTerminalProof: {
            ok: true,
            bundlePath: shippedTerminalProof.bundlePath,
          },
          readback: converge.readback,
          message: `Change ${changeId} workflow run was already ${statusName}; converged terminal authority (status+lifecycleState=archived).`,
        });
      }
      return formatConvergeFailure({
        converge,
        changeId,
        runId: runId ?? "unknown",
        eligibilityClass: "shipped_terminal",
        fromStatus,
        shippedTerminalProof,
      });
    }
  }

  if (!statusName || !TERMINABLE_WORKFLOW_RUN_STATUSES.has(statusName)) {
    return formatToolOutput({
      success: false,
      error: `Workflow termination refused: cannot classify run status${statusName ? ` "${statusName}"` : ""} for change ${changeId}.`,
      changeId,
      ...(runId ? { runId } : {}),
      hint: "Only RUNNING/PAUSED runs are terminable; already-terminal runs are idempotent success. Refusing to act on an unclassifiable run.",
    });
  }

  // TERMINABLE: refuse if neither poison nor shipped-terminal proof.
  if (!wedgedEvidence && !shippedTerminalProof?.ok) {
    return formatToolOutput({
      success: false,
      error: `Workflow termination refused: change ${changeId} run is ${statusName} with no poisoned-history evidence, and shipped-terminal proof failed (${shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE"}).`,
      changeId,
      ...(runId ? { runId } : {}),
      runStatus: statusName,
      eligibilityClass: "none",
      shippedTerminalProof: shippedTerminalProof?.ok
        ? undefined
        : {
            ok: false,
            refusalCode: shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE",
            evidence:
              shippedTerminalProof?.evidence ??
              "no shipped-terminal proof available",
          },
      hint: "This tool only terminates wedged (poisoned-history) runs OR shipped-terminal runs (all 7 disk gates done + phase9 done + valid archive bundle matching changeId). Refusing to terminate a healthy workflow.",
    });
  }
  if (!runId) {
    return formatToolOutput({
      success: false,
      error: `Workflow termination refused: describe output for change ${changeId} carries no runId — cannot pin an exact run.`,
      changeId,
      runStatus: statusName,
      hint: "Exact run pinning is mandatory; refusing to terminate an unpinned run.",
    });
  }

  // Classification: poisoned_history (existing) vs shipped_terminal (new).
  const eligibilityClass: "poisoned_history" | "shipped_terminal" =
    wedgedEvidence ? "poisoned_history" : "shipped_terminal";

  if (dryRun) {
    return formatToolOutput({
      success: true,
      dryRun: true,
      wouldTerminate: true,
      changeId,
      runId,
      runStatus: statusName,
      eligibilityClass,
      ...(wedgedEvidence ? { wedgedEvidence } : {}),
      ...(shippedTerminalProof?.ok
        ? {
            shippedTerminalProof: {
              ok: true,
              bundlePath: shippedTerminalProof.bundlePath,
            },
          }
        : {}),
      shippedProof: { acceptance: "done", release: "done" },
      message: `Would terminate pinned run ${runId} (${statusName}, ${eligibilityClass}) of shipped change ${changeId}.`,
    });
  }

  // Terminate the EXACT pinned run: a handle bound to (workflowId, runId)
  // can never kill a different run of the same workflow.
  const pinnedHandle = getChangeHandle(service, projectId, changeId, runId);
  let alreadyTerminated = false;
  try {
    await pinnedHandle.terminate(
      `adv_change_workflow_terminate: operator-approved termination of ${eligibilityClass} shipped change workflow ${changeId} (run ${runId})`,
    );
  } catch (error) {
    if (isWorkflowCompletedError(error)) {
      // The pinned run ended after describe but before terminate landed.
      // A shipped-terminal recovery still must converge and verify the
      // terminal projection; only poisoned-history keeps its legacy
      // refresh-only completion behavior.
      alreadyTerminated = true;
    } else {
      // failure-before-projection-mutation: no refresh, no disk write.
      return formatToolOutput({
        success: false,
        error: `Failed to terminate change workflow: ${error instanceof Error ? error.message : String(error)}`,
        changeId,
        runId,
        workflowTerminated: false,
      });
    }
  }

  // rq-shippedWorkflowTermination01 D12: shipped_terminal path funnels
  // through convergeTerminalAuthority to write status+lifecycleState and
  // verify readback. Poisoned-history path keeps existing refresh-only
  // behavior (a poisoned run may have never reached archive; convergence
  // is out of scope for that eligibility class).
  if (eligibilityClass === "shipped_terminal") {
    const fromStatus = change.status;
    const converge = await convergeTerminalAuthority({
      store,
      changeId,
      pinnedRunId: runId,
      authorization: {
        reason: "shipped_terminal_workflow_termination",
        evidence,
      },
      describeUnpinned: async () => {
        if (typeof handle.describe !== "function") {
          throw new Error("Change workflow handle does not support describe()");
        }
        return handle.describe();
      },
    });

    if (converge.kind === "converged") {
      return formatToolOutput({
        success: true,
        changeId,
        workflowTerminated: true,
        ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
        converged: true,
        runId,
        runStatus: statusName,
        eligibilityClass,
        fromStatus,
        toStatus: "archived",
        shippedTerminalProof: shippedTerminalProof?.ok
          ? { ok: true, bundlePath: shippedTerminalProof.bundlePath }
          : undefined,
        shippedProof: { acceptance: "done", release: "done" },
        readback: converge.readback,
        message: `Terminated pinned run ${runId} of shipped change ${changeId}; converged terminal authority (status+lifecycleState=archived).`,
      });
    }

    // Non-converged outcomes: delegate to the shared formatter used by
    // both the terminate-then-converge and idempotent-then-converge paths.
    return formatConvergeFailure({
      converge,
      changeId,
      runId,
      eligibilityClass,
      fromStatus,
      shippedTerminalProof,
    });
  }

  // Poisoned-history path: terminate + refresh only (no convergence write).
  await refreshProjectionCache();
  return formatToolOutput({
    success: true,
    changeId,
    workflowTerminated: true,
    ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
    runId,
    runStatus: statusName,
    eligibilityClass,
    wedgedEvidence,
    shippedProof: { acceptance: "done", release: "done" },
    message: `Terminated pinned run ${runId} of shipped change ${changeId}. Disk projection remains authoritative; subsequent reads fall through to disk.`,
  });
};
export const advChangeRepairOriginHandler = async (
  {
    changeId,
    origin_kind,
    origin_issue_number,
    origin_source_artifact,
    approvalEvidence,
    approvedByUser,
    reason,
    dryRun,
    target_path,
    target_confirmed,
    confirmationEvidence,
  }: {
    changeId: string;
    origin_kind: ChangeOrigin["kind"];
    origin_issue_number?: number;
    origin_source_artifact?: string;
    approvalEvidence: string;
    approvedByUser: true;
    reason: string;
    dryRun?: boolean;
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
  store: Store,
  _maybeOverridePath?: string,
  providers: {
    claimChecker?: typeof defaultClaimChecker;
  } = {},
) => {
  if (approvedByUser !== true) {
    return formatToolOutput({
      error: "approvedByUser must be true for origin repair",
      changeId,
      hint: "Explicit operator approval is required for this audited repair path.",
    });
  }
  const originLinkageError = validateCreateOriginLinkage({
    origin_kind,
    origin_issue_number,
    origin_source_artifact,
  });
  if (originLinkageError) {
    return formatToolOutput(originLinkageError);
  }
  const evidence = approvalEvidence?.trim() ?? "";
  if (evidence.length === 0) {
    return formatToolOutput({
      error: "approvalEvidence is required for origin repair",
      changeId,
      hint: "Cite the operator approval or audit evidence for this repair.",
    });
  }
  const repairReason = reason?.trim() ?? "";
  if (repairReason.length === 0) {
    return formatToolOutput({
      error: "reason is required for origin repair",
      changeId,
      hint: "Provide a non-blank rationale for changing the origin.",
    });
  }
  const newOrigin: ChangeOrigin = {
    kind: origin_kind,
    ...(origin_issue_number !== undefined
      ? { issue_number: origin_issue_number }
      : {}),
    ...(origin_source_artifact
      ? { source_artifact: origin_source_artifact }
      : {}),
  };
  const runRepair = async (
    activeStore: Store,
    projectContext?: TargetProjectOutputContext,
  ) => {
    const result = await activeStore.changes.get(changeId);
    if (!result.success) {
      return formatToolOutput({ error: result.error });
    }
    if (!result.data) {
      return formatToolOutput({ error: `Change not found: ${changeId}` });
    }
    const change = result.data;
    // rq-activeOriginRepair01: active/open changes only. Archived/closed
    // origin repair is out of scope (OOS2).
    if (change.status === "archived" || change.status === "closed") {
      return formatToolOutput({
        error: `Cannot repair origin of ${change.status} change ${changeId}. Origin repair is for active/open changes only.`,
        changeId,
        status: change.status,
        hint: "Archived/closed origin repair is out of scope.",
      });
    }
    const previousOrigin = change.origin;
    // rq-backlogCoord02: claim-safe repair. If the new origin carries a
    // concrete issue number, ensure no other open change already holds the
    // claim. The change itself may already hold the claim (idempotent).
    if (newOrigin.issue_number !== undefined) {
      const projectId = (await getProjectId(activeStore.paths.root)) ?? "";
      const claimChecker = providers.claimChecker ?? defaultClaimChecker;
      const existing = await claimChecker(projectId, newOrigin.issue_number);
      const conflicting = existing.filter(
        (candidate) => candidate.changeId !== changeId,
      );
      if (conflicting.length > 0) {
        const first = conflicting[0];
        return formatToolOutput({
          error: `Issue #${newOrigin.issue_number} is already claimed by change ${first.changeId} (status: ${first.status})`,
          code: "ORIGIN_CLAIM_CONFLICT",
          issue_number: newOrigin.issue_number,
          existing_change_id: first.changeId,
          existing_change_status: first.status,
          changeId,
          hint: `Resolve the conflicting claim before assigning this issue to ${changeId}, or use a different origin_issue_number.`,
        });
      }
    }
    if (dryRun) {
      return formatToolOutput({
        success: true,
        dryRun: true,
        changeId,
        previousOrigin,
        origin: newOrigin,
        approvalEvidence: evidence,
        reason: repairReason,
        message: `Would repair origin of ${changeId} (${change.status})`,
        ...(projectContext ? { _projectContext: projectContext } : {}),
      });
    }
    const bundle = getService();
    if (!bundle) {
      return formatToolOutput({
        error: "Temporal service not available",
        changeId,
      });
    }
    const projectId = (await getProjectId(activeStore.paths.root)) ?? "";
    const handle = getChangeHandle(bundle, projectId, changeId);
    await fireSignalAndRefresh(
      handle,
      activeStore,
      changeId,
      originRepairedSignal,
      {
        origin: newOrigin,
        repairedBy: "agent",
        repairedAt: new Date().toISOString(),
        approvalEvidence: evidence,
        reason: repairReason,
        previousOrigin,
      },
    );
    const readback = await activeStore.changes.get(changeId);
    if (!readback.success) {
      // rq-schemaDriftToolLayer: best-effort post-mutation readback. The
      // repair signal already landed; do not mask it as a hard failure.
      // Surface the schema error text so the operator can investigate
      // while still seeing the successful repair outcome below.
      logger.warn(
        `repair_origin readback failed for ${changeId}: ${readback.error}`,
      );
    }
    const readbackOrigin =
      readback.success && readback.data ? readback.data.origin : undefined;
    return formatToolOutput({
      success: true,
      changeId,
      status: change.status,
      previousOrigin,
      origin: readbackOrigin ?? newOrigin,
      approvalEvidence: evidence,
      reason: repairReason,
      message: `Repaired origin of ${changeId}`,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  };
  if (target_path) {
    try {
      return await withTargetPathStore(
        {
          currentProjectPath: store.paths.root,
          target_path,
          stateRequirement: dryRun ? "snapshot-ok" : "temporal-required",
          target_confirmed,
          confirmationEvidence,
        },
        async ({ context, store: targetStore }) =>
          runRepair(targetStore, formatTargetProjectContext(context)),
      );
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      return formatToolOutput({
        success: false,
        error: `Target project origin repair unavailable: ${errorText}`,
        changeId,
        target_path,
        targetRepairPacket: {
          workdir: target_path,
          tool: "adv_change_repair_origin",
          args: {
            changeId,
            origin_kind,
            ...(origin_issue_number !== undefined
              ? { origin_issue_number }
              : {}),
            ...(origin_source_artifact ? { origin_source_artifact } : {}),
            approvalEvidence: evidence,
            approvedByUser: true,
            reason: repairReason,
            ...(dryRun ? { dryRun } : {}),
          },
        },
      });
    }
  }
  return runRepair(store);
};

export const archiveChangeTools = {
  adv_change_archive: {
    description: "Archive a completed change (applies deltas to specs)",
    args: {
      changeId: z.string().describe("Change ID to archive"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview changes without writing. With dryRun: true, this tool is read-only and safe to invoke without approval.",
        ),
      worktreePath: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to a git worktree where the in-repo bundle should be written. Defaults to the project root (main checkout). Used by /adv-archive Phase 9 Step 1 so bundles land in the worktree's .adv/archive/ and can be staged on the change branch without cp -r workarounds.",
        ),
      noCloseIssue: z
        .boolean()
        .optional()
        .describe("Skip automatic linked GitHub issue closure"),
      closeIssue: z
        .boolean()
        .optional()
        .describe(
          "Backward-compatible explicit affirmative (no-op, closure is default-on)",
        ),
      phase9: z
        .enum(["run", "skip"])
        .optional()
        .describe(
          "Phase 9 git finalization mode. Defaults to run. 'skip' is a compatibility/manual-recovery escape hatch; release gate completion must happen only after reachability/push evidence exists.",
        ),
      prTitleType: z
        .enum([
          "feat",
          "fix",
          "perf",
          "chore",
          "docs",
          "refactor",
          "test",
          "build",
          "ci",
          "style",
          "revert",
        ])
        .optional()
        .describe(
          "Optional Conventional Commit type for the archive PR title. Used when the project's archive.pr_title_policy.format is 'conventional' and the change metadata does not provide a type. Operator explicit choice overrides any metadata-derived type.",
        ),
      ...targetPathSchema.shape,
    },
    execute: advChangeArchiveHandler,
  },
  adv_archive_purge: {
    description:
      "Operator-only maintenance tool (rq-archivePurge01): purge an archived change. Two escalation levels — default workflow-only purge terminates the archived change's Temporal workflow while preserving the on-disk archive bundle and disk projection (adv_change_show keeps returning content from disk); opt-in includeDiskBundle: true additionally removes the archive/<id>/ bundle directory and local disk projection recursively so subsequent adv_change_show returns the not-found path. Archived-only: refuses non-archived or unknown changeIds with a structured error and no mutations. Requires approvedByUser: true plus non-empty approvalEvidence; returns an audit result {changeId, workflowTerminated, bundleRemoved, archivedPath}. Not a routine autonomous agent action — invoke only on explicit operator instruction.",
    args: {
      changeId: z.string().describe("Archived change ID to purge"),
      includeDiskBundle: z
        .boolean()
        .optional()
        .describe(
          "Opt-in destructive escalation: also recursively remove the archive/<id>/ bundle directory and local disk projection so adv_change_show returns not-found. Default false preserves the on-disk bundle.",
        ),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms the operator explicitly approved this purge",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Audited evidence of operator approval for this purge (e.g. operator instruction + reason).",
        ),
    },
    execute: advArchivePurgeHandler,
  },
  adv_change_workflow_terminate: {
    description:
      "Operator-only maintenance tool: terminate the EXACT wedged or shipped-terminal run of a change's Temporal workflow, pinned by runId via describe() — NOT a Temporal Reset. Eligibility is strict and ordered: approval-first (approvedByUser + non-blank approvalEvidence before any read or mutation); the change must exist and NOT be archived (archived changes route to adv_archive_purge, the sole archived-change lever — rq-archivePurge01 semantics preserved); shipped proof required (acceptance AND release gates done on the disk projection). The workflow is then described once and the exact run pinned. Two eligibility classes (rq-shippedWorkflowTermination01): (1) poisoned_history — describe carries poisoned-history evidence; terminate + cache refresh only (no convergence write). (2) shipped_terminal — describe shows RUNNING/PAUSED with no poison but the durable disk projection carries all 7 gates done + phase9_status done + a schema-valid archive bundle whose embedded change.id strictly equals the requested changeId; terminate + atomic status/lifecycleState=archived convergence write + read-after-write verification + two successor-race checks (pre-write + post-readback). A not-found/completed describe or an already-terminal run status is idempotent success ONLY for the poisoned class; for the shipped_terminal class it routes through convergence (or refuses with IDEMPOTENT_BUT_PROOF_MISSING if proof fails). Shipped-terminal refusal codes: PROOF_INVALID_DISK_PROJECTION, PROOF_MISSING_GATES, PROOF_MISSING_PHASE9, PROOF_NO_BUNDLE, PROOF_INVALID_BUNDLE, PROOF_BUNDLE_ID_MISMATCH. A run with no pin-able runId or an unclassifiable status is refused. RUNNING/PAUSED status alone never authorizes termination. dryRun returns the full structured pin assessment (eligibilityClass + proof components) without terminating or touching the projection cache. Termination targets the pinned run via getHandle(workflowId, runId); a not-found terminate is idempotent success, and any other terminate failure returns a structured error BEFORE any projection-cache refresh (failure-before-projection-mutation). On shipped_terminal success, the projection cache is refreshed and readback asserts both status and lifecycleState converged to archived. Not a routine autonomous agent action — invoke only on explicit operator instruction.",
    args: {
      changeId: z
        .string()
        .describe("Change ID whose wedged workflow run should be terminated"),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms the operator explicitly approved this workflow termination",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Audited evidence of operator approval for this termination (e.g. operator instruction + wedged-state reason).",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview the eligibility + pin assessment (describe is performed) without terminating the run or refreshing the projection cache.",
        ),
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .default("normal")
        .describe(
          "Recovery mode. 'poisoned_history' allows the operator to supply precise recovery evidence to skip the workflow describe precheck and terminate via the unpinned handle, falling through to the disk projection on signal failure.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Operator-supplied precise recovery evidence (e.g. TMPRL1100, WorkflowNotFoundError, WorkflowExecutionAlreadyCompleted). Required when recoveryMode is 'poisoned_history'.",
        ),
    },
    execute: advChangeWorkflowTerminateHandler,
  },
  adv_change_repair_origin: {
    description:
      "Repair the origin linkage of an active/open ADV change. Audited and claim-safe: requires approval evidence and a reason, validates the origin kind/linkage matrix, rejects conflicting open issue claims with existing claimant evidence, and refuses archived/closed changes.",
    args: {
      changeId: z.string().describe("Change ID to repair"),
      origin_kind: ChangeOriginKindSchema.describe(
        "New origin provenance kind ('roadmap', 'discovery', 'triage', or 'adhoc')",
      ),
      origin_issue_number: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "GitHub issue number for kind=roadmap (required) or kind=triage (optional). Rejected for discovery and adhoc origins.",
        ),
      origin_source_artifact: z
        .string()
        .optional()
        .describe(
          "Stable upstream artifact reference for kind=triage or kind=discovery.",
        ),
      approvalEvidence: z
        .string()
        .min(1)
        .describe("Audited evidence of operator approval for this repair"),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms operator explicitly approved the origin repair",
        ),
      reason: z
        .string()
        .min(1)
        .describe("Non-blank rationale for the origin repair"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the repair without firing a signal"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the repair through that project's Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: advChangeRepairOriginHandler,
  },
};
