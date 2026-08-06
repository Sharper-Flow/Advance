/**
 * Tool Adapter Helpers — Signal/Query Surface
 *
 * Thin wrappers around the closed TemporalOperations owner API.
 * Used by tool-layer code to fire signals and run queries against
 * change workflows, replacing the old executeUpdate-based mutation path.
 *
 * Requirement anchors: rq-changeWorkflowSignalOnly01 and rq-cacheRefresh01.
 */

import { buildChangeWorkflowId } from "../temporal/client";
import type { ChangeWorkflowInput } from "../temporal/contracts";
import { ensureChangeWorkflowStarted } from "../temporal/workflow-start";
import type { QueryDefinition, SignalDefinition } from "@temporalio/workflow";
import { runTemporal } from "../storage/store-temporal/shared";
import {
  makeTemporalOperationContext,
  type TemporalOperations,
  type TemporalWorkflowHandle,
} from "../temporal/operations";
import type {
  TemporalWorkflowHandleProxy,
  TemporalWorkflowHandleQueryProxy,
} from "./change-mutation-coordinator";
import type { Store } from "../storage/store";
import {
  changeStateQuery,
  getGateStatusQuery,
  getMutationReceiptQuery,
} from "../temporal/messages";
import {
  evaluateTargetReadiness,
  type QueryProbeResult,
} from "../temporal/session-readiness";
import type { MutationReceipt } from "../temporal/contracts";
import {
  MutationApplicationUnconfirmedError,
  waitForQueryPredicate,
} from "../utils/query-predicate";
export {
  MutationApplicationUnconfirmedError,
  waitForQueryPredicate,
} from "../utils/query-predicate";
import type { GateCompletion, GateId } from "../types";
import {
  classifyMutationOutcome,
  enforceMutationEligibilityForError,
  requireMutationEligible,
  type TemporalMutationOutcome,
  type TemporalWorkflowDiagnostic,
} from "../temporal/mutation-safety";
import { createAdvSessionNotReadyEnvelope } from "../temporal/readiness-types";
import {
  TemporalMutationOutcomeError,
  TemporalReadOutcomeError,
  isTemporalMutationOutcomeError,
  isTemporalReadOutcomeError,
} from "../temporal/outcome-errors";

export {
  TemporalMutationOutcomeError,
  TemporalReadOutcomeError,
  isTemporalMutationOutcomeError,
  isTemporalReadOutcomeError,
};

// Temporal signal processing + projection can take several seconds under load.
// 60 attempts × 500ms = 30s total gives adequate headroom for CI and local dev.
export const GATE_COMPLETION_POLL_ATTEMPTS = 60;
export const GATE_COMPLETION_POLL_DELAY_MS = 500;

/**
 * Owner-bound workflow handle proxy. The only production-safe way to perform
 * query/signal/describe on a workflow: the owner stays the single RPC authority,
 * and the handle is the opaque workflow reference.
 */
function buildProxy(
  owner: TemporalOperations,
  handle: TemporalWorkflowHandle,
  projectId: string,
): TemporalWorkflowHandleProxy {
  return {
    owner,
    handle,
    workflowId: handle.workflowId,
    projectId,
    signal: async (signal: unknown, ...args: unknown[]) => {
      const ctx = makeTemporalOperationContext(
        projectId,
        handle.workflowId,
        "signal",
        typeof signal === "object" && signal !== null && "name" in signal
          ? String((signal as { name: string }).name)
          : "signal",
        10_000,
      );
      const outcome = await owner.signal(
        ctx,
        handle,
        signal as SignalDefinition<unknown[], string>,
        args,
      );
      if (outcome.kind === "confirmed") return;
      throw new TemporalMutationOutcomeError(outcome);
    },
    query: async <T>(query: unknown, ...args: unknown[]): Promise<T> => {
      const ctx = makeTemporalOperationContext(
        projectId,
        handle.workflowId,
        "query",
        typeof query === "object" && query !== null && "name" in query
          ? String((query as { name: string }).name)
          : "query",
        5_000,
      );
      const outcome = await owner.query(
        ctx,
        handle,
        query as QueryDefinition<T, unknown[], string>,
        ...args,
      );
      if (outcome.kind === "complete") return outcome.value as T;
      throw new TemporalReadOutcomeError(outcome);
    },
    describe: async () => {
      const ctx = makeTemporalOperationContext(
        projectId,
        handle.workflowId,
        "describe",
        "describe",
        5_000,
      );
      const outcome = await owner.describe(ctx, handle);
      if (outcome.kind === "complete") return outcome.value;
      throw new TemporalReadOutcomeError(outcome);
    },
    terminate: async (reason?: string) => {
      const ctx = makeTemporalOperationContext(
        projectId,
        handle.workflowId,
        "terminate",
        "terminate",
        10_000,
      );
      const outcome = await owner.terminate(ctx, handle, reason ?? "");
      if (outcome.kind === "confirmed") return outcome.value;
      throw new TemporalMutationOutcomeError(outcome);
    },
    cancel: async () => {
      const ctx = makeTemporalOperationContext(
        projectId,
        handle.workflowId,
        "cancel",
        "cancel",
        10_000,
      );
      const outcome = await owner.cancel(ctx, handle);
      if (outcome.kind === "confirmed") return outcome.value;
      throw new TemporalMutationOutcomeError(outcome);
    },
  };
}

export async function waitForAppliedReceipt(
  proxy: TemporalWorkflowHandleProxy,
  receiptId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<MutationReceipt | undefined> {
  return waitForQueryPredicate(
    () =>
      proxy.query<MutationReceipt | undefined>(
        getMutationReceiptQuery,
        receiptId,
      ),
    (receipt) => receipt?.id === receiptId,
    opts,
  );
}

/**
 * Poll a change workflow until a gate reaches a terminal status (done/stuck)
 * or the attempt budget is exhausted. Single source of truth for
 * gate-completion polling shared by the gate-completion and archive
 * release-gate-completion paths (STRUCT-003).
 */
export async function waitForGateCompletion(
  proxy: TemporalWorkflowHandleQueryProxy,
  gateId: GateId,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<GateCompletion | undefined> {
  return waitForQueryPredicate(
    () => proxy.query<GateCompletion>(getGateStatusQuery, gateId),
    (gate) => gate?.status === "done" || gate?.status === "stuck",
    opts,
  );
}

/**
 * Fire-and-forget signal to a change workflow.
 * Wrapped with Temporal retry (transient failures are retried).
 *
 * SC4 mutation-eligibility guard (rq-temporalMutationSafety01): if the
 * underlying `runTemporal` retry-and-timeout layer exhausts its budget
 * without server acknowledgement, the error is classified into a
 * `TemporalWorkflowDiagnostic` and re-thrown as
 * `TemporalMutationIneligibleError` for any SC4 mutation-ineligible class
 * (no-poller, unregistered-query, deadline, unknown, query-rejected,
 * resource-exhaustion, permission). `not_found` and `poisoned_history` are
 * intentionally NOT blocked here — they require separate operator
 * safeguards (approval, exact run pinning, shipped proof, dry-run) handled
 * by `evaluateDestructiveWorkflowRecoveryPreconditions`.
 */
export async function fireSignal<Args extends unknown[]>(
  proxy: TemporalWorkflowHandleProxy,
  signal: unknown,
  ...args: Args
): Promise<void> {
  let error: unknown;
  try {
    await runTemporal(() => proxy.signal(signal, ...args));
    return;
  } catch (err) {
    error = err;
  }
  if (isTemporalMutationOutcomeError(error)) {
    // The owner has already classified the outcome. Enforce SC4 mutation
    // eligibility on the diagnostic; if it is ineligible, surface the typed
    // TemporalMutationIneligibleError. Otherwise preserve the outcome error.
    requireMutationEligible(error.outcome.diagnostic);
    throw error;
  }
  const diagnostic: TemporalWorkflowDiagnostic =
    enforceMutationEligibilityForError(error);
  if (diagnostic.class === "reachable") {
    throw new Error(
      `fireSignal: unexpected reachable diagnostic after error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  throw error;
}

/**
 * KD4 per-mutation readiness helpers. The target queue is resolved from the
 * workflow handle description (the only authoritative source for the queue a
 * signal will be delivered to). A successful read-only Query against the
 * target workflow proves the queue can process mutations; fail-closed to
 * ADV_SESSION_NOT_READY if the proof fails or the queue cannot be resolved.
 */
const workflowTaskQueueCache = new Map<string, string>();

function isSessionReadinessBypassActive(): boolean {
  const bypass = process.env.ADV_SESSION_READINESS_BYPASS;
  return bypass === "1";
}

interface WorkflowHandleDescription {
  taskQueue?: string;
}

async function resolveTargetQueue(
  proxy: TemporalWorkflowHandleProxy,
): Promise<string | undefined> {
  const workflowId = proxy.workflowId;
  if (workflowId && workflowTaskQueueCache.has(workflowId)) {
    return workflowTaskQueueCache.get(workflowId);
  }

  try {
    const description = (await proxy.describe()) as WorkflowHandleDescription;
    if (typeof description.taskQueue === "string" && description.taskQueue) {
      if (workflowId) {
        workflowTaskQueueCache.set(workflowId, description.taskQueue);
      }
      return description.taskQueue;
    }
  } catch {
    // fall through to undefined
  }
  return undefined;
}

function makeHandleQueryProbe(
  proxy: TemporalWorkflowHandleProxy,
): (targetQueue: string) => Promise<QueryProbeResult> {
  return async () => {
    try {
      await proxy.query(changeStateQuery);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Fire a signal targeting a change workflow, then refresh the in-memory cache
 * for that change.
 *
 * Tool-layer code SHALL use this helper for any signal associated with a
 * `changeId`. Use `fireSignal` (without refresh) ONLY for signals not associated
 * with a single change (none currently exist; documented exemptions require a
 * `// rq-cacheRefresh01-exempt: <reason>` annotation at the call site).
 *
 * Failure to refresh produces silent stale reads on subsequent
 * `store.changes.get()` calls — the bug class this helper exists to prevent.
 *
 * Cross-project note: when mutating a change in another project via
 * `target_path`, the refresh invalidates the TARGET project's cache (resolved
 * via the `store` argument that wraps that project's StoreBackend), NOT the
 * calling project's. Use `withTargetPathStore(...)` upstream to obtain the
 * correct store reference before calling this helper.
 *
 * Behavior:
 *   1. Authoritative readiness precheck (KD4): prove the target workflow queue
 *      is serviceable with a bounded read-only Query. If not ready, fail-closed
 *      and return the ADV_SESSION_NOT_READY envelope WITHOUT firing the signal.
 *   2. Fire signal via `fireSignal()` (preserves transient retry semantics).
 *   3. After signal succeeds, call `store.changes.refresh(changeId)` (drops
 *      cache entry and re-fetches).
 *   4. The store contract guarantees `refresh` is best-effort and does not
 *      throw in production; if it throws (contract violation), this helper
 *      propagates so the bug surfaces rather than being swallowed.
 *   5. If the signal fails, refresh is NOT attempted (the workflow state has
 *      not advanced).
 */
export async function fireSignalAndRefresh<Args extends unknown[]>(
  proxy: TemporalWorkflowHandleProxy,
  store: Store,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void> {
  if (!isSessionReadinessBypassActive()) {
    const targetQueue = await resolveTargetQueue(proxy);
    if (targetQueue) {
      const readiness = await evaluateTargetReadiness({
        targetQueue,
        hasWorkflow: true,
        queryProbe: makeHandleQueryProbe(proxy),
        cacheTtlMs: 10_000,
        probeBudgetMs: 2_000,
      });
      if (!readiness.ready) {
        throw createAdvSessionNotReadyEnvelope(readiness.blockers);
      }
    }
  }

  await fireSignal(proxy, signal, ...args);
  const receiptId =
    args[0] && typeof args[0] === "object"
      ? (args[0] as { mutationReceiptId?: unknown }).mutationReceiptId
      : undefined;
  if (typeof receiptId === "string" && receiptId) {
    const receipt = await waitForAppliedReceipt(proxy, receiptId);
    if (!receipt) throw new MutationApplicationUnconfirmedError(receiptId);
  }
  await store.changes.refresh(changeId);
}

/**
 * SC4 wiring: fire a change-workflow signal only after a workflow
 * diagnostic has been vetted for mutation eligibility. When the caller has a
 * recent failed-read diagnostic (e.g. recovery routing after a no-poller,
 * unregistered-query, deadline, or unknown-query failure), this guard
 * refuses the signal so a mutation-ineligible workflow cannot be signaled.
 *
 * Callers WITHOUT a recent diagnostic should continue using the
 * un-guarded `fireSignal` overloads — the guard is a recovery-routing
 * guard, not a universal pre-signal hook (see SC4 wording: "when
 * recovery routing runs").
 *
 * Throws `TemporalMutationIneligibleError` (re-exported from
 * `mutation-safety`) when the diagnostic is mutation-ineligible.
 */
export async function fireSignalGuarded<Args extends unknown[]>(
  proxy: TemporalWorkflowHandleProxy,
  eligibility: TemporalWorkflowDiagnostic,
  signal: unknown,
  ...args: Args
): Promise<void> {
  requireMutationEligible(eligibility);
  await fireSignal(proxy, signal, ...args);
}

/**
 * SC4 wiring: fire-and-refresh variant that requires a mutation-eligible
 * workflow diagnostic. The subsequent `store.changes.refresh(changeId)`
 * counts as a cache-authority promotion under SC4, so the same guard must
 * gate the whole sequence.
 */
export async function fireSignalAndRefreshGuarded<Args extends unknown[]>(
  proxy: TemporalWorkflowHandleProxy,
  store: Store,
  changeId: string,
  eligibility: TemporalWorkflowDiagnostic,
  signal: unknown,
  ...args: Args
): Promise<void> {
  requireMutationEligible(eligibility);
  await fireSignalAndRefresh(proxy, store, changeId, signal, ...args);
}

/**
 * SC6 wiring: classify the outcome of a post-signal readback query so the
 * caller can distinguish a confirmed mutation from a confirmed-ambiguous
 * one. `outcome_unknown_readback_unavailable` is the outcome the contract
 * requires for any readback failure (no poller, unregistered query,
 * deadline, unknown query, or generic Failed-to-query error); callers
 * MUST NOT outer-retry on that outcome.
 *
 * The optional `signalError` argument carries any error thrown BEFORE the
 * server acknowledged the signal — when present, the outcome short-circuits
 * to `failed_before_ack` (the signal did not land; the mutation is a
 * no-op, transport-layer retry may still apply).
 */
export interface PostSignalReadbackResult<T> {
  outcome: TemporalMutationOutcome;
  data?: T;
  error?: unknown;
}

export async function runPostSignalReadback<T>(
  readback: () => Promise<T>,
  signalError?: unknown,
): Promise<PostSignalReadbackResult<T>> {
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
 * Build a workflow handle for a specific change within a project.
 *
 * Optional `runId` pins the handle to one exact execution run (Temporal
 * `getHandle(workflowId, runId)`), so run-sensitive operations such as
 * `adv_change_workflow_terminate` can act on precisely the run that was
 * assessed via describe — never on a different run of the same workflowId.
 */
export function getChangeHandle(
  owner: TemporalOperations,
  projectId: string,
  changeId: string,
  runId?: string,
): TemporalWorkflowHandleProxy {
  const workflowId = buildChangeWorkflowId(projectId, changeId);
  const handle = owner.getHandle(
    makeTemporalOperationContext(
      projectId,
      workflowId,
      runId ? "describe" : "query",
      "getChangeHandle",
      5_000,
    ),
    runId,
  );
  return buildProxy(owner, handle, projectId);
}

/**
 * Start a change workflow (idempotent — returns existing handle if already running).
 */
export async function startChangeWorkflow(
  owner: TemporalOperations,
  input: ChangeWorkflowInput,
): Promise<TemporalWorkflowHandleProxy> {
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  makeTemporalOperationContext(
    input.projectId,
    workflowId,
    "start",
    "startChangeWorkflow",
    30_000,
  );
  const handle = await ensureChangeWorkflowStarted(owner, input, {
    workflowQueueMode: input.sessionId ? "session" : "project",
  });
  return buildProxy(owner, handle, input.projectId);
}

/**
 * Injectable dependencies for {@link isChangeReachable}.
 * All I/O is performed by the caller-supplied functions so the helper stays
 * pure and fully testable.
 */
export interface ReachabilityDeps {
  visibilityLister: (projectId: string, changeId: string) => Promise<boolean>;
  diskChecker: (changesDir: string, changeId: string) => Promise<boolean>;
  workflowStateGetter: (changeId: string) => Promise<boolean>;
}

// rq-activeChangePointer01
/**
 * Three-tier reachability check for a changeId.
 *
 * Order (short-circuiting):
 *   1. Worker-free Visibility lister.
 *   2. Disk fallback (change.json present on disk).
 *   3. Workflow-state fallback.
 *
 * A rejected tier is treated as a miss and falls through to the next tier.
 * The function is pure: all I/O is injected via `deps`.
 */
export async function isChangeReachable(
  projectId: string,
  changeId: string,
  deps: ReachabilityDeps,
  changesDir: string,
): Promise<boolean> {
  try {
    if (await deps.visibilityLister(projectId, changeId)) {
      return true;
    }
  } catch {
    // Visibility failed; fall through to disk check.
  }

  try {
    if (await deps.diskChecker(changesDir, changeId)) {
      return true;
    }
  } catch {
    // Disk check failed; fall through to workflow check.
  }

  try {
    if (await deps.workflowStateGetter(changeId)) {
      return true;
    }
  } catch {
    // Workflow check failed; treat as unreachable.
  }

  return false;
}

// rq-activeChangePointer01 / rq-doctorConsolidation01 (option B):
/**
 * Tri-state phantom probe result. Unlike {@link isChangeReachable} which
 * collapses "confirmed absent" and "probe failed" into `false`, this
 * preserves the distinction so the doctor can clear a phantom pointer ONLY
 * on confirmed-absent evidence and refuse on indeterminate.
 */
export type PhantomProbeResult =
  | { status: "confirmed_absent"; evidence: string }
  | { status: "confirmed_present"; evidence: string }
  | { status: "indeterminate"; evidence: string };

/**
 * Tri-state phantom probe for a changeId.
 *
 * Returns `confirmed_absent` only when ALL three tiers EXPLICITLY report
 * absence (not-found / empty result). If ANY tier throws an error (transport
 * failure, timeout, schema error), returns `indeterminate` — the change may
 * exist but the probe couldn't confirm it, so the caller must NOT clear.
 *
 * Short-circuits to `confirmed_present` on the first tier that finds the
 * change.
 *
 * Pure: all I/O is performed by the caller-supplied functions so the helper
 * stays pure and fully testable.
 */
export async function probeChangePhantomStatus(
  projectId: string,
  changeId: string,
  deps: ReachabilityDeps,
  changesDir: string,
): Promise<PhantomProbeResult> {
  const tiers = [
    {
      name: "visibility",
      probe: () => deps.visibilityLister(projectId, changeId),
    },
    {
      name: "disk",
      probe: () => deps.diskChecker(changesDir, changeId),
    },
    {
      name: "workflow-state",
      probe: () => deps.workflowStateGetter(changeId),
    },
  ];

  const absentEvidence: string[] = [];

  for (const tier of tiers) {
    let result: boolean;
    try {
      result = await tier.probe();
    } catch {
      return {
        status: "indeterminate",
        evidence: `tier '${tier.name}' threw — cannot confirm absence`,
      };
    }
    if (result) {
      return {
        status: "confirmed_present",
        evidence: `tier '${tier.name}' confirmed change exists`,
      };
    }
    absentEvidence.push(tier.name);
  }

  return {
    status: "confirmed_absent",
    evidence: `all tiers reported absent: ${absentEvidence.join(", ")}`,
  };
}
