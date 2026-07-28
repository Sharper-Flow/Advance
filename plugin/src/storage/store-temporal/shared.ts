import type { Connection } from "@temporalio/client";
import {
  normalizePersistedSubagentReportState,
  type Change,
} from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import { buildChangeWorkflowId } from "../../temporal/client";
import {
  classifyTemporalError,
  collectErrorText,
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  type TemporalErrorClass,
  type TemporalReadDeadline,
  withTemporalRetry,
} from "../../temporal/retry-wrapper";
import {
  recoveryReasonFromError,
  type ProjectionRecoveryReason,
  type RecoveryReason,
} from "../../temporal/recovery-classification";
import { reinitStsl } from "../../temporal/service";
import { createLogger } from "../../utils/debug-log";
import type { ChangeSummaryMemo, ChangeSummary } from "../store-temporal-memo";
import type { Store } from "../store-types";
import type { TemporalClientBundle } from "../../temporal/client";
import {
  classifyMutationOutcome,
  requireMutationEligible,
  type TemporalMutationOutcome,
} from "../../temporal/mutation-safety";
import { isSchemaError } from "../change-projection-reader";
import type { DiskPersistOutcome } from "./disk-persist";
import { DiskProjectionPersistError } from "./disk-persist";
import type {
  ChangeSummaryShard,
  ChangeSummaryPointer,
} from "../change-summary-shard-reader";
import { commitChangeProjectionWithSummary } from "../change-summary-shard";
import {
  changeStateQuery,
  getOperationLedgerOutcomeQuery,
} from "../../temporal/messages";
import { waitForQueryPredicate } from "../../utils/query-predicate";
import type { OperationLedgerEntry } from "../../temporal/contracts";
import { getToolOperationContext } from "../../utils/tool-operation-context";
import { randomUUID } from "node:crypto";

const logger = createLogger("store-temporal-shared");

const ownerGuardCache = new WeakMap<
  TemporalStoreBackendInput,
  Map<string, string>
>();

function getOwnerGuardCache(
  input: TemporalStoreBackendInput,
): Map<string, string> {
  let cache = ownerGuardCache.get(input);
  if (!cache) {
    cache = new Map<string, string>();
    ownerGuardCache.set(input, cache);
  }
  return cache;
}

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  describe?: () => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
  signal: (definition: unknown, ...args: unknown[]) => Promise<void>;
}

export interface TemporalHandleClient {
  workflow: {
    getHandle: (workflowId: string) => WorkflowHandleLike;
    start?: (...args: unknown[]) => Promise<WorkflowHandleLike>;
  };
}

export interface TemporalStoreBackendInput {
  legacy: Store;
  temporal: { client: TemporalHandleClient } | TemporalClientBundle;
  projectId: string;
}

export function mapTemporalChangeStateToChange(
  state: ChangeWorkflowState,
): Change {
  const [normalizedState] = normalizePersistedSubagentReportState(state);
  const safeState = normalizedState as ChangeWorkflowState;

  return {
    id: safeState.changeId,
    title: safeState.title,
    status: safeState.status,
    lifecycleState: safeState.lifecycleState,
    created_at: safeState.createdAt,
    tasks: safeState.tasks,
    subagent_reports: safeState.subagent_reports,
    test_runs: safeState.testRuns,
    deltas: safeState.deltas,
    wisdom: safeState.wisdom,
    gates: safeState.gates,
    reentry_history: safeState.reentry_history,
    fast_follow_of: safeState.fast_follow_of,
    cross_project_origin: safeState.cross_project_origin,
    origin: safeState.origin,
    contract: safeState.contract,
    acceptanceCriteria: safeState.acceptanceCriteria,
    documents: safeState.documents,
    artifacts: safeState.artifacts,
    phase9_status: safeState.phase9_status,
    lastSignalAt: safeState.lastSignalAt,
    adv_project_id: safeState.projectId,
    cross_project_links: safeState.cross_project_links,
    external_dependencies: safeState.external_dependencies,
    same_project_dependencies: safeState.same_project_dependencies ?? [],
    ops_followup: safeState.ops_followup,
    ops_followup_links: safeState.ops_followup_links,
    epic_membership: safeState.epic_membership,
    lightweight_profile: safeState.lightweight_profile,
    release_notes: safeState.release_notes,
  };
}

/**
 * Fields whose values are owned by a healthy ChangeWorkflow. Disk-only
 * recovery metadata deliberately remains outside this list: a Temporal
 * dual-write must apply its authoritative state to the latest projection,
 * rather than replace concurrent recovery repairs with a captured snapshot.
 */
const TEMPORAL_OWNED_PROJECTION_FIELDS = [
  "id",
  "title",
  "status",
  "lifecycleState",
  "created_at",
  "tasks",
  "subagent_reports",
  "test_runs",
  "deltas",
  "wisdom",
  "gates",
  "reentry_history",
  "fast_follow_of",
  "cross_project_origin",
  "origin",
  "contract",
  "acceptanceCriteria",
  "documents",
  "artifacts",
  "phase9_status",
  "lastSignalAt",
  "adv_project_id",
  "cross_project_links",
  "external_dependencies",
  "same_project_dependencies",
  "ops_followup",
  "ops_followup_links",
  "epic_membership",
  "lightweight_profile",
  "release_notes",
] as const satisfies readonly (keyof Change)[];

/**
 * Apply a Temporal state to the projection freshly read by the transaction.
 * Projection revision/audit data and recovery-only fields stay on `latest`;
 * the transaction owns revision/audit updates after this merge.
 */
export function projectTemporalStateOntoLatest(
  latest: Change,
  state: ChangeWorkflowState,
): Change {
  const mapped = mapTemporalChangeStateToChange(state);
  const temporalOwned = Object.fromEntries(
    TEMPORAL_OWNED_PROJECTION_FIELDS.map((field) => [field, mapped[field]]),
  ) as Pick<Change, (typeof TEMPORAL_OWNED_PROJECTION_FIELDS)[number]>;

  return { ...latest, ...temporalOwned };
}

export function getChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): WorkflowHandleLike {
  const workflowId = buildChangeWorkflowId(input.projectId, changeId);
  const bundle = input.temporal as { client: TemporalHandleClient };
  return bundle.client.workflow.getHandle(workflowId);
}

/**
 * SC4 wiring: fire a signal on a change workflow handle ONLY when the
 * supplied workflow diagnostic permits mutation. When the caller has a
 * recent failed-read diagnostic (recovery routing), this guard refuses
 * the signal so a mutation-ineligible workflow cannot be signaled. When
 * no diagnostic is supplied, the helper behaves like a normal signal —
 * the SC4 contract scopes the guard to recovery routing.
 */
export async function signalChangeWorkflowGuarded(
  input: TemporalStoreBackendInput,
  changeId: string,
  signal: unknown,
  args: unknown[],
  eligibility?: import("../../temporal/mutation-safety").TemporalWorkflowDiagnostic,
): Promise<void> {
  if (eligibility) {
    requireMutationEligible(eligibility);
  }
  await runTemporal(async () =>
    (await getGuardedChangeHandle(input, changeId)).signal(signal, ...args),
  );
}

/**
 * SC6 wiring: classify the outcome of a post-signal readback query so the
 * caller can distinguish a confirmed mutation from a confirmed-ambiguous
 * one. `outcome_unknown_readback_unavailable` is the outcome the contract
 * requires for any readback failure; callers MUST NOT outer-retry on it.
 *
 * Optional `signalError` carries any error thrown BEFORE the server
 * acknowledged the signal — when present, the outcome short-circuits to
 * `failed_before_ack`.
 */
export interface StoragePostSignalReadbackResult<T> {
  outcome: import("../../temporal/mutation-safety").TemporalMutationOutcome;
  data?: T;
  error?: unknown;
}

export async function queryChangeWorkflowReadback<T>(
  readback: () => Promise<T>,
  signalError?: unknown,
): Promise<StoragePostSignalReadbackResult<T>> {
  if (signalError !== undefined && signalError !== null) {
    return {
      outcome: classifyMutationOutcome({ signalError }),
      error: signalError,
    };
  }
  try {
    const data = await readback();
    return { outcome: classifyMutationOutcome({}), data };
  } catch (error) {
    return {
      outcome: classifyMutationOutcome({ readbackError: error }),
      error,
    };
  }
}

/**
 * Extract the underlying Temporal Connection from the store input when one
 * is present. Production bundles expose it; test fixtures and target-path
 * snapshots may omit it and fall back to the Promise.race-based wrapper.
 */
export function getTemporalConnection(
  input: TemporalStoreBackendInput,
): Connection | undefined {
  const bundle = input.temporal as { connection?: Connection };
  return bundle.connection;
}

/**
 * Typed error thrown when a change-scoped operation targets a change
 * owned by a different project than the current store binding.
 */
export class AdvProjectContextMismatchError extends Error {
  readonly name = "AdvProjectContextMismatch";
  constructor(
    readonly changeId: string,
    readonly owningProjectId: string,
    readonly currentProjectId: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Shared guard: before returning a Temporal workflow handle for a change,
 * verify the change's owner (via legacy disk snapshot) matches the
 * current store's project binding. Ownerless legacy changes are
 * best-effort compatible — the guard passes through silently.
 */
export async function getGuardedChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): Promise<WorkflowHandleLike> {
  const cachedOwner = ownerGuardCache.get(input)?.get(changeId);
  if (cachedOwner === input.projectId) {
    return getChangeHandle(input, changeId);
  }

  let legacyResult: Awaited<ReturnType<typeof input.legacy.changes.get>>;
  try {
    legacyResult = await input.legacy.changes.get(changeId);
  } catch (err) {
    // Best-effort: legacy disk read failure (transient I/O, missing
    // file, permissions) MUST NOT cascade as a guard rejection. Pass
    // through to Temporal — the underlying error will surface from
    // the actual workflow call if it's persistent.
    logger.debug(
      `Owner guard skipped for change ${changeId}: legacy read failed (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
    return getChangeHandle(input, changeId);
  }
  if (isSchemaError(legacyResult)) {
    throw new Error(legacyResult.error);
  }
  if (legacyResult.success && legacyResult.data?.adv_project_id) {
    const owningProjectId = legacyResult.data.adv_project_id;
    if (owningProjectId !== input.projectId) {
      throw new AdvProjectContextMismatchError(
        changeId,
        owningProjectId,
        input.projectId,
        `Change '${changeId}' is owned by project '${owningProjectId}' (current: '${input.projectId}'). ` +
          `Open the change in its owning project's context, or verify the linked-project configuration.`,
      );
    }
    getOwnerGuardCache(input).set(changeId, owningProjectId);
  }
  return getChangeHandle(input, changeId);
}

/**
 * Build an idempotent `onTransientFailure` hook that calls `reinitStsl`
 * at most once per outer op (KD-2, KD-4). `withTemporalRetry` fires its
 * hook on every transient failure — without per-op idempotency, a
 * 3-attempt failure cycle would close + reopen the connection twice,
 * closing the freshly-opened socket from the first reconnect. The
 * `reconnected` flag is local to this closure so two parallel ops each
 * get their own gate; STSL's own single-flight guard collapses
 * concurrent triggers into one Connection.connect.
 *
 * Reconnect failure is non-fatal — the original op error propagates
 * after the retry budget. `reinitStsl` already records the failure in
 * `StslStats.reconnectFailureCount`, so swallowing here keeps the
 * retry loop intact without losing observability.
 */
export function makeReconnectingHook(): () => Promise<void> {
  let reconnected = false;
  return async () => {
    if (reconnected) return;
    reconnected = true;
    try {
      await reinitStsl();
    } catch (err) {
      logger.debug(
        `STSL reinit failed during retry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}

export interface RunTemporalOptions {
  /** Per-operation type label for telemetry aggregation (KD-3). */
  opType?: string;
  /** Per-attempt timeout in milliseconds. Omit for long-running ops. */
  timeoutMs?: number;
  /**
   * Request-scoped aggregate deadline (KD1). Attempt timeouts and
   * retry/backoff admission are capped to its remaining budget.
   * Read-only paths only — mutation callers omit this.
   */
  deadline?: TemporalReadDeadline;
}

export async function runTemporal<T>(
  op: () => Promise<T>,
  options?: RunTemporalOptions,
): Promise<T> {
  return withTemporalRetry(op, {
    opType: options?.opType,
    timeoutMs: options?.timeoutMs,
    deadline: options?.deadline,
    onTransientFailure: makeReconnectingHook(),
  });
}

/**
 * Per-attempt timeout cap for `handle.query(...)` calls. Without this,
 * a dead worker causes the query to hang indefinitely and all tool
 * calls through that path stall with it.
 *
 * Applied ONLY to query callsites — `executeUpdate`, `workflow.start`,
 * and `getHandle` keep the unbounded `runTemporal` so long-running
 * legitimate operations don't get interrupted. See design.md § KD-2,
 * P1.3.8.
 *
 * Configurable via `ADV_TEMPORAL_QUERY_TIMEOUT_MS` (finite-positive
 * milliseconds). Default raised to 15s to tolerate the SQLite-backed
 * Temporal dev server's variable history-replay latency under
 * multi-worker load, where a long-history workflow's query can
 * legitimately exceed the previous 5s cap. Production / CI may pin
 * tighter via the env override. Invalid (non-finite, non-positive,
 * non-numeric) values fall back to the default.
 */
export function resolveQueryTimeoutMs(): number {
  const v = Number(process.env.ADV_TEMPORAL_QUERY_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 15_000;
}
export const QUERY_TIMEOUT_MS = resolveQueryTimeoutMs();

export interface RunTemporalQueryOptions {
  /**
   * Request-scoped aggregate deadline. The effective per-attempt
   * timeout becomes `min(timeoutMs, remaining budget)` and no
   * retry/backoff begins after expiry.
   */
  deadline?: TemporalReadDeadline;
  /**
   * Per-attempt timeout cap. Defaults to `QUERY_TIMEOUT_MS` (15s,
   * overridable via `ADV_TEMPORAL_QUERY_TIMEOUT_MS`); read paths
   * override this to a lower per-member cap so a single wedged
   * workflow cannot consume the aggregate budget.
   */
  timeoutMs?: number;
}

/**
 * Thin alias for query calls. Preserves backward compat with existing
 * shard callers. `runTemporal` is the single implementation entry point.
 */
export async function runTemporalQuery<T>(
  op: () => Promise<T>,
  options?: RunTemporalQueryOptions,
): Promise<T> {
  return runTemporal(op, {
    timeoutMs: options?.timeoutMs ?? QUERY_TIMEOUT_MS,
    deadline: options?.deadline,
  });
}

export {
  createTemporalReadContext,
  runTemporalRead,
  abortTemporalRead,
  isTemporalReadExpired,
  type TemporalReadContext,
  type TemporalReadMetadata,
  type TemporalReadResult,
  type RunTemporalReadOptions,
} from "./read-context";

export type ChangeCommandOutcome =
  | { kind: "accepted"; state: ChangeWorkflowState }
  | { kind: "idempotent_replay"; state: ChangeWorkflowState }
  | { kind: "rejected"; reason: string }
  | { kind: "projection_failure"; reason: string }
  | { kind: "operator_required"; reason: string }
  | { kind: "outcome_unknown_readback_unavailable"; reason: string };

export type CommandProjectionCommitOutcome =
  | {
      kind: "committed";
      snapshotRevision?: number;
      shard?: ChangeSummaryShard;
      pointer?: ChangeSummaryPointer;
    }
  | {
      kind: "idempotent";
      snapshotRevision?: number;
      shard?: ChangeSummaryShard;
      pointer?: ChangeSummaryPointer;
    }
  | { kind: "conflict"; reason: string }
  | { kind: "error"; reason: string }
  | { kind: "operator_required"; reason: string };

export function buildSummaryCommitProjection(
  legacy: Store,
  changeId: string,
  operationId: string,
  payloadHash: string,
  mutationKind: string,
): (
  state: ChangeWorkflowState,
  stateRevision: number,
) => Promise<CommandProjectionCommitOutcome> {
  return async (state, stateRevision) => {
    const summary = await commitChangeProjectionWithSummary({
      paths: {
        changesDir: legacy.paths.changes,
        summariesDir: legacy.paths.summariesDir,
      },
      changeId,
      operationId,
      payloadHash,
      stateRevision,
      authority: { kind: "temporal", mutationReceiptId: operationId },
      mutationKind,
      mutateLatest: (latest) => projectTemporalStateOntoLatest(latest, state),
      verify: ({ readback }) => (readback.state_revision ?? 0) >= stateRevision,
    });
    switch (summary.kind) {
      case "committed":
      case "idempotent":
        return {
          kind: summary.kind,
          snapshotRevision: summary.snapshotRevision,
          shard: summary.shard,
          pointer: summary.pointer,
        };
      case "conflict":
        return {
          kind: "conflict",
          reason: summary.error ?? "summary conflict",
        };
      case "error":
        return {
          kind: "error",
          reason: summary.error ?? "summary error",
        };
      default:
        return { kind: "error", reason: "unknown summary outcome" };
    }
  };
}

export interface ChangeCommandOptions {
  deps: StoreDeps;
  changeId: string;
  operationId: string;
  commandKind: string;
  payloadHash: string;
  signal: unknown;
  signalArgs: unknown[];
  /**
   * Caller-provided projection commit. Must be built from the same operationId
   * and payloadHash so the projection audit trail matches the command proof.
   * The `stateRevision` is the authoritative workflow revision recorded in the
   * accepted ledger entry; the projection must acknowledge it.
   */
  commitProjection: (
    state: ChangeWorkflowState,
    stateRevision: number,
  ) => Promise<CommandProjectionCommitOutcome>;
  /**
   * Optional hook invoked after the primary signal is acknowledged but before
   * the ledger outcome is polled. Used for deterministic companion signals
   * (e.g., artifact metadata) that must be processed before the command's
   * projection commit.
   */
  postSignal?: (handle: WorkflowHandleLike) => Promise<void>;
  /**
   * Optional SC4 eligibility diagnostic. When supplied, the command is
   * refused against a mutation-ineligible workflow before any signal fires.
   */
  eligibility?: import("../../temporal/mutation-safety").TemporalWorkflowDiagnostic;
}

/**
 * Stable command identity fallback for adapters that do not receive a
 * caller-supplied operation id. It is explicit, deterministic, and derived from
 * the command payload so retries hash to the same id — but it is NOT
 * authoritative; callers should supply their own operation id whenever the
 * command semantics matter.
 */
export function fallbackOperationId(
  commandKind: string,
  payload: unknown,
): string {
  const toolContext = getToolOperationContext();
  if (toolContext) {
    // The tool boundary already binds this invocation to session/message/name
    // and normalized args. A command-kind child survives regenerated adapter
    // timestamps and remains stable across the host retry of this invocation.
    return `${toolContext.baseOperationId}:${commandKind}`;
  }
  // Direct/internal callers have no host invocation identity. Deliberately do
  // not dedupe by payload: append commands with identical content are distinct
  // unless the caller supplies its own authoritative operationId.
  void payload;
  return `legacy:${commandKind}:${randomUUID()}`;
}

/**
 * Typed ChangeWorkflow command primitive: signal, poll the operation ledger for
 * an accepted/idempotent/rejected outcome, read the confirmed state, and commit
 * the disk projection atomically. The result is derived from confirmed state
 * rather than a second unverified read.
 *
 * This is the canonical adapter path for task/gate/wisdom/delta/epic/close
 * commands; content updates use the same ledger-aware workflow reducers but may
 * batch multiple content signals in one adapter call.
 */
export async function changeCommand(
  options: ChangeCommandOptions,
): Promise<ChangeCommandOutcome> {
  const {
    deps,
    changeId,
    operationId,
    commandKind,
    payloadHash,
    signal,
    signalArgs,
    commitProjection,
    postSignal,
    eligibility,
  } = options;
  const handle = await getGuardedChangeHandle(deps.input, changeId);
  try {
    if (eligibility) {
      requireMutationEligible(eligibility);
    }
    await runTemporal(async () => {
      await handle.signal(signal, ...signalArgs);
      if (postSignal) {
        await postSignal(handle);
      }
    });
  } catch (err) {
    const outcome = classifyMutationOutcome({ signalError: err });
    if (outcome === "outcome_unknown_readback_unavailable") {
      return {
        kind: "outcome_unknown_readback_unavailable",
        reason: `${commandKind} signal failed and readback is unavailable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return {
      kind: "operator_required",
      reason: `${commandKind} signal rejected: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let ledger: OperationLedgerEntry | undefined;
  try {
    ledger = await waitForQueryPredicate(
      () =>
        handle.query(getOperationLedgerOutcomeQuery, operationId) as Promise<
          OperationLedgerEntry | undefined
        >,
      (entry) =>
        entry?.outcome === "accepted" ||
        entry?.outcome === "idempotent_replay" ||
        entry?.outcome === "rejected",
      { attempts: 30, delayMs: 200 },
    );
  } catch (err) {
    return {
      kind: "outcome_unknown_readback_unavailable",
      reason: `${commandKind} operation ${operationId} ledger query failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!ledger) {
    return {
      kind: "outcome_unknown_readback_unavailable",
      reason: `${commandKind} operation ${operationId} was not confirmed via the operation ledger`,
    };
  }
  if (ledger.outcome === "rejected") {
    return {
      kind: "rejected",
      reason: `${commandKind} operation ${operationId} was rejected by the workflow`,
    };
  }
  if (ledger.command_kind !== commandKind) {
    return {
      kind: "rejected",
      reason: `${commandKind} operation ${operationId} ledger mismatch: command_kind ${ledger.command_kind}`,
    };
  }
  if (ledger.payload_hash !== payloadHash) {
    return {
      kind: "rejected",
      reason: `${commandKind} operation ${operationId} ledger mismatch: payload_hash`,
    };
  }

  let state: ChangeWorkflowState;
  try {
    state = (await runTemporal(async () =>
      handle.query(changeStateQuery),
    )) as ChangeWorkflowState;
  } catch (err) {
    return {
      kind: "outcome_unknown_readback_unavailable",
      reason: `${commandKind} state readback failed after confirmed operation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if ((state.state_revision ?? 0) < ledger.state_revision) {
    return {
      kind: "projection_failure",
      reason: `${commandKind} operation ${operationId} readback state_revision ${state.state_revision} is behind ledger state_revision ${ledger.state_revision}`,
    };
  }

  let commit: CommandProjectionCommitOutcome;
  try {
    commit = await commitProjection(state, ledger.state_revision);
  } catch (err) {
    if (err instanceof DiskProjectionPersistError) {
      throw err;
    }
    return {
      kind: "projection_failure",
      reason: `${commandKind} projection commit threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (commit.kind === "committed" || commit.kind === "idempotent") {
    deps.setCachedChange(state);
    return {
      kind:
        ledger.outcome === "idempotent_replay"
          ? "idempotent_replay"
          : "accepted",
      state,
    };
  }
  if (commit.kind === "operator_required") {
    return { kind: "operator_required", reason: commit.reason };
  }
  return {
    kind: "projection_failure",
    reason: `${commandKind} projection commit outcome: ${commit.kind}`,
  };
}

export {
  createTemporalReadDeadline,
  remainingDeadlineMs,
  TEMPORAL_READ_DEADLINE_BUDGET_MS,
  TemporalQueryTimeoutError,
  type TemporalReadDeadline,
} from "../../temporal/retry-wrapper";

/**
 * Bound an arbitrary read promise (source enumeration, hydration call)
 * by the remaining aggregate deadline budget. Unlike `runTemporalQuery`
 * this performs no retry/backoff and no STSL reconnect — it is the
 * admission gate for read stages that manage their own failure
 * classification (KD1/KD5). On expiry it rejects with
 * `TemporalQueryTimeoutError(deadline.budgetMs)` so callers can record
 * typed incompleteness rather than re-entering a retry loop.
 */
export async function raceWithTemporalDeadline<T>(
  op: Promise<T>,
  deadline: TemporalReadDeadline,
): Promise<T> {
  const remaining = remainingDeadlineMs(deadline);
  if (remaining <= 0) {
    throw new TemporalQueryTimeoutError(deadline.budgetMs);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new TemporalQueryTimeoutError(deadline.budgetMs)),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const GENERIC_QUERY_FAILURE_RE = /Failed to query Workflow|query Workflow/i;
const POISONED_WORKFLOW_EVIDENCE_RE =
  /WorkflowTaskFailedCauseNonDeterministicError|Nondeterminism|TMPRL1100|No command scheduled/i;

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function hasPoisonedWorkflowDescription(
  input: TemporalStoreBackendInput,
  changeId: string,
  deadline?: TemporalReadDeadline,
): Promise<boolean> {
  const handle = getChangeHandle(input, changeId);
  if (typeof handle.describe !== "function") return false;
  try {
    const description = await runTemporal(async () => handle.describe?.(), {
      timeoutMs: QUERY_TIMEOUT_MS,
      deadline,
    });
    return POISONED_WORKFLOW_EVIDENCE_RE.test(stringifyEvidence(description));
  } catch (error) {
    logger.debug(
      `Poisoned workflow describe probe failed for change ${changeId}: ${collectErrorText(error)}`,
    );
    return false;
  }
}

export interface TemporalReadFailureClassification {
  errorClass: TemporalErrorClass;
  /**
   * Typed reason for the read failure. `query_failed` means the workflow
   * state is unknown — it NEVER authorizes mutation. Recovery paths that
   * mutate (re-seed) or project must require BOTH `errorClass ===
   * "fallback"` AND a `ProjectionRecoveryReason` (i.e. recoveryReason !==
   * "query_failed").
   */
  recoveryReason?: RecoveryReason;
  /**
   * rq-temporalMutationSafety01 — SC6 mutation outcome classification.
   * `confirmed` means the readback succeeded; `outcome_unknown_readback_unavailable`
   * means the signal ACK happened but the readback could not confirm the
   * mutation; `failed_before_ack` means the signal call itself errored.
   *
   * Callers that perform a signal+readback sequence should pass
   * `signalError` here so the result can be threaded back to the caller's
   * outcome classification. The default value `confirmed` is the
   * readback-only case (no preceding signal).
   */
  outcome?: TemporalMutationOutcome;
}

export async function classifyTemporalReadFailure(
  input: TemporalStoreBackendInput,
  changeId: string,
  error: unknown,
  deadlineOrSignalError?: TemporalReadDeadline | unknown,
  maybeSignalError?: unknown,
): Promise<TemporalReadFailureClassification> {
  // Tolerate the legacy 4-arg shape (deadline) AND the new 5-arg shape
  // (deadline, signalError) for SC6 outcome classification.
  let deadline: TemporalReadDeadline | undefined;
  let signalError: unknown;
  if (
    deadlineOrSignalError &&
    typeof deadlineOrSignalError === "object" &&
    "budgetMs" in (deadlineOrSignalError as Record<string, unknown>) &&
    "deadlineAt" in (deadlineOrSignalError as Record<string, unknown>)
  ) {
    deadline = deadlineOrSignalError as TemporalReadDeadline;
    signalError = maybeSignalError;
  } else {
    signalError = deadlineOrSignalError;
  }

  const errorClass = classifyTemporalError(error);

  if (
    errorClass === "fatal" &&
    GENERIC_QUERY_FAILURE_RE.test(collectErrorText(error)) &&
    (await hasPoisonedWorkflowDescription(input, changeId, deadline))
  ) {
    return {
      errorClass: "fallback",
      recoveryReason: "poisoned_history",
      outcome: classifyMutationOutcome({
        ...(signalError !== undefined ? { signalError } : {}),
        readbackError: error,
      }),
    };
  }

  // Total three-way classification of every other reachable query failure:
  // poisoned → poisoned_history, completed/not-found → missing_workflow,
  // anything else → query_failed (never mutation-authorizing).
  return {
    errorClass,
    recoveryReason: recoveryReasonFromError(error),
    outcome: classifyMutationOutcome({
      ...(signalError !== undefined ? { signalError } : {}),
      readbackError: error,
    }),
  };
}

export interface StoreDeps {
  input: TemporalStoreBackendInput;
  legacy: Store;

  // Shared state maps
  changeCache: Map<string, Change>;
  changeOverlayCache: Map<string, Partial<Change>>;
  memo: ChangeSummaryMemo;
  taskChangeIndex: Map<string, string>;

  // Shared helpers (closures over the maps above)
  buildSummary: (state: ChangeWorkflowState) => ChangeSummary;
  setCachedChange: (state: ChangeWorkflowState) => Change;
  invalidateChange: (changeId: string) => void;
  updateOverlay: (changeId: string, patch: Partial<Change>) => void;
  emitChangeSummarySignal: (
    changeId: string,
    state: ChangeWorkflowState,
  ) => void;
  persistStateToDisk: (
    changeId: string,
    state: ChangeWorkflowState,
  ) => Promise<DiskPersistOutcome>;
  /**
   * Durability-critical persist: awaits the projection write and throws
   * DiskProjectionPersistError on failure so `success:true` implies a durable
   * disk projection. Callers must already hold confirmed post-mutation state
   * and have refreshed the cache (spec-delta / gate / wisdom mutations).
   */
  persistStateToDiskDurable: (
    changeId: string,
    state: ChangeWorkflowState,
  ) => Promise<void>;
  /**
   * Durable persist + cache/summary refresh for mutations that hold confirmed
   * state but have not yet refreshed the cache (task mutations). Avoids the
   * redundant readback in dualWriteAfterMutation.
   */
  persistAndRefreshDurable: (
    changeId: string,
    state: ChangeWorkflowState,
  ) => Promise<void>;
  dualWriteAfterMutation: (changeId: string) => Promise<void>;
  getTemporalWorkflowClient: () => {
    workflow: {
      start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
      getHandle: (workflowId: string) => WorkflowHandleLike;
    };
  };
  resolveStateOrQuery: (
    getHandle: () => WorkflowHandleLike | Promise<WorkflowHandleLike>,
    result: unknown,
  ) => Promise<ChangeWorkflowState>;
  indexTasksFromState: (state: ChangeWorkflowState) => void;
  resolveChangeId: (taskId: string) => Promise<string | null>;
  /** Disk-only authoritative snapshot read for routine ReadStore methods. */
  readChangeSnapshot: (
    changeId: string,
  ) => Promise<import("./read-model").ChangeReadSnapshot>;
  getTemporalChange: (
    changeId: string,
    opts?: {
      deadline?: TemporalReadDeadline;
      context?: import("./read-context").TemporalReadContext;
    },
  ) => Promise<ReturnType<Store["changes"]["get"]>>;
  listResolvedChanges: (
    filter?: {
      includeArchived?: boolean;
      includeClosed?: boolean;
    },
    deadline?: TemporalReadDeadline,
    options?: { candidateLimit?: number; hydrationConcurrency?: number },
  ) => Promise<import("../store-types").ResolvedChangeList>;
  reseedChangeFromDisk: (
    changeId: string,
    reason?: ProjectionRecoveryReason,
  ) => Promise<Change | null>;
}
