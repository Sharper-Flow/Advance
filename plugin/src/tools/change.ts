// rq-prop-context1: Durable Proposal Context for adv-task
/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */
import { z, ZodError } from "zod";
import { createHash } from "crypto";
import { rm, readFile } from "fs/promises";
import { basename, join, relative, resolve } from "path";
import type { FastFollowOf, ChangeOrigin, WorkNodeRef } from "../types";
import {
  createDefaultGates,
  allGatesSatisfied,
  GateIdSchema,
  ChangeListStatusFilterSchema,
  ChangeOriginKindSchema,
  ChangeRepoScopeSchema,
  BriefingPacketLaneSchema,
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  WorkNodeRefSchema,
  ReleaseNotesContentSchema,
  type GateId,
  type ArtifactKind,
  type Change,
  type ChangeLifecycleState,
  type ChangeRepoScope,
  type ScopedSubagentReport,
  type BriefingPacketLane,
  type GateCompletion,
  type WorkerBundleImpact,
  type ReleaseNotesContent,
  type HydrationStats,
} from "../types";
import { ChangeSchema } from "../types/changes";
import type { ChangeCreateInitialMetadata, Store } from "../storage/store";
import type { ProjectConfig } from "../types/project";
import { loadAllSpecs } from "../storage/json";
import { getReflection } from "../storage/reflection";
import { loadChange } from "../storage/json";
import { getProjectId } from "../utils/project-id";
import { formatZodError } from "../utils/safe-execute";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import { projectLoopLedger } from "../utils/loop-ledger";
import { advWorktreeDelete } from "./worktree";
import { initStateDb as initWorktreeStateDb } from "./worktree/state";
import {
  compactOpsFollowupAnnotation,
  compactOpsFollowupLinkAnnotations,
} from "./ops-followup-readback";
import {
  normalizeArtifactMetadataForReadback,
  normalizeGateArtifactEvidenceForReadback,
  loadProposalForContext,
  readArtifacts,
  type ArtifactReadResult,
} from "./change/artifacts";
import {
  checkActiveDuplicateChange,
  ChangeCreateProviders,
  DEFAULT_CLAIM_RACE_CHECK_MS,
  defaultClaimChecker,
  extractContextMismatch,
  isSyntheticValidationDraftSummary,
  buildSyntheticValidationDraftError,
  collectBlankCreateArtifactOrLinkageFields,
  validateCreateOriginLinkage,
  invalidGitHubIssueUrls,
  applyIssueUpdates,
  applyClarifyReadinessToChangeOutput,
  appendClarifyNeededForCreatedChange,
  buildEpicMembershipFromSeed,
  createCrossProjectFollowUp,
  validateParentChange,
  resolveScopeRepos,
  filterChangesForProductScope,
  productContextOutput,
  loadValidationContext,
} from "./change/create-clarify";
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
} from "./change/archive-gate";
import { releaseGateProofToCompletion } from "./change/release-proof";
import {
  getGateDivergenceHint,
  ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT,
  isSearchAttributeArchiveFailure,
  verifyStatusRepairReadAfterWrite,
  loadSpecsMap,
  buildReentryResult,
  closeLinkedIssue,
  buildChangeClosePayload,
  computeShippedTerminalProof,
  type ShippedTerminalProofResult,
} from "./change/recovery";
import {
  logRecoveryProbeDiagnostics,
  shouldTakeRecoveryBranch,
} from "./recovery-probe";
import { markPoisonedWorkflowForChange } from "../storage/store-temporal/poisoned-workflow-cache";
import { classifyMutationRecoveryDecision } from "./monotonic-recovery";
import { reconcileRecoveredGates } from "./gate";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import {
  getPluginBundleDistDir,
  getPluginBundleReleasePreflightError,
} from "../plugin-bundle-manifest";
import {
  buildD3ContextFromStore,
  enforceD3ForChangeCreate,
  type D3EnforcementError,
} from "../validator/work-graph-enforcement";
import { nodeRefKey } from "../validator/work-graph-validation";

import {
  createTemporalReadContext,
  isTemporalReadExpired,
  runTemporalRead,
  type TemporalReadContext,
} from "../storage/store-temporal/read-context";
import { TemporalQueryTimeoutError } from "../temporal/retry-wrapper";

const logger = createLogger("change");

const LEAN_PHASE_PLAN_FIELDS = new Set([
  "id",
  "title",
  "status",
  "gates",
  "acceptanceCriteria",
  "_phasePlan",
  "_unavailable",
]);

const DIRECTIVE_INCLUDE_FIELDS: Record<string, readonly string[]> = {
  ledger: ["_ledger"],
  loopLedger: ["_loopLedger"],
  loopLedgerDetails: ["_loopLedger"],
  snapshot: ["_contextSnapshot", "_contextSnapshotError"],
  readyTasks: [
    "_readyTasks",
    "_readyTasksMeta",
    "_todoProjection",
    "_readyTasksError",
  ],
  proposal: ["_proposal"],
  problemStatement: ["_problemStatement"],
  agreement: ["_agreement"],
  design: ["_design"],
  executiveSummary: ["_executiveSummary"],
  acceptance: ["_acceptance"],
  subagentReports: ["_subagentReports", "_subagentReportsMeta"],
  briefingPacket: ["_briefingPacket", "_briefingPacketError"],
};

function hasPhaseDirective(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as { kind?: unknown; directive?: unknown };
  return plan.kind === "actionable" && plan.directive !== undefined;
}

function shapeDirectiveResponse(
  output: Record<string, unknown>,
  include: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!hasPhaseDirective(output._phasePlan)) return undefined;

  // The phase-start read requests only the plan. Preserve every explicitly
  // requested companion projection instead of silently replacing it with an
  // omission marker, while still suppressing the default heavy payload.
  const retainedFields = new Set(LEAN_PHASE_PLAN_FIELDS);
  for (const [includeKey, outputKeys] of Object.entries(
    DIRECTIVE_INCLUDE_FIELDS,
  )) {
    if (include[includeKey] === true) {
      for (const outputKey of outputKeys) retainedFields.add(outputKey);
    }
  }

  const leanOutput: Record<string, unknown> = {};
  const omittedFields = Object.keys(output)
    .filter((key) => !retainedFields.has(key) && output[key] !== undefined)
    .sort();

  for (const key of retainedFields) {
    if (output[key] !== undefined) leanOutput[key] = output[key];
  }
  if (omittedFields.length > 0) leanOutput._omittedFields = omittedFields;

  return leanOutput;
}

function formatD3Error(error: D3EnforcementError): string {
  switch (error.code) {
    case "INVALID_WORK_NODE_REF": {
      const reason = (error as { reason?: string }).reason;
      if (reason === "self_edge") return "Self-dependency is not allowed.";
      if (reason === "duplicate_ref")
        return "Duplicate dependency reference in same_project_dependencies.";
      return "Invalid dependency reference.";
    }
    case "UNRESOLVED_DEPENDENCY":
      return "Dependency target does not exist in scope.";
    case "DEPENDENCY_CYCLE":
      return "Adding this dependency would create a cycle.";
    case "DEP_PREREQ_NONTERMINAL": {
      const refs = (error as { blocking_refs: WorkNodeRef[] }).blocking_refs;
      return `Cannot create change: prerequisites are not terminal: ${refs.map((r) => nodeRefKey(r)).join(", ")}`;
    }
    default:
      return `Dependency enforcement failed: ${error.code}`;
  }
}

/**
 * rq-boundedAuthoritativeRead01: shared aggregate deadline runner for the
 * composed adv_change_show read. Every optional/enrichment subread (clarify
 * readiness, external dependency status, snapshot/phase-plan projection, ready
 * tasks, briefing packet, artifact content, archived reflection) shares one
 * request-scoped 8-second TemporalReadContext and a 1500ms per-member cap so
 * a slow optional enrichment cannot take a fresh budget.
 */
function createChangeShowSubreadRunner(readCtx: TemporalReadContext) {
  const omittedIds: string[] = [];

  async function run<T>(
    label: string,
    op: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    if (isTemporalReadExpired(readCtx) || readCtx.isCircuitBreakerTripped()) {
      const error = new TemporalQueryTimeoutError(readCtx.deadline.budgetMs);
      omittedIds.push(label);
      return { ok: false, error };
    }
    try {
      const read = await runTemporalRead(undefined, op, readCtx, {
        timeoutMs: 1_500,
        opType: label,
        maxAttempts: 1,
      });
      if (!read.complete) {
        if (read.error instanceof TemporalQueryTimeoutError) {
          readCtx.recordUnresponsiveMember();
        }
        omittedIds.push(label);
        return { ok: false, error: read.error };
      }
      readCtx.recordResponsiveMember();
      return { ok: true, value: read.data as T };
    } catch (error) {
      logger.debug("subread.run error", { label, error });
      if (error instanceof TemporalQueryTimeoutError) {
        readCtx.recordUnresponsiveMember();
      }
      omittedIds.push(label);
      return { ok: false, error };
    }
  }

  /**
   * Run a sub-read that can satisfy itself from durable local state.
   *
   * `run` refuses to invoke its operation once the aggregate Temporal budget
   * is spent, which is correct for reads that can only be served by a live
   * workflow query. Artifact content is different: it is mirrored into the
   * durable disk projection, so an exhausted Temporal budget must not stop
   * the local tiers from serving it (rq-artifactPathTruth01). The operation
   * receives the request deadline so its own Temporal tier still self-gates,
   * and the local tiers remain reachable regardless.
   */
  async function runLocalCapable<T>(
    label: string,
    op: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    try {
      return { ok: true, value: await op() };
    } catch (error) {
      logger.debug("subread.runLocalCapable error", { label, error });
      omittedIds.push(label);
      return { ok: false, error };
    }
  }

  function getHydrationStats(): HydrationStats | undefined {
    if (omittedIds.length === 0) return undefined;
    return {
      deadlineExceeded: true,
      omitted: omittedIds.length,
      omittedIds,
    };
  }

  return { run, runLocalCapable, getHydrationStats };
}

/**
 * Map of artifact kind → the `adv_change_show` output key that carries its
 * raw content. Provenance for each resolved kind is reported alongside under
 * `_artifactSources` so a caller can distinguish an authoritative live
 * workflow read from a projection/disk/archive fallback.
 */
const ARTIFACT_OUTPUT_KEYS: Record<string, string> = {
  proposal: "_proposal",
  problemStatement: "_problemStatement",
  agreement: "_agreement",
  design: "_design",
  executiveSummary: "_executiveSummary",
  acceptance: "_acceptance",
};

function applyArtifactContentToOutput(
  output: Record<string, unknown>,
  artifactContent: Partial<Record<ArtifactKind, ArtifactReadResult>>,
): void {
  const sources: Record<string, string> = {};
  for (const [kind, outputKey] of Object.entries(ARTIFACT_OUTPUT_KEYS)) {
    const entry = artifactContent[kind as ArtifactKind];
    if (entry === undefined) continue;
    output[outputKey] = entry.content;
    sources[kind] = entry.source;
  }
  if (Object.keys(sources).length > 0) {
    output._artifactSources = sources;
  }
}

// adv_change_workflow_terminate: shipped proof = acceptance AND release gates
// done on the disk projection. Only a fully-shipped change may have its
// wedged workflow terminated — the disk projection is authoritative for
// everything the change still needs.
const WORKFLOW_TERMINATE_SHIPPED_GATES = ["acceptance", "release"] as const;

// Run statuses that are already terminal server-side: nothing left to
// terminate, so the tool reports idempotent success (after eligibility).
const TERMINAL_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TERMINATED",
  "CONTINUED_AS_NEW",
  "TIMED_OUT",
]);

// Run statuses eligible for termination. Anything else (UNSPECIFIED,
// UNKNOWN, absent) is refused — never act on an unclassifiable run.
const TERMINABLE_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "RUNNING",
  "PAUSED",
]);

// =============================================================================
// rq-shippedWorkflowTermination01 — terminal-authority convergence helper.
//
// Single funneled path used by adv_change_workflow_terminate after an eligible
// run is terminated (or determined idempotently gone). Writes status AND
// lifecycleState atomically, refreshes the projection cache, asserts both
// fields via read-back, and detects a successor run (TOCTOU window) both
// before the write and after the readback.
// =============================================================================

type ConvergeTerminalAuthorityResult =
  | {
      kind: "converged";
      readback: Awaited<
        ReturnType<typeof verifyStatusRepairReadAfterWrite>
      >["readback"];
    }
  | {
      kind: "successorRace";
      successorRunId: string;
      phase: "pre_write";
    }
  | {
      kind: "lateSuccessorRace";
      successorRunId: string;
      phase: "post_readback";
    }
  | {
      kind: "writeFailed";
      error: string;
    }
  | {
      kind: "readbackFailed";
      error: string;
      readback: Awaited<
        ReturnType<typeof verifyStatusRepairReadAfterWrite>
      >["readback"];
    };

/**
 * Converge terminal authority after an eligible pinned run is terminated.
 * Returns a typed result; the caller is responsible for shaping the tool
 * output (success only when kind === "converged").
 *
 * The `describeUnpinned` callback must invoke `handle.describe()` on an
 * UNPINNED handle (no runId) so Temporal returns the most-recent execution.
 * That lets us detect a different live successor run that may have started
 * after pinning.
 */
async function convergeTerminalAuthority(input: {
  store: Store;
  changeId: string;
  pinnedRunId: string;
  authorization: { reason: string; evidence: string };
  describeUnpinned: () => Promise<unknown>;
}): Promise<ConvergeTerminalAuthorityResult> {
  // Successor check #1 (pre-write): a successor may have started between
  // the pinned describe and the terminate landing.
  try {
    const postTerminateDesc = await input.describeUnpinned();
    const pin = workflowRunPinFromDescription(postTerminateDesc);
    if (
      pin.runId &&
      pin.runId !== input.pinnedRunId &&
      pin.statusName &&
      TERMINABLE_WORKFLOW_RUN_STATUSES.has(pin.statusName)
    ) {
      return {
        kind: "successorRace",
        successorRunId: pin.runId,
        phase: "pre_write",
      };
    }
  } catch (error) {
    // not-found/completed is acceptable — the pinned run is gone and no
    // successor exists. Any other error falls through to convergence.
    const { isWorkflowCompletedError } =
      await import("../temporal/recovery-classification");
    if (!isWorkflowCompletedError(error)) {
      // Surface as writeFailed with describe error so the operator sees it.
      return {
        kind: "writeFailed",
        error: `pre-write successor describe failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Load the current change to spread onto the disk projection.
  const currentResult = await input.store.changes.get(input.changeId);
  if (!currentResult.success || !currentResult.data) {
    return {
      kind: "writeFailed",
      error: "could not load change for convergence write",
    };
  }
  const change = currentResult.data;

  // Write status AND lifecycleState atomically (D5).
  try {
    const { saveRecoveredChangeStatus } = await import("./_recovery-writers");
    await saveRecoveredChangeStatus({
      store: input.store,
      change,
      authorization: input.authorization,
      status: "archived",
      lifecycleState: "archived",
    });
  } catch (error) {
    return {
      kind: "writeFailed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Refresh projection cache so subsequent reads fall through to disk.
  try {
    await input.store.changes.refresh(input.changeId);
  } catch (error) {
    logger.debug(
      `Post-convergence cache refresh failed for ${input.changeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Read-after-write verification (D6).
  const readback = await verifyStatusRepairReadAfterWrite({
    store: input.store,
    changeId: input.changeId,
    requireLifecycleState: true,
  });
  if (!readback.ok) {
    return {
      kind: "readbackFailed",
      error: readback.error,
      readback: readback.readback,
    };
  }

  // Successor check #2 (post-readback): catches a successor that started
  // between the write and the readback (TOCTOU window).
  try {
    const finalDesc = await input.describeUnpinned();
    const finalPin = workflowRunPinFromDescription(finalDesc);
    if (
      finalPin.runId &&
      finalPin.runId !== input.pinnedRunId &&
      finalPin.statusName &&
      TERMINABLE_WORKFLOW_RUN_STATUSES.has(finalPin.statusName)
    ) {
      return {
        kind: "lateSuccessorRace",
        successorRunId: finalPin.runId,
        phase: "post_readback",
      };
    }
  } catch (error) {
    // rq-shippedWorkflowTermination01 AC8: a non-completed error from the
    // final successor check cannot prove absence of a live successor. Surface
    // as a typed partial-recovery result so the operator knows convergence
    // authority is unverifiable. Not-found/completed is acceptable (means
    // no successor exists).
    const { isWorkflowCompletedError } =
      await import("../temporal/recovery-classification");
    if (!isWorkflowCompletedError(error)) {
      return {
        kind: "readbackFailed",
        error: `post-readback successor describe failed (convergence authority unverifiable): ${error instanceof Error ? error.message : String(error)}`,
        readback: {
          showStatus: "archived",
          showLifecycleState: "archived",
          inFlightCount: 0,
          archivedCount: 1,
        },
      };
    }
  }

  return { kind: "converged", readback: readback.readback };
}

/**
 * Format a non-converged result from convergeTerminalAuthority into the
 * operator-facing tool output. Used by both the terminate-then-converge and
 * idempotent-then-converge paths so failure shapes stay consistent.
 */
function formatConvergeFailure(input: {
  converge: Exclude<ConvergeTerminalAuthorityResult, { kind: "converged" }>;
  changeId: string;
  runId: string;
  eligibilityClass: "shipped_terminal";
  fromStatus: Change["status"];
  shippedTerminalProof: ShippedTerminalProofResult | null;
}): string {
  const { converge, changeId, runId, eligibilityClass, fromStatus } = input;
  if (converge.kind === "successorRace") {
    return formatToolOutput({
      success: false,
      partialRecovery: true,
      pinnedRunTerminated: true,
      converged: false,
      changeId,
      runId,
      eligibilityClass,
      fromStatus,
      successorRace: {
        pinnedRunId: runId,
        successorRunId: converge.successorRunId,
        phase: converge.phase,
      },
      remediation:
        "A different live successor run appeared before convergence write. Re-elevate operator approval and re-run adv_change_workflow_terminate against the successor runId, or adv_archive_purge once status converges.",
    });
  }
  if (converge.kind === "lateSuccessorRace") {
    return formatToolOutput({
      success: false,
      partialRecovery: true,
      pinnedRunTerminated: true,
      converged: false,
      changeId,
      runId,
      eligibilityClass,
      fromStatus,
      attemptedStatus: "archived",
      attemptedLifecycleState: "archived",
      lateSuccessorRace: {
        pinnedRunId: runId,
        successorRunId: converge.successorRunId,
        phase: converge.phase,
      },
      remediation:
        "Late successor appeared after convergence write. Disk projection is archived but a new live run exists. Re-elevate operator approval and re-run adv_change_workflow_terminate against the successor runId.",
    });
  }
  if (converge.kind === "writeFailed") {
    return formatToolOutput({
      success: false,
      partialRecovery: true,
      pinnedRunTerminated: true,
      converged: false,
      changeId,
      runId,
      eligibilityClass,
      fromStatus,
      attemptedStatus: "archived",
      attemptedLifecycleState: "archived",
      error: `Convergence write failed: ${converge.error}`,
      remediation:
        "Pinned run was terminated but the disk projection write failed. Re-run adv_change_workflow_terminate dryRun:true to re-check; if workflow is gone, run adv_doctor to diagnose the wedged projection. Status-flip recovery is being internalized (rq-creationRequestHash01 / design D4).",
    });
  }
  // readbackFailed
  return formatToolOutput({
    success: false,
    partialRecovery: true,
    pinnedRunTerminated: true,
    converged: false,
    changeId,
    runId,
    eligibilityClass,
    fromStatus,
    attemptedStatus: "archived",
    attemptedLifecycleState: "archived",
    error: `Terminal readback failed: ${converge.error}`,
    readback: converge.readback,
    remediation:
      "Workflow run was terminated and disk projection was written, but terminal readback did not converge. Re-run adv_change_workflow_terminate dryRun:true to re-check; if workflow is gone, run adv_doctor to diagnose the wedged projection. Status-flip recovery is being internalized (rq-creationRequestHash01 / design D4).",
  });
}

// =============================================================================
// rq-archiveConvergenceRecovery — dead-workflow archive convergence writer.
//
// When a workflow dies before the archiveConvergedSignal can project, a change
// may be stuck half-converged: status archived but lifecycleState open,
// release gate pending, phase9_status pending. This writer repairs the disk
// projection through the storage-owned conditional projection commit when
// shipped proof and a valid archive bundle are present.
// =============================================================================

export type ArchiveConvergenceRefusalCode =
  | "AUTHORIZATION_MISSING"
  | "PROOF_NOT_SHIPPED"
  | "PROOF_MISSING_BUNDLE"
  | "PROOF_INVALID_BUNDLE"
  | "PROOF_BUNDLE_ID_MISMATCH";

export type SaveRecoveredArchiveConvergenceResult =
  | {
      kind: "converged";
      change: Change;
      readback: {
        status: "archived";
        lifecycleState: "archived";
        releaseStatus: "done";
        phase9Status: "done";
      };
    }
  | {
      kind: "refused";
      refusalCode: ArchiveConvergenceRefusalCode;
      evidence: string;
    }
  | {
      kind: "writeFailed";
      error: string;
    }
  | {
      kind: "readbackFailed";
      error: string;
      readback: {
        status?: Change["status"];
        lifecycleState?: Change["lifecycleState"];
        releaseStatus?: GateCompletion["status"];
        phase9Status?: NonNullable<Change["phase9_status"]>["status"];
      };
    }
  | {
      kind: "state_unknown";
      error: string;
      readback: {
        status?: Change["status"];
        lifecycleState?: Change["lifecycleState"];
        releaseStatus?: GateCompletion["status"];
        phase9Status?: NonNullable<Change["phase9_status"]>["status"];
      };
    };

export async function saveRecoveredArchiveConvergence(input: {
  store: Store;
  change: Change;
  changeId: string;
  authorization: { reason: string; evidence: string };
  finalization: GitFinalizeOutcome;
  releaseGate?: GateCompletion;
  archivedAt?: string;
}): Promise<SaveRecoveredArchiveConvergenceResult> {
  const { reason, evidence } = input.authorization;
  if (!reason?.trim() || !evidence?.trim()) {
    return {
      kind: "refused",
      refusalCode: "AUTHORIZATION_MISSING",
      evidence:
        "disk-projection recovery authorization requires non-empty reason and evidence",
    };
  }

  // Shipped proof: finalization must be verified shipped by the archive flow.
  if (input.finalization.status !== "shipped") {
    return {
      kind: "refused",
      refusalCode: "PROOF_NOT_SHIPPED",
      evidence: `finalization.status: ${input.finalization.status}`,
    };
  }

  // Archive bundle proof: bundle must exist and contain a change with the
  // requested changeId.
  const bundlePath = await findArchiveBundle(
    input.store.paths.archive,
    input.changeId,
  );
  if (!bundlePath) {
    return {
      kind: "refused",
      refusalCode: "PROOF_MISSING_BUNDLE",
      evidence: `no archive bundle found under ${input.store.paths.archive} for ${input.changeId}`,
    };
  }
  let bundleJsonText: string;
  try {
    bundleJsonText = await readFile(join(bundlePath, "change.json"), "utf-8");
  } catch (error) {
    return {
      kind: "refused",
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle change.json unreadable at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let bundleParsed: unknown;
  try {
    bundleParsed = JSON.parse(bundleJsonText);
  } catch (error) {
    return {
      kind: "refused",
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle change.json JSON parse failed at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let bundleChange: Change;
  try {
    bundleChange = ChangeSchema.parse(bundleParsed);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        kind: "refused",
        refusalCode: "PROOF_INVALID_BUNDLE",
        evidence: `bundle ChangeSchema parse failed: ${formatZodError(error)}`,
      };
    }
    return {
      kind: "refused",
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle ChangeSchema parse threw non-Zod error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (bundleChange.id !== input.changeId) {
    return {
      kind: "refused",
      refusalCode: "PROOF_BUNDLE_ID_MISMATCH",
      evidence: `bundle change.id: "${bundleChange.id}", requested: "${input.changeId}"`,
    };
  }

  const archivedAt = input.archivedAt ?? new Date().toISOString();
  const completedBy = "adv-archive";
  const approvalEvidence = buildReleaseCompletionEvidence(input.finalization);

  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      kind: "workflow_completed",
      evidence: {
        reason: "missing_workflow",
        evidence: `${input.authorization.reason}; ${input.authorization.evidence}`,
      },
    },
    changesDir: input.store.paths.changes,
    expectedRevision: input.change.projection_revision ?? 0,
    intent: {
      changeId: input.changeId,
      mutationKind: "archive_convergence",
      sendSignal: async () => {},
      refresh: async () => ({}) as never,
      verifyTemporal: () => true,
      mutateLatestProjection: (latest) => {
        const releaseGateDone: GateCompletion = input.releaseGate ?? {
          status: "done",
          completed_at: archivedAt,
          completed_by: completedBy,
          approval_evidence: approvalEvidence,
          recovery_audit: {
            reason: "archive_convergence_recovery",
            evidence: `${input.authorization.reason}; ${input.authorization.evidence}`,
            recovered_at: archivedAt,
          },
        };
        const phase9Done = preservePhase9Evidence(latest.phase9_status, {
          status: "done",
          startedAt: latest.phase9_status?.startedAt ?? archivedAt,
          completedAt: archivedAt,
          route: input.finalization.route,
          ...(input.finalization.prNumber
            ? { prNumber: input.finalization.prNumber }
            : {}),
          ...(input.finalization.prUrl
            ? { prUrl: input.finalization.prUrl }
            : {}),
          ...(input.finalization.mergeCommitSha
            ? { mergeCommitSha: input.finalization.mergeCommitSha }
            : {}),
          ...(input.finalization.changeTipSha
            ? { changeTipSha: input.finalization.changeTipSha }
            : {}),
          autoMergeArmed: false,
        });
        return {
          ...latest,
          status: "archived",
          lifecycleState: "archived",
          gates: {
            ...(latest.gates ?? {}),
            release: releaseGateDone,
          },
          phase9_status: phase9Done,
        };
      },
      verifyProjection: (readback) => {
        const failures: string[] = [];
        if (readback.status !== "archived") {
          failures.push(`status: ${readback.status ?? "missing"}`);
        }
        if (readback.lifecycleState !== "archived") {
          failures.push(
            `lifecycleState: ${readback.lifecycleState ?? "missing"}`,
          );
        }
        if (readback.gates?.release?.status !== "done") {
          failures.push(
            `release gate: ${readback.gates?.release?.status ?? "missing"}`,
          );
        }
        if (readback.phase9_status?.status !== "done") {
          failures.push(
            `phase9_status: ${readback.phase9_status?.status ?? "missing"}`,
          );
        }
        return failures.length === 0
          ? true
          : {
              ok: false,
              error: `readback did not converge: ${failures.join("; ")}`,
            };
      },
    },
  });

  try {
    await input.store.changes.refresh(input.changeId);
  } catch {
    // Best-effort cache refresh; the disk commit is the important effect.
  }

  switch (outcome.kind) {
    case "recovered_verified":
    case "applied_temporal": {
      const readback = outcome.value;
      return {
        kind: "converged",
        change: readback,
        readback: {
          status: readback.status,
          lifecycleState: readback.lifecycleState,
          releaseStatus: readback.gates?.release?.status,
          phase9Status: readback.phase9_status?.status,
        } as Extract<
          SaveRecoveredArchiveConvergenceResult,
          { kind: "converged" }
        >["readback"],
      };
    }
    case "recovered_unverified":
      return {
        kind: "state_unknown",
        error: `archive convergence recovery wrote the projection but the postcondition could not be verified: ${outcome.reason}`,
        readback: {},
      };
    case "stale_revision":
      return {
        kind: "writeFailed",
        error: `archive convergence recovery encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
      };
    case "operator_required":
      return {
        kind: "writeFailed",
        error: `archive convergence recovery could not commit the projection: ${outcome.reason}`,
      };
    default: {
      const _exhaustive: never = outcome;
      return {
        kind: "writeFailed",
        error: `archive convergence recovery returned unexpected outcome: ${String(_exhaustive)}`,
      };
    }
  }
}

/**
 * Structural narrowing of a `describe()` result into the exact run pin
 * (runId + status name). Accepts both the SDK status object shape
 * (`status.name`) and a plain string status; anything absent stays
 * undefined so the caller can refuse instead of guessing.
 */
function workflowRunPinFromDescription(description: unknown): {
  runId?: string;
  statusName?: string;
} {
  if (typeof description !== "object" || description === null) return {};
  const record = description as Record<string, unknown>;
  const runId =
    typeof record.runId === "string" && record.runId.length > 0
      ? record.runId
      : undefined;
  let statusName: string | undefined;
  const status = record.status;
  if (typeof status === "object" && status !== null) {
    const name = (status as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) statusName = name;
  } else if (typeof status === "string" && status.length > 0) {
    statusName = status;
  }
  return { runId, statusName };
}

async function getChangeWorkflowHandleForStore(store: Store, changeId: string) {
  const { getService } = await import("../temporal/service");
  const service = getService();
  const projectId = service ? await getProjectId(store.paths.root) : null;
  if (!service || !projectId) return undefined;
  const { getChangeHandle } = await import("./_adapters");
  return getChangeHandle(service, projectId, changeId);
}

function subagentReportTaskId(
  report: ScopedSubagentReport,
): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}
function subagentReportReadbackKey(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: subagentReportTaskId(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(report),
  });
}
const DEFAULT_BRIEFING_PACKET_LANE: BriefingPacketLane = "engineer";

function briefingPacketGeneratedBy(
  lane: BriefingPacketLane,
  request?: string,
): string {
  const generatedBy = request
    ? `adv_change_show:${lane}:${request}`
    : `adv_change_show:${lane}`;
  return generatedBy.slice(0, BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH);
}

function collectBriefingFactsForReadback(change: Change) {
  const facts: BriefingPacketRendererInput["durable_facts"] = [];
  const seenIds = new Set<string>();

  const pushUnique = (
    fact: NonNullable<BriefingPacketRendererInput["durable_facts"]>[number],
  ): void => {
    if (seenIds.has(fact.id)) return;
    seenIds.add(fact.id);
    facts.push(fact);
  };

  for (const task of change.tasks ?? []) {
    for (const report of task.subagent_reports ?? []) {
      for (const fact of classifyBriefingFacts({ report })) {
        pushUnique(fact);
      }
    }
  }

  for (const report of change.subagent_reports ?? []) {
    for (const fact of classifyBriefingFacts({ report })) {
      pushUnique(fact);
    }
  }

  return facts;
}

/**
 * Storage-backed adapter that hydrates existing ADV structured state into the
 * pure briefing-packet renderer. Reads artifact content only when a packet is
 * requested; never mutates workflow state or persists live packet bodies.
 */
async function buildBriefingPacketForChange(
  store: Store,
  change: Change,
  lane: BriefingPacketLane = DEFAULT_BRIEFING_PACKET_LANE,
  request?: string,
): Promise<BriefingPacketRendererInput> {
  const changeId = change.id;
  const artifacts = await readArtifacts(store, changeId, [
    "proposal",
    "problemStatement",
    "acceptance",
  ]);

  const verificationExpectations: string[] = [];
  if (change.contract) {
    for (const item of change.contract.items) {
      if (item.kind === "acceptance_criterion") {
        verificationExpectations.push(item.text);
      }
    }
  }
  if (artifacts.acceptance?.content) {
    for (const line of artifacts.acceptance.content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !verificationExpectations.includes(trimmed)) {
        verificationExpectations.push(trimmed);
      }
    }
  }

  const affectedFiles = new Set<string>();
  if (change.affectedPaths) {
    for (const f of change.affectedPaths) affectedFiles.add(f);
  }
  for (const task of change.tasks ?? []) {
    for (const f of task.touched_files ?? []) affectedFiles.add(f);
  }

  const reviewMatrixById = new Map(
    change.contract?.reviewMatrix?.rows.map((row) => [row.contractId, row]),
  );
  const contractItems: NonNullable<
    BriefingPacketRendererInput["contract"]
  >["items"] =
    change.contract?.items.map((item) => {
      const row = reviewMatrixById.get(item.id);
      const status =
        row?.status ??
        (item.status === "approved" ? ("pass" as const) : ("unknown" as const));
      return {
        id: item.id,
        kind: item.kind,
        text: item.text,
        status,
        variant: item.variant,
      };
    }) ?? [];

  return {
    change_id: changeId,
    title: change.title,
    lane,
    origin: change.origin
      ? {
          kind: change.origin.kind,
          issue_number: change.origin.issue_number,
          source_artifact: change.origin.source_artifact,
        }
      : undefined,
    scope: {
      proposal: artifacts.proposal?.content,
      problem_statement: artifacts.problemStatement?.content,
    },
    contract: contractItems.length ? { items: contractItems } : undefined,
    tasks: change.tasks?.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      touched_files: task.touched_files,
    })),
    affected_files: Array.from(affectedFiles),
    epic_membership: change.epic_membership ?? null,
    verification_expectations:
      verificationExpectations.length > 0
        ? verificationExpectations
        : undefined,
    durable_facts: collectBriefingFactsForReadback(change),
    archive_digest: undefined,
    generated_by: briefingPacketGeneratedBy(lane, request),
    generated_at: new Date().toISOString(),
  };
}
import { fileExists, removeChangeDir } from "../storage/json";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
  readProjectionManifest,
  verifyProjectionAtGitCommit,
  canonicalSha256,
} from "../archive";
import {
  DEFAULT_MAX_CHARS,
  formatToolOutput,
  paginate,
  resolveOutputMode,
} from "../utils/tool-output";
import { withTimeout, TimeoutError } from "../utils/with-timeout";
import {
  buildTodoProjection,
  formatValidationOutput,
  formatSmellReport,
} from "../utils/tool-formatters";
import { checkRequirementSmells } from "../validator/prep-readiness";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import {
  changeToDirectiveState,
  normalizeChangeLifecycleState,
} from "../temporal/change-state";
import { deriveDirectiveSafe } from "../utils/workflow-directive";
import { degradedPhasePlan, derivePhasePlanSafe } from "../utils/phase-plan";
import { withPhaseDirective } from "../utils/phase-directive";
import {
  renderBriefingPacket,
  type BriefingPacketRendererInput,
} from "../utils/briefing-packet-renderer";
import { classifyBriefingFacts } from "../utils/briefing-fact-classifier";
import { resolveChangeSelection } from "../storage/change-selection";
import { sweepClosedChangesFromDisk } from "../storage/disk-sweep";
import { BulkCloseSelectorSchema } from "../types";
import { collectErrorText } from "../temporal/retry-wrapper";
import {
  formatTargetProjectContext,
  type TargetProjectContext,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
  targetPathSchema,
  appendTargetProjectContextOutput,
  EPIC_OWNER_ROUTING_ERROR_CODES,
} from "./target-project";
import { includeSnapshotSchema } from "./shared-args";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { getService } from "../temporal/service";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import {
  changeCancelledSignal,
  gateReenteredSignal,
  originRepairedSignal,
  workerBundleProvenanceRecordedSignal,
  workerBundleImpactSetSignal,
} from "../temporal/messages";
import {
  getOpenOpsFollowupObligations,
  makeOpsResolutionBlocker,
} from "../temporal/gate-readiness";
import {
  isRequiredOpsFollowupLink,
  overlayOpsResolutionsForRead,
  reconcileOpsFollowupLinks,
  resolveRequiredOpsLinks,
} from "./ops-followup-reconciliation";
import {
  detectArchiveMode,
  deleteChangeBranch,
  finalizeRelease,
  validateChangeWorktree,
  type GitFinalizeOutcome,
} from "./archive-helpers/git-finalize";

// =============================================================================
// adv_change_list phase derivation
// =============================================================================

/**
 * Progress phase rendered on adv_change_list rows. Open changes report the
 * current gate; "released" marks the all-gates-done-but-still-open wedge
 * (release gate complete, archive not yet finalized), kept distinct from the
 * in-flight "release" gate; terminal lifecycle states report themselves.
 */
type ChangePhase = GateId | "released" | "archived" | "closed";

/**
 * Derive a row's progress phase from the store-supplied gate/lifecycle hints.
 * Pure derivation over the list read model — no workflow state, no signals.
 * Rows from legacy/mock stores that lack a gate hint omit `phase` entirely
 * rather than fabricating progress from the permanently-"draft" status.
 */
function deriveChangePhase(row: {
  status: Change["status"];
  lifecycleState?: ChangeLifecycleState;
  currentGate?: GateId | "done";
}): ChangePhase | undefined {
  const lifecycle =
    row.lifecycleState ?? normalizeChangeLifecycleState(row.status);
  if (lifecycle === "archived") return "archived";
  if (lifecycle === "closed") return "closed";
  if (row.currentGate === undefined) return undefined;
  return row.currentGate === "done" ? "released" : row.currentGate;
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Internal time budget for adv_change_validate's authoritative input load
 * (change read + validation context: specs, active peers, proposal).
 *
 * Sits below the safeExecute 10s tool ceiling (same safe-budget convention
 * as WORKTREE_TOOL_SAFE_TIMEOUT_MS in tools/adv-worktree.ts) so a slow
 * Temporal query or peer hydration surfaces as an explicit typed degraded
 * response instead of an unclassified whole-tool ToolExecutionTimeout.
 * When the budget is exceeded no validation verdict is produced — the
 * response is typed degraded metadata, never a complete-looking partial.
 */
export const CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS = 8_000;

export const changeTools = {
  adv_change_list: {
    description:
      "List active changes with optional filtering, recency enrichment, and sorting",
    args: {
      status: ChangeListStatusFilterSchema.optional().describe(
        'Filter by status. Use "in-flight" for open changes (draft).',
      ),
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include archived changes (default: false)"),
      includeClosed: z
        .boolean()
        .optional()
        .describe("Include closed changes (default: false)"),
      sort: z
        .enum(["recency", "stalest", "default"])
        .optional()
        .describe(
          'Sort order: "recency" (most recent first), "stalest" (oldest first), "default" (created_at desc)',
        ),
      limit: z
        .number()
        .optional()
        .describe("Max changes to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default: 0)"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
      scope: z
        .enum(["repo", "product"])
        .optional()
        .default("repo")
        .describe(
          "Product-linked visibility scope. `repo` (default) shows changes scoped to the current repo; `product` shows all product changes.",
        ),
    },
    execute: async (
      {
        status,
        includeArchived,
        includeClosed,
        sort,
        limit,
        offset,
        target_path,
        scope = "repo",
      }: {
        status?: string;
        includeArchived?: boolean;
        includeClosed?: boolean;
        sort?: "recency" | "stalest" | "default";
        limit?: number;
        offset?: number;
        target_path?: string;
        scope?: "repo" | "product";
      },
      store: Store,
    ) => {
      // Reject "active"/"pending" at the boundary — they are never stored on
      // changes and would silently return an empty list. The Zod schema also
      // rejects them at parse time; this check is defense-in-depth for direct
      // handler invocation (tests, internal callers).
      if (status === "active" || status === "pending") {
        return formatToolOutput({
          error: `status: "${status}" is not a valid filter for adv_change_list. "active" and "pending" are never stored on changes. Use "in-flight" (or no status filter) for open changes; "archived"/"closed" for terminal changes.`,
        });
      }
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          // rq-changeSummaryReadModel01: default warm path uses
          // `changes.listSummary` when available so unchanged callers
          // benefit from memo/cache short-circuits without forcing every
          // candidate through full hydration. Falls back to the legacy
          // `changes.list` when the store does not implement the optional
          // summary surface (e.g. legacy/mock stores).
          const summaryList = activeStore.changes.listSummary;
          const result = summaryList
            ? await summaryList({
                status: status === "in-flight" ? undefined : status,
                includeArchived,
                includeClosed,
              })
            : await activeStore.changes.list({
                status: status === "in-flight" ? undefined : status,
                includeArchived,
                includeClosed,
              });
          // Enrich with last-activity data from the store-computed timestamp.
          const now = new Date();
          const withLastActivity = result.changes.map((change) => {
            // currentGate/lifecycleState are internal derivation hints for
            // `phase`; only the derived phase is exposed on the row.
            const { currentGate, lifecycleState, ...row } = change;
            const phase = deriveChangePhase({
              status: change.status,
              lifecycleState,
              currentGate,
            });
            const lastActivityAt = new Date(change.lastActivityAt);
            const minutesSince = Math.max(
              0,
              Math.floor((now.getTime() - lastActivityAt.getTime()) / 60000),
            );
            return {
              ...row,
              ...(phase ? { phase } : {}),
              lastActivity: change.lastActivityAt,
              lastActivityAgeMinutes: minutesSince,
              ...(change.fast_follow_of
                ? { parent_change_id: change.fast_follow_of.parent_change_id }
                : {}),
              ops_followup: compactOpsFollowupAnnotation(change.ops_followup),
              ops_followup_links: compactOpsFollowupLinkAnnotations(
                change.ops_followup_links,
              ),
              epic: change.epic_membership
                ? {
                    id: change.epic_membership.epic_id,
                    title: change.epic_membership.title,
                    entry_id: change.epic_membership.entry_id,
                  }
                : undefined,
            };
          });
          let filtered = await filterChangesForProductScope(
            withLastActivity,
            activeStore,
            scope,
          );
          if (status === "in-flight") {
            const inFlightStatuses = new Set(["draft"]);
            filtered = filtered.filter((c) => inFlightStatuses.has(c.status));
          }
          // Sort: stalest (asc by lastActivity) or recency (desc by lastActivity)
          if (sort === "stalest") {
            filtered.sort((a, b) => {
              const cmp = a.lastActivity.localeCompare(b.lastActivity);
              return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
            });
          } else if (sort === "recency") {
            filtered.sort((a, b) => {
              const cmp = b.lastActivity.localeCompare(a.lastActivity);
              return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
            });
          }
          // sort === "default" or omitted: preserve store order (created_at desc)
          const paged = paginate(filtered, {
            limit,
            offset,
            tool: "adv_change_list",
            args: status ? `status: "${status}"` : undefined,
          });
          return formatToolOutput({
            changes: paged.items,
            pagination: paged.pagination,
            ...(result.warnings ? { warnings: result.warnings } : {}),
            ...(result.hydrationStats
              ? { hydrationStats: result.hydrationStats }
              : {}),
            ...(productContextOutput(activeStore, scope)
              ? { _productContext: productContextOutput(activeStore, scope) }
              : {}),
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        },
      );
    },
  },
  // rq-advChangeShowInclude01 — adv_change_show accepts opt-in include flags
  adv_change_show: {
    description:
      "Get full change details including tasks and deltas. " +
      "Supports optional include flags to collapse the phase-start " +
      "tool quartet: include.ledger pulls the in-progress task's " +
      "durable run state; include.snapshot returns the rendered " +
      "context snapshot at top-level (matches mutation-tool convention); " +
      "include.readyTasks returns the unblocked ready queue (top-N " +
      "by priority then created_at; default 10, max 50). " +
      "include.phasePlan attaches the typed PhasePlan read projection " +
      "as `_phasePlan` (read-only; non-authorizing variants carry no " +
      "route/command). " +
      "include.proposal / include.problemStatement / include.agreement / include.design / include.executiveSummary / include.acceptance " +
      "return the raw markdown content for each artifact (GH #21). " +
      "Defaults are unchanged when include is omitted.",
    args: {
      changeId: z.string().describe("Change ID"),
      limit: z
        .number()
        .optional()
        .describe("Max tasks to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Task offset for pagination (default: 0)"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When artifact include flags are requested, routes reads through the target project's Temporal store/documents; otherwise reads a disk snapshot and returns _projectContext.",
        ),
      include: z
        .object({
          ledger: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the in-progress task's durable run ledger as `_ledger`.",
            ),
          loopLedger: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the compact typed loop-ledger summary as `_loopLedger`.",
            ),
          loopLedgerDetails: z
            .boolean()
            .optional()
            .describe(
              "When true, includes bounded detailed loop-ledger entries in `_loopLedger`.",
            ),
          loopLedgerLimit: z
            .number()
            .min(1)
            .max(100)
            .optional()
            .describe(
              "Maximum detailed loop-ledger entries. Range 1-100; default 20.",
            ),
          snapshot: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the rendered context snapshot as top-level `_contextSnapshot`.",
            ),
          readyTasks: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the unblocked ready queue as `_readyTasks` (top-N by priority then created_at).",
            ),
          readyTasksLimit: z
            .number()
            .min(1)
            .max(50)
            .optional()
            .describe("Override default top-10 ready-task slice. Range 1-50."),
          phasePlan: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the typed PhasePlan read projection as `_phasePlan`. Read-only and non-authorizing: degraded/blocked/terminal variants carry provenance and no route/command.",
            ),
          artifactOnly: z
            .boolean()
            .optional()
            .describe(
              "When true with artifact include flags, returns a bounded artifact-only readback instead of full change/task context.",
            ),
          proposal: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw proposal.md content as `_proposal`.",
            ),
          problemStatement: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw problem-statement.md content as `_problemStatement`.",
            ),
          agreement: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw agreement.md content as `_agreement`.",
            ),
          design: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw design.md content as `_design`.",
            ),
          executiveSummary: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw executive-summary.md content as `_executiveSummary`.",
            ),
          acceptance: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw acceptance.md content as `_acceptance`.",
            ),
          subagentReports: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches persisted task sub-agent reports as `_subagentReports`.",
            ),
          briefingPacket: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches a generated lane-specific briefing packet as `_briefingPacket`.",
            ),
          briefingPacketLane: z
            .preprocess(
              (value) => (value === "" ? undefined : value),
              BriefingPacketLaneSchema.optional(),
            )
            .optional()
            .describe(
              "Lane to render when include.briefingPacket is true. Defaults to engineer.",
            ),
          briefingPacketRequest: z
            .string()
            .max(BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH)
            .optional()
            .describe(
              "Optional request context included in the generated packet metadata.",
            ),
        })
        .optional()
        .describe(
          "Optional include flags to attach extra fields. Defaults preserve current behavior.",
        ),
      outputMode: z
        .enum(["compact", "pretty"])
        .optional()
        .describe(
          "Output mode: compact (default) or pretty. Overrides ADV_TOOL_OUTPUT_MODE env var for this call.",
        ),
    },
    execute: async (
      {
        changeId,
        limit,
        offset,
        target_path,
        include,
        outputMode,
      }: {
        changeId: string;
        limit?: number;
        offset?: number;
        target_path?: string;
        include?: {
          ledger?: boolean;
          loopLedger?: boolean;
          loopLedgerDetails?: boolean;
          loopLedgerLimit?: number;
          snapshot?: boolean;
          readyTasks?: boolean;
          readyTasksLimit?: number;
          phasePlan?: boolean;
          artifactOnly?: boolean;
          proposal?: boolean;
          problemStatement?: boolean;
          agreement?: boolean;
          design?: boolean;
          executiveSummary?: boolean;
          acceptance?: boolean;
          subagentReports?: boolean;
          briefingPacket?: boolean;
          briefingPacketLane?: BriefingPacketLane;
          briefingPacketRequest?: string;
        };
        outputMode?: "compact" | "pretty";
      },
      store: Store,
    ) => {
      const requestedKinds: ArtifactKind[] = [];
      if (include?.proposal) requestedKinds.push("proposal");
      if (include?.problemStatement) requestedKinds.push("problemStatement");
      if (include?.agreement) requestedKinds.push("agreement");
      if (include?.design) requestedKinds.push("design");
      if (include?.executiveSummary) requestedKinds.push("executiveSummary");
      if (include?.acceptance) requestedKinds.push("acceptance");

      const runShow = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const readCtx = createTemporalReadContext();
        const subread = createChangeShowSubreadRunner(readCtx);
        const result = await activeStore.changes.get(changeId, {
          context: readCtx,
        });
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        const change = result.data;
        const { test_runs, ...publicChange } = change;
        const displayChange: Change = {
          ...publicChange,
          artifacts: await normalizeArtifactMetadataForReadback(
            change.artifacts,
          ),
          gates: await normalizeGateArtifactEvidenceForReadback(change.gates),
        };
        if (include?.artifactOnly) {
          const output: Record<string, unknown> = {
            id: displayChange.id,
            title: displayChange.title,
            status: displayChange.status,
            artifacts: displayChange.artifacts,
            _artifactOnly: true,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };
          if (requestedKinds.length > 0) {
            const artifactRead = await subread.runLocalCapable(
              "artifacts",
              () =>
                readArtifacts(activeStore, changeId, requestedKinds, {
                  deadline: readCtx.deadline,
                }),
            );
            if (artifactRead.ok) {
              applyArtifactContentToOutput(output, artifactRead.value);
            } else {
              output._artifactsError =
                artifactRead.error instanceof Error
                  ? artifactRead.error.message
                  : String(artifactRead.error);
            }
          }
          const changeShowHydrationStats = subread.getHydrationStats();
          if (changeShowHydrationStats) {
            output.hydrationStats = changeShowHydrationStats;
          }
          return formatToolOutput(output);
        }
        const { content: proposalText } = await loadProposalForContext(
          activeStore,
          changeId,
          change.title,
        );
        const paged = paginate(change.tasks, {
          limit,
          offset,
          tool: "adv_change_show",
          args: `changeId: "${changeId}"`,
        });
        const output: Record<string, unknown> = {
          ...displayChange,
          tasks: paged.items,
          _taskPagination: paged.pagination,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        };
        // Surface linked ops follow-up state structurally. The full profile
        // remains on the change; this just guarantees it is visible even when
        // downstream formatters would otherwise drop undefined keys.
        output.ops_followup = change.ops_followup ?? null;
        output.ops_followup_links = change.ops_followup_links ?? [];
        const changeDir = join(activeStore.paths.changes, changeId);
        const problemStatementPath = join(changeDir, "problem-statement.md");
        const problemStatementExists = await fileExists(problemStatementPath);
        output.problemStatementExists = problemStatementExists;
        if (problemStatementExists) {
          output.problemStatementPath = problemStatementPath;
        }
        const clarifyRead = await subread.run("clarify", () =>
          applyClarifyReadinessToChangeOutput({
            output,
            change,
            proposalText,
            changeId,
            store: activeStore,
            persist: false,
          }),
        );
        if (!clarifyRead.ok) {
          output._clarifyFindingsError =
            clarifyRead.error instanceof Error
              ? clarifyRead.error.message
              : String(clarifyRead.error);
        }
        // Surface cross-project origin prominently when present
        if (change.cross_project_origin) {
          output._crossProjectOrigin = {
            note: `⚠️ Cross-project follow-up from ${change.cross_project_origin.source_project}`,
            ...change.cross_project_origin,
          };
        }
        // Surface same-project fast-follow origin prominently when present
        if (change.fast_follow_of) {
          output._fastFollowOrigin = {
            note: `↳ Fast-follow from ${change.fast_follow_of.parent_change_id}`,
            ...change.fast_follow_of,
          };
        }
        const dependencyRead = await subread.run("externalDependency", () =>
          buildExternalDependencyStatus(change.external_dependencies),
        );
        if (dependencyRead.ok) {
          if (dependencyRead.value) {
            output._externalDependencyStatus = dependencyRead.value;
          }
        } else {
          output._externalDependencyStatusError =
            dependencyRead.error instanceof Error
              ? dependencyRead.error.message
              : String(dependencyRead.error);
        }
        // Include reflection data for archived changes
        if (change.status === "archived") {
          const reflectionRead = await subread.run("reflection", () =>
            getReflection(
              activeStore.paths.external ?? activeStore.paths.root,
              changeId,
            ),
          );
          if (reflectionRead.ok && reflectionRead.value) {
            output._reflection = reflectionRead.value;
          }
        }
        // include flags (AC3) — opt-in attachments. Defaults preserve
        // current behavior.
        if (include) {
          // Lazy shared projection-state loader: the snapshot and phase-plan
          // read projections derive from the SAME reconciled gates projection
          // so one durable snapshot yields one consistent directive/plan view
          // (SC1). Loaded at most once per call and only when a projection
          // that needs it is requested.
          const buildProjectionState = async () => {
            let gates: Awaited<ReturnType<typeof activeStore.gates.get>> = null;
            try {
              const rawGates = await activeStore.gates.get(changeId);
              if (rawGates) {
                const reconciliation = await reconcileRecoveredGates({
                  store: activeStore,
                  changeId,
                  current: rawGates,
                });
                gates = reconciliation.gates;
              }
            } catch {
              // best-effort: missing gates → projections still useful
            }
            const normalizedGates = gates
              ? await normalizeGateArtifactEvidenceForReadback(gates)
              : undefined;
            return {
              directiveState: changeToDirectiveState({
                projectId: displayChange.adv_project_id ?? "unknown",
                change: displayChange,
                gates: normalizedGates ?? undefined,
              }),
              normalizedGates,
            };
          };
          let projectionStatePromise:
            | ReturnType<typeof buildProjectionState>
            | undefined;
          const loadProjectionState = () =>
            (projectionStatePromise ??= buildProjectionState());
          // Snapshot — matches mutation-tool convention (top-level
          // `_contextSnapshot`). Uses the same formatter live emission
          // and compaction use, ensuring fidelity parity.
          if (include.snapshot) {
            const snapshotRead = await subread.run(
              "snapshot",
              () => projectionStatePromise ?? loadProjectionState(),
            );
            if (snapshotRead.ok) {
              try {
                const { directiveState, normalizedGates } = snapshotRead.value;
                // AC5: derive the authoritative directive from the same change
                // projection + gates the snapshot renders, so the change-show
                // packet carries the `Next:` orientation line. Best effort: a
                // derivation failure must not break change-show; the snapshot
                // omits the `Next:` line.
                const directive = deriveDirectiveSafe(
                  directiveState,
                  Date.now(),
                );
                if (!directive) {
                  logger.warn(
                    `deriveWorkflowDirective failed in change-show for ${changeId}; snapshot omits Next line`,
                  );
                }
                output._contextSnapshot = buildChangeContextSnapshot({
                  change: displayChange,
                  proposalText,
                  gates: normalizedGates,
                  workdir: activeStore.paths.root,
                  directive,
                });
              } catch (e) {
                output._contextSnapshotError =
                  e instanceof Error ? e.message : String(e);
              }
            } else {
              output._contextSnapshotError =
                snapshotRead.error instanceof Error
                  ? snapshotRead.error.message
                  : String(snapshotRead.error);
            }
          }
          // Phase plan — typed, read-only current-action projection (SC1,
          // AC3, AC8). `derivePhasePlanSafe` never throws: missing,
          // conflicting, or unsupported state degrades into a typed
          // non-authorizing plan with provenance and no route/command.
          if (include.phasePlan) {
            const phasePlanRead = await subread.run(
              "phasePlan",
              () => projectionStatePromise ?? loadProjectionState(),
            );
            if (phasePlanRead.ok) {
              try {
                const { directiveState } = phasePlanRead.value;
                output._phasePlan = withPhaseDirective(
                  derivePhasePlanSafe(directiveState, Date.now()),
                );
              } catch (e) {
                output._phasePlan = degradedPhasePlan(
                  changeId,
                  "missing_state",
                  e instanceof Error ? e.message : String(e),
                );
              }
            } else {
              output._phasePlan = degradedPhasePlan(
                changeId,
                "missing_state",
                phasePlanRead.error instanceof Error
                  ? phasePlanRead.error.message
                  : String(phasePlanRead.error),
              );
            }
          }
          if (include.ledger) {
            output._ledger = null;
          }
          // rq-loopLedger01 — opt-in compact/detail _loopLedger readback;
          // legacy include.ledger above stays _ledger:null and is not aliased.
          if (include.loopLedger || include.loopLedgerDetails) {
            output._loopLedger = projectLoopLedger(
              {
                changeId: change.id,
                tasks: change.tasks,
                subagent_reports: change.subagent_reports,
                testRuns: test_runs,
              },
              {
                details: include.loopLedgerDetails === true,
                limit: include.loopLedgerLimit,
              },
            );
          }
          if (include.subagentReports) {
            const legacyTaskReports = change.tasks.flatMap((task) =>
              (task.subagent_reports ?? []).map((report) => report),
            );
            const reportsByKey = new Map<string, ScopedSubagentReport>();
            for (const report of [
              ...(change.subagent_reports ?? []),
              ...legacyTaskReports,
            ]) {
              reportsByKey.set(subagentReportReadbackKey(report), report);
            }
            const reports = Array.from(reportsByKey.values());
            output._subagentReports = reports;
            output._subagentReportsMeta = {
              total: reports.length,
              sidecar: change.subagent_reports?.length ?? 0,
              legacyTask: legacyTaskReports.length,
            };
          }
          // Ready tasks — unblocked queue, sliced to top-N. Avoids the
          // separate adv_task_ready round-trip on phase boundaries.
          if (include.readyTasks) {
            const readyRead = await subread.run("readyTasks", () =>
              activeStore.tasks.ready(changeId),
            );
            if (readyRead.ok) {
              try {
                const readyResult = readyRead.value;
                const readyLimit = include.readyTasksLimit ?? 10;
                output._readyTasks = readyResult.ready.slice(0, readyLimit);
                output._readyTasksMeta = {
                  total: readyResult.ready.length,
                  limit: readyLimit,
                  blockedCount: readyResult.blocked.length,
                };
                output._todoProjection = buildTodoProjection({
                  current:
                    change.tasks.find(
                      (task) => task.status === "in_progress",
                    ) ?? null,
                  ready: readyResult.ready.map((task) => ({
                    id: task.id,
                    title: task.title,
                    status: task.status,
                  })),
                });
              } catch (e) {
                output._readyTasksError =
                  e instanceof Error ? e.message : String(e);
              }
            } else {
              output._readyTasksError =
                readyRead.error instanceof Error
                  ? readyRead.error.message
                  : String(readyRead.error);
            }
          }
          // Briefing packet — generated read projection over existing
          // structured state. No live packet state is persisted.
          if (include.briefingPacket) {
            const briefingRead = await subread.run(
              "briefingPacket",
              async () => {
                const lane =
                  include.briefingPacketLane ?? DEFAULT_BRIEFING_PACKET_LANE;
                const packetInput = await buildBriefingPacketForChange(
                  activeStore,
                  change,
                  lane,
                  include.briefingPacketRequest,
                );
                return renderBriefingPacket(packetInput);
              },
            );
            if (briefingRead.ok) {
              output._briefingPacket = briefingRead.value;
            } else {
              output._briefingPacketError =
                briefingRead.error instanceof Error
                  ? briefingRead.error.message
                  : String(briefingRead.error);
            }
          }

          // GH #21: Artifact content include flags — read raw markdown
          // from the change directory. Only reads when explicitly
          // requested to avoid unnecessary I/O. Falls back to the
          // latest archive bundle for archived changes.
          // Batched multi-include read per C9 — single store.changes.get()
          // query covers all requested kinds (KD-6 readArtifacts).
          if (requestedKinds.length > 0) {
            const artifactRead = await subread.runLocalCapable(
              "artifacts",
              () =>
                readArtifacts(activeStore, changeId, requestedKinds, {
                  deadline: readCtx.deadline,
                }),
            );
            if (artifactRead.ok) {
              applyArtifactContentToOutput(output, artifactRead.value);
            } else {
              output._artifactsError =
                artifactRead.error instanceof Error
                  ? artifactRead.error.message
                  : String(artifactRead.error);
            }
          }
        }
        const changeShowHydrationStats = subread.getHydrationStats();
        if (changeShowHydrationStats) {
          output.hydrationStats = changeShowHydrationStats;
        }
        const pretty = resolveOutputMode(outputMode);
        const leanOutput = shapeDirectiveResponse(output, include ?? {});
        if (leanOutput) {
          const serializedPhasePlan = JSON.stringify(
            leanOutput._phasePlan,
            null,
            pretty ? 2 : undefined,
          );
          return formatToolOutput(leanOutput, {
            pretty,
            maxChars: Math.max(
              DEFAULT_MAX_CHARS,
              serializedPhasePlan.length + 4096,
            ),
          });
        }
        return formatToolOutput(output, { pretty });
      };

      if (target_path && requestedKinds.length > 0) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            mutation: false,
          },
          async ({ context, store: targetStore }) =>
            runShow(targetStore, formatTargetProjectContext(context)),
        );
      }

      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) =>
          runShow(activeStore, projectContext),
      );
    },
  },
  adv_change_create: {
    description: "Create a new change proposal",
    args: {
      summary: z
        .string()
        .describe(
          "2-5 word summary used as the change title and ID. " +
            "Start with an action verb (add, fix, update, remove, refactor). " +
            "Be specific, not generic. " +
            'Good: "Add rate limiting", "Fix auth token refresh". ' +
            'Bad: "Implement comprehensive authentication system", "Full update".',
        ),
      capability: z.string().optional().describe("Primary capability affected"),
      proposal: z
        .string()
        .optional()
        .describe(
          "Optional proposal.md content to persist during change creation",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "Optional confirmed problem statement text to persist as problem-statement.md artifact",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "Optional agreement.md content (objectives, AC, constraints, avoidances)",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "Optional design.md content (architecture, LBP decisions, implementation strategy)",
        ),
      executiveSummary: z
        .string()
        .optional()
        .describe(
          "Optional executive-summary.md content (post-acceptance outcome narrative)",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to the target project directory for cross-project change creation. " +
            "When provided, creates the change in that project instead of the current one.",
        ),
      source_project: z
        .string()
        .optional()
        .describe(
          "Name of the source project creating this follow-up. " +
            "Auto-detected from current store config when target_path is provided.",
        ),
      source_change_id: z
        .string()
        .optional()
        .describe(
          "Change ID in the source project that triggered this follow-up.",
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
      epic_owner_target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to the Epic owner ADV project. When provided with epic_id/entry_id/epic_title, seeds Epic membership in a remote-owner Epic instead of the current project.",
        ),
      epic_owner_target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
        ),
      epic_owner_confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
        ),
      parent_change_id: z
        .string()
        .optional()
        .describe(
          "Same-project parent change ID for fast-follow lineage. " +
            "Mutually exclusive with target_path (cross-project follow-up). " +
            "Parent must exist in the current project.",
        ),
      scope_repos: z
        .array(ChangeRepoScopeSchema)
        .optional()
        .describe(
          "Product-linked repo scope for this change. Repo IDs must exist in the product config. Defaults to the current repo when product linking is enabled.",
        ),
      epic_id: z
        .string()
        .min(1)
        .optional()
        .describe("Parent Epic ID for create-time Epic membership seeding."),
      entry_id: z
        .string()
        .min(1)
        .optional()
        .describe("Epic entry ID for create-time Epic membership seeding."),
      epic_order: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Advisory order within the Epic roadmap."),
      epic_title: z
        .string()
        .min(1)
        .optional()
        .describe("Display title for the Epic entry."),
      same_project_dependencies: z
        .array(WorkNodeRefSchema)
        .default([])
        .describe(
          "Same-project hard prerequisite changes/shells. Change creation is refused while any prereq is nonterminal.",
        ),
      origin_kind: ChangeOriginKindSchema.optional().describe(
        "Origin provenance kind. " +
          "'roadmap' = READABLE LEGACY ONLY — retired for new writes by reshapeTriagePortfolioBalance; archived changes still carry this kind. Use 'triage' for new issue-linked changes. " +
          "'discovery' = surfaced mid-session (bug found, drive-by improvement). " +
          "'triage' = promoted by /adv-triage from wisdom/notes (origin_source_artifact recommended). " +
          "'adhoc' = explicit, no upstream artifact. " +
          "Omit to leave origin unset (legacy/backward-compatible).",
      ),
      origin_issue_number: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "GitHub issue number for kind=roadmap (required) or kind=triage (optional). " +
            "Rejected for discovery, adhoc, and omitted origin_kind.",
        ),
      origin_source_artifact: z
        .string()
        .optional()
        .describe(
          "Stable reference to the upstream artifact for kind=triage or kind=discovery. " +
            "Examples: wisdom-id, task-id, or note-line ref. " +
            "Parse-only legacy: agenda-id ('ag-...') values remain readable for historical records.",
        ),
      forceRecreate: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Bypass duplicate detection when the existing active change's workflow is poisoned and a new change is required. Only allowed when the duplicate is poisoned.",
        ),
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      {
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        target_path,
        source_project,
        source_change_id,
        target_confirmed,
        confirmationEvidence,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
        parent_change_id,
        scope_repos,
        epic_id,
        entry_id,
        epic_order,
        epic_title,
        same_project_dependencies,
        origin_kind,
        origin_issue_number,
        origin_source_artifact,
        forceRecreate,
        include,
      }: {
        summary: string;
        capability?: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        executiveSummary?: string;
        target_path?: string;
        source_project?: string;
        source_change_id?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
        parent_change_id?: string;
        scope_repos?: ChangeRepoScope[];
        epic_id?: string;
        entry_id?: string;
        epic_order?: number;
        epic_title?: string;
        same_project_dependencies?: WorkNodeRef[];
        origin_kind?: ChangeOrigin["kind"];
        origin_issue_number?: number;
        origin_source_artifact?: string;
        forceRecreate?: boolean;
        include?: { snapshot?: boolean };
      },
      store: Store,
      _maybeOverridePath?: string,
      providers: ChangeCreateProviders = {},
    ) => {
      if (isSyntheticValidationDraftSummary(summary)) {
        return formatToolOutput(buildSyntheticValidationDraftError(summary));
      }
      if (target_path && parent_change_id) {
        return formatToolOutput({
          error: "target_path and parent_change_id are mutually exclusive",
        });
      }
      if (epic_owner_target_path) {
        const ownerRoot = resolve(epic_owner_target_path);
        const childRoot = resolve(target_path ?? store.paths.root);
        if (
          ownerRoot !== childRoot &&
          childRoot === resolve(store.paths.root)
        ) {
          return formatToolOutput({
            error:
              "Owner remote + child local routing is not supported for change creation. Create the change in the Epic owner project or a different remote project.",
            code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_CHILD_ROUTING_UNSUPPORTED,
          });
        }
      }
      const blankCreateFields = collectBlankCreateArtifactOrLinkageFields({
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        origin_source_artifact,
      });
      if (blankCreateFields.length > 0) {
        return formatToolOutput({
          error: "Blank artifact or linkage fields are not allowed.",
          fields: blankCreateFields,
          hint: "Provide non-blank strings for fields you intend to set, or omit fields you do not intend to set.",
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
      // Origin validation: the linkage matrix has already been validated.
      // Origin is typed-state only — behavior automation (auto-create issue,
      // auto-close on archive) lands in a follow-up change.
      let origin: ChangeOrigin | undefined;
      if (origin_kind) {
        origin = {
          kind: origin_kind,
          ...(origin_issue_number !== undefined
            ? { issue_number: origin_issue_number }
            : {}),
          ...(origin_source_artifact
            ? { source_artifact: origin_source_artifact }
            : {}),
        };
      }
      // Validate create-time Epic membership seed fields up-front so both
      // same-project and cross-project creates share one completeness gate.
      const epicSeedResult = buildEpicMembershipFromSeed({
        epic_id,
        entry_id,
        epic_order,
        epic_title,
      });
      if (epicSeedResult.error) {
        return formatToolOutput(epicSeedResult.error);
      }
      const epicMembership = epicSeedResult.membership;

      // D3 enforcement: validate same_project_dependencies at create time.
      // Refuse creation if any hard prerequisite is nonterminal.
      const deps = same_project_dependencies ?? [];
      if (deps.length > 0) {
        const projectId = (await getProjectId(store.paths.root)) ?? "";
        const sourceRef: WorkNodeRef = {
          kind: "change",
          project_id: projectId,
          change_id: "pending", // New change ID is derived from summary below.
        };
        const d3Ctx = await buildD3ContextFromStore(store);
        const d3Result = enforceD3ForChangeCreate(sourceRef, deps, d3Ctx);
        if (!d3Result.ok) {
          return formatToolOutput({
            success: false,
            error: formatD3Error(d3Result.error),
            code: d3Result.error.code,
            ...(d3Result.error.code === "SHELL_PREREQ_NONTERMINAL" ||
            d3Result.error.code === "DEP_PREREQ_NONTERMINAL"
              ? {
                  blocking_refs: (
                    d3Result.error as { blocking_refs: WorkNodeRef[] }
                  ).blocking_refs,
                }
              : {}),
          });
        }
      }

      // rq-backlogCoord02 — Pre-create claim collision check.
      // Fires for any origin that carries a concrete `issue_number` (kind
      // roadmap requires it; triage may carry it when promoting from a
      // backlog item). Skipped for adhoc/discovery without issue_number.
      // Skipped entirely when no Temporal service is available (legacy /
      // test mode) UNLESS an explicit `claimChecker` provider is injected.
      const claimChecker = providers.claimChecker ?? defaultClaimChecker;
      const claimRaceCheckMs =
        providers.claimRaceCheckMs ?? DEFAULT_CLAIM_RACE_CHECK_MS;
      const claimCoordinationEnabled =
        providers.claimChecker !== undefined || getService() !== null;
      // reshapeTriagePortfolioBalance: claim check fires on any
      // issue-linked origin regardless of kind label, matching runtime
      // semantics reframed by rq-backlogCoord02.
      const issueNumberForClaim = origin?.issue_number;
      const shouldClaimCheck =
        claimCoordinationEnabled &&
        issueNumberForClaim !== undefined &&
        issueNumberForClaim > 0;
      if (shouldClaimCheck && issueNumberForClaim !== undefined) {
        const projectId = (await getProjectId(store.paths.root)) ?? "";
        const existing = await claimChecker(projectId, issueNumberForClaim);
        if (existing.length > 0) {
          const first = existing[0];
          return formatToolOutput({
            error: `Issue #${issueNumberForClaim} is already claimed by change ${first.changeId} (status: ${first.status})`,
            code: "CLAIM_CONFLICT",
            issue_number: issueNumberForClaim,
            existing_change_id: first.changeId,
            existing_change_status: first.status,
            hint: `Resume that change with /adv-apply ${first.changeId}, or omit origin_issue_number to create an unlinked change.`,
          });
        }
      }
      if (target_path) {
        return createCrossProjectFollowUp({
          summary,
          capability,
          proposal,
          problemStatement,
          agreement,
          design,
          executiveSummary,
          target_path,
          target_confirmed,
          confirmationEvidence,
          source_project,
          source_change_id,
          epicMembership,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
          store,
          forceRecreate,
        });
      }
      let fastFollowOf: FastFollowOf | undefined;
      if (parent_change_id) {
        const parentValidation = await validateParentChange(
          store,
          parent_change_id,
        );
        if (!parentValidation.ok) {
          return formatToolOutput({
            error: `Parent change not found: ${parent_change_id}`,
            validParentIds: parentValidation.validParentIds,
          });
        }
        fastFollowOf = {
          parent_change_id,
          linked_at: new Date().toISOString(),
        };
      }
      const scopeResolution = resolveScopeRepos(store, scope_repos);
      if (!scopeResolution.ok) {
        return formatToolOutput({ error: scopeResolution.error });
      }
      const projectId = (await getProjectId(store.paths.root)) ?? "";
      const duplicateError = await checkActiveDuplicateChange(store, summary, {
        forceRecreate,
        projectId,
      });
      if (duplicateError) {
        return formatToolOutput(duplicateError);
      }
      const initialMetadata: ChangeCreateInitialMetadata = {};
      if (origin) initialMetadata.origin = origin;
      if (fastFollowOf) initialMetadata.fast_follow_of = fastFollowOf;
      if (scopeResolution.scope)
        initialMetadata.scope_repos = scopeResolution.scope;
      if (epicMembership) {
        initialMetadata.epic_membership = epicMembership;
      }
      if (deps.length > 0) {
        initialMetadata.same_project_dependencies = deps;
      }
      const createOptions =
        Object.keys(initialMetadata).length > 0
          ? { initialMetadata }
          : undefined;
      // rq-backlogCoord08: seed creation metadata before workflow start so
      // origin/search attributes are authoritative Temporal state, not a late
      // disk-only patch.
      const result = await store.changes.create(summary, {
        capability,
        artifacts: {
          ...(proposal !== undefined ? { proposal } : {}),
          ...(problemStatement !== undefined ? { problemStatement } : {}),
          ...(agreement !== undefined ? { agreement } : {}),
          ...(design !== undefined ? { design } : {}),
          ...(executiveSummary !== undefined ? { executiveSummary } : {}),
        },
        ...(createOptions?.initialMetadata
          ? { initialMetadata: createOptions.initialMetadata }
          : {}),
      });
      const output: Record<string, unknown> = { ...result };
      if (fastFollowOf) {
        output.fast_follow_of = fastFollowOf;
      }
      // Surface duplicate warning prominently if present
      if (result.duplicateWarning) {
        output._duplicateWarning = result.duplicateWarning;
      }
      if (origin) {
        output.origin = origin;
      }
      if (initialMetadata.epic_membership) {
        output.epic_membership = initialMetadata.epic_membership;
      }
      if (scopeResolution.scope) {
        output.scope_repos = scopeResolution.scope;
      }
      await appendClarifyNeededForCreatedChange(store, result.changeId, output);
      const createdChangeResult = await store.changes.get(result.changeId);
      if (!createdChangeResult.success) {
        // rq-schemaDriftToolLayer: a load failure on the just-created change
        // (e.g. schema validation) is a real corruption signal — the
        // change.json written by create is unreadable. Propagate verbatim
        // instead of silently omitting the snapshot and returning a
        // misleading success.
        return formatToolOutput({
          error: createdChangeResult.error,
          changeId: result.changeId,
        });
      }
      if (createdChangeResult.data) {
        const { content: proposalText } = await loadProposalForContext(
          store,
          result.changeId,
          createdChangeResult.data.title,
        );
        const createdGates =
          createdChangeResult.data.gates ?? createDefaultGates();
        // AC5: created-change snapshot carries the `Next:` orientation line.
        // Best effort: a derivation failure must not break change-create; the
        // snapshot omits the `Next:` line.
        const createdDirective = deriveDirectiveSafe(
          changeToDirectiveState({
            projectId: createdChangeResult.data.adv_project_id ?? "unknown",
            change: createdChangeResult.data,
            gates: createdGates,
          }),
          Date.now(),
        );
        if (!createdDirective) {
          logger.warn(
            `deriveWorkflowDirective failed in change-create for ${result.changeId}; snapshot omits Next line`,
          );
        }
        if (include?.snapshot) {
          output._contextSnapshot = buildChangeContextSnapshot({
            change: createdChangeResult.data,
            proposalText,
            gates: createdGates,
            workdir: store.paths.root,
            directive: createdDirective,
          });
        }
      }
      // rq-backlogCoord03 — Post-create double-check for race tolerance.
      // Temporal Visibility is eventually consistent; concurrent creates may
      // both pass the pre-create check. Re-query after the propagation window
      // and surface CLAIM_RACE_DETECTED if N>1 changes share the issue. The
      // new change is NOT rolled back — the caller decides resolution.
      if (
        shouldClaimCheck &&
        origin?.issue_number !== undefined &&
        result.changeId
      ) {
        if (claimRaceCheckMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, claimRaceCheckMs));
        }
        try {
          const projectId = (await getProjectId(store.paths.root)) ?? "";
          const racers = await claimChecker(projectId, origin.issue_number);
          if (racers.length > 1) {
            output.warning = "CLAIM_RACE_DETECTED";
            output.race_change_ids = racers.map((r) => r.changeId);
            output.race_hint = `Concurrent change-create detected for issue #${origin.issue_number}. Changes: [${racers
              .map((r) => r.changeId)
              .join(", ")}]. Resolve by archiving duplicates.`;
          }
        } catch (err) {
          // Post-create check failure is non-fatal — the change exists.
          logger.warn(
            `Post-create claim race-check failed for ${result.changeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return formatToolOutput(output);
    },
  },
  adv_change_update: {
    description:
      "Update narrative artifacts (proposal.md, problem-statement.md, agreement.md, design.md, executive-summary.md) for an existing change. Does NOT create a new change or modify change.json metadata (status, tasks, deltas). Use this instead of calling adv_change_create again when refining a proposal or persisting the post-acceptance executive summary. Only provided fields are written — omitted fields are left unchanged.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID to update — must match an existing change from `adv_change_list`. Unknown IDs are rejected with a hint. This tool writes artifact files only; it does NOT modify change.json metadata (status, tasks, deltas).",
        ),
      proposal: z
        .string()
        .optional()
        .describe(
          "New proposal.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "New problem-statement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "New agreement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "New design.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      executiveSummary: z
        .string()
        .optional()
        .describe(
          "New executive-summary.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
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
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional prior user approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
        ),
    },
    execute: async (
      {
        changeId,
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        target_path,
        target_confirmed,
        confirmationEvidence,
        priorApprovalEvidence,
      }: {
        changeId: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        executiveSummary?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        priorApprovalEvidence?: string;
      },
      store: Store,
    ) => {
      const runUpdate = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        // P1.12 Scope C: at-least-one-field guard with agent-facing hint
        // naming the valid fields so the next call can be constructed without
        // a schema lookup.
        if (
          proposal === undefined &&
          problemStatement === undefined &&
          agreement === undefined &&
          design === undefined &&
          executiveSummary === undefined
        ) {
          return formatToolOutput({
            error:
              "At least one of 'proposal', 'problemStatement', 'agreement', 'design', or 'executiveSummary' must be provided.",
            hint: "Pass one or more of: proposal, problemStatement, agreement, design, executiveSummary. See the tool description for which file each field writes.",
          });
        }
        const artifactInputs = [
          { field: "proposal", value: proposal },
          { field: "problemStatement", value: problemStatement },
          { field: "agreement", value: agreement },
          { field: "design", value: design },
          { field: "executiveSummary", value: executiveSummary },
        ] as const;
        const blankArtifactFields = artifactInputs
          .filter(
            ({ value }) =>
              value !== undefined &&
              typeof value === "string" &&
              value.trim().length === 0,
          )
          .map(({ field }) => field);
        if (blankArtifactFields.length > 0) {
          return formatToolOutput({
            error: "Blank artifact fields are not allowed.",
            fields: blankArtifactFields,
            hint: "Provide non-blank strings for artifact fields, or omit fields you do not intend to change.",
          });
        }
        // P1.12 Scope C: verify changeId exists before writing. Surface a
        // structured error that names the source-of-truth tools so the
        // agent can self-correct without guessing.
        const existing = await activeStore.changes.get(changeId);
        if (!existing.success) {
          // rq-schemaDriftToolLayer: propagate LoadResult errors (including
          // schema validation failures) verbatim instead of masking them as
          // "Change not found" — the store layer (T2) already formats these.
          return formatToolOutput({ error: existing.error });
        }
        if (!existing.data) {
          return formatToolOutput({
            error: `Change '${changeId}' not found.`,
            hint: "Fetch valid change IDs with 'adv_change_list' or confirm the target with 'adv_change_show changeId: <id>' before retrying.",
          });
        }
        // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
        // probe describe() to auto-detect poisoned/completed workflows without
        // operator-supplied recoveryMode/evidence ceremony.
        const handle = await getChangeWorkflowHandleForStore(
          activeStore,
          changeId,
        );
        const internalDecision = await classifyMutationRecoveryDecision({
          handle,
        });
        if (
          internalDecision.kind === "recover_via_disk" &&
          executiveSummary !== undefined
        ) {
          await logRecoveryProbeDiagnostics(handle, changeId);
          const { RECOVERY_RECONCILIATION_WARNING } =
            await import("../temporal/recovery-classification");
          const { saveRecoveredArtifactMetadata } =
            await import("./_recovery-writers");
          const executiveSummaryPath = join(
            activeStore.paths.changes,
            changeId,
            "executive-summary.md",
          );
          const executiveSummaryReadable =
            await fileExists(executiveSummaryPath);
          await saveRecoveredArtifactMetadata({
            store: activeStore,
            change: existing.data,
            authorization: {
              reason: internalDecision.reason,
              evidence: internalDecision.evidence,
            },
            kind: "executiveSummary",
            metadata: {
              ...(executiveSummaryReadable
                ? { path: executiveSummaryPath }
                : {}),
              updatedAt: new Date().toISOString(),
              contentHash: createHash("sha256")
                .update(executiveSummary)
                .digest("hex"),
              source: "recovery",
              readable: executiveSummaryReadable,
            },
          });
          return formatToolOutput({
            changeId,
            ...(executiveSummaryReadable ? { executiveSummaryPath } : {}),
            executiveSummaryReadable,
            _recoveryMutation: true,
            priorApprovalEvidence,
            reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        if (internalDecision.kind === "operator_required") {
          return formatToolOutput({
            error: `Cannot safely update artifact metadata: ${internalDecision.detail}`,
            code: "ARTIFACT_METADATA_MUTATION_OPERATOR_REQUIRED",
            cause: internalDecision.cause,
            changeId,
          });
        }
        let result;
        try {
          result = await activeStore.changes.updateArtifacts(changeId, {
            ...(proposal !== undefined ? { proposal } : {}),
            ...(problemStatement !== undefined ? { problemStatement } : {}),
            ...(agreement !== undefined ? { agreement } : {}),
            ...(design !== undefined ? { design } : {}),
            ...(executiveSummary !== undefined ? { executiveSummary } : {}),
          });
        } catch (error) {
          if (executiveSummary === undefined) {
            throw error;
          }
          // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
          // signal-error recovery is classified internally from the signal error +
          // describe() evidence via the unified classifier.
          const decision = await classifyMutationRecoveryDecision({
            signalError: error,
            handle,
          });
          if (decision.kind === "recover_via_disk") {
            const { RECOVERY_RECONCILIATION_WARNING } =
              await import("../temporal/recovery-classification");
            const { saveRecoveredArtifactMetadata } =
              await import("./_recovery-writers");
            const executiveSummaryPath = join(
              activeStore.paths.changes,
              changeId,
              "executive-summary.md",
            );
            const executiveSummaryReadable =
              await fileExists(executiveSummaryPath);
            await saveRecoveredArtifactMetadata({
              store: activeStore,
              change: existing.data,
              authorization: {
                reason: decision.reason,
                evidence: decision.evidence,
              },
              kind: "executiveSummary",
              metadata: {
                ...(executiveSummaryReadable
                  ? { path: executiveSummaryPath }
                  : {}),
                updatedAt: new Date().toISOString(),
                contentHash: createHash("sha256")
                  .update(executiveSummary)
                  .digest("hex"),
                source: "recovery",
                readable: executiveSummaryReadable,
              },
            });
            return formatToolOutput({
              changeId,
              ...(executiveSummaryReadable ? { executiveSummaryPath } : {}),
              executiveSummaryReadable,
              _recoveryMutation: true,
              priorApprovalEvidence,
              reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          if (decision.kind === "operator_required") {
            return formatToolOutput({
              error: `Cannot safely update artifact metadata: ${decision.detail}`,
              code: "ARTIFACT_METADATA_MUTATION_OPERATOR_REQUIRED",
              cause: decision.cause,
              changeId,
            });
          }
          throw error;
        }
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        return formatToolOutput({
          changeId,
          proposalPath: result.proposalPath,
          problemStatementPath: result.problemStatementPath,
          agreementPath: result.agreementPath,
          designPath: result.designPath,
          executiveSummaryPath: result.executiveSummaryPath,
          ...(projectContext ? { _projectContext: projectContext } : {}),
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
            runUpdate(targetStore, formatTargetProjectContext(context)),
        );
      }
      return runUpdate(store);
    },
  },

  adv_worker_bundle_provenance_record: {
    description:
      "Record durable worker-bundle release provenance for a change. Fires workerBundleProvenanceRecordedSignal with the source SHA, the build:worker run ID, and the replay-determinism run ID. Intended to be called after both runs have passed for the source SHA being released.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID to record provenance for."),
      source_sha: z
        .string()
        .min(1)
        .describe(
          "Source commit SHA the worker bundle was built and replay-tested from.",
        ),
      build_run_id: z
        .string()
        .min(1)
        .describe(
          "Durable run ID of the passing build:worker adv_run_test invocation.",
        ),
      replay_run_id: z
        .string()
        .min(1)
        .describe(
          "Durable run ID of the passing replay-determinism adv_run_test invocation.",
        ),
      worker_manifest_generation: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Optional worker-bundle manifest generation at build time."),
    },
    execute: async (
      {
        changeId,
        source_sha,
        build_run_id,
        replay_run_id,
        worker_manifest_generation,
      }: {
        changeId: string;
        source_sha: string;
        build_run_id: string;
        replay_run_id: string;
        worker_manifest_generation?: number;
      },
      store: Store,
    ) => {
      const existing = await store.changes.get(changeId);
      if (!existing.success || !existing.data) {
        return formatToolOutput({
          success: false,
          error: existing.success
            ? `Change '${changeId}' not found.`
            : existing.error,
          hint: "Use adv_change_list to find valid change IDs.",
        });
      }

      const projectId = await getProjectId(store.paths.root);
      if (!projectId) {
        return formatToolOutput({ error: "Could not resolve project ID" });
      }
      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({ error: "Temporal service not available" });
      }

      const handle = getChangeHandle(bundle, projectId, changeId);
      const recordedAt = new Date().toISOString();
      await fireSignalAndRefresh(
        handle,
        store,
        changeId,
        workerBundleProvenanceRecordedSignal,
        {
          source_sha,
          build_run_id,
          replay_run_id,
          ...(worker_manifest_generation !== undefined && {
            worker_manifest_generation,
          }),
          recorded_at: recordedAt,
        },
      );

      return formatToolOutput({
        success: true,
        changeId,
        source_sha,
        build_run_id,
        replay_run_id,
        ...(worker_manifest_generation !== undefined && {
          worker_manifest_generation,
        }),
        recorded_at: recordedAt,
      });
    },
  },

  adv_change_set_worker_bundle_impact: {
    description:
      "Set or confirm the worker-bundle impact classification for a change. Use at planning to declare whether this change requires worker-bundle build+replay provenance before release (kind='required') or does not (kind='not_applicable'). The declaration is typed, not a path heuristic, and is the authority for the release gate.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID to set worker-bundle impact on."),
      kind: z
        .enum(["required", "not_applicable"])
        .describe(
          "Whether worker-bundle provenance is required for release or not applicable.",
        ),
      rationale: z
        .string()
        .min(1)
        .describe("Human-readable rationale for the classification."),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        changeId,
        kind,
        rationale,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        kind: "required" | "not_applicable";
        rationale: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runSetImpact = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const existing = await activeStore.changes.get(changeId);
        if (!existing.success || !existing.data) {
          return formatToolOutput({
            success: false,
            error: existing.success
              ? `Change '${changeId}' not found.`
              : existing.error,
            hint: "Use adv_change_list to find valid change IDs.",
          });
        }

        const change = existing.data;
        const confirmedAt = new Date().toISOString();
        const worker_bundle_impact: WorkerBundleImpact = {
          kind,
          rationale,
          confirmed_at: confirmedAt,
        };
        const updated = { ...change, worker_bundle_impact };
        await activeStore.changes.save(updated);

        const projectId =
          projectContext?.projectId ??
          (await getProjectId(activeStore.paths.root));
        if (!projectId) {
          return formatToolOutput({ error: "Could not resolve project ID" });
        }
        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({ error: "Temporal service not available" });
        }
        const handle = getChangeHandle(bundle, projectId, changeId);
        await fireSignalAndRefresh(
          handle,
          activeStore,
          changeId,
          workerBundleImpactSetSignal,
          {
            worker_bundle_impact,
            set_at: confirmedAt,
          },
        );

        return formatToolOutput({
          success: true,
          changeId,
          worker_bundle_impact,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: true,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runSetImpact(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project worker-bundle impact set unavailable: ${errorText}`,
            changeId,
            target_path,
          });
        }
      }
      return runSetImpact(store);
    },
  },

  adv_change_set_release_notes: {
    description:
      "Set or replace the typed release-note content block for a change. Full replacement only — omitted optional fields are removed. Validates the payload against the canonical ReleaseNotesContentSchema before signaling. Does not complete gates or authorize archive.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID to set release notes on."),
      release_notes: ReleaseNotesContentSchema.describe(
        "Complete release-note content block to replace any existing release_notes. It requires audience and category; all other fields are optional.",
      ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        changeId,
        release_notes,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        release_notes: ReleaseNotesContent;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runSetReleaseNotes = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (!changeId || changeId.trim().length === 0) {
          return formatToolOutput({
            success: false,
            error: "changeId is required",
            code: "INVALID_TOOL_ARGS",
          });
        }

        const existing = await activeStore.changes.get(changeId);
        if (!existing.success || !existing.data) {
          return formatToolOutput({
            success: false,
            error: existing.success
              ? `Change '${changeId}' not found.`
              : existing.error,
            hint: "Use adv_change_list to find valid change IDs.",
          });
        }

        const notesValidation =
          ReleaseNotesContentSchema.safeParse(release_notes);
        if (!notesValidation.success) {
          return formatToolOutput({
            success: false,
            error: "Invalid release_notes content",
            code: "INVALID_TOOL_ARGS",
            issues: notesValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }

        const setAt = new Date().toISOString();
        try {
          const updated = await activeStore.changes.setReleaseNotes(changeId, {
            release_notes: notesValidation.data,
            setAt,
          });

          if (!updated) {
            return formatToolOutput({
              success: false,
              error: `Failed to set release notes for change '${changeId}'.`,
              changeId,
            });
          }

          return formatToolOutput({
            success: true,
            changeId,
            release_notes: updated.release_notes,
            set_at: setAt,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        } catch (error) {
          return formatToolOutput({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            changeId,
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: true,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runSetReleaseNotes(
                targetStore,
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project release-notes set unavailable: ${errorText}`,
            changeId,
            target_path,
          });
        }
      }
      return runSetReleaseNotes(store);
    },
  },

  adv_change_close: {
    description:
      "Close an active change with required user approval and audit metadata",
    args: {
      changeId: z.string().describe("Change ID to close"),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why the change is being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview close without firing signals or removing files."),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .default("normal")
        .describe(
          "Recovery mode. 'poisoned_history' allows the operator to supply precise recovery evidence to skip the workflow describe precheck and fall through to the disk projection on signal failure.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Operator-supplied precise recovery evidence (e.g. TMPRL1100, WorkflowNotFoundError, WorkflowExecutionAlreadyCompleted). Required when recoveryMode is 'poisoned_history'.",
        ),
    },
    execute: async (
      {
        changeId,
        reason,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        supersededBy,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
        recoveryMode,
        recoveryEvidence,
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
      const runClose = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (reason === "superseded" && !supersededBy) {
          return formatToolOutput({
            error: "supersededBy is required when reason is 'superseded'.",
          });
        }
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        // Tool-layer enforcement: cancellation requires explicit approval evidence
        if (!approvalEvidence || approvalEvidence.trim().length === 0) {
          return formatToolOutput({
            error: "approvalEvidence is required for change close",
            changeId,
            hint: "Obtain user approval via question tool, then call adv_change_close with approvalEvidence.",
          });
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            reason,
            supersededBy,
            message: `Would close change ${changeId} as ${reason}.`,
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
        const projectId =
          projectContext?.projectId ??
          (await getProjectId(activeStore.paths.root));
        if (!projectId) {
          return formatToolOutput({
            error: "Could not resolve project ID",
            changeId,
          });
        }
        const handle = getChangeHandle(bundle, projectId, changeId);
        const closeInput = {
          approvalEvidence,
          reason,
          supersededBy,
          cancelledAt: new Date().toISOString(),
        };
        // Operator-supplied recovery branch (fixPoisonedClosePathPrecheck):
        // when the operator has provided precise poisoned-history evidence,
        // skip the describe() precheck and the workflow signal entirely and
        // write the closed disk projection directly. This avoids the 10-second
        // timeout on a poisoned workflow that cannot accept signals.
        if (
          shouldTakeRecoveryBranch({
            recoveryMode,
            recoveryEvidence,
            approvedByUser: _approvedByUser,
            approvalEvidence,
          })
        ) {
          markPoisonedWorkflowForChange(projectId, changeId);
          const { saveRecoveredChangeStatus } =
            await import("./_recovery-writers");
          const { buildChangeClosure } = await import("./change/recovery");
          await saveRecoveredChangeStatus({
            store: activeStore,
            change: result.data,
            authorization: {
              reason: "poisoned_history",
              evidence: recoveryEvidence as string,
            },
            status: "closed",
            closure: buildChangeClosure(closeInput),
          });
          return formatToolOutput({
            success: true,
            _recoveryMutation: true,
            diskProjectionRetained: true,
            changeId,
            reason,
            message: `Closed change ${changeId} as ${reason} via operator-supplied poisoned-history recovery branch (workflow signal skipped). Retained closed disk projection for stale-visibility reconciliation.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
        // probe describe() to auto-detect poisoned/completed workflows without
        // operator-supplied recoveryMode/evidence ceremony.
        const internalDecision = await classifyMutationRecoveryDecision({
          handle,
        });
        if (internalDecision.kind === "recover_via_disk") {
          await logRecoveryProbeDiagnostics(handle, changeId);
          const { saveRecoveredChangeStatus } =
            await import("./_recovery-writers");
          const { buildChangeClosure } = await import("./change/recovery");
          await saveRecoveredChangeStatus({
            store: activeStore,
            change: result.data,
            authorization: {
              reason: internalDecision.reason,
              evidence: internalDecision.evidence,
            },
            status: "closed",
            closure: buildChangeClosure(closeInput),
          });
          return formatToolOutput({
            success: true,
            _recoveryMutation: true,
            diskProjectionRetained: true,
            changeId,
            reason,
            message: `Closed change ${changeId} as ${reason} via D4 internal monotonic recovery (authority=${internalDecision.authority}). Retained closed disk projection for stale-visibility reconciliation.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        if (internalDecision.kind === "operator_required") {
          return formatToolOutput({
            error: `Cannot safely close change: ${internalDecision.detail}`,
            code: "CHANGE_CLOSE_MUTATION_OPERATOR_REQUIRED",
            cause: internalDecision.cause,
            changeId,
          });
        }
        try {
          // rq-cacheRefresh01: refresh AFTER cancel so subsequent reads
          // see the closed/cancelled state, not the stale active state.
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            changeCancelledSignal,
            buildChangeClosePayload(closeInput),
          );
          // Remove source `changes/<id>/` directory after successful close.
          // Best-effort: failure surfaces as a warning but does NOT flip success
          // to false — the closed status is durable.
          let cleanupWarning: string | undefined;
          if (activeStore.paths?.changes) {
            try {
              await removeChangeDir(activeStore.paths.changes, changeId);
            } catch (err) {
              cleanupWarning = `Source cleanup warning: failed to remove changes/${changeId}: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          return formatToolOutput({
            success: true,
            changeId,
            message: cleanupWarning
              ? `Closed change ${changeId} as ${reason}. ${cleanupWarning}`
              : `Closed change ${changeId} as ${reason}.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        } catch (error) {
          // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
          // signal-error recovery is classified internally from the signal error +
          // describe() evidence via the unified classifier.
          const decision = await classifyMutationRecoveryDecision({
            signalError: error,
            handle,
          });
          if (decision.kind === "recover_via_disk") {
            const { saveRecoveredChangeStatus } =
              await import("./_recovery-writers");
            const { buildChangeClosure } = await import("./change/recovery");
            await saveRecoveredChangeStatus({
              store: activeStore,
              change: result.data,
              authorization: {
                reason: decision.reason,
                evidence: decision.evidence,
              },
              status: "closed",
              closure: buildChangeClosure(closeInput),
            });
            return formatToolOutput({
              success: true,
              _recoveryMutation: true,
              diskProjectionRetained: true,
              changeId,
              reason,
              message: `Closed change ${changeId} as ${reason} via D4 internal monotonic recovery (authority=${decision.authority}). Retained closed disk projection for stale-visibility reconciliation.`,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          if (decision.kind === "operator_required") {
            return formatToolOutput({
              error: `Cannot safely close change: ${decision.detail}`,
              code: "CHANGE_CLOSE_MUTATION_OPERATOR_REQUIRED",
              cause: decision.cause,
              changeId,
            });
          }
          const contextMismatch = extractContextMismatch(error);
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            ...contextMismatch,
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: !dryRun,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runClose(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project close unavailable: ${errorText}`,
            changeId,
            target_path,
          });
        }
      }
      return runClose(store);
    },
  },
  // rq-bulkClose01: Filter-Aware Bulk Close
  adv_change_bulk_close: {
    description:
      "Close multiple changes in a single approved operation. Supports explicit IDs or filter-based selection. Requires either a status filter or a staleness filter. Fail-all if any target is protected or invalid.",
    args: {
      selector: BulkCloseSelectorSchema.describe(
        "Explicit IDs or filter criteria",
      ),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why changes are being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded (max 1)"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview bulk close without firing signals or removing files.",
        ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .default("normal")
        .describe(
          "Recovery mode. 'poisoned_history' allows the operator to supply precise recovery evidence to skip the per-change workflow describe precheck and fall through to the disk projection on signal failure.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Operator-supplied precise recovery evidence (e.g. TMPRL1100, WorkflowNotFoundError, WorkflowExecutionAlreadyCompleted). Required when recoveryMode is 'poisoned_history'.",
        ),
    },
    execute: async (
      {
        selector,
        reason,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        supersededBy,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
        recoveryMode,
        recoveryEvidence,
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
      if (reason === "superseded") {
        if (selector.kind === "filter") {
          return formatToolOutput({
            error:
              "Filter-based bulk close with reason 'superseded' is not supported. Use explicit IDs.",
          });
        }
        if (!supersededBy) {
          return formatToolOutput({
            error: "supersededBy is required when reason is 'superseded'.",
          });
        }
      }
      const runBulkClose = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const contextOutput = projectContext
          ? { _projectContext: projectContext }
          : {};
        const selection = await resolveChangeSelection(selector, {
          list: activeStore.changes.list.bind(activeStore.changes),
          get: activeStore.changes.get.bind(activeStore.changes),
        });
        if (!selection.ok) {
          return formatToolOutput({
            error: selection.error,
            ...contextOutput,
          });
        }
        if (selection.changeIds.length === 0) {
          return formatToolOutput({
            error: "SELECTION_ERROR: No changes matched the provided criteria.",
            ...contextOutput,
          });
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            closed: 0,
            wouldClose: selection.changeIds,
            results: selection.changeIds.map((id) => ({
              changeId: id,
              success: true,
              dryRun: true,
            })),
            diskRemoved: [],
            diskFailed: [],
            message: `Would close ${selection.changeIds.length} change(s).`,
            ...contextOutput,
          });
        }
        try {
          const bundle = getService();
          if (!bundle) {
            return formatToolOutput({
              error: "Temporal service not available",
              ...contextOutput,
            });
          }
          const projectId =
            projectContext?.projectId ??
            (await getProjectId(activeStore.paths.root));
          if (!projectId) {
            return formatToolOutput({
              error: "Could not resolve project ID",
              ...contextOutput,
            });
          }
          const results: {
            changeId: string;
            success: boolean;
            error?: string;
            recovered?: boolean;
          }[] = [];
          let closed = 0;
          for (const id of selection.changeIds) {
            try {
              const handle = getChangeHandle(bundle, projectId, id);
              const closeInput = {
                approvalEvidence,
                reason,
                supersededBy,
                cancelledAt: new Date().toISOString(),
              };
              // Operator-supplied recovery branch (fixPoisonedClosePathPrecheck):
              // when the operator has provided precise poisoned-history evidence,
              // skip the per-change describe() precheck and attempt the signal.
              if (
                shouldTakeRecoveryBranch({
                  recoveryMode,
                  recoveryEvidence,
                  approvedByUser: _approvedByUser,
                  approvalEvidence,
                })
              ) {
                try {
                  await fireSignalAndRefresh(
                    handle,
                    activeStore,
                    id,
                    changeCancelledSignal,
                    buildChangeClosePayload(closeInput),
                  );
                  results.push({ changeId: id, success: true });
                  closed++;
                  continue;
                } catch (err) {
                  const existing = await activeStore.changes.get(id);
                  if (existing.success && existing.data) {
                    const { saveRecoveredChangeStatus } =
                      await import("./_recovery-writers");
                    const { buildChangeClosure } =
                      await import("./change/recovery");
                    await saveRecoveredChangeStatus({
                      store: activeStore,
                      change: existing.data,
                      authorization: {
                        reason: "poisoned_history",
                        evidence: recoveryEvidence as string,
                      },
                      status: "closed",
                      closure: buildChangeClosure(closeInput),
                    });
                    results.push({
                      changeId: id,
                      success: true,
                      recovered: true,
                    });
                    closed++;
                    continue;
                  }
                  results.push({
                    changeId: id,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  continue;
                }
              }
              // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
              // probe describe() per change to auto-detect poisoned/completed
              // workflows without operator-supplied recoveryMode/evidence ceremony.
              const internalDecision = await classifyMutationRecoveryDecision({
                handle,
              });
              if (internalDecision.kind === "recover_via_disk") {
                await logRecoveryProbeDiagnostics(handle, id);
                const existing = await activeStore.changes.get(id);
                if (existing.success && existing.data) {
                  const { saveRecoveredChangeStatus } =
                    await import("./_recovery-writers");
                  const { buildChangeClosure } =
                    await import("./change/recovery");
                  await saveRecoveredChangeStatus({
                    store: activeStore,
                    change: existing.data,
                    authorization: {
                      reason: internalDecision.reason,
                      evidence: internalDecision.evidence,
                    },
                    status: "closed",
                    closure: buildChangeClosure(closeInput),
                  });
                  results.push({
                    changeId: id,
                    success: true,
                    recovered: true,
                  });
                  closed++;
                  continue;
                }
              }
              if (internalDecision.kind === "operator_required") {
                results.push({
                  changeId: id,
                  success: false,
                  error: `Cannot safely close change: ${internalDecision.detail}`,
                });
                continue;
              }
              // rq-cacheRefresh01: refresh per-change after each cancel
              // so subsequent reads of any cancelled change see closed state.
              await fireSignalAndRefresh(
                handle,
                activeStore,
                id,
                changeCancelledSignal,
                buildChangeClosePayload(closeInput),
              );
              results.push({ changeId: id, success: true });
              closed++;
            } catch (err) {
              const existing = await activeStore.changes.get(id);
              if (!existing.success) {
                // rq-schemaDriftToolLayer: load failure on change.json (e.g.
                // schema validation) — propagate verbatim. Recovery cannot
                // proceed without a readable change, and the load error is
                // more informative than the original signal error.
                results.push({
                  changeId: id,
                  success: false,
                  error: existing.error,
                });
                continue;
              }
              if (existing.success && existing.data) {
                const closeInput = {
                  approvalEvidence,
                  reason,
                  supersededBy,
                  cancelledAt: new Date().toISOString(),
                };
                // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
                // signal-error recovery is classified internally from the signal error +
                // describe() evidence via the unified classifier.
                const handle = getChangeHandle(bundle, projectId, id);
                const decision = await classifyMutationRecoveryDecision({
                  signalError: err,
                  handle,
                });
                if (decision.kind === "recover_via_disk") {
                  const { saveRecoveredChangeStatus } =
                    await import("./_recovery-writers");
                  const { buildChangeClosure } =
                    await import("./change/recovery");
                  await saveRecoveredChangeStatus({
                    store: activeStore,
                    change: existing.data,
                    authorization: {
                      reason: decision.reason,
                      evidence: decision.evidence,
                    },
                    status: "closed",
                    closure: buildChangeClosure(closeInput),
                  });
                  results.push({
                    changeId: id,
                    success: true,
                    recovered: true,
                  });
                  closed++;
                  continue;
                }
                if (decision.kind === "operator_required") {
                  results.push({
                    changeId: id,
                    success: false,
                    error: `Cannot safely close change: ${decision.detail}`,
                  });
                  continue;
                }
              }
              results.push({
                changeId: id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          // D3: Compose with sweepClosedChangesFromDisk for unified per-id
          // disk-removal reporting. Only run when close succeeded overall
          // — partial workflow-close failures preserve source dirs as the
          // rollback / recovery path. (rq-bulkCloseDiskSweep01)
          let diskRemoved: string[] = [];
          let diskFailed: Array<{
            id: string;
            error: string;
          }> = [];
          const successfulIds = results
            .filter((r) => r.success && !r.recovered)
            .map((r) => r.changeId);
          if (successfulIds.length > 0 && activeStore.paths?.changes) {
            const sweep = await sweepClosedChangesFromDisk(
              successfulIds,
              activeStore.paths.changes,
            );
            diskRemoved = sweep.removed;
            diskFailed = sweep.failed;
          }
          const allSuccess = closed === selection.changeIds.length;
          let message = allSuccess
            ? `Successfully closed ${closed} change(s).`
            : `Closed ${closed} of ${selection.changeIds.length} change(s). See results for details.`;
          if (diskFailed.length > 0) {
            const warnings = diskFailed
              .map(
                (f) =>
                  `Source cleanup warning: failed to remove changes/${f.id}: ${f.error}`,
              )
              .join(" ");
            message += ` ${warnings}`;
          }
          return formatToolOutput({
            success: allSuccess,
            closed,
            results,
            diskRemoved,
            diskFailed,
            message,
            ...contextOutput,
          });
        } catch (error) {
          const contextMismatch = extractContextMismatch(error);
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            ...contextMismatch,
            ...contextOutput,
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: !dryRun,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runBulkClose(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project bulk close unavailable: ${errorText}`,
            target_path,
          });
        }
      }
      return runBulkClose(store);
    },
  },
  adv_change_validate: {
    description:
      "Validate change against existing specs (specs as laws) and check for conflicts with other active changes",
    args: {
      changeId: z.string().describe("Change ID to validate"),
      strict: z
        .boolean()
        .optional()
        .describe("Run strict validation checks; only errors block by default"),
      strictWarnings: z
        .boolean()
        .optional()
        .describe(
          "Opt in to treating warnings as blocking failures during strict validation",
        ),
    },
    execute: async (
      {
        changeId,
        strict,
        strictWarnings,
      }: {
        changeId: string;
        strict?: boolean;
        strictWarnings?: boolean;
      },
      store: Store,
    ) => {
      // tk-f4a18a9705ef: bound the authoritative input load (change read +
      // validation context) so a slow Temporal read degrades structurally
      // below the 10s safeExecute ceiling instead of surfacing as an
      // unclassified whole-tool ToolExecutionTimeout. Early-return
      // responses travel through the union so existing error output shapes
      // are preserved exactly.
      type ValidateInputs =
        | { kind: "response"; response: string }
        | {
            kind: "ok";
            change: Change;
            context: Awaited<ReturnType<typeof loadValidationContext>>;
          };
      let inputs: ValidateInputs;
      try {
        inputs = await withTimeout(
          (async (): Promise<ValidateInputs> => {
            const result = await store.changes.get(changeId);
            if (!result.success) {
              return {
                kind: "response",
                response: formatToolOutput({ error: result.error }),
              };
            }
            if (!result.data) {
              return {
                kind: "response",
                response: formatToolOutput({
                  error: `Change not found: ${changeId}`,
                }),
              };
            }
            const change = result.data;
            const context = await loadValidationContext(
              store,
              changeId,
              change.title,
            );
            return { kind: "ok", change, context };
          })(),
          CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS,
          `adv_change_validate input load exceeded ${CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS}ms budget`,
        );
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err;
        return formatToolOutput({
          passed: false,
          degraded: true,
          error: "VALIDATION_TIME_BUDGET_EXHAUSTED",
          reason: "time_budget_exhausted",
          stage: "load-inputs",
          timeoutMs: CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS,
          changeId,
          strict: strict === true,
          hint:
            "Validation input load exceeded its internal time budget (below the 10s tool ceiling). " +
            "No validation verdict was produced and authoritative state is untouched. " +
            "Likely a slow Temporal query or peer hydration — retry; if persistent, run adv_status and adv_doctor to check worker/workflow health.",
        });
      }
      if (inputs.kind === "response") {
        return inputs.response;
      }
      const { change, context } = inputs;
      const {
        specs,
        activeChanges,
        conflictInventory,
        proposalText,
        changedSpecFiles,
      } = context;
      // Run full validation with typed conflict inventory for conflict detection
      const validationResult = await validateChange(change, {
        specs,
        activeChanges,
        conflictInventory,
        proposalText,
        changedSpecFiles,
      });
      // Check for requirement smells in spec deltas
      const smellIssues = checkRequirementSmells(change);
      const hasSmells = smellIssues.length > 0;
      // Strict mode can escalate warnings to failures, but it can NEVER
      // override a non-clean validation result and turn it into a pass. The
      // validator's `passed` flag already consumes `canConcludeClean`.
      const passed =
        validationResult.passed &&
        (!strict ||
          (validationResult.errors.length === 0 &&
            (!strictWarnings || validationResult.warnings.length === 0)));
      const formatted = formatValidationOutput({
        passed,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
      // If smells found, format and attach smell report
      if (hasSmells) {
        const smellInputs = smellIssues.map((issue) => ({
          type: issue.code,
          text: (issue.details?.requirementId as string) ?? issue.message,
          suggestion:
            (issue.details?.remediation as string) ??
            "Review and rewrite requirement",
        }));
        const smellReport = formatSmellReport(smellInputs);
        Object.assign(formatted, smellReport);
      }
      return formatToolOutput({
        passed,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        strictWarnings: strict ? Boolean(strictWarnings) : undefined,
        checksPerformed: validationResult.checksPerformed,
        checkedAt: validationResult.checkedAt,
        authorityDiagnostics: validationResult.authorityDiagnostics,
        formatted,
      });
    },
  },
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
    execute: async (
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
            error:
              "Cannot archive: unresolved required ops follow-up obligations",
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
        const gateState = await resolveArchiveGateState(
          store,
          changeId,
          change,
        );
        const divergenceHint =
          gateState.source === "store" &&
          !allGatesSatisfied(gateState.storeGates)
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
          if (
            !worktreePath &&
            phase9 !== "skip" &&
            existingBundlePath === null
          ) {
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
          if (
            Object.values(change.deltas).some((deltas) => deltas.length > 0)
          ) {
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
          return reconcileArchivedBundleRetry({
            store,
            change,
            changeId,
            archiveMode,
            phase9,
            existingBundlePath,
            openOpsObligationsPayload,
            validationWarnings: validationResult.warnings,
          });
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
        let archiveResult: import("../archive/types").ArchiveOperationResult;
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
            const message =
              error instanceof Error ? error.message : String(error);
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
                durableProof as Parameters<
                  typeof releaseGateProofToCompletion
                >[0],
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
          const statusAlreadyArchived = change.status === "archived";
          if (!statusAlreadyArchived) {
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
              change.phase9_status = preservePhase9Evidence(
                change.phase9_status,
                {
                  status: "done",
                  startedAt: change.phase9_status?.startedAt ?? archivedAt,
                  completedAt: archivedAt,
                  changeTipSha: finalization?.changeTipSha,
                },
              );
            }
            try {
              await store.changes.save(change);
              const epicProjection =
                await projectEpicTerminalSummaryAfterArchive({
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
                  await import("../temporal/recovery-classification");
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
                            releaseGateAlreadyDone:
                              releaseGateCompletion.alreadyDone,
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
                  await import("./_recovery-writers");
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
                        releaseGateAlreadyDone:
                          releaseGateCompletion.alreadyDone,
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
    },
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
    execute: async (
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
      const archivedPath = await findArchiveBundle(
        store.paths.archive,
        changeId,
      );

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
          await import("../temporal/recovery-classification");
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
    },
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
    execute: async (
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

        const { getService } = await import("../temporal/service");
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
        const { getChangeHandle } = await import("./_adapters");
        const handle = getChangeHandle(service, projectId, changeId);
        const { isWorkflowCompletedError } =
          await import("../temporal/recovery-classification");

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

      // Archived changes route to adv_archive_purge — the sole archived-change
      // termination lever. This preserves rq-archivePurge01 semantics exactly.
      if (change.status === "archived") {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: change ${changeId} is archived.`,
          changeId,
          currentStatus: change.status,
          hint: "Use adv_archive_purge for archived changes — it is the sole archived-change workflow termination lever.",
        });
      }

      const { getService } = await import("../temporal/service");
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
      const { getChangeHandle } = await import("./_adapters");
      const handle = getChangeHandle(service, projectId, changeId);

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
        await import("../temporal/recovery-classification");

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

      const { runId, statusName } = describeThrewCompleted
        ? { runId: undefined, statusName: "COMPLETED" as string | undefined }
        : workflowRunPinFromDescription(description);

      // Determine eligibility class up front so idempotent paths can route
      // correctly: poisoned-history may refresh-only; shipped-terminal must
      // converge authority.
      const { poisonedDescriptionEvidence } = await import("./recovery-probe");
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
              },
              readback: converge.readback,
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
                refusalCode:
                  shippedTerminalProof?.refusalCode ?? "PROOF_NO_BUNDLE",
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
    },
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
    execute: async (
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
          const existing = await claimChecker(
            projectId,
            newOrigin.issue_number,
          );
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
          const errorText =
            error instanceof Error ? error.message : String(error);
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
    },
  },
  adv_change_update_issues: {
    description: "Update GitHub issue URLs linked to a change",
    args: {
      changeId: z.string().describe("Change ID"),
      add: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to add"),
      remove: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to remove"),
    },
    execute: async (
      {
        changeId,
        add,
        remove,
      }: {
        changeId: string;
        add?: string[];
        remove?: string[];
      },
      store: Store,
    ) => {
      const addList = (add ?? []).filter(Boolean);
      const removeList = (remove ?? []).filter(Boolean);
      if (addList.length === 0 && removeList.length === 0) {
        return formatToolOutput({
          error: "At least one non-empty add/remove issue list is required",
        });
      }
      const invalid = invalidGitHubIssueUrls([...addList, ...removeList]);
      if (invalid.length > 0) {
        return formatToolOutput({
          error: `Invalid GitHub issue URL(s): ${invalid.join(", ")}. Expected https://github.com/<owner>/<repo>/issues/<number>`,
          invalid,
        });
      }
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }
      const change = result.data;
      const { github_issues, result: update } = applyIssueUpdates(
        change.github_issues,
        addList,
        removeList,
      );
      change.github_issues = github_issues;
      try {
        await store.changes.save(change);
      } catch (err) {
        return formatToolOutput({
          error: `Failed to save change: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      return formatToolOutput({
        success: true,
        message: `Issues updated: +${update.added.length} -${update.removed.length}`,
        github_issues: change.github_issues,
        added: update.added,
        removed: update.removed,
        alreadyLinked: update.alreadyLinked,
        notLinked: update.notLinked,
      });
    },
  },
  adv_change_reenter: {
    description:
      "Reopen gates from a specified point for scope expansion re-entry. Resets the target gate and all downstream gates to pending, preserving existing tasks and completed work.",
    args: {
      changeId: z.string().describe("Change ID to reopen gates for"),
      fromGate: GateIdSchema.describe("Gate to reopen from"),
      reason: z.string().describe("Why re-entry is needed"),
      scopeDelta: z
        .string()
        .optional()
        .describe("Description of new or changed scope"),
      approvedByUser: z
        .boolean()
        .optional()
        .describe(
          "Deprecated compatibility field. Re-entry no longer requires explicit user approval.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional audit evidence when re-entry follows an explicit user instruction.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview re-entry without firing gate reset signal."),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the re-entry through that project's Temporal-backed target store.",
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
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      {
        changeId,
        fromGate,
        reason,
        scopeDelta,
        approvalEvidence: _approvalEvidence,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
        include,
      }: {
        changeId: string;
        fromGate: GateId;
        reason: string;
        scopeDelta?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      const runReenter = async (
        activeStore: Store,
        projectContext?: TargetProjectContext,
      ) => {
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({
            error: `Change not found: ${changeId}`,
            changeId,
          });
        }

        // M2a (terminatechangeworkflowonarchi): change workflows now Complete
        // on archive/close. Reenter on a Completed workflow would fail with an
        // opaque WorkflowExecutionAlreadyCompleted error from Temporal. Reject
        // at the tool layer with a domain-level message and remediation hint.
        if (
          result.data.status === "archived" ||
          result.data.status === "closed"
        ) {
          return formatToolOutput({
            error: `Cannot reenter ${result.data.status} change ${changeId}. Reenter is for scope expansion on active changes; archived/closed changes cannot be reopened. Use adv_doctor if workflow recovery is needed.`,
            changeId,
          });
        }

        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            fromGate,
            reason,
            scopeDelta,
            ...(projectContext
              ? { _projectContext: formatTargetProjectContext(projectContext) }
              : {}),
            message: `Would reenter change ${changeId} from ${fromGate}.`,
          });
        }

        try {
          const bundle = getService();
          if (!bundle) {
            return formatToolOutput({
              error: "Temporal service not available",
              changeId,
            });
          }
          const projectId = await getProjectId(activeStore.paths.root);
          if (!projectId) {
            return formatToolOutput({
              error: "Could not resolve project ID",
              changeId,
            });
          }
          const handle = getChangeHandle(bundle, projectId, changeId);
          // rq-cacheRefresh01: refresh after reenter so buildReentryResult
          // reads the reset-gates state from a fresh cache, not stale gates.
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            gateReenteredSignal,
            {
              fromGateId: fromGate,
              reason,
              scopeDelta,
              reenteredBy: "agent",
              reenteredAt: new Date().toISOString(),
            },
          );
          const output = await buildReentryResult(
            activeStore,
            changeId,
            fromGate,
            include?.snapshot ?? false,
          );
          return projectContext
            ? appendTargetProjectContextOutput(output, projectContext)
            : output;
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              target_confirmed,
              confirmationEvidence,
              stateRequirement: dryRun ? "snapshot-ok" : "temporal-required",
              mutation: dryRun ? false : undefined,
            },
            async ({ context, store: targetStore }) =>
              runReenter(targetStore, context),
          );
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return runReenter(store);
    },
  },
};
export {
  readArtifact,
  readArtifacts,
  loadProposalForContext,
} from "./change/artifacts";
export { closeLinkedIssue } from "./change/recovery";
