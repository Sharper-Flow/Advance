// rq-prop-context1: Durable Proposal Context for adv-task
/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */
import { ZodError } from "zod";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import type { WorkNodeRef } from "../../types";
import {
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  type GateId,
  type ArtifactKind,
  type Change,
  type ChangeLifecycleState,
  type ScopedSubagentReport,
  type BriefingPacketLane,
  type GateCompletion,
  type HydrationStats,
} from "../../types";
import { ChangeSchema } from "../../types/changes";
import type { Store } from "../../storage/store";
import { getProjectId } from "../../utils/project-id";
import { formatZodError } from "../../utils/safe-execute";
import { createLogger } from "../../utils/debug-log";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../../types/subagent-reports";
import { readArtifacts, type ArtifactReadResult } from "./artifacts";
import {
  buildReleaseCompletionEvidence,
  preservePhase9Evidence,
  verifyReleaseEvidenceFromMain,
} from "./archive-gate";
import {
  verifyStatusRepairReadAfterWrite,
  type ShippedTerminalProofResult,
} from "./recovery";
import { classifyMutationRecoveryDecision } from "../monotonic-recovery";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { type D3EnforcementError } from "../../validator/work-graph-enforcement";
import { nodeRefKey } from "../../validator/work-graph-validation";
import {
  isTemporalReadExpired,
  runTemporalRead,
  type TemporalReadContext,
} from "../../storage/store-temporal/read-context";
import { TemporalQueryTimeoutError } from "../../temporal/retry-wrapper";
import { findArchiveBundle } from "../../archive";
import { formatToolOutput } from "../../utils/tool-output";
import { normalizeChangeLifecycleState } from "../../temporal/change-state";
import { type BriefingPacketRendererInput } from "../../utils/briefing-packet-renderer";
import { classifyBriefingFacts } from "../../utils/briefing-fact-classifier";
import { collectErrorText } from "../../temporal/retry-wrapper";
import { boundedRetry } from "../../utils/fs";
import { readBoundedProjectionDocument } from "../../storage/change-projection-reader";
import { isWorkflowAbsentByExactName } from "../../temporal/recovery-classification";
import {
  detectArchiveMode,
  type GitFinalizeOutcome,
} from "../archive-helpers/git-finalize";

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
      await import("../../temporal/recovery-classification");
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
    const { saveRecoveredChangeStatus } = await import("../_recovery-writers");
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
      await import("../../temporal/recovery-classification");
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

type ArchivedNoWorkflowProofResult =
  | {
      ok: true;
      bundleSha256: string;
      finalization: GitFinalizeOutcome;
    }
  | {
      ok: false;
      code:
        | Extract<ShippedTerminalProofResult, { ok: false }>["refusalCode"]
        | "PROOF_BUNDLE_NOT_ON_DEFAULT_BRANCH";
      evidence: string;
    };

/**
 * Full proof for repairing an already-archived projection whose workflow is
 * absent. The normal shipped-terminal proof protects the live-workflow
 * termination path; this stricter variant additionally requires the disk
 * projection to already be archived and re-verifies release reachability from
 * the default branch before the convergence write.
 */
async function verifyArchivedNoWorkflowProof(input: {
  store: Store;
  changeId: string;
  change: Change;
  shippedTerminalProof: ShippedTerminalProofResult;
}): Promise<ArchivedNoWorkflowProofResult> {
  if (!input.shippedTerminalProof.ok) {
    return {
      ok: false,
      code: input.shippedTerminalProof.refusalCode,
      evidence: input.shippedTerminalProof.evidence,
    };
  }
  if (input.shippedTerminalProof.diskChange.status !== "archived") {
    return {
      ok: false,
      code: "PROOF_INVALID_DISK_PROJECTION",
      evidence: `disk projection status: ${input.shippedTerminalProof.diskChange.status}; expected archived`,
    };
  }

  const { archiveMode } = detectArchiveMode(input.store.config ?? {});
  const finalization = verifyReleaseEvidenceFromMain({
    store: input.store,
    changeId: input.changeId,
    archiveMode,
    change: input.change,
  });
  if (finalization.status !== "shipped") {
    return {
      ok: false,
      code: "PROOF_BUNDLE_NOT_ON_DEFAULT_BRANCH",
      evidence:
        finalization.blocked?.reason ??
        `default-branch release proof status: ${finalization.status}`,
    };
  }

  try {
    const bundleText = await readFile(
      join(input.shippedTerminalProof.bundlePath, "change.json"),
      "utf8",
    );
    return {
      ok: true,
      bundleSha256: createHash("sha256").update(bundleText).digest("hex"),
      finalization,
    };
  } catch (error) {
    return {
      ok: false,
      code: "PROOF_INVALID_BUNDLE",
      evidence: `bundle proof receipt could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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

/**
 * Read the handler-written projection envelope for archive-commit evidence.
 * The schemaVersion: 2 envelope is attributable: it is produced ONLY by the
 * workflow Activity (temporal/activities.ts writeChangeProjection). Local
 * writers — recovery stamps, coordinateChangeMutation commits — persist a
 * plain Change document instead (change-projection-transaction.ts), so their
 * archived status is NOT accepted here: a stale plain-JSON archived stamp is
 * exactly the AC1 poisoned state where the transition was never delivered,
 * and accepting it would report success without causality to any workflow
 * commit. The archive handlers roll back unless their projectChangeState
 * Activity returned "written", so an envelope carrying status "archived" is
 * airtight proof the transition committed — unlike describe status
 * (liveness) or search attributes (provisional).
 */
async function readArchivedProjectionStatus(
  store: Store,
  changeId: string,
): Promise<string | undefined> {
  const projectionFile = join(store.paths.changes, `${changeId}.json`);
  const outcome = await readBoundedProjectionDocument(projectionFile);
  if (outcome.kind !== "ok") return undefined;
  try {
    const parsed: unknown = JSON.parse(outcome.content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 2) return undefined;
    const envelopeState = record.state;
    if (
      !envelopeState ||
      typeof envelopeState !== "object" ||
      Array.isArray(envelopeState)
    ) {
      return undefined;
    }
    const status = (envelopeState as Record<string, unknown>).status;
    return typeof status === "string" ? status : undefined;
  } catch {
    return undefined;
  }
}

async function getChangeWorkflowHandleForStore(store: Store, changeId: string) {
  const { getService } = await import("../../temporal/service");
  const service = getService();
  const projectId = service ? await getProjectId(store.paths.root) : null;
  if (!service || !projectId) return undefined;
  const { getChangeHandle } = await import("../_adapters");
  return getChangeHandle(service, projectId, changeId);
}

const ARCHIVE_WORKFLOW_PROOF_BUDGET_MS = 2000;
const ARCHIVE_WORKFLOW_PROOF_BASE_MS = 50;
const ARCHIVE_WORKFLOW_PROOF_CAP_MS = 250;

type ArchiveWorkflowProofHandle = {
  describe?: () => Promise<unknown>;
};

type ArchiveWorkflowProofResult =
  | {
      ok: true;
      attempts: number;
      proof: "terminal" | "projection";
      detail: string;
    }
  | {
      ok: false;
      attempts: number;
      code:
        | "ARCHIVE_WORKFLOW_PROOF_AMBIGUOUS"
        | "ARCHIVE_WORKFLOW_PROOF_FAILED";
      error: string;
      recoveryDecision: Awaited<
        ReturnType<typeof classifyMutationRecoveryDecision>
      >;
    };

/**
 * Prove that the archive transition committed durably after the transition
 * request was accepted. Neither signal acceptance nor workflow liveness is
 * proof, and the archived search-attribute marker is provisional — the
 * handlers publish it before the fallible archive Activity and retract it
 * only after rollback. Proof therefore requires one of two airtight
 * artifacts, checked per poll:
 *   1. the workflow-Activity projection envelope (schemaVersion: 2) carrying
 *      status "archived" — the archive handlers roll back unless this write
 *      succeeded, and only the Activity produces this shape, so its presence
 *      is airtight commit evidence attributable to a workflow commit; or
 *   2. a terminal workflow execution status (the patched terminal block
 *      writes the durable projection before completion).
 * A plain-JSON archived document is NOT proof: local recovery writers can
 * stamp archived without any workflow transition (the AC1 poisoned state).
 * Visibility/list queries are intentionally not consulted here.
 */
async function proveArchiveWorkflowTransition(
  handle: ArchiveWorkflowProofHandle | undefined,
  store: Store,
  changeId: string,
): Promise<ArchiveWorkflowProofResult> {
  let lastError: unknown = new Error(
    `No workflow handle is available for change ${changeId}`,
  );
  const proof = await boundedRetry<{
    proof: "terminal" | "projection";
    detail: string;
  }>({
    budgetMs: ARCHIVE_WORKFLOW_PROOF_BUDGET_MS,
    baseMs: ARCHIVE_WORKFLOW_PROOF_BASE_MS,
    capMs: ARCHIVE_WORKFLOW_PROOF_CAP_MS,
    jitter: 0,
    attempt: async () => {
      const projectedStatus = await readArchivedProjectionStatus(
        store,
        changeId,
      );
      if (projectedStatus === "archived") {
        return {
          ok: true as const,
          value: {
            proof: "projection" as const,
            detail: "handler-written projection carries status archived",
          },
        };
      }
      if (!handle || typeof handle.describe !== "function") {
        return { ok: false as const };
      }
      try {
        const description = await handle.describe();
        const { statusName } = workflowRunPinFromDescription(description);
        const normalizedStatus = statusName?.toUpperCase();
        if (
          normalizedStatus === "COMPLETED" ||
          normalizedStatus === "ARCHIVED"
        ) {
          return {
            ok: true as const,
            value: {
              proof: "terminal" as const,
              detail: `workflow reached terminal status ${normalizedStatus}`,
            },
          };
        }
        lastError = new Error(
          `archive transition is not yet durable for ${changeId}: ` +
            `projection does not carry status archived` +
            (projectedStatus ? ` (found ${projectedStatus})` : "") +
            ` and workflow status is ${normalizedStatus ?? "unknown"}`,
        );
        return { ok: false as const };
      } catch (error) {
        lastError = error;
        return { ok: false as const };
      }
    },
  });

  if (proof.ok && proof.value) {
    return {
      ok: true,
      attempts: proof.attempts,
      proof: proof.value.proof,
      detail: proof.value.detail,
    };
  }

  const recoveryDecision = await classifyMutationRecoveryDecision({
    signalError: lastError,
    handle,
  });
  const ambiguous = isWorkflowAbsentByExactName(lastError);
  const detail = collectErrorText(lastError);
  return {
    ok: false,
    attempts: proof.attempts,
    code: ambiguous
      ? "ARCHIVE_WORKFLOW_PROOF_AMBIGUOUS"
      : "ARCHIVE_WORKFLOW_PROOF_FAILED",
    error:
      `Archive transition is not durably recorded: post-save workflow proof ` +
      `failed after ${proof.attempts} proof attempt(s) for ${changeId}. ` +
      `${ambiguous ? "The workflow may be completed or retention-expired. " : "Neither the handler-written projection nor a terminal workflow status proves the transition. "}` +
      `Re-run archive after confirming workflow and projection state. Cause: ${detail}`,
    recoveryDecision,
  };
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

export {
  logger,
  LEAN_PHASE_PLAN_FIELDS,
  DIRECTIVE_INCLUDE_FIELDS,
  hasPhaseDirective,
  shapeDirectiveResponse,
  formatD3Error,
  createChangeShowSubreadRunner,
  ARTIFACT_OUTPUT_KEYS,
  applyArtifactContentToOutput,
  WORKFLOW_TERMINATE_SHIPPED_GATES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  TERMINABLE_WORKFLOW_RUN_STATUSES,
  type ConvergeTerminalAuthorityResult,
  convergeTerminalAuthority,
  type ArchivedNoWorkflowProofResult,
  verifyArchivedNoWorkflowProof,
  formatConvergeFailure,
  workflowRunPinFromDescription,
  readArchivedProjectionStatus,
  getChangeWorkflowHandleForStore,
  ARCHIVE_WORKFLOW_PROOF_BUDGET_MS,
  ARCHIVE_WORKFLOW_PROOF_BASE_MS,
  ARCHIVE_WORKFLOW_PROOF_CAP_MS,
  type ArchiveWorkflowProofHandle,
  type ArchiveWorkflowProofResult,
  proveArchiveWorkflowTransition,
  subagentReportTaskId,
  subagentReportReadbackKey,
  DEFAULT_BRIEFING_PACKET_LANE,
  briefingPacketGeneratedBy,
  collectBriefingFactsForReadback,
  buildBriefingPacketForChange,
  type ChangePhase,
  deriveChangePhase,
};
