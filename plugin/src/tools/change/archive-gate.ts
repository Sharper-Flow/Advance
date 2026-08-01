/**
 * archive-gate helpers extracted from change.ts.
 */
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
import { commitChangeProjection } from "../../storage/change-projection-transaction";
import { getProjectId } from "../../utils/project-id";
import { createLogger } from "../../utils/debug-log";
import { formatToolOutput } from "../../utils/tool-output";
import {
  collectErrorText,
  classifyTemporalError,
  isReconnectableError,
  TemporalQueryTimeoutError,
} from "../../temporal/retry-wrapper";
import { getService } from "../../temporal/service";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  waitForGateCompletion,
} from "../_adapters";
import {
  createTemporalReadContext,
  runTemporalQuery,
  runTemporalRead,
  type WorkflowHandleLike,
} from "../../storage/store-temporal/shared";
import { isWorkflowCompletedError } from "../../temporal/recovery-classification";
import {
  gateCompletedSignal,
  getGateStatusQuery,
  phase9StatusUpdatedSignal,
  changeStateQuery,
} from "../../temporal/messages";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import {
  detectDefaultBranch,
  classifyFinalizationRoute,
  resolveReleaseReachability,
  coercePrWorkflowRoute,
  type GitFinalizeOutcome,
  type GitFinalizeDeps,
} from "../archive-helpers/git-finalize";
import { hasGateRecoveryAudit } from "../recovery-audit";
import {
  releaseGateProofToCompletion,
  type ReleaseGateProof,
  type DurableReleaseGateProofResult,
} from "./release-proof";
import { saveChange } from "../../storage/json";
import { findArchiveBundle, bundleJsonStringify } from "../../archive/archive";
import { withArchiveProjectionLock } from "../../archive/projection-lock";
import { sha256HexString } from "../../archive/terminal-summary";
import { atomicWriteFile } from "../../utils/fs";
import { readFile } from "fs/promises";
import { join } from "path";
const logger = createLogger("change");
export function getArchiveTaskPreflightError(change: {
  tasks: {
    id: string;
    title: string;
    status: string;
  }[];
}): string | null {
  const incompleteTasks = change.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  if (incompleteTasks.length > 0) {
    return formatToolOutput({
      error: "Cannot archive: incomplete tasks",
      incompleteTasks: incompleteTasks.map((t) => ({
        id: t.id,
        title: t.title,
      })),
    });
  }
  return null;
}
export type ArchiveGateState = {
  effectiveGates: Gates;
  storeGates: Gates;
  source: "store" | "live";
  liveGates?: Gates;
  liveQueryError?: string;
};
export async function resolveArchiveGateState(
  store: Store,
  changeId: string,
  change: {
    gates?: Gates;
  },
): Promise<ArchiveGateState> {
  const storeGates = change.gates ?? createDefaultGates();
  const bundle = getService();
  const projectId = bundle ? await getProjectId(store.paths.root) : null;
  if (!bundle || !projectId) {
    return { effectiveGates: storeGates, storeGates, source: "store" };
  }
  try {
    const queriedGates = await runReacquiringChangeQuery<Gates>(
      projectId,
      changeId,
      getGateStatusQuery,
      undefined,
    );
    if (queriedGates && typeof queriedGates === "object") {
      // Live Temporal gates are authoritative. When they disagree with store
      // gates, getGateDivergenceHint surfaces the mismatch so the user can
      // recover (e.g., manual /adv-gate-complete to sync stale state).
      return {
        effectiveGates: queriedGates,
        storeGates,
        source: "live",
        liveGates: queriedGates,
      };
    }
  } catch (error) {
    return {
      effectiveGates: storeGates,
      storeGates,
      source: "store",
      liveQueryError: collectErrorText(error),
    };
  }
  return { effectiveGates: storeGates, storeGates, source: "store" };
}
export function getArchiveGatePreflightError(
  changeId: string,
  gateState: ArchiveGateState,
  allowReleasePending: boolean,
  divergenceHint?: string | null,
): string | null {
  const gates = gateState.effectiveGates;
  // rq-releaseFinalization01: archive may run with release gate pending.
  // Finalization creates the reachability/push evidence required to complete
  // the release gate, which is then done after archive succeeds.
  const incompleteGates = allowReleasePending
    ? GATE_ORDER.filter(
        (gateId) => gateId !== "release" && !isGateSatisfied(gates[gateId]),
      )
    : getIncompleteGates(gates);
  if (incompleteGates.length > 0) {
    const fallbackHint = `Run /adv-gate-status ${changeId} to see gate details`;
    const hint = [
      fallbackHint,
      gateState.liveQueryError
        ? `Live gate-status query failed: ${gateState.liveQueryError}`
        : null,
      divergenceHint ?? null,
    ]
      .filter(Boolean)
      .join(" ");
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
      hint,
    });
  }
  return null;
}
// rq-releaseFinalization01: release gate confirmation must be durable.
// rq-reapOrphanAdvWorkers T2: archive finalization reads must not pin a
// pre-built handle. `reinitStsl` swaps the cached bundle's client in place
// on reconnect; a handle captured before the retry loop keeps the closed
// client and every retried query fails with the same transport error.
// Rebuilding the handle from `getService()` inside each attempt closure
// picks up the swapped-in client.
function queryWithFreshChangeHandle(
  projectId: string,
  changeId: string,
  query: unknown,
  args: unknown[],
): Promise<unknown> {
  const bundle = getService();
  if (!bundle) {
    throw new Error("STSL not initialized for change query");
  }
  return getChangeHandle(bundle.client, projectId, changeId).query(
    query,
    ...args,
  );
}
export function runReacquiringChangeQuery<T>(
  projectId: string,
  changeId: string,
  query: unknown,
  ...args: unknown[]
): Promise<T> {
  return runTemporalQuery(() =>
    queryWithFreshChangeHandle(projectId, changeId, query, args),
  ) as Promise<T>;
}
/**
 * Handle-like adapter whose `query` reacquires the real handle from
 * `getService()` on every invocation. Lets `waitForGateCompletion` (the
 * single source of truth for gate poll semantics, STRUCT-003) drive the
 * archive release-gate poll without pinning a stale client.
 */
function reacquiringChangeQueryHandle(
  projectId: string,
  changeId: string,
): WorkflowHandleLike {
  return {
    query: (definition: unknown, ...args: unknown[]) =>
      queryWithFreshChangeHandle(projectId, changeId, definition, args),
    executeUpdate: () =>
      Promise.reject(
        new Error("reacquiring query handle does not support executeUpdate"),
      ),
    signal: () =>
      Promise.reject(
        new Error("reacquiring query handle does not support signal"),
      ),
  };
}

const RELEASE_GATE_PRE_QUERY_BUDGET_MS = 3_000;

const TERMINAL_WORKFLOW_STATUS_NAMES = new Set([
  "COMPLETED",
  "TERMINATED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

function isTerminalWorkflowStatus(description: unknown): boolean {
  const name = (description as { status?: { name?: unknown } } | undefined)
    ?.status?.name;
  return typeof name === "string" && TERMINAL_WORKFLOW_STATUS_NAMES.has(name);
}

function isUnresponsiveWorkflowError(error: unknown): boolean {
  return (
    error instanceof TemporalQueryTimeoutError ||
    (error instanceof Error && error.name === "TemporalQueryTimeout")
  );
}

async function describeChangeHandleWithDeadline(
  bundle: NonNullable<ReturnType<typeof getService>>,
  projectId: string,
  changeId: string,
): Promise<unknown> {
  const handle = getChangeHandle(bundle.client, projectId, changeId);
  // Fallback for environments without native deadline support (test mocks):
  // use the direct describe() call. Production uses runTemporalRead for a
  // bounded 3s deadline + AbortController that cancels the gRPC call cleanly.
  if (
    !bundle.connection ||
    typeof (bundle.connection as unknown as { withDeadline?: unknown })
      .withDeadline !== "function"
  ) {
    return handle.describe?.();
  }
  const ctx = createTemporalReadContext(RELEASE_GATE_PRE_QUERY_BUDGET_MS);
  const result = await runTemporalRead(
    bundle.connection,
    () =>
      handle.describe?.() ??
      Promise.reject(new Error("Workflow handle has no describe() method")),
    ctx,
    { timeoutMs: RELEASE_GATE_PRE_QUERY_BUDGET_MS },
  );
  if (result.error) throw result.error;
  return result.data;
}

async function runBoundedReacquiringChangeQuery<T>(
  bundle: NonNullable<ReturnType<typeof getService>>,
  projectId: string,
  changeId: string,
  query: unknown,
  ...args: unknown[]
): Promise<T> {
  // Fallback for environments without native deadline support (test mocks):
  // use the original unbounded query path. Production uses runTemporalRead
  // for a bounded 3s deadline + AbortController.
  if (
    !bundle.connection ||
    typeof (bundle.connection as unknown as { withDeadline?: unknown })
      .withDeadline !== "function"
  ) {
    return runReacquiringChangeQuery<T>(projectId, changeId, query, ...args);
  }
  const ctx = createTemporalReadContext(RELEASE_GATE_PRE_QUERY_BUDGET_MS);
  const result = await runTemporalRead(
    bundle.connection,
    () => queryWithFreshChangeHandle(projectId, changeId, query, args),
    ctx,
    { timeoutMs: RELEASE_GATE_PRE_QUERY_BUDGET_MS },
  );
  if (result.error) throw result.error;
  return result.data as T;
}

export async function waitForArchiveReleaseGateCompletion(
  projectId: string,
  changeId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<GateCompletion | undefined> {
  return waitForGateCompletion(
    reacquiringChangeQueryHandle(projectId, changeId),
    "release",
    opts,
  );
}
export function buildReleaseCompletionEvidence(
  finalization: GitFinalizeOutcome,
): string {
  const details = [
    `defaultBranch=${finalization.defaultBranch}`,
    `mainCheckout=${finalization.mainCheckout}`,
    `pushStatus=${finalization.pushStatus}`,
    finalization.releasedCommitSha
      ? `releasedCommitSha=${finalization.releasedCommitSha}`
      : null,
    finalization.mergeCommitSha
      ? `mergeCommitSha=${finalization.mergeCommitSha}`
      : null,
    finalization.mainCheckpointCommitSha
      ? `mainCheckpointCommitSha=${finalization.mainCheckpointCommitSha}`
      : null,
    finalization.prBranch ? `prBranch=${finalization.prBranch}` : null,
    finalization.prNumber ? `prNumber=${finalization.prNumber}` : null,
    finalization.prUrl ? `prUrl=${finalization.prUrl}` : null,
    finalization.route ? `route=${finalization.route}` : null,
  ].filter(Boolean);
  return `Phase 9 finalization ${finalization.status}; ${details.join("; ")}`;
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

/**
 * rq-fixPhase9PrDetection AC4: preserve durable Phase 9 evidence fields
 * (repo, prNumber, prUrl, route, changeTipSha, autoMergeArmed) across
 * pending_merge/done/failed transitions. Fields defined on `next` take
 * precedence; otherwise, fields from `previous` are carried forward so
 * previous evidence (e.g., changeTipSha, repo) is not dropped.
 */
export function preservePhase9Evidence(
  previous: Phase9FinalizationStatus | undefined,
  next: Phase9FinalizationStatus,
): Phase9FinalizationStatus {
  if (!previous) {
    return next;
  }
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
/**
 * rq-archiveRetryIdempotence01 (AC7): bounded retry when the change is already
 * archived and the archive bundle is present. Reconciles release-gate and
 * phase9 metadata without repeating finalization, branch deletion, issue
 * closure, or cleanup.
 */
export async function reconcileArchivedBundleRetry(input: {
  store: Store;
  change: Change;
  changeId: string;
  archiveMode: "direct" | "pr";
  phase9?: "run" | "skip";
  existingBundlePath: string;
  openOpsObligationsPayload: Record<string, unknown>;
  validationWarnings: Array<{
    code: string;
    message: string;
    path?: string;
  }>;
}): Promise<string> {
  if (input.phase9 === "skip") {
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      archivePath: input.existingBundlePath,
      noOp: true,
      message: `Change ${input.changeId} is already archived with an existing bundle; phase9=skip skipped reconciliation.`,
      ...input.openOpsObligationsPayload,
      ...(input.validationWarnings.length > 0
        ? {
            validationWarnings: input.validationWarnings.map((w) => ({
              code: w.code,
              message: w.message,
              path: w.path,
            })),
          }
        : {}),
    });
  }
  const finalization = verifyReleaseEvidenceFromMain({
    store: input.store,
    changeId: input.changeId,
    archiveMode: input.archiveMode,
    change: input.change,
  });
  const commonPayload = {
    changeId: input.changeId,
    archivePath: input.existingBundlePath,
    ...input.openOpsObligationsPayload,
    ...(input.validationWarnings.length > 0
      ? {
          validationWarnings: input.validationWarnings.map((w) => ({
            code: w.code,
            message: w.message,
            path: w.path,
          })),
        }
      : {}),
  };
  if (finalization.status === "blocked") {
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
      ...commonPayload,
      finalization,
      continueFrom: {
        path: finalization.mainCheckout,
        branch: finalization.defaultBranch,
      },
    });
  }
  if (finalization.status === "pending_merge") {
    await recordPhase9Status({
      store: input.store,
      changeId: input.changeId,
      status: buildPendingMergePhase9Status({
        finalization,
        startedAt:
          input.change.phase9_status?.startedAt ?? new Date().toISOString(),
        previous: input.change.phase9_status,
      }),
    });
    return formatToolOutput({
      success: true,
      noOp: true,
      message: `Change ${input.changeId} is already archived; pending_merge state recorded without repeating finalization.`,
      ...commonPayload,
      phase9: "pending_merge",
      finalization,
      continueFrom: {
        path: finalization.mainCheckout,
        branch: finalization.defaultBranch,
      },
    });
  }
  // Reconcile the release gate even when the store already shows done: an
  // existing-bundle retry must not retire as no-op success solely because
  // store.gates.get reports release done. Structural Phase 9 evidence is
  // re-verified and the durable proof must match before reconciliation
  // succeeds (rq-releaseProjectionDurability01).
  const releaseEvidence = buildReleaseCompletionEvidence(finalization);
  // First verification checks the authoritative active change projection
  // only. Reading the archive bundle here would let a stale or incomplete
  // bundle short-circuit a live workflow that still needs the gate signal.
  let durableProof = await verifyReleaseGateDurableForArchive({
    store: input.store,
    changeId: input.changeId,
    evidence: releaseEvidence,
    finalization,
    requireExistingGate: true,
  });
  let releaseResult: Extract<
    ArchiveReleaseGateResult,
    {
      ok: true;
    }
  >;
  // rq-releaseProjectionDurability01 / fixReleaseGateProjection AC3: a
  // shipped-finalization proof (e.g. no_remote + skipped push) is structural
  // evidence the change reached the default branch, but it does NOT prove the
  // live workflow has already processed the release gate. For a live workflow
  // we must still signal and poll so phase9_status can be recorded via the
  // workflow; for a terminal workflow completeReleaseGateAfterFinalization
  // falls back to the recovery writer and sets recoveryMutation so we skip the
  // phase9 signal. Store/disk sources mean the gate is already durably done,
  // so we can safely short-circuit.
  if (durableProof.ok && durableProof.source !== "shipped-finalization") {
    releaseResult = {
      ok: true,
      gate:
        durableProof.gate ??
        releaseGateProofToCompletion(
          durableProof as Extract<ReleaseGateProof, { accepted: true }>,
        ),
      alreadyDone: true,
      ...(durableProof.source === "disk" ? { recoveryMutation: true } : {}),
    };
  } else {
    const completionResult = await completeReleaseGateAfterFinalization({
      store: input.store,
      change: input.change,
      changeId: input.changeId,
      finalization,
      existingBundlePath: input.existingBundlePath,
    });
    if (!completionResult.ok) {
      return formatToolOutput({
        success: false,
        error: `Archive release gate completion blocked: ${completionResult.error}`,
        requirement: "rq-releaseFinalization01",
        ...commonPayload,
        finalization,
        continueFrom: {
          path: finalization.mainCheckout,
          branch: finalization.defaultBranch,
        },
        workflowGateStatus: completionResult.workflowGateStatus,
        stuckReason: completionResult.stuckReason,
        readinessBlockers: completionResult.readinessBlockers,
      });
    }
    // Write the confirmed live gate back to the durable projection before the
    // readback verification. This closes the async-projection race where the
    // workflow poll observes "done" before the scheduled projection activity
    // has persisted it, and it covers the split-brain case where the active
    // projection has been removed and only the archive bundle remains.
    // Recovery mutations already wrote the disk projection, so skip the
    // redundant live writeback to avoid failing on a missing bundle path.
    if (!completionResult.recoveryMutation) {
      await commitArchiveReleaseGateProjection({
        store: input.store,
        changeId: input.changeId,
        gate: completionResult.gate,
        evidence: releaseEvidence,
        bundlePath: input.existingBundlePath,
      });
    }
    durableProof = await verifyReleaseGateDurableForArchive({
      store: input.store,
      changeId: input.changeId,
      evidence: releaseEvidence,
      finalization,
      bundlePath: input.existingBundlePath,
      requireExistingGate: true,
    });
    if (!durableProof.ok) {
      return formatToolOutput({
        success: false,
        error: `Archive durable release gate proof blocked: ${durableProof.error}`,
        requirement: "rq-releaseProjectionDurability01",
        ...commonPayload,
        finalization,
        continueFrom: {
          path: finalization.mainCheckout,
          branch: finalization.defaultBranch,
        },
        releaseGateStatus: durableProof.releaseGateStatus,
        stuckReason: durableProof.stuckReason,
        readinessBlockers: durableProof.readinessBlockers,
      });
    }
    releaseResult = {
      ...completionResult,
      gate:
        durableProof.gate ??
        releaseGateProofToCompletion(
          durableProof as Extract<ReleaseGateProof, { accepted: true }>,
        ),
    };
  }
  // rq-archiveRetryIdempotence01 / AC3 split-brain recovery: reconcile Phase 9
  // metadata to done whenever it is not already done — INCLUDING when it is
  // unset. The #216 split-brain leaves a durable bundle with phase9_status
  // unset (the Temporal-only recorder could not fire during the timeout); the
  // idempotent re-run MUST record it. The prior guard
  // (`phase9_status?.status && ...`) skipped the unset case, silently leaving
  // the split-brain unreconciled. `preservePhase9Evidence(undefined, next)`
  // returns `next`, so an unset status is recorded cleanly.
  //
  // Guard on `!releaseResult.recoveryMutation`: when the release gate had to be
  // recovered via disk projection, the change workflow has already completed
  // and CANNOT accept the phase9 signal — recording there would throw a
  // completed-workflow error and break the poisoned-recovery path. In that case
  // phase9 reconciliation is the internalized recovery concern, not this
  // signal. When the workflow is live (no recovery mutation), record normally.
  if (
    input.change.phase9_status?.status !== "done" &&
    !releaseResult.recoveryMutation
  ) {
    await recordPhase9Status({
      store: input.store,
      changeId: input.changeId,
      status: preservePhase9Evidence(input.change.phase9_status, {
        status: "done",
        startedAt:
          input.change.phase9_status?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        changeTipSha: input.change.phase9_status?.changeTipSha,
      }),
    });
  }
  return formatToolOutput({
    success: true,
    noOp: true,
    message: `Change ${input.changeId} is already archived; release gate and Phase 9 metadata reconciled without repeating finalization or cleanup.`,
    ...commonPayload,
    finalization,
    continueFrom: {
      path: finalization.mainCheckout,
      branch: finalization.defaultBranch,
    },
    releaseGate: releaseResult.gate,
    releaseGateAlreadyDone: releaseResult.alreadyDone,
    ...(releaseResult.recoveryMutation ? { _recoveryMutation: true } : {}),
    ...(releaseResult.reconciliationWarning
      ? { reconciliationWarning: releaseResult.reconciliationWarning }
      : {}),
  });
}
export function buildFailedPhase9Classification(input: {
  change: Change;
  finalization: GitFinalizeOutcome;
}):
  | {
      phase9Failure: {
        status: "failed";
        error?: string;
        blocker?: string;
        recoverable: false;
        remediation?: string;
        details?: string[];
      };
    }
  | Record<string, never> {
  // rq-archiveRecoveryConsistency01: failed Phase 9 recovery without
  // structural release proof must classify the blocker and fail closed.
  const phase9Status = input.change.phase9_status;
  if (phase9Status?.status !== "failed") {
    return {};
  }
  const blocked =
    input.finalization.status === "blocked"
      ? input.finalization.blocked
      : undefined;
  return {
    phase9Failure: {
      status: "failed",
      error: phase9Status.error,
      blocker: blocked?.reason,
      recoverable: false,
      remediation: blocked?.remediation,
      details: blocked?.details,
    },
  };
}
export async function recordPhase9Status(input: {
  store: Store;
  changeId: string;
  status: Phase9FinalizationStatus;
}): Promise<void> {
  const bundle = getService();
  if (!bundle) {
    throw new Error("Temporal service not available for phase9 status update");
  }
  const projectId = await getProjectId(input.store.paths.root);
  if (!projectId) {
    throw new Error("Could not resolve project ID for phase9 status update");
  }
  const handle = getChangeHandle(bundle.client, projectId, input.changeId);
  await fireSignalAndRefresh(
    handle,
    input.store,
    input.changeId,
    phase9StatusUpdatedSignal,
    {
      phase9_status: input.status,
      updatedAt: new Date().toISOString(),
    },
  );
}
export async function projectEpicTerminalSummaryAfterArchive(input: {
  store: Store;
  change: Change;
  completedAt: string;
}): Promise<
  | {
      status: "not_applicable";
    }
  | {
      status: "recorded";
      epicId: string;
      entryId: string;
    }
  | {
      status: "warning";
      epicId: string;
      entryId: string;
      error: string;
    }
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
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      `archive epic terminal projection: failed to update ${membership.epic_id}/${membership.entry_id} for ${input.change.id}: ${error}`,
    );
    return {
      status: "warning",
      epicId: membership.epic_id,
      entryId: membership.entry_id,
      error,
    };
  }
}
/**
 * Verify Phase 9 release evidence from the main checkout when the original
 * change worktree is already gone. Used only for existing-bundle retries; it
 * mirrors finalizeRelease's release proof without merging or pushing again.
 */
export function verifyReleaseEvidenceFromMain(input: {
  store: Store;
  changeId: string;
  archiveMode: "direct" | "pr";
  change?: Change;
  deps?: Pick<GitFinalizeDeps, "runGit" | "runGh">;
}): GitFinalizeOutcome {
  const mainCheckout = input.store.paths.root;
  const { branch: defaultBranch } = detectDefaultBranch(
    mainCheckout,
    input.deps,
  );
  const classifiedRoute = classifyFinalizationRoute(
    mainCheckout,
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
      mainCheckout,
      defaultBranch,
      changeId: input.changeId,
      route,
      prNumber: input.change?.phase9_status?.prNumber,
      // rq-fixPhase9SquashMergeRedetect SC1: thread persisted tip so
      // reachability detection survives branch deletion.
      changeTipSha: input.change?.phase9_status?.changeTipSha,
      // rq-fixPhase9PrDetection SC2: thread persisted repo so reachability
      // can resolve PR evidence even when the route object lacks it.
      repo: input.change?.phase9_status?.repo,
    },
    input.deps,
  );
  if (reachability.reachable) {
    return {
      status: "shipped",
      mainCheckout,
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
  if (reachability.proof === "origin_push_unverified") {
    return {
      status: "blocked",
      mainCheckout,
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
  }
  if (reachability.proof === "pr_unmerged") {
    return {
      status: "blocked",
      mainCheckout,
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
  }
  if (reachability.proof === "pr_missing_merge_proof") {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      route: route.route,
      pushStatus: "pushed",
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: false,
      blocked: {
        reason: "PR_MERGE_PROOF_MISSING",
        remediation: `Unable to verify a merged PR for change/${input.changeId}. If a PR exists, ensure it is merged and retry; if the branch was squash-merged and deleted, run adv_doctor to diagnose the wedged projection (rq-releaseFinalization01; status-flip recovery being internalized per design D4).`,
        details: reachability.details,
      },
    };
  }
  return {
    status: "blocked",
    mainCheckout,
    defaultBranch,
    route: route.route,
    pushStatus: "not_attempted",
    blocked: {
      reason:
        reachability.proof === "origin_unmerged"
          ? "CHANGE_BRANCH_NOT_REACHABLE_FROM_ORIGIN"
          : "CHANGE_BRANCH_NOT_REACHABLE",
      // rq-fixPhase9SquashMergeRedetect AC4: when reachability cannot be
      // established, surface adv_doctor as the recovery path
      // for changes whose branch was legitimately squash-merged and deleted
      // after shipping (gates-done + bundle-present invariant).
      remediation: `Change branch change/${input.changeId} must be reachable from ${route.route === "no_remote" ? defaultBranch : `origin/${defaultBranch}`} before release completion (rq-releaseFinalization01). If the branch was squash-merged and deleted after the change shipped, run adv_doctor to diagnose the wedged projection (status-flip recovery being internalized per design D4).`,
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
    };
/**
 * Repair only the release-gate disk projection after structural Phase 9
 * evidence exists but the change workflow has already completed. The caller
 * must pass completed-workflow evidence so disk-direct recovery remains
 * auditable instead of becoming an unguarded state bypass.
 */
export async function recoverReleaseGateViaDiskProjection(input: {
  store: Store;
  change: Change;
  evidence: string;
  recoveryEvidence: string;
}): Promise<
  Extract<
    ArchiveReleaseGateResult,
    {
      ok: true;
    }
  >
> {
  const { RECOVERY_RECONCILIATION_WARNING } =
    await import("../../temporal/recovery-classification");
  const { saveRecoveredGateCompletion } = await import("../_recovery-writers");
  const completion: GateCompletion = {
    status: "done",
    completed_at: new Date().toISOString(),
    completed_by: "adv-archive",
    approval_evidence: input.evidence,
  };
  const updated = await saveRecoveredGateCompletion({
    store: input.store,
    change: input.change,
    authorization: {
      reason: "completed_workflow_release_gate_recovery",
      evidence: `${input.recoveryEvidence}; ${input.evidence}`,
    },
    gateId: "release",
    completion,
  });
  return {
    ok: true,
    gate: updated.gates?.release ?? completion,
    alreadyDone: false,
    recoveryMutation: true,
    reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
  };
}
/**
 * Single source of truth for the completed-workflow recovery dance used by the
 * archive release-gate completion path (STRUCT-002). Classifies the error; on a
 * completed/poisoned workflow it recovers the release gate via disk projection,
 * otherwise it rethrows. Replaces three byte-identical inline catch blocks.
 */
export async function recoverReleaseGateIfWorkflowCompleted(
  error: unknown,
  ctx: {
    store: Store;
    change: Change;
    evidence: string;
  },
  options: { recoverOnUnresponsive?: boolean } = {},
): Promise<
  Extract<
    ArchiveReleaseGateResult,
    {
      ok: true;
    }
  >
> {
  if (isWorkflowCompletedError(error)) {
    return recoverReleaseGateViaDiskProjection({
      store: ctx.store,
      change: ctx.change,
      evidence: ctx.evidence,
      recoveryEvidence: collectErrorText(error),
    });
  }
  if (options.recoverOnUnresponsive && isUnresponsiveWorkflowError(error)) {
    return recoverReleaseGateViaDiskProjection({
      store: ctx.store,
      change: ctx.change,
      evidence: ctx.evidence,
      recoveryEvidence: collectErrorText(error),
    });
  }
  throw error;
}
export function releaseGateEvidenceMatches(
  gate: GateCompletion | undefined,
  evidence: string,
): boolean {
  const approvalEvidence = gate?.approval_evidence;
  const recoveryEvidence = gate?.recovery_audit?.evidence;
  return (
    (typeof approvalEvidence === "string" &&
      approvalEvidence.includes(evidence)) ||
    (typeof recoveryEvidence === "string" &&
      recoveryEvidence.includes(evidence))
  );
}

async function loadAuditedDiskReleaseGate(input: {
  store: Store;
  changeId: string;
  evidence: string;
  /**
   * True when the archive's fresh Phase 9 finalization is authoritatively
   * `shipped`. Derived structurally inside verifyReleaseGateDurableForArchive
   * from the finalization outcome status — never a caller-trusted flag on this
   * acceptance path (fixDurableProofFallback).
   */
  shipped?: boolean;
  /**
   * Archive bundle path for the split-brain retry path. When provided, the
   * disk proof is read from the bundle's own change.json instead of the active
   * changes directory, which may already have been removed or superseded.
   */
  bundlePath?: string;
}): Promise<GateCompletion | null> {
  const changesDir = input.bundlePath
    ? dirname(input.bundlePath)
    : input.store.paths.changes;
  const changeId = input.bundlePath
    ? basename(input.bundlePath)
    : input.changeId;
  const disk = await loadChange(changesDir, changeId);
  if (!disk.success || !disk.data?.gates) return null;
  const gate = disk.data.gates.release;
  // rq-releaseProjectionDurability01 resilience: when the store-backed gate
  // read is stale — a poisoned/missing workflow or a stale changeCache entry
  // (getTemporalChange reads changeCache first) returns a pre-completion
  // pending projection — a disk release gate that ADV genuinely completed
  // (status done) is still authoritative. Require `done`; accept without a
  // recovery audit only when the archive's fresh finalization is git-verified
  // `shipped` (finalization sets `shipped` exclusively on confirmed
  // default-branch reachability/merge, which cannot be forged without a real
  // merge). Recovery-audit remains required for non-shipped disk fallbacks,
  // preserving the strict guard.
  if (gate?.status !== "done") return null;
  if (!hasGateRecoveryAudit(gate) && !input.shipped) return null;
  // Shipped reconciliation: `shipped` is derived INSIDE the verifier from
  // finalization.status === "shipped" (confirmed default-branch reachability —
  // cannot be forged without a real merge). A done disk gate + git-verified
  // shipped is authoritative proof the change is released, covering both a
  // healthy manual completion (free-text notes, no recovery audit) whose store
  // projection lags behind a done disk gate, and a terminated-workflow disk
  // recovery. This does NOT weaken the un-shipped guard: unshipped changes have
  // input.shipped === false and fall through to the strict evidence-match
  // requirement below.
  if (input.shipped || releaseGateEvidenceMatches(gate, input.evidence)) {
    return gate;
  }
  return null;
}

/**
 * rq-releaseProjectionDurability01 split-brain writeback: after a live
 * gateCompletedSignal is confirmed via workflow query, durably project the
 * done release gate to the archive bundle's change.json (or the active change
 * projection when no bundle is provided) so the next
 * verifyReleaseGateDurableForArchive readback observes the mutation.
 *
 * This fixes the race where the workflow handler schedules an async projection
 * activity that has not landed by the time the archive tool polls "done", or
 * where the retry path is running against an existing bundle that has no active
 * projection at all.
 */
export async function commitArchiveReleaseGateProjection(input: {
  store: Store;
  changeId: string;
  gate: GateCompletion;
  evidence: string;
  bundlePath?: string;
}): Promise<void> {
  const changesDir = input.bundlePath
    ? dirname(input.bundlePath)
    : input.store.paths.changes;
  const changeId = input.bundlePath
    ? basename(input.bundlePath)
    : input.changeId;

  let stateRevision: number | undefined;
  const bundle = getService();
  if (bundle) {
    const projectId = await getProjectId(input.store.paths.root);
    if (projectId) {
      try {
        const state = await runReacquiringChangeQuery<ChangeWorkflowState>(
          projectId,
          input.changeId,
          changeStateQuery,
        );
        stateRevision = state.state_revision;
      } catch (error) {
        logger.warn(
          `commitArchiveReleaseGateProjection: state_revision query failed for ${input.changeId}; committing without state revision: ${collectErrorText(error)}`,
        );
      }
    }
  }

  const operationId = `live-release-gate-complete:${input.changeId}:${input.gate.completed_at ?? new Date().toISOString()}`;
  const result = await commitChangeProjection({
    changesDir,
    changeId,
    operationId,
    stateRevision,
    authority: { kind: "temporal", mutationReceiptId: operationId },
    mutationKind: "gate_completion",
    mutateLatest: (latest) => ({
      ...latest,
      gates: {
        ...(latest.gates ?? {}),
        release: input.gate,
      } as Gates,
    }),
    verify: ({ readback }) => readback.gates?.release?.status === "done",
  });

  if (result.kind !== "committed") {
    logger.warn(
      `commitArchiveReleaseGateProjection: projection commit did not land for ${input.changeId}: ${result.kind}`,
    );
  }
}

export async function verifyReleaseGateDurableForArchive(input: {
  store: Store;
  changeId: string;
  evidence: string;
  /**
   * The archive's fresh Phase 9 git-finalization outcome. `shipped` is derived
   * from `finalization.status === "shipped"` INSIDE this verifier
   * (fixDurableProofFallback structural-authority hardening — no caller-trusted
   * boolean). git-finalize returns `shipped` only on confirmed reachability/
   * merge (PR pr_merged, no_remote local merge, or direct merge+push), so it is
   * authoritative proof the change reached the default branch. When shipped, the
   * durable proof is accepted for a `done` release gate even if the stored gate
   * evidence does not substring-match the structured completion evidence — this
   * covers manually-completed gates (free-text approval notes) and admin/squash-
   * merge SHA supersession (store-backed path), and terminated-workflow disk
   * recovery bound to the release-gate recovery provenance (disk-fallback path).
   * The evidence-string path is preserved for archive-completed gates (backward
   * compatible). Non-`shipped` status preserves the strict evidence-match guard.
   */
  finalization?: GitFinalizeOutcome;
  /**
   * Archive bundle path for the split-brain retry path. When provided, disk
   * proof reads and recovery writes target the bundle's change.json so the
   * re-run reconciles the durable archive copy instead of a missing active
   * projection.
   */
  bundlePath?: string;
  /**
   * Structural hardening for the idempotent re-run path: do not synthesize a
   * release gate from the finalization alone. When true, the verifier only
   * accepts a gate that is already observed in the store or durable disk
   * projection. This prevents the shipped-rescue shortcut from masking a
   * terminated workflow that should be recovered via disk projection.
   */
  requireExistingGate?: boolean;
}): Promise<DurableReleaseGateProofResult> {
  // Structural authority (fixDurableProofFallback design-validation hardening):
  // `shipped` is derived INSIDE the verifier from the finalization outcome
  // status, replacing a caller-supplied boolean. git-finalize sets
  // status === "shipped" only on confirmed default-branch reachability/merge.
  const shipped = input.finalization?.status === "shipped";
  let gates: Gates | null;
  try {
    gates = await input.store.gates.get(input.changeId);
  } catch (error) {
    return {
      accepted: false,
      ok: false,
      error: `Store-backed release gate read failed: ${collectErrorText(error)}`,
    };
  }
  const releaseGate = gates?.release;

  // Normal store path (rq-releaseProjectionDurability01): if the store-backed
  // release gate is already done, reconcile evidence as before. This path is
  // unchanged; shipped only bypasses the evidence-match guard, not the source.
  if (releaseGate?.status === "done") {
    if (!releaseGateEvidenceMatches(releaseGate, input.evidence) && !shipped) {
      return {
        accepted: false,
        ok: false,
        error:
          "Store-backed durable release gate proof lacks matching Phase 9 evidence",
        releaseGateStatus: releaseGate.status,
        readinessBlockers: releaseGate.readiness_blockers,
        stuckReason: releaseGate.stuck_reason,
      };
    }
    return {
      accepted: true,
      ok: true,
      source: "store",
      finalizationStatus: input.finalization?.status ?? "unknown",
      releasedCommitSha: input.finalization?.releasedCommitSha,
      mergeCommitSha: input.finalization?.mergeCommitSha,
      pushStatus: input.finalization?.pushStatus,
      route: input.finalization?.route,
      gate: releaseGate,
    };
  }

  // Non-shipped / rescuable disk fallback: prefer a done disk gate when one
  // exists. This covers audited recovery projections and shipped manual
  // completions before the structural shipped rescue below synthesizes a gate.
  const diskReleaseGate = await loadAuditedDiskReleaseGate({
    ...input,
    shipped,
  });
  if (diskReleaseGate) {
    return {
      accepted: true,
      ok: true,
      source: "disk",
      finalizationStatus: input.finalization?.status ?? "unknown",
      gate: diskReleaseGate,
    };
  }

  // Shipped rescue (KD2/KD5): git-verified `shipped` is unforgeable proof the
  // change reached the default branch. Only synthesize a gate when neither the
  // store nor the durable disk projection already shows done, and require the
  // immutable released commit SHA and a valid route/push combination so the
  // proof remains structural. The idempotent re-run path disables this shortcut
  // so a terminated workflow cannot be papered over with a synthetic gate.
  if (!input.requireExistingGate && shipped && input.finalization) {
    const { route, pushStatus, releasedCommitSha } = input.finalization;
    const prRoute =
      route === "pr_auto_merge" ||
      route === "pr_manual" ||
      route === "merge_queue";
    const validRoutePushCombo =
      (route === "no_remote" && pushStatus === "skipped") ||
      ((route === "direct" || prRoute) && pushStatus === "pushed");
    if (releasedCommitSha && validRoutePushCombo) {
      return {
        accepted: true,
        ok: true,
        source: "shipped-finalization",
        finalizationStatus: input.finalization.status,
        releasedCommitSha,
        mergeCommitSha: input.finalization.mergeCommitSha,
        pushStatus,
        route,
        gate: {
          status: "done",
          completed_at: new Date().toISOString(),
          completed_by: "adv-archive",
          approval_evidence: input.evidence,
        },
      };
    }
  }
  return {
    accepted: false,
    ok: false,
    error:
      "Store-backed durable release gate proof did not observe release done",
    releaseGateStatus: releaseGate?.status,
    readinessBlockers: releaseGate?.readiness_blockers,
    stuckReason: releaseGate?.stuck_reason,
  };
}
/**
 * rq-reapOrphanAdvWorkers T3 (SC3/AC3): a gateCompletedSignal failure is
 * AMBIGUOUS when it is retryable saturation (retry axis: DEADLINE_EXCEEDED /
 * UNAVAILABLE / RESOURCE_EXHAUSTED / ABORTED) or a transport-channel drop
 * (reconnect axis) — the signal may have landed server-side before the client
 * observed the error. Completed-workflow errors are NOT ambiguous (they route
 * to disk-projection recovery); fatal errors propagate unchanged.
 */
async function isAmbiguousReleaseGateSignalFailure(
  error: unknown,
): Promise<boolean> {
  const { isWorkflowCompletedError } =
    await import("../../temporal/recovery-classification");
  if (isWorkflowCompletedError(error)) return false;
  return (
    classifyTemporalError(error) === "transient" || isReconnectableError(error)
  );
}
/**
 * rq-reapOrphanAdvWorkers T3 (SC3/AC3): reconcile exactly once after an
 * ambiguous gateCompletedSignal failure. A blind re-signal mints a new
 * non-deduped request and can duplicate the completion, so the ONLY retry is
 * this single bounded terminal-state read through the T2 reacquiring query.
 * Terminal (release done) → already-done success. Non-terminal → surface the
 * classified signal error; the operator's idempotent archive re-run reconciles
 * through the pre-signal terminal pre-check. No loop, no re-signal.
 *
 * The disk proof is not re-checked here: callers
 * (reconcileArchivedBundleRetry / adv_change_archive) run
 * verifyReleaseGateDurableForArchive immediately before this function, so a
 * durable disk-done gate short-circuits before any signal is fired.
 */
async function reconcileReleaseGateAfterAmbiguousSignal(input: {
  store: Store;
  change: Change;
  projectId: string;
  changeId: string;
  evidence: string;
  signalError: unknown;
}): Promise<ArchiveReleaseGateResult> {
  let reconciledGate: GateCompletion | undefined;
  try {
    reconciledGate = await runReacquiringChangeQuery<GateCompletion>(
      input.projectId,
      input.changeId,
      getGateStatusQuery,
      "release",
    );
  } catch (queryError) {
    // The single reconcile read raced a completed workflow — the ambiguous
    // signal may have landed and retired the workflow. Route through the same
    // disk-projection recovery as every other Temporal interaction here.
    const { isWorkflowCompletedError } =
      await import("../../temporal/recovery-classification");
    if (isWorkflowCompletedError(queryError)) {
      return recoverReleaseGateIfWorkflowCompleted(queryError, {
        store: input.store,
        change: input.change,
        evidence: input.evidence,
      });
    }
    return {
      ok: false,
      error:
        `Release gate signal outcome is ambiguous (${collectErrorText(input.signalError)}) ` +
        `and the bounded reconcile read failed: ${collectErrorText(queryError)}. ` +
        `No re-signal was attempted; re-run archive to reconcile.`,
    };
  }
  if (reconciledGate?.status === "done") {
    return { ok: true, gate: reconciledGate, alreadyDone: true };
  }
  return {
    ok: false,
    error:
      `Release gate signal failed transiently (${collectErrorText(input.signalError)}) ` +
      `and the bounded reconcile read observed non-terminal release gate status ` +
      `"${reconciledGate?.status ?? "unknown"}". No re-signal was attempted; ` +
      `re-run archive to reconcile.`,
    workflowGateStatus: reconciledGate?.status,
    readinessBlockers: reconciledGate?.readiness_blockers,
    stuckReason: reconciledGate?.stuck_reason,
  };
}

export type PersistConfirmedReleaseGateResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

async function writeActiveReleaseGateProjection(
  store: Store,
  changeId: string,
  baseChange: Change,
  gate: GateCompletion,
  operationId: string,
  payloadHash: string,
): Promise<PersistConfirmedReleaseGateResult> {
  const changesDir = store.paths.changes;
  const outcome = await commitChangeProjection({
    changesDir,
    changeId,
    operationId,
    payloadHash,
    authority: { kind: "temporal", mutationReceiptId: operationId },
    mutationKind: "poll_confirmed_release_gate_projection",
    mutateLatest: (latest) => ({
      ...latest,
      gates: {
        ...(latest.gates ?? {}),
        release: gate,
      } as Gates,
    }),
    verify: ({ readback }) => {
      const actual = readback.gates?.release;
      if (!actual) return false;
      return (
        actual.status === "done" &&
        actual.completed_at === gate.completed_at &&
        actual.completed_by === gate.completed_by &&
        actual.approval_evidence === gate.approval_evidence
      );
    },
  });

  if (outcome.kind === "committed") {
    return { ok: true };
  }

  const isMissing =
    outcome.kind === "operator_required" &&
    (outcome.reason?.includes("change not found") ?? false);
  if (!isMissing) {
    const retryable =
      outcome.kind === "stale_revision" ||
      outcome.kind === "lock_timeout" ||
      outcome.kind === "write_error";
    return {
      ok: false,
      error: `Active release-gate projection commit failed: ${outcome.kind}${outcome.kind === "operator_required" ? `: ${outcome.reason}` : ""}`,
      retryable,
    };
  }

  const toWrite = {
    ...baseChange,
    gates: {
      ...(baseChange.gates ?? {}),
      release: gate,
    } as Gates,
  };
  try {
    await saveChange(changesDir, toWrite);
  } catch (error) {
    return {
      ok: false,
      error: `Active release-gate projection create failed: ${collectErrorText(error)}`,
      retryable: true,
    };
  }

  const readback = await loadChange(changesDir, changeId);
  if (!readback.success || !readback.data) {
    return {
      ok: false,
      error: "Active release-gate projection readback failed after create",
      retryable: true,
    };
  }
  const actual = readback.data.gates?.release;
  if (
    !actual ||
    actual.status !== "done" ||
    actual.completed_at !== gate.completed_at ||
    actual.completed_by !== gate.completed_by ||
    actual.approval_evidence !== gate.approval_evidence
  ) {
    return {
      ok: false,
      error:
        "Active release-gate projection gate did not match confirmed readback",
      retryable: true,
    };
  }
  return { ok: true };
}

async function writeArchiveBundleReleaseGate(
  store: Store,
  changeId: string,
  baseChange: Change,
  gate: GateCompletion,
  existingBundlePath?: string | null,
): Promise<PersistConfirmedReleaseGateResult> {
  const archiveDir = store.paths.archive;
  if (!archiveDir) {
    return { ok: true };
  }
  const bundleDir =
    existingBundlePath ?? (await findArchiveBundle(archiveDir, changeId));
  if (!bundleDir) {
    return { ok: true };
  }

  return withArchiveProjectionLock(store.paths.root, async () => {
    const loaded = await loadChange(archiveDir, basename(bundleDir));
    let latest: Change;
    if (loaded.success && loaded.data && loaded.data.id === changeId) {
      latest = loaded.data;
    } else {
      latest = baseChange;
    }
    const updated = {
      ...latest,
      gates: {
        ...(latest.gates ?? {}),
        release: gate,
      } as Gates,
    };
    const manifestPath = join(bundleDir, "change.json");
    try {
      await atomicWriteFile(manifestPath, bundleJsonStringify(updated));
    } catch (error) {
      return {
        ok: false,
        error: `Archive bundle release-gate write failed: ${collectErrorText(error)}`,
        retryable: true,
      };
    }
    const raw = await readFile(manifestPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: `Archive bundle release-gate readback is not valid JSON: ${collectErrorText(error)}`,
        retryable: true,
      };
    }
    const actual = (parsed as { gates?: { release?: GateCompletion } }).gates
      ?.release;
    if (
      !actual ||
      actual.status !== "done" ||
      actual.completed_at !== gate.completed_at ||
      actual.completed_by !== gate.completed_by ||
      actual.approval_evidence !== gate.approval_evidence
    ) {
      return {
        ok: false,
        error:
          "Archive bundle release-gate readback did not match confirmed gate",
        retryable: true,
      };
    }
    return { ok: true };
  });
}

/**
 * Dual-surface poll-confirmed release-gate projection writer.
 *
 * After a live workflow poll confirms `release: done`, persist that exact
 * completion into the durable projection(s) so the subsequent
 * `store.gates.get()` proof succeeds without a second workflow query.
 *
 * - Writes the active change projection first (creating it if it was retired).
 * - Writes the archive bundle projection when one exists.
 * - Invalidates the in-memory cache only after both durable writes are verified.
 * - Returns a retryable failure; callers MUST NOT run the second durable proof
 *   or cleanup when this fails.
 */
export async function persistConfirmedReleaseGateReadback(input: {
  store: Store;
  change: Change;
  changeId: string;
  gate: GateCompletion;
  evidence?: string;
  existingBundlePath?: string | null;
}): Promise<PersistConfirmedReleaseGateResult> {
  if (input.gate.status !== "done") {
    return {
      ok: false,
      error: "Refusing to persist a non-done release gate",
      retryable: false,
    };
  }

  // Preserve the exact polled completion, falling back to the Phase 9
  // evidence only when the signal readback omitted the approval_evidence
  // field (defensive: real workflow handlers include it).
  const gate: GateCompletion = {
    ...input.gate,
    approval_evidence: input.gate.approval_evidence ?? input.evidence,
  };

  if (!gate.completed_at || !gate.completed_by || !gate.approval_evidence) {
    return {
      ok: false,
      error: "Confirmed release gate is missing required proof fields",
      retryable: false,
    };
  }

  const operationId = `poll-confirmed-release-gate:${input.changeId}:${gate.completed_at}`;
  const payloadHash = sha256HexString(JSON.stringify(gate));

  const active = await writeActiveReleaseGateProjection(
    input.store,
    input.changeId,
    input.change,
    gate,
    operationId,
    payloadHash,
  );
  if (!active.ok) {
    return active;
  }

  const bundle = await writeArchiveBundleReleaseGate(
    input.store,
    input.changeId,
    input.change,
    gate,
    input.existingBundlePath,
  );
  if (!bundle.ok) {
    return bundle;
  }

  await input.store.changes.invalidate(input.changeId);
  return { ok: true };
}

/**
 * Record the release gate after Phase 9 returns shipped evidence and
 * before archive status retires the workflow. Each Temporal interaction can
 * race a completed workflow, so query, signal, and confirmation poll all route
 * completed-workflow failures through disk-projection recovery. An ambiguous
 * transient signal failure reconciles once via a bounded terminal-state read
 * instead of blindly re-firing the signal (rq-reapOrphanAdvWorkers T3).
 */
export async function completeReleaseGateAfterFinalization(input: {
  store: Store;
  change: Change;
  changeId: string;
  finalization: GitFinalizeOutcome;
  existingBundlePath?: string;
}): Promise<ArchiveReleaseGateResult> {
  if (input.finalization.status !== "shipped") {
    return {
      ok: false,
      error: `Release gate requires successful Phase 9 finalization, got ${input.finalization.status}`,
    };
  }
  const bundle = getService();
  if (!bundle) {
    return {
      ok: false,
      error: "Temporal service not available for release gate completion",
    };
  }
  const projectId = await getProjectId(input.store.paths.root);
  if (!projectId) {
    return {
      ok: false,
      error: "Could not resolve project ID for release gate completion",
    };
  }
  const evidence = buildReleaseCompletionEvidence(input.finalization);
  let currentGate: GateCompletion | undefined;
  try {
    const description = await describeChangeHandleWithDeadline(
      bundle,
      projectId,
      input.changeId,
    );
    if (isTerminalWorkflowStatus(description)) {
      return recoverReleaseGateViaDiskProjection({
        store: input.store,
        change: input.change,
        evidence,
        recoveryEvidence: `workflow describe returned terminal status ${
          (description as { status: { name: string } }).status.name
        }`,
      });
    }

    currentGate = await runBoundedReacquiringChangeQuery<GateCompletion>(
      bundle,
      projectId,
      input.changeId,
      getGateStatusQuery,
      "release",
    );
  } catch (error) {
    return recoverReleaseGateIfWorkflowCompleted(
      error,
      {
        store: input.store,
        change: input.change,
        evidence,
      },
      { recoverOnUnresponsive: true },
    );
  }
  if (currentGate?.status === "done") {
    // #305 residual: the gate is already done on the first query (a prior
    // signal landed, or a retry finds done immediately). Drop the poisoned
    // cache entry so the immediately-following second
    // verifyReleaseGateDurableForArchive store.gates.get queries fresh
    // instead of reading a stale pending left by a racing refresh. Mirrors
    // the postSignal invalidate below (line ~1211).
    await input.store.changes.invalidate(input.changeId);
    return { ok: true, gate: currentGate, alreadyDone: true };
  }
  // rq-reapOrphanAdvWorkers T3 (SC3/AC3): fire gateCompletedSignal in a SINGLE
  // attempt. The shared fireSignal retry wrapper would blindly re-signal on an
  // ambiguous transient failure (the signal may have landed server-side),
  // minting duplicate non-deduped completion requests. Retry happens ONLY via
  // the bounded reconcile read in the catch — never via re-fire. The handle is
  // built here, after the pre-signal query, so a mid-query reconnect
  // (reinitStsl swaps bundle.client in place) cannot pin a closed client (T2).
  const signalHandle = getChangeHandle(
    bundle.client,
    projectId,
    input.changeId,
  );
  try {
    await signalHandle.signal(gateCompletedSignal, {
      gateId: "release",
      completedBy: "adv-archive",
      completedAt: new Date().toISOString(),
      approvalEvidence: evidence,
    });
    // fixPhase9StatusSignal: refresh is intentionally deferred until AFTER
    // waitForArchiveReleaseGateCompletion observes done. Calling refresh
    // here (immediately after the signal fire) races with the workflow's
    // signal-processing loop — the refresh's single changeStateQuery may
    // return pre-signal state, get classified "confirmed", and cache +
    // disk-write stale "pending" state that verifyReleaseGateDurableForArchive
    // then reads. The poll below is the authoritative post-signal check;
    // refresh runs once the workflow has confirmed done.
  } catch (error) {
    if (await isAmbiguousReleaseGateSignalFailure(error)) {
      return reconcileReleaseGateAfterAmbiguousSignal({
        store: input.store,
        change: input.change,
        projectId,
        changeId: input.changeId,
        evidence,
        signalError: error,
      });
    }
    return recoverReleaseGateIfWorkflowCompleted(error, {
      store: input.store,
      change: input.change,
      evidence,
    });
  }
  let postSignalGate: GateCompletion | undefined;
  try {
    postSignalGate = await waitForArchiveReleaseGateCompletion(
      projectId,
      input.changeId,
    );
  } catch (error) {
    return recoverReleaseGateIfWorkflowCompleted(error, {
      store: input.store,
      change: input.change,
      evidence,
    });
  }
  if (postSignalGate?.status === "done") {
    // Persist the poll-confirmed release gate into the durable projection
    // before the second store.gates.get proof. The writer invalidates the
    // cache only after the durable readback succeeds; a failure here is
    // retryable and must not proceed to cleanup.
    const persistResult = await persistConfirmedReleaseGateReadback({
      store: input.store,
      change: input.change,
      changeId: input.changeId,
      gate: postSignalGate,
      evidence,
      existingBundlePath: input.existingBundlePath,
    });
    if (!persistResult.ok) {
      return {
        ok: false,
        error: persistResult.error,
        workflowGateStatus: postSignalGate?.status,
        readinessBlockers: postSignalGate?.readiness_blockers,
        stuckReason: postSignalGate?.stuck_reason,
      };
    }
    return { ok: true, gate: postSignalGate, alreadyDone: false };
  }
  return {
    ok: false,
    error: "Cannot confirm release gate completion from workflow state",
    workflowGateStatus: postSignalGate?.status,
    readinessBlockers: postSignalGate?.readiness_blockers,
    stuckReason: postSignalGate?.stuck_reason,
  };
}
