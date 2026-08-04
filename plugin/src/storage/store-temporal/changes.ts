import type {
  Store,
  ChangeConflictAuthority,
  AuthorityDiagnostics,
} from "../store-types";
import { snapshotToLoadResult } from "./read-model";
import {
  type ArtifactKind,
  type ArtifactPayload,
  type ChangeClosure,
  type BulkCloseResult,
  type Change,
  type GateId,
  type TerminalWarning,
  type TerminalSource,
  type ChangeStatus,
  type ChangeListResponse,
  type ArchiveConvergedSignalPayload,
  type GateCompletedSignalPayload,
  type Phase9FinalizationStatus,
} from "../../types";
import { createHash } from "crypto";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { stableStringify } from "../../temporal/digest";
import {
  acceptanceUpdatedSignal,
  agreementUpdatedSignal,
  archiveChangeSignal,
  archiveConvergedSignal,
  archiveRequestedSignal,
  closeChangeSignal,
  commitBatchCloseSignal,
  abortBatchCloseSignal,
  prepareBatchCloseSignal,
  designUpdatedSignal,
  epicMembershipClearedSignal,
  epicMembershipSetSignal,
  executiveSummaryUpdatedSignal,
  releaseNotesSetSignal,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  updateArtifactMetadataSignal,
  changeStateQuery,
  crossProjectCoordinationUpdatedSignal,
} from "../../temporal/messages";
import { getMutationReceiptQuery } from "../../temporal/messages";
import type { MutationReceipt } from "../../temporal/contracts";
import { ensureChangeWorkflowStarted } from "../../temporal/workflow-start";
import { makeTemporalOperationContext } from "../../temporal/operations";
import {
  MutationApplicationUnconfirmedError,
  waitForQueryPredicate,
} from "../../utils/query-predicate";
import {
  TemporalListOutcomeError,
  TemporalMutationOutcomeError,
  TemporalReadOutcomeError,
} from "../../temporal/outcome-errors";
import { getCurrentSessionId } from "../../utils/session-id";
import { removeChangeDir, loadProjectConfig } from "../json";
import { resolveProjectFeaturePolicy } from "../../types";
import {
  isSchemaError,
  listChangeDirs,
  loadChange,
} from "../change-projection-reader";
import {
  listSummaryChanges,
  type SummaryIndexPaths,
  type ChangeSummaryShard,
} from "../change-summary-shard-reader";
import {
  runTemporal,
  runTemporalQuery,
  getChangeHandle,
  getGuardedChangeHandle,
  getTemporalOwner,
  createTemporalReadDeadline,
  createTemporalReadContext,
  type TemporalReadContext,
  isTemporalReadExpired,
  raceWithTemporalDeadline,
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  TEMPORAL_READ_DEADLINE_BUDGET_MS,
  type StoreDeps,
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
} from "./shared";
import { isPoisonedWorkflowForChange } from "./poisoned-workflow-cache";
import { computeHostCommandPayloadHash } from "../../utils/command-payload-hash";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import {
  validateAggregateSize,
  validatePerArtifactSize,
} from "../_artifact-size-validation";
import { createLogger } from "../../utils/debug-log";
import { enforceMutationEligibilityForError } from "../../temporal/mutation-safety";
import { fireSignalWithMutationGuard } from "./gates";
import { buildVisibilityQuery } from "../../temporal/list-change-workflows";
import { CHANGE_WORKFLOW_PREFIX } from "../../temporal/contracts";
import { buildChangeWorkflowId } from "../../temporal/client";
import { atomicWriteFile, acquireFileLock } from "../../utils/fs";
import { mapWithConcurrency } from "../../utils/concurrency";
import {
  coordinateBatchClose,
  type BatchCloseCoordinationDeps,
  type BatchCloseCoordinationResult,
  type BatchCloseOperation,
  BatchCloseOperationSchema,
} from "./batch-close-coordinator";
import { computeCreationRequestHash } from "./creation-hash";
import type { TemporalReadDeadline } from "../../temporal/retry-wrapper";

// Command outcomes surfaced by the changeCommand primitive:
// accepted, idempotent_replay, rejected, projection_failure,
// operator_required, outcome_unknown_readback_unavailable.

const logger = createLogger("store-temporal-changes");

function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildChangeCommandIdentity(
  commandKind: string,
  payload: Record<string, unknown>,
  callerOperationId?: string,
): { operationId: string; payloadHash: string } {
  const payloadHash = computeHostCommandPayloadHash(payload);
  const operationId =
    callerOperationId ?? fallbackOperationId(commandKind, payload);
  return { operationId, payloadHash };
}

function unwrapCommandOutcome(
  outcome: ChangeCommandOutcome,
  context: string,
): ChangeWorkflowState {
  if (outcome.kind === "accepted" || outcome.kind === "idempotent_replay") {
    return outcome.state;
  }
  throw new Error(`${context}: ${outcome.kind} — ${outcome.reason}`);
}

/**
 * Deterministic order for content signal fan-out within a single
 * `create()` or `updateArtifacts()` call. Workflow histories diff cleanly
 * across runs only if the order is fixed. Locked by C5; verified by the
 * signal invariant test (T19).
 *
 * Tool layer MUST `await` each signal acknowledgement before firing the
 * next; concurrent firing (`Promise.all`) is forbidden because TS SDK
 * preserves only server-acceptance order within an activation.
 */
const ARTIFACT_SIGNAL_ORDER: ReadonlyArray<{
  kind: ArtifactKind;
  signal:
    | typeof proposalUpdatedSignal
    | typeof problemStatementUpdatedSignal
    | typeof agreementUpdatedSignal
    | typeof designUpdatedSignal
    | typeof executiveSummaryUpdatedSignal
    | typeof acceptanceUpdatedSignal;
}> = [
  { kind: "proposal", signal: proposalUpdatedSignal },
  { kind: "problemStatement", signal: problemStatementUpdatedSignal },
  { kind: "agreement", signal: agreementUpdatedSignal },
  { kind: "design", signal: designUpdatedSignal },
  { kind: "executiveSummary", signal: executiveSummaryUpdatedSignal },
  { kind: "acceptance", signal: acceptanceUpdatedSignal },
];

/**
 * rq-temporalMutationSafety01 — SC4 mutation-eligibility guard for a single
 * signal call. The signal is dispatched via `runTemporal`; any failure is
 * classified into a `TemporalWorkflowDiagnostic` and SC4-mutation-ineligible
 * classes (no_poller / query_failed_or_not_registered / deadline / unknown /
 * query_rejected / permission / resource_exhaustion) are re-thrown as
 * `TemporalMutationIneligibleError`. `not_found` and `poisoned_history`
 * intentionally pass through — they require additional operator safeguards
 * (approval, exact run pinning, shipped proof, dry-run) handled elsewhere.
 *
 * Use this at every signal, projection-write, reset, and terminate call
 * site that does NOT already go through `fireSignal` (the tools/_adapters
 * wrapper applies the same SC4 guard at its boundary).
 */
async function fireGuardedSignal<Args extends unknown[]>(
  input: import("./shared").TemporalStoreBackendInput,
  changeId: string,
  signalName: import("@temporalio/workflow").SignalDefinition<unknown[]>,
  ...args: Args
): Promise<void> {
  try {
    const outcome = await runTemporal(async () => {
      const owner = getTemporalOwner(input);
      const handle = await getGuardedChangeHandle(input, changeId);
      const workflowId = buildChangeWorkflowId(input.projectId, changeId);
      const ctx = makeTemporalOperationContext(
        input.projectId,
        workflowId,
        "signal",
        "fireGuardedSignal",
        5_000,
      );
      return await owner.signal(ctx, handle, signalName, [
        ...(args as unknown[]),
      ]);
    });
    if (outcome.kind !== "confirmed") {
      throw new TemporalMutationOutcomeError(outcome);
    }
  } catch (err) {
    // SC4 guard at signal-dispatch boundary.
    enforceMutationEligibilityForError(err);
    // Surviving path: SC4-pass (not_found / poisoned_history).
    throw err;
  }
}

/**
 * Fire one command per defined artifact field, in deterministic order
 * (proposal → problemStatement → agreement → design → executiveSummary →
 * acceptance). Each artifact gets a stable operation id derived from the
 * caller-stable `parentOperationId` plus the artifact kind. The command polls
 * the workflow operation ledger for an accepted outcome, then commits the
 * disk projection together with an immutable summary shard.
 *
 * The companion `updateArtifactMetadataSignal` fires as a `postSignal` hook so
 * the projection commit sees `state.artifacts.{kind}.contentHash` consistent
 * with `state.documents.{kind}`.
 */
async function fireContentArtifactCommands(
  deps: StoreDeps,
  changeId: string,
  artifacts: ArtifactPayload,
  parentOperationId: string,
  updatedAt: string,
  confirmReadinessReceipts = false,
): Promise<ChangeWorkflowState> {
  const { input, legacy } = deps;
  let lastState: ChangeWorkflowState | undefined;
  for (const { kind, signal } of ARTIFACT_SIGNAL_ORDER) {
    const content = artifacts[kind];
    if (content === undefined) continue;
    const commandKind = `${kind}Updated`;
    const payloadHash = computeHostCommandPayloadHash({ text: content });
    const operationId = `${parentOperationId}:${kind}`;
    const requiresReceipt =
      confirmReadinessReceipts &&
      (kind === "executiveSummary" || kind === "acceptance");
    const mutationReceiptId = requiresReceipt
      ? `mrec_${randomUUID()}`
      : undefined;

    const outcome = await changeCommand({
      deps,
      changeId,
      operationId,
      commandKind,
      payloadHash,
      signal,
      signalArgs: [
        {
          text: content,
          updatedAt,
          ...(mutationReceiptId ? { mutationReceiptId } : {}),
          operation_id: operationId,
          command_kind: commandKind,
          payload_hash: payloadHash,
        },
      ],
      postSignal: async (owner, handle) => {
        const ctx = makeTemporalOperationContext(
          input.projectId,
          buildChangeWorkflowId(input.projectId, changeId),
          "signal",
          "updateArtifactMetadata",
          5_000,
        );
        const outcome = await owner.signal(
          ctx,
          handle,
          updateArtifactMetadataSignal,
          [
            {
              kind,
              metadata: {
                updatedAt,
                contentHash: computeContentHash(content),
                source: "temporal",
                readable: false,
              },
            },
          ],
        );
        if (outcome.kind !== "confirmed") {
          throw new TemporalMutationOutcomeError(outcome);
        }
      },
      commitProjection: buildSummaryCommitProjection(
        legacy,
        changeId,
        operationId,
        payloadHash,
        commandKind,
      ),
    });
    if (outcome.kind !== "accepted" && outcome.kind !== "idempotent_replay") {
      throw new Error(
        `content command ${commandKind} for ${changeId} failed: ${outcome.kind} — ${"reason" in outcome ? outcome.reason : ""}`,
      );
    }
    lastState = outcome.state;

    if (mutationReceiptId) {
      const owner = getTemporalOwner(input);
      const handle = await getGuardedChangeHandle(input, changeId);
      const ctx = makeTemporalOperationContext(
        input.projectId,
        buildChangeWorkflowId(input.projectId, changeId),
        "query",
        "getMutationReceipt",
        5_000,
      );
      const receipt = await waitForQueryPredicate(
        async () => {
          const outcome = await owner.query(
            ctx,
            handle,
            getMutationReceiptQuery,
            mutationReceiptId,
          );
          if (outcome.kind !== "complete") {
            throw (
              outcome.error ?? new Error("mutation receipt query incomplete")
            );
          }
          return outcome.value as MutationReceipt | undefined;
        },
        (candidate) => candidate?.id === mutationReceiptId,
      );
      if (!receipt) {
        throw new MutationApplicationUnconfirmedError(mutationReceiptId);
      }
    }
  }
  if (!lastState) {
    throw new Error(
      `fireContentArtifactCommands(${changeId}) fired no artifact commands`,
    );
  }
  return lastState;
}

function canonicalizeBatchCloseTargetIds(target_ids: string[]): string[] {
  // Stable order + duplicate removal: equivalent selector orders map to the
  // same batch_id, and a target cannot appear twice in the operation record.
  return [...new Set(target_ids)].sort();
}

function computeBatchCloseRequestHash(
  target_ids: string[],
  closure: ChangeClosure,
): string {
  const canonicalIds = canonicalizeBatchCloseTargetIds(target_ids);
  const hash = createHash("sha256");
  for (const id of canonicalIds) hash.update(id);
  hash.update(stableStringify(closure));
  return hash.digest("hex");
}

function getBatchOperationRecordPath(
  legacy: { paths: { changes: string } },
  batch_id: string,
): string {
  return `${legacy.paths.changes}/.batch-operations/${batch_id}.json`;
}

type BatchCloseOperationLoadResult =
  | { valid: true; operation: BatchCloseOperation }
  | { valid: false; error: string }
  | undefined;

async function loadBatchCloseOperation(
  legacy: { paths: { changes: string } },
  batch_id: string,
): Promise<BatchCloseOperationLoadResult> {
  const path = getBatchOperationRecordPath(legacy, batch_id);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return undefined;
    }
    return { valid: false, error: String(err) };
  }
  const parsed = BatchCloseOperationSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, error: parsed.error.message };
  }
  return { valid: true, operation: parsed.data };
}

async function persistBatchCloseOperation(
  legacy: { paths: { changes: string } },
  op: BatchCloseOperation,
): Promise<void> {
  const path = getBatchOperationRecordPath(legacy, op.batch_id);
  await atomicWriteFile(path, `${JSON.stringify(op, null, 2)}\n`);
}

function createBatchCloseCoordinationDeps(
  input: import("./shared").TemporalStoreBackendInput,
  legacy: { paths: { changes: string } },
  getTemporalChange: StoreDeps["getTemporalChange"],
  preloadedOperation?: BatchCloseOperation,
): BatchCloseCoordinationDeps {
  return {
    loadOperation: async () => preloadedOperation,
    persistOperation: (op) => persistBatchCloseOperation(legacy, op),
    resolveChange: async (changeId) => {
      const result = await getTemporalChange(changeId);
      if (!result.success) {
        return { notFound: true, reason: result.error ?? "Change not found" };
      }
      if (!result.data) {
        return { notFound: true, reason: "Change not found" };
      }
      return { state: result.data as unknown as ChangeWorkflowState };
    },
    sendSignal: async (changeId, signal, payload) => {
      if (signal === "prepare") {
        await fireGuardedSignal(
          input,
          changeId,
          prepareBatchCloseSignal,
          payload,
        );
      } else if (signal === "commit") {
        await fireGuardedSignal(
          input,
          changeId,
          commitBatchCloseSignal,
          payload,
        );
      } else if (signal === "abort") {
        await fireGuardedSignal(
          input,
          changeId,
          abortBatchCloseSignal,
          payload,
        );
      } else {
        throw new Error(`Unknown batch close signal: ${signal}`);
      }
    },
    queryState: async (changeId) => {
      const owner = getTemporalOwner(input);
      const handle = await getGuardedChangeHandle(input, changeId);
      const workflowId = buildChangeWorkflowId(input.projectId, changeId);
      const ctx = makeTemporalOperationContext(
        input.projectId,
        workflowId,
        "query",
        "batchCloseQueryState",
        5_000,
      );
      const outcome = await runTemporal(async () =>
        owner.query(ctx, handle, changeStateQuery),
      );
      if (outcome.kind !== "complete") {
        throw new TemporalReadOutcomeError(outcome);
      }
      return outcome.value as ChangeWorkflowState;
    },
    now: () => new Date().toISOString(),
  };
}

function mapBatchCloseOutcome(
  outcome: BatchCloseCoordinationResult,
  changeIds: string[],
): BulkCloseResult {
  const committedIds = new Set(
    Object.entries(outcome.operation.per_target)
      .filter(([, record]) => record.phase === "committed")
      .map(([id]) => id),
  );
  const success = outcome.kind === "committed_all";
  return {
    success,
    closed: committedIds.size,
    results: changeIds.map((changeId) => {
      const record = outcome.operation.per_target[changeId];
      return {
        changeId,
        success: record?.phase === "committed",
        error: record?.error,
        state: record?.phase,
      };
    }),
    message: outcome.message,
  };
}

interface ChangeListFilter {
  status?: string;
  includeArchived?: boolean;
  includeClosed?: boolean;
  prefix?: string;
  titleContains?: string;
  createdBefore?: string;
  lastActivityBefore?: string;
  sort?: "recency" | "stalest" | "default";
  limit?: number;
  offset?: number;
  /** Internal caller-specific cap for per-change hydration. */
  validationConcurrency?: number;
  /** Request-scoped deadline shared with an enclosing status read. */
  deadline?: TemporalReadDeadline | TemporalReadContext;
}

interface ListChangeSummariesResult {
  summaries: ChangeSummaryShard[];
  totalIds: number;
  warnings?: TerminalWarning[];
  statusCounts?: Record<ChangeStatus, number>;
  boundedOmittedIds?: string[];
}

/**
 * Projection-only change list reader built on immutable summary shards.
 *
 * No Temporal Visibility, Query, or Memo reads. The caller (list / listSummary)
 * supplies behavioral options so each routine method keeps its exact semantics
 * while sharing the durable read path.
 */
async function listChangeSummaries(
  filter: ChangeListFilter | undefined,
  paths: SummaryIndexPaths,
  options: {
    /** list() uses case-insensitive prefix; listSummary() keeps case-sensitive. */
    caseInsensitivePrefix?: boolean;
    /** Force a sort regardless of filter.sort (list() always sorts by created_at desc). */
    forceSort?: "recency" | "stalest" | "default";
    /** Enable offset/limit pagination (listSummary); list() currently ignores them. */
    paginate?: boolean;
    /** Cap rows before downstream hydration while retaining API offset semantics. */
    candidateLimit?: number;
  } = {},
): Promise<ListChangeSummariesResult> {
  const summaryResult = await listSummaryChanges(paths);
  if (summaryResult.kind !== "ok") {
    return {
      summaries: [],
      totalIds: 0,
      warnings: [
        {
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "active_disk",
          message: summaryResult.error,
        },
      ],
    };
  }

  const baseWarnings: TerminalWarning[] =
    summaryResult.warnings?.map((warning) => ({
      code:
        warning.kind === "oversized"
          ? "SOURCE_BOUND_EXCEEDED"
          : "TERMINAL_CANDIDATE_OMITTED",
      source: "active_disk",
      message: `${warning.kind} summary document at ${warning.path}${warning.error ? `: ${warning.error}` : ""}${warning.actual ? ` (${warning.actual} bytes)` : ""}`,
      omittedCount: 1,
    })) ?? [];

  const statusCounts: Record<ChangeStatus, number> = {
    draft: 0,
    archived: 0,
    closed: 0,
  };
  for (const summary of summaryResult.summaries) {
    statusCounts[summary.status] = (statusCounts[summary.status] ?? 0) + 1;
  }

  const requestedStatus =
    filter?.status === "active" || filter?.status === "pending"
      ? "draft"
      : filter?.status;
  const includeArchived =
    filter?.includeArchived || requestedStatus === "archived";
  const includeClosed = filter?.includeClosed || requestedStatus === "closed";

  const filtered = summaryResult.summaries.filter((summary) => {
    const terminal =
      summary.status === "archived" || summary.status === "closed";
    if (
      terminal &&
      !(summary.status === "archived" ? includeArchived : includeClosed)
    ) {
      return false;
    }
    if (!terminal && requestedStatus && summary.status !== requestedStatus) {
      return false;
    }

    if (filter?.prefix) {
      const prefix = filter.prefix;
      const id = options.caseInsensitivePrefix
        ? summary.id.toLowerCase()
        : summary.id;
      const needle = options.caseInsensitivePrefix
        ? prefix.toLowerCase()
        : prefix;
      if (!id.startsWith(needle)) return false;
    }
    if (filter?.titleContains) {
      const needle = filter.titleContains.toLowerCase();
      if (!summary.title.toLowerCase().includes(needle)) return false;
    }
    if (filter?.createdBefore && !(summary.created_at < filter.createdBefore)) {
      return false;
    }
    if (
      filter?.lastActivityBefore &&
      !(summary.last_activity_at < filter.lastActivityBefore)
    ) {
      return false;
    }
    return true;
  });

  const sort = options.forceSort ?? filter?.sort ?? "default";
  filtered.sort((left, right) => {
    const field = sort === "default" ? "created_at" : "last_activity_at";
    const comparison = left[field].localeCompare(right[field]);
    return (
      (sort === "stalest" ? comparison : -comparison) ||
      left.id.localeCompare(right.id)
    );
  });

  const boundedOmittedIds =
    options.candidateLimit === undefined
      ? undefined
      : filtered.slice(options.candidateLimit).map((summary) => summary.id);
  const boundedFiltered =
    options.candidateLimit === undefined
      ? filtered
      : filtered.slice(0, Math.max(0, options.candidateLimit));

  if (options.paginate) {
    const offset = Math.max(0, filter?.offset ?? 0);
    const limit =
      filter?.limit === undefined ? undefined : Math.max(0, filter.limit);
    return {
      summaries: boundedFiltered.slice(
        offset,
        limit === undefined ? undefined : offset + limit,
      ),
      totalIds: summaryResult.summaries.length,
      warnings: baseWarnings.length > 0 ? baseWarnings : undefined,
      statusCounts,
      ...(boundedOmittedIds ? { boundedOmittedIds } : {}),
    };
  }

  return {
    summaries: boundedFiltered,
    totalIds: summaryResult.summaries.length,
    warnings: baseWarnings.length > 0 ? baseWarnings : undefined,
    statusCounts,
    ...(boundedOmittedIds ? { boundedOmittedIds } : {}),
  };
}

const GATE_ORDER: readonly GateId[] = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
];

function deriveCurrentGate(
  gates: Change["gates"] | undefined,
): GateId | "done" {
  for (const gateId of GATE_ORDER) {
    const gate = gates?.[gateId];
    if (typeof gate === "object" && gate !== null && gate.status === "done") {
      continue;
    }
    return gateId;
  }
  return "done";
}

function changeLastActivityAt(change: Change): string {
  return (
    (change as { lastSignalAt?: string }).lastSignalAt ?? change.created_at
  );
}

function changeToListRow(
  change: Change,
): ChangeListResponse["changes"][number] {
  return {
    id: change.id,
    title: change.title,
    status: change.status,
    created_at: change.created_at,
    lastActivityAt: changeLastActivityAt(change),
    taskCount: change.tasks?.length ?? 0,
    completedTasks:
      (change.tasks ?? []).filter((t) => t.status === "done").length ?? 0,
    currentGate: deriveCurrentGate(change.gates),
    lifecycleState: change.status === "draft" ? "open" : change.status,
    fast_follow_of: change.fast_follow_of,
    epic_membership: change.epic_membership,
    capabilities: Object.keys(change.deltas ?? {}),
  };
}

function summaryToListRow(
  summary: ChangeSummaryShard,
): ChangeListResponse["changes"][number] {
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    created_at: summary.created_at,
    lastActivityAt: summary.last_activity_at,
    taskCount: summary.task_count,
    completedTasks: summary.completed_tasks,
    currentGate: summary.phase as GateId | "done",
    lifecycleState: summary.status === "draft" ? "open" : summary.status,
    fast_follow_of: summary.fast_follow_of,
    epic_membership: summary.epic_membership,
    capabilities: summary.capabilities,
  };
}

function matchesChangeListFilter(
  row: {
    id: string;
    title: string;
    status: ChangeStatus;
    created_at: string;
    lastActivityAt: string;
  },
  filter: ChangeListFilter | undefined,
  options: { caseInsensitivePrefix?: boolean },
): boolean {
  const requestedStatus =
    filter?.status === "active" || filter?.status === "pending"
      ? "draft"
      : filter?.status;
  const includeArchived =
    filter?.includeArchived || requestedStatus === "archived";
  const includeClosed = filter?.includeClosed || requestedStatus === "closed";

  const terminal = row.status === "archived" || row.status === "closed";
  if (
    terminal &&
    !(row.status === "archived" ? includeArchived : includeClosed)
  ) {
    return false;
  }
  if (!terminal && requestedStatus && row.status !== requestedStatus) {
    return false;
  }

  if (filter?.prefix) {
    const prefix = filter.prefix;
    const id = options.caseInsensitivePrefix ? row.id.toLowerCase() : row.id;
    const needle = options.caseInsensitivePrefix
      ? prefix.toLowerCase()
      : prefix;
    if (!id.startsWith(needle)) return false;
  }

  if (filter?.titleContains) {
    const needle = filter.titleContains.toLowerCase();
    if (!row.title.toLowerCase().includes(needle)) return false;
  }

  if (filter?.createdBefore && !(row.created_at < filter.createdBefore)) {
    return false;
  }
  if (
    filter?.lastActivityBefore &&
    !(row.lastActivityAt < filter.lastActivityBefore)
  ) {
    return false;
  }

  return true;
}

/**
 * Three-tier projection-first change list reader.
 *
 * 1. Immutable summary shards (fast path, zero I/O beyond the index).
 * 2. Disk `change.json` hydration for shard-less IDs, zero workflow queries.
 * 3. Capped per-member workflow fallback only when durable evidence is
 *    missing or invalid, honouring the shared read context / circuit breaker.
 */
async function readProjectionChangeList(
  filter: ChangeListFilter | undefined,
  paths: SummaryIndexPaths,
  deps: StoreDeps,
  options: {
    caseInsensitivePrefix?: boolean;
    forceSort?: "recency" | "stalest" | "default";
    paginate?: boolean;
    includeHydrationStats?: boolean;
    deadline?: TemporalReadDeadline | TemporalReadContext;
    candidateLimit?: number;
    loadArchiveForActiveShadow?: boolean;
  },
): Promise<
  ChangeListResponse & {
    sourceRankedIds?: string[];
    totalIds?: number;
    statusCounts?: Record<ChangeStatus, number>;
    boundedOmittedIds?: string[];
  }
> {
  const {
    input: _input,
    legacy,
    memo,
    getTemporalChange,
    markLoadedDiskProjection,
  } = deps;

  const suppliedRead = options.deadline;
  const ctx = suppliedRead
    ? "abortController" in suppliedRead
      ? suppliedRead
      : createTemporalReadContext(suppliedRead.budgetMs)
    : createTemporalReadContext(TEMPORAL_READ_DEADLINE_BUDGET_MS);
  if (suppliedRead && !("abortController" in suppliedRead)) {
    ctx.deadline = suppliedRead;
  }
  const deadline = ctx.deadline;
  const expired = (): boolean => isTemporalReadExpired(ctx);

  const requestedStatus =
    filter?.status === "active" || filter?.status === "pending"
      ? "draft"
      : filter?.status;
  const includeArchived =
    filter?.includeArchived || requestedStatus === "archived";
  const includeClosed = filter?.includeClosed || requestedStatus === "closed";
  const wantsTerminalStatuses = includeArchived || includeClosed;

  const warnings: TerminalWarning[] = [];
  const degradedSources = new Set<TerminalSource>();
  const deadlineOmissions: string[] = [];
  const loadFailedOmissions: string[] = [];

  // Tier 1: summary shards.
  const summaryResult = await listChangeSummaries(filter, paths, {
    caseInsensitivePrefix: options.caseInsensitivePrefix,
    forceSort: options.forceSort,
    // Apply API pagination after combining durable sources. Candidate bounds
    // are applied before hydration without consuming the requested offset.
    paginate: false,
    candidateLimit: options.candidateLimit,
  });

  const summaryRows = new Map<string, ChangeListResponse["changes"][number]>();
  if (summaryResult.summaries.length > 0) {
    for (const summary of summaryResult.summaries) {
      markLoadedDiskProjection?.(summary.id);
      summaryRows.set(summary.id, summaryToListRow(summary));
    }
  }
  if (summaryResult.warnings) {
    degradedSources.add("active_disk");
    warnings.push(...summaryResult.warnings);
  }

  // Collect candidate IDs from every durable/advisory source.
  const candidateIds = new Set<string>(summaryRows.keys());
  if (options.candidateLimit === undefined) {
    for (const summary of memo.getAll()) candidateIds.add(summary.id);
  }

  const addSourceIds = (ids: string[]): void => {
    const sourceIds =
      options.candidateLimit === undefined
        ? ids
        : ids.slice(0, Math.max(0, options.candidateLimit));
    for (const id of sourceIds) candidateIds.add(id);
  };

  // Disk active projections.
  let diskIds: string[] = [];
  try {
    diskIds = await raceWithTemporalDeadline(
      listChangeDirs(paths.changesDir),
      deadline,
    );
  } catch (err) {
    const hitDeadline = err instanceof TemporalQueryTimeoutError || expired();
    degradedSources.add("active_disk");
    if (wantsTerminalStatuses) {
      warnings.push({
        code: "TERMINAL_SOURCE_DEGRADED",
        source: "active_disk",
        message: `Disk listChangeDirs ${
          hitDeadline ? "exceeded the aggregate read deadline" : "failed"
        }: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  addSourceIds(diskIds);

  // Archive bundles.
  // Build a canonical-id -> archive-directory map so duplicate date-prefixed
  // directories for the same change id are deduplicated, active-disk shadows can
  // be dominated, and terminal reads can hydrate archived changes.
  const archiveCandidateMap = new Map<
    string,
    { dir: string; change: Change }
  >();
  if (
    (wantsTerminalStatuses || options.loadArchiveForActiveShadow) &&
    legacy.paths.archive
  ) {
    try {
      const archiveDirs = await raceWithTemporalDeadline(
        listChangeDirs(legacy.paths.archive),
        deadline,
      );
      for (const dir of archiveDirs) {
        // The race around each load protects the I/O itself. This admission
        // check prevents an expired request from starting the next candidate.
        if (expired()) {
          deadlineOmissions.push(dir);
          degradedSources.add("archive");
          break;
        }
        const loaded = await raceWithTemporalDeadline(
          loadChange(legacy.paths.archive, dir),
          deadline,
        );
        if (loaded.success && loaded.data?.id) {
          const canonicalId = loaded.data.id;
          if (!archiveCandidateMap.has(canonicalId)) {
            archiveCandidateMap.set(canonicalId, {
              dir,
              change: loaded.data,
            });
          }
        }
      }
    } catch (err) {
      const hitDeadline = err instanceof TemporalQueryTimeoutError || expired();
      degradedSources.add("archive");
      if (wantsTerminalStatuses) {
        warnings.push({
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "archive",
          message: `Archive bundle scan ${
            hitDeadline ? "exceeded the aggregate read deadline" : "failed"
          }: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
  if (wantsTerminalStatuses) {
    for (const id of archiveCandidateMap.keys()) candidateIds.add(id);
  }

  // Routine change-list reads must remain projection-only. Temporal Visibility
  // enumeration is reserved for explicit recovery/diagnostic surfaces such as
  // listConflictAuthority, not for routine list/listSummary reads.

  const fromMemo = summaryRows.size;
  const fromCache = 0;
  let fromHydration = 0;
  let terminalCandidates = 0;
  let terminalFromArchive = 0;
  let terminalFromDisk = 0;
  let terminalFromWorkflow = 0;

  const rows = new Map<string, ChangeListResponse["changes"][number]>(
    summaryRows,
  );
  const allIds = Array.from(candidateIds);
  const unresolvedIds = allIds.filter((id) => !summaryRows.has(id));
  if (wantsTerminalStatuses) {
    terminalCandidates = unresolvedIds.length;
  }
  const batchConcurrency = Math.max(
    1,
    Math.min(20, filter?.validationConcurrency ?? 20),
  );

  const hydrate = async (id: string): Promise<void> => {
    if (expired()) {
      deadlineOmissions.push(id);
      return;
    }

    // Tier 2: disk change.json hydration (zero workflow queries).
    let diskResult: Awaited<ReturnType<typeof loadChange>> | undefined;
    try {
      diskResult = await raceWithTemporalDeadline(
        loadChange(paths.changesDir, id),
        deadline,
      );
    } catch (err) {
      if (err instanceof TemporalQueryTimeoutError || expired()) {
        deadlineOmissions.push(id);
      } else {
        loadFailedOmissions.push(id);
      }
      return;
    }

    if (
      diskResult &&
      !diskResult.success &&
      diskResult.type === "schema_error"
    ) {
      // Schema-invalid durable projection is unusable; fall through to
      // workflow fallback rather than treating it as a hard omission.
      diskResult = undefined;
    }

    if (diskResult?.success && diskResult.data) {
      markLoadedDiskProjection?.(diskResult.data.id);
      let change = diskResult.data;
      const terminalOnDisk =
        change.status === "archived" || change.status === "closed";
      // Archive-bundle dominance for active disk shadows.
      if (!terminalOnDisk && archiveCandidateMap.has(change.id)) {
        change = { ...change, status: "archived" as const };
      }
      rows.set(change.id, changeToListRow(change));
      fromHydration++;
      if (wantsTerminalStatuses) {
        if (change.status === "archived" || terminalOnDisk) {
          terminalFromDisk++;
        }
      }
      return;
    }

    // Tier 2b: archive bundle direct load for terminal reads.
    if (wantsTerminalStatuses && legacy.paths.archive) {
      const archiveCandidate = archiveCandidateMap.get(id);
      if (archiveCandidate) {
        const archived = {
          ...archiveCandidate.change,
          status: "archived" as const,
        };
        rows.set(archived.id, changeToListRow(archived));
        fromHydration++;
        terminalFromArchive++;
        return;
      }
    }

    // Tier 3: capped workflow fallback only when durable evidence is missing.
    try {
      const result = await getTemporalChange(id, { context: ctx });
      if (result.success && result.data) {
        rows.set(result.data.id, changeToListRow(result.data));
        fromHydration++;
        if (wantsTerminalStatuses) {
          terminalFromWorkflow++;
        }
        return;
      }
    } catch (err) {
      if (err instanceof TemporalQueryTimeoutError || expired()) {
        deadlineOmissions.push(id);
        return;
      }
      // Other workflow failures are recorded as load failures.
    }

    loadFailedOmissions.push(id);
  };

  await mapWithConcurrency(unresolvedIds, batchConcurrency, hydrate);

  // Filter/sort the combined result set.
  const combinedRows = Array.from(rows.values()).filter((row) =>
    matchesChangeListFilter(row, filter, {
      caseInsensitivePrefix: options.caseInsensitivePrefix,
    }),
  );

  const sort = options.forceSort ?? filter?.sort ?? "default";
  combinedRows.sort((a, b) => {
    const field = sort === "default" ? "created_at" : "lastActivityAt";
    const cmp = a[field].localeCompare(b[field]);
    return (sort === "stalest" ? cmp : -cmp) || a.id.localeCompare(b.id);
  });

  let paginatedRows = combinedRows;
  if (options.paginate) {
    const offset = Math.max(0, filter?.offset ?? 0);
    const limit =
      filter?.limit === undefined ? undefined : Math.max(0, filter.limit);
    paginatedRows = combinedRows.slice(
      offset,
      limit === undefined ? undefined : offset + limit,
    );
  }

  const omitted = deadlineOmissions.length + loadFailedOmissions.length;
  const deadlineExceeded = deadlineOmissions.length > 0;

  // Terminal omission warning only for terminal reads.
  if (wantsTerminalStatuses && omitted > 0) {
    warnings.push({
      code: "TERMINAL_CANDIDATE_OMITTED",
      source: "workflow_query",
      message: `${omitted} terminal candidate(s) could not be loaded from any available source.`,
      omittedCount: omitted,
      omittedIds: [...deadlineOmissions, ...loadFailedOmissions].slice(0, 20),
    });
  }

  // Deadline degradation surfaces for both active and terminal reads.
  if (deadlineExceeded) {
    const sources =
      degradedSources.size > 0
        ? Array.from(degradedSources)
        : (["workflow_query"] as TerminalSource[]);
    for (const source of sources) {
      warnings.push({
        code: "SOURCE_DEADLINE_EXCEEDED",
        source,
        message: `Aggregate read deadline (${deadline.budgetMs}ms) exceeded while resolving ${source}; results are incomplete.`,
        ...(deadlineOmissions.length > 0
          ? {
              omittedCount: deadlineOmissions.length,
              omittedIds: deadlineOmissions.slice(0, 20),
            }
          : {}),
      });
    }
  }

  const hydrationStats = {
    totalIds: allIds.length,
    fromMemo,
    fromCache,
    fromHydration,
    ...(wantsTerminalStatuses
      ? {
          terminalCandidates,
          terminalFromArchive,
          terminalFromDisk,
          terminalFromWorkflow,
          omitted,
        }
      : {}),
    ...(deadlineExceeded ? { deadlineExceeded: true } : {}),
  };

  const hasWarnings = warnings.length > 0;
  const hasTerminalRelevantStats =
    wantsTerminalStatuses &&
    (terminalCandidates > 0 || omitted > 0 || deadlineExceeded);

  return {
    changes: paginatedRows,
    ...(hasWarnings ? { warnings } : {}),
    ...(options.includeHydrationStats || hasWarnings || hasTerminalRelevantStats
      ? { hydrationStats }
      : {}),
    totalIds: allIds.length,
    ...(summaryResult.statusCounts
      ? { statusCounts: summaryResult.statusCounts }
      : {}),
    ...(summaryResult.boundedOmittedIds
      ? { boundedOmittedIds: summaryResult.boundedOmittedIds }
      : {}),
  };
}

export function createChangeOps(deps: StoreDeps): Store["changes"] {
  const {
    input,
    legacy,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    indexTasksFromState,
    setCachedChange,
    getTemporalChange,
    dualWriteAfterMutation,
    persistStateToDiskDurable,
    readChangeSnapshot,
  } = deps;

  return {
    create: async (summary, options) => {
      const capability = options?.capability;
      const artifacts = options?.artifacts ?? {};
      const initialMetadata = options?.initialMetadata;
      const epicMembership = initialMetadata?.epic_membership;

      // rq-creationRequestHash01 (tk-74c358188ffb, design D2 / AC4 / AC11):
      // compute the canonical creation-request hash from stable identity
      // fields. Threaded into seedState (so the workflow records it once at
      // start) and into ChangeWorkflowInput.creationRequestHash (so the
      // "already started" recovery path can reconcile retries against the
      // original request — closes the post-commit-timeout duplicate-
      // creation defect class). The hash is also stamped on the disk
      // projection below so disk-first readers see it without a workflow
      // query round-trip.
      const creationRequestHash = computeCreationRequestHash({
        summary,
        capability,
        origin: initialMetadata?.origin,
        fast_follow_of: initialMetadata?.fast_follow_of,
        cross_project_origin: initialMetadata?.cross_project_origin,
        scope_repos: initialMetadata?.scope_repos,
        epic_membership_seed: epicMembership,
        same_project_dependencies: initialMetadata?.same_project_dependencies,
      });

      // Layer 1 size validation (KD-8 layer 1). Fails fast before any
      // disk write or signal fires. Layer 2 (signal-handler state-mutation
      // rejection) in T8 enforces structurally inside the workflow.
      for (const kind of [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ] as const) {
        const content = artifacts[kind];
        if (content !== undefined) validatePerArtifactSize(kind, content);
      }
      validateAggregateSize(artifacts);

      // T15 / AC8: no artifact-content disk writes from the temporal store
      // production path. Forward only the non-artifact scaffolding
      // (change.json + dir + default proposal.md placeholder) to legacy
      // disk store; user-supplied artifact content flows exclusively
      // through content signals → state.documents.
      //
      // Note: createChangeScaffold still writes a default proposal.md
      // SCAFFOLD on disk to maintain backward compat for legacy callers
      // that read disk. The scaffold is placeholder content, not user
      // content; once T20 deletes the positional API entirely, the
      // scaffold path itself can be removed.
      const result = await legacy.changes.create(summary, {
        ...(capability !== undefined ? { capability } : {}),
        ...(initialMetadata ? { initialMetadata } : {}),
        // No artifacts passed — content flows via signals only.
      });
      const created = await legacy.changes.get(result.changeId);
      if (isSchemaError(created)) {
        throw new Error(created.error);
      }
      if (!created.success || !created.data) {
        throw new Error(
          `Created change ${result.changeId} but could not reload scaffolded change state`,
        );
      }

      const projectConfig = await loadProjectConfig(legacy.paths.root).catch(
        () => null,
      );
      const featurePolicy = resolveProjectFeaturePolicy(
        projectConfig?.features,
      );

      // P1.4 transactional guard: if Temporal workflow start fails,
      // the disk scaffold (proposal.md, change.json, etc.) would
      // otherwise persist as an orphan that confuses subsequent tool
      // calls. Remove the change dir on failure and re-throw the
      // ORIGINAL error — never mask it with rollback errors.
      //
      // See design.md § KD-7.
      try {
        const owner = getTemporalOwner(input);
        const startInput: import("../../temporal/contracts").ChangeWorkflowInput =
          {
            projectId: input.projectId,
            changeId: created.data.id,
            title: created.data.title,
            initializedAt: created.data.created_at,
            projectionChangesDir: legacy.paths.changes,
            archiveProjects: [{ projectPath: legacy.paths.root }],
            // KD-10 / rq-isolSessionTaskQueue01: thread current session ID so
            // the start can route to advance-{projectId}-{sess}.
            // Undefined falls back to project queue (legacy / pre-init / tests).
            sessionId: getCurrentSessionId(),
            // rq-creationRequestHash01: enables the "already started" hash
            // reconciliation. Without this, the existing workflow's handle
            // is returned silently on retry — masking any divergence between
            // the original and retried request.
            creationRequestHash,
            seedState: {
              status: created.data.status,
              tasks: created.data.tasks,
              deltas: created.data.deltas,
              wisdom: created.data.wisdom,
              gates: created.data.gates,
              reentry_history: created.data.reentry_history,
              fast_follow_of: created.data.fast_follow_of,
              cross_project_origin: created.data.cross_project_origin,
              origin: created.data.origin,
              same_project_dependencies:
                initialMetadata?.same_project_dependencies ??
                created.data.same_project_dependencies ??
                [],
              // rq-autoManageAdvWorktrees AC3 — new changes are auto-managed
              // by default. Seed the workflow state with the marker so the
              // first read sees it; lazy migration (A4) covers legacy changes
              // that pre-date this field.
              worktree_auto_managed: true,
              // rq-creationRequestHash01: stamp the hash onto the workflow
              // state so future retries / Continue-As-New can reconcile.
              creation_request_hash: creationRequestHash,
              ...(epicMembership ? { epic_membership: epicMembership } : {}),
            },
          };
        await ensureChangeWorkflowStarted(owner, startInput, {
          workflowQueueMode: featurePolicy.workflowQueueMode,
          budgetMs: 30_000,
        });
      } catch (err) {
        // rq-creationRequestHash01: a hash conflict is a deterministic,
        // caller-induced refusal — the just-written disk scaffold must be
        // rolled back so a subsequent same-summary create with the ORIGINAL
        // request can still succeed. Treat the same as any Temporal-start
        // failure for P1.4 purposes.
        try {
          await removeChangeDir(legacy.paths.changes, created.data.id);
        } catch (rollbackErr) {
          // Rollback itself failed (disk unmounted, permissions, etc).
          // Log but don't mask the original Temporal error.
          logger.error(
            `P1.4 rollback failed for change '${created.data.id}' after Temporal-start error: ${
              rollbackErr instanceof Error
                ? rollbackErr.message
                : String(rollbackErr)
            }. Manual cleanup of the change directory may be required.`,
          );
        }
        throw err;
      }

      const changeWithOwner: Change = {
        ...created.data,
        adv_project_id: input.projectId,
        // rq-autoManageAdvWorktrees AC3 — stamp the disk projection so the
        // first read sees the marker even before the workflow signal-
        // handler projection writes it back. Sticky on the workflow side
        // via applyWorktreeAutoManagedToState.
        worktree_auto_managed: true,
        // rq-creationRequestHash01: persist hash on the disk projection so
        // disk-first readers (legacy fallback, archive bundle hydration)
        // can reconcile without a workflow query round-trip.
        creation_request_hash: creationRequestHash,
        same_project_dependencies:
          initialMetadata?.same_project_dependencies ??
          created.data.same_project_dependencies ??
          [],
      };
      try {
        await legacy.changes.save(changeWithOwner);
      } catch (err) {
        // Best-effort: disk save failure for owner metadata MUST NOT
        // cascade as a creation failure.
        logger.warn(
          `Owner metadata disk save failed for change ${created.data.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      updateOverlay(created.data.id, {
        created_at: created.data.created_at,
        created_by: created.data.created_by,
        deltas: created.data.deltas,
        validation: created.data.validation,
        github_issues: created.data.github_issues,
        clarify_findings: created.data.clarify_findings,
        cross_project_origin: created.data.cross_project_origin,
        fast_follow_of: created.data.fast_follow_of,
        origin: created.data.origin,
        scope_repos: created.data.scope_repos,
        adv_project_id: input.projectId,
        // rq-autoManageAdvWorktrees AC3 — surface the marker on the Memo
        // overlay so lightweight summary reads observe it without a
        // workflow query round-trip.
        worktree_auto_managed: true,
      });

      // KD-3 + KD-4: sequential await fan-out of content signals so the
      // workflow's state.documents becomes the source of truth for artifact
      // content. Order is deterministic; each await blocks until server
      // acknowledgement of the prior signal. Undefined fields fire no
      // signal (no-op). The metadata-update signal fires AFTER each content
      // signal to keep state.artifacts[kind].contentHash consistent.
      //
      // Only fires for actually-defined fields. Metadata is source-tagged as
      // Temporal-only and deliberately carries no path; the legacy scaffold may
      // create placeholder files, but active artifact content lives in
      // state.documents.

      if (Object.values(artifacts).some((v) => v !== undefined)) {
        const updatedAt = new Date().toISOString();
        const parentOperationId = fallbackOperationId("createArtifacts", {
          changeId: created.data!.id,
          artifacts,
        });
        const state = await fireContentArtifactCommands(
          deps,
          created.data!.id,
          artifacts,
          parentOperationId,
          updatedAt,
        );
        setCachedChange(state);
        emitChangeSummarySignal(created.data!.id, state);
      }

      return result;
    },
    save: async (change) => {
      // Invalidate cached change before save to prevent stale status from
      // being served by projection readers. Without this, archive operations
      // (which set status="archived" then save) leave a zombie entry in the
      // cache, causing routine reads to show archived changes as still active.
      invalidateChange(change.id);

      if (change.status === "archived") {
        // SC4 + SC6 — archive is a terminal-state mutation. The signal
        // guard raises `TemporalMutationIneligibleError` for SC4 classes;
        // the post-signal readback classifies as
        // `outcome_unknown_readback_unavailable` if it fails after the
        // signal ACK. Either failure surfaces a typed error rather than
        // silently authorizing the disk write below.
        const hasAcceptedDeltas = Object.values(change.deltas).some(
          (deltas) => deltas.length > 0,
        );
        if (hasAcceptedDeltas && !change.archive_projection_proof) {
          throw new Error(
            `changes.save(${change.id}, archived): accepted deltas require archive_projection_proof before terminal state.`,
          );
        }

        const releaseGateDone = change.gates?.release?.status === "done";
        const phase9Done = change.phase9_status?.status === "done";
        const useArchiveConverged = releaseGateDone && phase9Done;

        const requestedAt =
          change.archive_projection_proof?.verified_at ??
          new Date().toISOString();
        const approvalEvidence =
          change.gates?.release?.approval_evidence ??
          "Archive projection proof verified before terminal state";

        let outcome: import("../../temporal/mutation-safety").TemporalMutationOutcome;
        if (useArchiveConverged) {
          const releaseCompletion: GateCompletedSignalPayload = {
            gateId: "release",
            completedAt: change.gates!.release!.completed_at ?? requestedAt,
            completedBy: change.gates!.release!.completed_by ?? "adv-archive",
            approvalEvidence,
            artifactEvidence: change.gates!.release!.artifact_evidence,
          };
          const payload: ArchiveConvergedSignalPayload = {
            requestedAt,
            requestedBy: "archive-projection-reconciler",
            approvalEvidence,
            releaseCompletion,
            phase9Status: change.phase9_status as Phase9FinalizationStatus,
            projectionProof: change.archive_projection_proof,
          };
          outcome = await fireSignalWithMutationGuard(
            input,
            change.id,
            archiveConvergedSignal,
            [payload],
          );
        } else {
          outcome = change.archive_projection_proof
            ? await fireSignalWithMutationGuard(
                input,
                change.id,
                archiveRequestedSignal,
                [
                  {
                    approvalEvidence,
                    requestedBy: "archive-projection-reconciler",
                    requestedAt,
                    projectionProof: change.archive_projection_proof,
                  },
                ],
              )
            : await fireSignalWithMutationGuard(
                input,
                change.id,
                archiveChangeSignal,
                [],
              );
        }
        if (outcome === "outcome_unknown_readback_unavailable") {
          throw new Error(
            `changes.save(${change.id}, archived): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
          );
        }
        const owner = getTemporalOwner(input);
        const handle = await getGuardedChangeHandle(input, change.id);
        const ctx = makeTemporalOperationContext(
          input.projectId,
          buildChangeWorkflowId(input.projectId, change.id),
          "query",
          "archiveReadback",
          5_000,
        );
        const queryOutcome = await runTemporal(async () =>
          owner.query(ctx, handle, changeStateQuery),
        );
        if (queryOutcome.kind !== "complete") {
          throw (
            queryOutcome.error ?? new Error("archive readback query incomplete")
          );
        }
        const result =
          queryOutcome.value as import("../../temporal/contracts").ChangeWorkflowState;
        indexTasksFromState(result);
        updateOverlay(change.id, { status: "archived" });
        setCachedChange(result);
        emitChangeSummarySignal(change.id, result);
        return;
      }

      await legacy.changes.save(change);
      if (
        change.cross_project_links !== undefined ||
        change.external_dependencies !== undefined
      ) {
        // SC4-guarded signal: SC4 mutation-ineligible classes raise
        // `TemporalMutationIneligibleError`; not_found / poisoned_history
        // pass through to surface the original error.
        await fireGuardedSignal(
          input,
          change.id,
          crossProjectCoordinationUpdatedSignal,
          {
            ...(change.cross_project_links !== undefined
              ? { cross_project_links: change.cross_project_links }
              : {}),
            ...(change.external_dependencies !== undefined
              ? { external_dependencies: change.external_dependencies }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        );
      }
      updateOverlay(change.id, {
        title: change.title,
        status: change.status,
        created_at: change.created_at,
        created_by: change.created_by,
        deltas: change.deltas,
        validation: change.validation,
        github_issues: change.github_issues,
        closure: change.closure,
        clarify_findings: change.clarify_findings,
        reentry_history: change.reentry_history,
        cross_project_origin: change.cross_project_origin,
        cross_project_links: change.cross_project_links,
        external_dependencies: change.external_dependencies,
        fast_follow_of: change.fast_follow_of,
        origin: change.origin,
        scope_repos: change.scope_repos,
        adv_project_id: change.adv_project_id,
      });
    },
    list: async (filter) => {
      const projection = await readProjectionChangeList(
        filter,
        {
          changesDir: legacy.paths.changes,
          summariesDir: legacy.paths.summariesDir,
        },
        deps,
        {
          // list() historically applies case-insensitive prefix matching.
          caseInsensitivePrefix: true,
          // list() always sorts by created_at desc regardless of filter.sort.
          forceSort: "default",
          // list() does not paginate today.
          paginate: false,
          // Active list output still uses archive bundles to dominate stale
          // active projections; routine status summaries do not need this.
          loadArchiveForActiveShadow: true,
        },
      );
      const { changes, warnings, hydrationStats } = projection;
      return {
        changes,
        ...(warnings ? { warnings } : {}),
        ...(hydrationStats ? { hydrationStats } : {}),
      };
    },
    get: async (
      changeId: string,
      _opts?: { context?: TemporalReadContext },
    ) => {
      // Routine show/get is deliberately distinct from command/preflight
      // getTemporalChange: absence or corruption of a projection must never
      // obtain a workflow handle or trigger orphan hydration.
      const result = snapshotToLoadResult(await readChangeSnapshot(changeId));
      // Surface a poisoned-workflow marker on routine reads so callers
      // (e.g. adv_change_show) can report it without ever touching Temporal.
      if (result.success && result.data) {
        if (isPoisonedWorkflowForChange(deps.input.projectId, changeId)) {
          (result.data as Change & { _poisoned?: true })._poisoned = true;
        }
      }
      // Schema errors are not recoverable through a workflow round-trip;
      // surface them verbatim so callers do not mistake corruption for
      // "not found" or a generic Temporal failure.
      if (!result.success && result.type === "schema_error") {
        throw new Error(result.error);
      }
      return result;
    },
    refresh: async (changeId: string): Promise<void> => {
      // R1 follow-on: tool-layer code paths that mutate workflow state
      // via direct fireSignal() (notably adv_gate_complete) bypass the
      // store's own mutation methods and would otherwise leave stale
      // data in changeCache. After firing the signal those tools call
      // store.changes.refresh(changeId) to drop the stale entry and
      // re-populate the cache with fresh workflow state. Best-effort:
      // a refresh failure is logged but never thrown — the workflow
      // signal has already succeeded by the time we get here.
      invalidateChange(changeId);
      await dualWriteAfterMutation(changeId);
    },
    invalidate: async (changeId: string): Promise<void> => {
      // #305: after a direct signal has been confirmed by polling, drop the
      // cache entry only. A full refresh readback can race with the workflow's
      // signal-processing loop and return a pre-signal snapshot, which
      // dualWriteAfterMutation would classify as "confirmed" and re-cache.
      // invalidate avoids that re-poisoning; the next read misses cache and
      // queries the workflow fresh.
      invalidateChange(changeId);
    },
    setEpicMembership: async (
      changeId,
      { membership, expectedCurrent, setAt },
    ) => {
      const recordedAt = setAt ?? new Date().toISOString();
      invalidateChange(changeId);
      const commandKind = "epicMembershipSet";
      const payload = {
        membership,
        ...(expectedCurrent ? { expectedCurrent } : {}),
        setAt: recordedAt,
      };
      const { operationId, payloadHash } = buildChangeCommandIdentity(
        commandKind,
        payload,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: epicMembershipSetSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `changes.setEpicMembership(${changeId})`,
      );
      indexTasksFromState(state);
      updateOverlay(changeId, { epic_membership: state.epic_membership });
      return state as unknown as Change;
    },
    clearEpicMembership: async (changeId, { expected, clearedAt }) => {
      const recordedAt = clearedAt ?? new Date().toISOString();
      invalidateChange(changeId);
      const commandKind = "epicMembershipCleared";
      const payload = {
        expected,
        clearedAt: recordedAt,
      };
      const { operationId, payloadHash } = buildChangeCommandIdentity(
        commandKind,
        payload,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: epicMembershipClearedSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `changes.clearEpicMembership(${changeId})`,
      );
      indexTasksFromState(state);
      updateOverlay(changeId, { epic_membership: state.epic_membership });
      return state as unknown as Change;
    },
    setReleaseNotes: async (changeId, { release_notes, setAt }) => {
      const recordedAt = setAt ?? new Date().toISOString();
      invalidateChange(changeId);
      const commandKind = "releaseNotesSet";
      const payload = { release_notes, set_at: recordedAt };
      const { operationId, payloadHash } = buildChangeCommandIdentity(
        commandKind,
        payload,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: releaseNotesSetSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `changes.setReleaseNotes(${changeId})`,
      );
      indexTasksFromState(state);
      updateOverlay(changeId, { release_notes: state.release_notes });
      return state as unknown as Change;
    },
    close: async (changeId: string, closure: ChangeClosure) => {
      // AC5: host preflight is advisory only. It loads the current change so we
      // can give a clear UX refusal for already-terminal targets and so the
      // caller can distinguish not-found from ineligible, but the workflow
      // reducer is the sole authority for the lifecycle transition.
      const current = await getTemporalChange(changeId);
      if (!current.success || !current.data) {
        throw new Error(
          current.success === false
            ? current.error
            : `Change ${changeId} not found`,
        );
      }
      if (
        current.data.lifecycleState === "closed" ||
        current.data.lifecycleState === "archived" ||
        current.data.status === "closed" ||
        current.data.status === "archived"
      ) {
        throw new Error(
          `Change ${changeId} is already ${current.data.lifecycleState ?? current.data.status}; close rejected.`,
        );
      }

      invalidateChange(changeId);

      const commandKind = "closeChange";
      const payload = { ...closure };
      const operationId =
        closure.operation_id ?? fallbackOperationId(commandKind, payload);
      const payloadHash =
        closure.payload_hash ?? computeHostCommandPayloadHash(payload);
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: closeChangeSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const result = unwrapCommandOutcome(
        outcome,
        `changes.close(${changeId})`,
      );

      // Confirm the reducer outcome before returning. A rejected close leaves
      // the change in its open state; it must not be promoted to a durable
      // closed projection.
      if (result.status !== "closed" || result.lifecycleState !== "closed") {
        throw new Error(
          `changes.close(${changeId}): reducer did not transition to closed (status=${result.status}, lifecycleState=${result.lifecycleState})`,
        );
      }

      indexTasksFromState(result);
      updateOverlay(changeId, { status: "closed", closure: result.closure });
      return result as unknown as Change;
    },

    closeBatch: async (
      changeIds: string[],
      closure: ChangeClosure,
    ): Promise<BulkCloseResult> => {
      if (changeIds.length === 0) {
        return {
          success: true,
          closed: 0,
          results: [],
          message: "No changes to close.",
        };
      }

      const canonicalIds = canonicalizeBatchCloseTargetIds(changeIds);
      const batch_id = `batch-close-${computeBatchCloseRequestHash(canonicalIds, closure)}`;
      const recordPath = getBatchOperationRecordPath(legacy, batch_id);

      await mkdir(dirname(recordPath), { recursive: true });
      const releaseLock = await acquireFileLock(recordPath);
      try {
        const loaded = await loadBatchCloseOperation(legacy, batch_id);
        if (loaded && !loaded.valid) {
          return {
            success: false,
            closed: 0,
            results: canonicalIds.map((changeId) => ({
              changeId,
              success: false,
              error: `Batch operation record is corrupt or unreadable: ${loaded.error}`,
            })),
            message: `Batch ${batch_id} operation record is corrupt or unreadable; manual repair required.`,
          };
        }

        const coordinationDeps = createBatchCloseCoordinationDeps(
          input,
          legacy,
          getTemporalChange,
          loaded?.operation,
        );

        const outcome = await coordinateBatchClose(coordinationDeps, {
          batch_id,
          target_ids: canonicalIds,
          closure,
        });

        // Persist the canonical disk projection only for targets the reducer
        // confirmed as closed. Coordinator record is already durable.
        if (outcome.kind === "committed_all") {
          for (const changeId of canonicalIds) {
            const record = outcome.operation.per_target[changeId];
            if (record?.phase !== "committed") continue;
            const owner = getTemporalOwner(input);
            const handle = await getGuardedChangeHandle(input, changeId);
            const ctx = makeTemporalOperationContext(
              input.projectId,
              buildChangeWorkflowId(input.projectId, changeId),
              "query",
              "batchCloseReadback",
              5_000,
            );
            const result = await runTemporal(async () =>
              owner.query(ctx, handle, changeStateQuery),
            );
            if (result.kind !== "complete") {
              throw (
                result.error ?? new Error("batch close readback incomplete")
              );
            }
            const state = result.value as ChangeWorkflowState;
            indexTasksFromState(state);
            updateOverlay(changeId, {
              status: "closed",
              closure: state.closure,
            });
            setCachedChange(state);
            emitChangeSummarySignal(changeId, state);
            await persistStateToDiskDurable(changeId, state);
          }
        }

        return mapBatchCloseOutcome(outcome, changeIds);
      } finally {
        await releaseLock();
      }
    },
    updateArtifacts: async (changeId, artifacts) => {
      // Layer 1 size validation (KD-8 layer 1). Fail fast before any disk
      // write or signal fires. Aggregate cap considers existing state.documents
      // when present so a sequence of updates can't push the total past the
      // 1.8 MB continueAsNew ceiling.
      for (const kind of [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ] as const) {
        const content = artifacts[kind];
        if (content !== undefined) validatePerArtifactSize(kind, content);
      }
      // Best-effort existing state lookup for aggregate cap projection;
      // skip if state not yet available (workflow not running, etc.).
      let existingDocuments: Partial<Record<ArtifactKind, string | undefined>> =
        {};
      try {
        const snapshot = await getTemporalChange(changeId);
        // `getTemporalChange` returns a `LoadResult` (`{ success, data }`).
        // The documents live on `.data`, never on the wrapper — read through
        // the success branch so the aggregate cap projection sees the real
        // persisted documents (QUAL-002).
        if (isSchemaError(snapshot)) {
          throw new Error(snapshot.error);
        }
        if (snapshot.success && snapshot.data) {
          existingDocuments =
            (snapshot.data.documents as typeof existingDocuments) ?? {};
        }
      } catch {
        // Snapshot may be unavailable for in-flight workflows or test
        // fixtures; aggregate cap then computes against the proposed payload
        // alone, which is a conservative undercount but safe.
      }
      validateAggregateSize(artifacts, existingDocuments);

      const hasArtifactContent = ARTIFACT_SIGNAL_ORDER.some(
        ({ kind }) => artifacts[kind] !== undefined,
      );
      if (!hasArtifactContent) {
        // Preserve the legacy no-op contract for an empty patch: no workflow
        // command, projection write, cache invalidation, or synthetic error.
        return { success: true };
      }

      // T15 / AC8 + rq-artifactPathTruth01: no artifact-content disk writes
      // from the temporal store production path, and no synthesized artifact
      // paths. Active content is stored in state.documents; metadata records
      // source/readability instead of fake filesystem locations.

      // KD-3 + KD-4: sequential await fan-out of content commands. Each
      // defined artifact gets a stable operation id derived from a caller-
      // stable parent id; the changeCommand primitive confirms the ledger
      // outcome and commits the disk projection + summary shard.
      const updatedAt = new Date().toISOString();
      const parentOperationId = fallbackOperationId("updateArtifacts", {
        changeId,
        artifacts,
      });
      const state = await fireContentArtifactCommands(
        deps,
        changeId,
        artifacts,
        parentOperationId,
        updatedAt,
        true,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);

      // Compose result shape matching the legacy contract. Temporal-only
      // updates do not write artifact files, so no path fields are returned.
      const result: {
        success: true;
        proposalPath?: string;
        problemStatementPath?: string;
        agreementPath?: string;
        designPath?: string;
        executiveSummaryPath?: string;
      } = { success: true };

      // AC9 (completeStateBackedGate): invalidate the change cache after the
      // content-signal fan-out, matching save/close/refresh/bulk-close. Without
      // this, a store.changes.get(changeId) immediately following
      // adv_change_update returns stale cached state.documents/state.artifacts
      // content — the confirmed root cause of the stale-contract symptom (a
      // re-mint was required after adv_change_update because changeCache held
      // pre-update content).
      invalidateChange(changeId);
      return result;
    },

    // rq-changeSummaryReadModel01: lightweight summary list for default
    // warm paths. Uses `ChangeSummaryMemo` and `changeCache` to avoid
    // per-change full hydration when summary data already satisfies the
    // response contract; falls back to authoritative hydration for IDs
    // that have no summary proof.
    //
    // rq-activeListFastPath01: default active/in-flight callers stay on
    // this summary/memo/cache path. Terminal reconciliation is only
    // invoked when the filter explicitly asks for archived/closed rows
    // or when content filters require full state.
    //
    // rq-readCacheAdvisory01: the memo/summary/cache fast path is advisory,
    // never the primary list/status truth source for lifecycle/gate/task
    // state; warm rows served after deadline expiry stay degraded, and
    // completeness is never inferred from cache warmth or row count.
    listSummary: async (filter) => {
      const projection = await readProjectionChangeList(
        filter,
        {
          changesDir: legacy.paths.changes,
          summariesDir: legacy.paths.summariesDir,
        },
        deps,
        {
          // listSummary() keeps the historical case-sensitive prefix match.
          caseInsensitivePrefix: false,
          // Pagination is part of the summary API contract.
          paginate: true,
          // Summary API always carries hydration stats.
          includeHydrationStats: true,
          deadline: filter?.deadline,
          candidateLimit:
            filter?.limit === undefined
              ? undefined
              : Math.max(0, (filter.offset ?? 0) + filter.limit),
        },
      );
      const { changes, warnings, hydrationStats } = projection;
      return {
        changes,
        ...(warnings ? { warnings } : {}),
        ...(hydrationStats ? { hydrationStats } : {}),
        ...(projection.statusCounts
          ? { statusCounts: projection.statusCounts }
          : {}),
        ...(projection.boundedOmittedIds
          ? { boundedOmittedIds: projection.boundedOmittedIds }
          : {}),
      };
    },
    /**
     * rq-archiveInventoryActive01: active-only, fixed-8s, fail-closed conflict
     * authority. Membership comes only from Visibility
     * (`AdvLifecycleState="open" AND ExecutionStatus="Running"`); facts come
     * from the durable active projection (disk `change.json`) or a capped
     * workflow fallback. Terminal history, archive bundles, cache, and memo
     * cannot establish completeness.
     */
    listConflictAuthority: async (options) => {
      const deadline = options?.deadline ?? createTemporalReadDeadline();
      const expired = (): boolean => remainingDeadlineMs(deadline) <= 0;
      const warnings: string[] = [];
      const startMs = Date.now();
      let visibilitySucceeded = false;

      let visibilityIds: string[] = [];
      try {
        const owner = getTemporalOwner(input);
        const listCtx = makeTemporalOperationContext(
          input.projectId,
          "conflict-authority-list",
          "list",
          "listConflictAuthority",
          5_000,
        );
        const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${input.projectId}/`;
        const query = buildVisibilityQuery({ projectId: input.projectId });
        visibilityIds = await raceWithTemporalDeadline(
          (async () => {
            const ids: string[] = [];
            const outcome = await owner.list<{ workflowId: string }>(
              listCtx,
              query,
            );
            if (outcome.kind !== "complete") {
              throw new TemporalListOutcomeError(outcome);
            }
            for (const wf of outcome.value) {
              const wfid = wf.workflowId;
              if (!wfid.startsWith(projectPrefix)) continue;
              const changeId = wfid.slice(projectPrefix.length);
              if (changeId.length === 0) continue;
              ids.push(changeId);
            }
            return ids;
          })(),
          deadline,
        );
        visibilitySucceeded = true;
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        warnings.push(
          `Visibility active enumeration ${hitDeadline ? "exceeded the aggregate read deadline" : "failed"}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const activeIds = Array.from(new Set(visibilityIds)).sort((a, b) =>
        a.localeCompare(b),
      );

      type FactRow = {
        id: string;
        title: string;
        status: string;
        capabilities: string[];
        epic_membership?: Change["epic_membership"];
        fast_follow_of?: Change["fast_follow_of"];
      };
      const active: FactRow[] = [];
      let omittedCount = 0;
      let shadowCount = 0;

      type LoadActiveResult =
        | { kind: "fact"; fact: FactRow }
        | { kind: "shadow" }
        | { kind: "fail"; warning: string };

      const loadActiveFact = async (
        changeId: string,
      ): Promise<LoadActiveResult> => {
        // Durable active projection: read disk changes/<id>/change.json
        // directly. We deliberately avoid `legacy.changes.get` because it
        // performs archive-bundle dominance/self-heal reads for the general
        // listing path. The authority performs no unbounded archive scans:
        // terminal-shadow reconciliation uses only the active durable record;
        // archive bundles never participate in conflict authority.
        let diskResult: Awaited<ReturnType<typeof loadChange>> | undefined;
        let terminalProjection = false;
        try {
          diskResult = await raceWithTemporalDeadline(
            loadChange(legacy.paths.changes, changeId),
            deadline,
          );
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          return {
            kind: "fail",
            warning: `Active fact load for ${changeId} failed${hitDeadline ? " (deadline)" : ""}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        if (diskResult && isSchemaError(diskResult)) {
          // A schema-invalid peer is an omitted candidate, not an authority
          // outage. Failing the whole read here would let one malformed
          // record block conflict detection — and therefore archive — for
          // every other change in the project.
          return {
            kind: "fail",
            warning: `Active candidate ${changeId} has a schema-invalid durable projection; omitted from active authority: ${diskResult.error}`,
          };
        }
        if (diskResult?.success && diskResult.data) {
          const data = diskResult.data;
          if (data.id !== changeId) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} durable projection has mismatched id (${data.id}); cannot establish active authority.`,
            };
          }

          // Terminal-shadow reconciliation (rq-terminalAwareTruth01): a
          // Visibility-proven active ID with a terminal durable projection is a
          // stale shadow. If the terminal record can be confirmed, exclude it
          // from active membership without making the authority incomplete.
          if (data.status === "archived" || data.status === "closed") {
            // Visibility and the durable projection disagree. Confirm terminal
            // state through the already-authoritative active workflow fallback,
            // never through non-authoritative archive history.
            terminalProjection = true;
          } else {
            return {
              kind: "fact",
              fact: {
                id: data.id,
                title: data.title,
                status: data.status,
                capabilities: Object.keys(data.deltas ?? {}),
                epic_membership: data.epic_membership,
                fast_follow_of: data.fast_follow_of,
              },
            };
          }
        }

        // Optional workflow fallback: capped at min(1,000ms, remaining budget).
        try {
          const remaining = remainingDeadlineMs(deadline);
          if (remaining <= 0) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} has no durable projection and the aggregate deadline is exhausted; cannot establish active authority.`,
            };
          }
          const fallbackBudget = Math.min(1_000, Math.max(0, remaining));
          const fallbackDeadline = {
            budgetMs: fallbackBudget,
            deadlineAt: Date.now() + fallbackBudget,
          };
          const owner = getTemporalOwner(input);
          const handle = getChangeHandle(input, changeId);
          const ctx = makeTemporalOperationContext(
            input.projectId,
            buildChangeWorkflowId(input.projectId, changeId),
            "query",
            "conflictAuthorityFallback",
            fallbackBudget,
          );
          const outcome = await runTemporalQuery(
            async () => owner.query(ctx, handle, changeStateQuery),
            { deadline: fallbackDeadline },
          );
          if (outcome.kind !== "complete") {
            throw (
              outcome.error ??
              new Error("conflict authority fallback query incomplete")
            );
          }
          const state = outcome.value as ChangeWorkflowState;

          if (state.changeId !== changeId) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} workflow fallback returned mismatched id (${state.changeId}); cannot establish active authority.`,
            };
          }
          if (state.status === "archived" || state.status === "closed") {
            if (terminalProjection) {
              return { kind: "shadow" };
            }
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} workflow fallback returned terminal status (${state.status}); cannot establish active authority.`,
            };
          }

          if (terminalProjection) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} has a terminal durable projection but workflow fallback returned active status (${state.status}); cannot establish active authority.`,
            };
          }

          return {
            kind: "fact",
            fact: {
              id: state.changeId,
              title: state.title,
              status: state.status,
              capabilities: Object.keys(state.deltas ?? {}),
              epic_membership: (
                state as { epic_membership?: Change["epic_membership"] }
              ).epic_membership,
              fast_follow_of: state.fast_follow_of,
            },
          };
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          return {
            kind: "fail",
            warning: `Active candidate ${changeId} workflow fallback failed${hitDeadline ? " (deadline)" : ""}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      };

      const FACT_LOAD_CONCURRENCY = 4;
      const loadConcurrency = Math.max(
        1,
        Math.min(32, Math.floor(options?.concurrency ?? FACT_LOAD_CONCURRENCY)),
      );
      for (let i = 0; i < activeIds.length; i += loadConcurrency) {
        if (expired()) {
          const remaining = activeIds.slice(i);
          warnings.push(
            `Aggregate deadline expired before all active candidates could be loaded; omitted ${remaining.length} candidate(s).`,
          );
          omittedCount += remaining.length;
          break;
        }
        const batch = activeIds.slice(i, i + loadConcurrency);
        const loaded = await Promise.all(batch.map(loadActiveFact));
        for (const item of loaded) {
          if (item.kind === "fact") {
            active.push(item.fact);
          } else if (item.kind === "shadow") {
            shadowCount += 1;
          } else {
            warnings.push(item.warning);
            omittedCount += 1;
          }
        }
      }

      active.sort((a, b) => a.id.localeCompare(b.id));

      const completeness: ChangeConflictAuthority["completeness"] =
        warnings.length === 0 && omittedCount === 0 ? "complete" : "incomplete";

      const authorityDiagnostics: AuthorityDiagnostics = visibilitySucceeded
        ? {
            source: "active-conflict-authority",
            activeCandidateCount: activeIds.length,
            omittedCount,
            shadowCount,
            elapsedMs: Date.now() - startMs,
          }
        : {
            source: "active-conflict-authority",
            activeCandidateCount: null,
            omittedCount: null,
            shadowCount: null,
            elapsedMs: Date.now() - startMs,
          };

      return {
        active,
        completeness,
        canConcludeClean: completeness === "complete",
        warnings,
        source: "active-conflict-authority",
        authorityDiagnostics,
        candidateCount: activeIds.length,
        omittedCount,
        shadowCount,
      };
    },
  };
}
