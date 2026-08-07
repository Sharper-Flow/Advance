import type { Store } from "./store";
import { loadProposalForSnapshot } from "./proposal-read";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
  type ContextSnapshotResumeFreshness,
  type GateInfo,
} from "../utils/context-snapshot";
import { resolveResumeFreshness } from "./resume-freshness-resolver";
import { RESUME_FRESHNESS_TRIGGER_MINUTES } from "./resume-freshness-resolver";
import type { Change } from "../types";

export async function fetchChangeContextSnapshot(
  store: Store,
  changeId: string,
  gates?: Record<string, GateInfo>,
): Promise<string | undefined> {
  const result = await store.changes.get(changeId);
  if (!result.success || !result.data) {
    return undefined;
  }

  const change = result.data;
  const { content: proposalText } = await loadProposalForSnapshot(
    store,
    change,
  );
  const latestGates = gates ?? (await store.gates.get(changeId)) ?? undefined;

  // Resume Freshness (D9b): only call resolver when lastActivityAgeMinutes > trigger band.
  // Resolver itself is the second-line guard; this avoids the async call for fresh changes.
  const resumeFreshness = await computeResumeFreshnessInput(store, change);

  return buildChangeContextSnapshot({
    change,
    proposalText,
    gates: latestGates,
    workdir: store.paths.root,
    resumeFreshness,
  });
}

/**
 * Compute the optional resumeFreshness field for the snapshot. Returns
 * undefined when the change is fresh or the resolver fails unexpectedly.
 * Never throws — snapshot must render even if freshness computation fails.
 */
async function computeResumeFreshnessInput(
  store: Store,
  change: Change,
): Promise<ContextSnapshotResumeFreshness | undefined> {
  try {
    const lastActivityAt =
      (change as unknown as { lastActivityAt?: string }).lastActivityAt ??
      change.created_at;
    const lastActivityAgeMinutes = Math.floor(
      (Date.now() - new Date(lastActivityAt).getTime()) / 60000,
    );
    if (lastActivityAgeMinutes <= RESUME_FRESHNESS_TRIGGER_MINUTES) {
      return undefined;
    }
    const result = await resolveResumeFreshness(store, change.id, {
      lastActivityAgeMinutes,
      lastActivityAt,
    });
    return {
      findings: result.findings,
      skipped: result.skipped,
    };
  } catch {
    // Degrade gracefully — formatter renders without Freshness line.
    return undefined;
  }
}

/**
 * Fetch a compact context ticker (single-line) for a change. Mirrors
 * fetchChangeContextSnapshot but uses buildChangeContextTicker — emit this
 * from transient task-state tools (adv_task_update / adv_task_ready /
 * adv_task_add / adv_task_cancel) per rq-ctxticker2.
 */
export async function fetchChangeContextTicker(
  store: Store,
  changeId: string,
  gates?: Record<string, GateInfo>,
): Promise<string | undefined> {
  const result = await store.changes.get(changeId);
  if (!result.success || !result.data) {
    return undefined;
  }

  const change = result.data;
  const latestGates = gates ?? (await store.gates.get(changeId)) ?? undefined;

  return buildChangeContextTicker({
    change,
    gates: latestGates,
  });
}

/**
 * Conditionally attach a context ticker to a tool output when the caller
 * passes `include.snapshot: true`. No-op otherwise (default-OFF per
 * rq-ctxticker2 inversion).
 *
 * Best-effort: swallows fetch errors uniformly across all 5 ticker sites
 * (previously only `wisdom.ts` swallowed). Per DDC4 — never fail the tool
 * due to ticker emission failure.
 */
export async function maybeAttachChangeTicker(
  output: Record<string, unknown>,
  include: { snapshot?: boolean } | undefined,
  store: Store,
  changeId: string,
): Promise<void> {
  if (!include?.snapshot) return;
  try {
    const snapshot = await fetchChangeContextTicker(store, changeId);
    if (snapshot) {
      output._contextSnapshot = snapshot;
    }
  } catch {
    // Best-effort: never fail the tool due to ticker emission failure.
  }
}
