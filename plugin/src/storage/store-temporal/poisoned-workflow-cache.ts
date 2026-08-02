import { LRUCache } from "lru-cache";
import { buildChangeWorkflowId } from "../../temporal/client";

const DEFAULT_POISONED_WORKFLOW_CACHE_TTL_MS = 300_000; // 5 minutes
const DEFAULT_POISONED_WORKFLOW_CACHE_MAX = 1_000;

function resolveTtlMs(overrideMs?: number): number {
  if (
    overrideMs !== undefined &&
    Number.isFinite(overrideMs) &&
    overrideMs > 0
  ) {
    return overrideMs;
  }
  const envMs = Number(process.env.ADV_POISONED_WORKFLOW_CACHE_TTL_MS);
  if (Number.isFinite(envMs) && envMs > 0) {
    return envMs;
  }
  return DEFAULT_POISONED_WORKFLOW_CACHE_TTL_MS;
}

function resolveMaxSize(overrideMax?: number): number {
  if (
    overrideMax !== undefined &&
    Number.isFinite(overrideMax) &&
    overrideMax > 0
  ) {
    return overrideMax;
  }
  const envMax = Number(process.env.ADV_POISONED_WORKFLOW_CACHE_MAX);
  if (Number.isFinite(envMax) && envMax > 0) {
    return envMax;
  }
  return DEFAULT_POISONED_WORKFLOW_CACHE_MAX;
}

/**
 * In-memory cache of workflow IDs whose query/signal path has been classified
 * as poisoned-history (TMPRL1100 / nondeterminism). The cache is intentionally
 * module-level: a poisoned workflow is a property of the Temporal server-side
 * history, not of any one store instance, and short-circuiting any subsequent
 * query/signal avoids the 10-second timeout on every tool interaction.
 *
 * Entries carry a TTL so a later repaired workflow can be re-evaluated without
 * requiring a process restart, and a bounded size so the cache cannot grow
 * without limit across long-running sessions.
 */
const poisonedWorkflows = new LRUCache<string, true>({
  max: resolveMaxSize(),
  ttl: resolveTtlMs(),
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

export function markPoisonedWorkflow(workflowId: string, ttlMs?: number): void {
  poisonedWorkflows.set(workflowId, true, { ttl: resolveTtlMs(ttlMs) });
}

export function markPoisonedWorkflowForChange(
  projectId: string,
  changeId: string,
  ttlMs?: number,
): void {
  markPoisonedWorkflow(buildPoisonedWorkflowKey(projectId, changeId), ttlMs);
}

export function isPoisonedWorkflow(workflowId: string): boolean {
  return poisonedWorkflows.has(workflowId);
}

export function isPoisonedWorkflowForChange(
  projectId: string,
  changeId: string,
): boolean {
  return isPoisonedWorkflow(buildPoisonedWorkflowKey(projectId, changeId));
}

export function buildPoisonedWorkflowKey(
  projectId: string,
  changeId: string,
): string {
  return buildChangeWorkflowId(projectId, changeId);
}

/**
 * Test/reset hook. Clearing the cache is required between test cases because
 * the module-level cache would otherwise leak poisoned state across fixtures.
 */
export function clearPoisonedWorkflowCache(workflowId?: string): void {
  if (workflowId === undefined) {
    poisonedWorkflows.clear();
  } else {
    poisonedWorkflows.delete(workflowId);
  }
}

/**
 * Internal diagnostics for tests and probes: returns the number of currently
 * cached poisoned workflow entries. Exposed only for observability, not for
 * business logic.
 */
export function getPoisonedWorkflowCacheSize(): number {
  return poisonedWorkflows.size;
}
