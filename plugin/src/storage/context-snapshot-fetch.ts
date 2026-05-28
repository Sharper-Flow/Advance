import { join } from "node:path";
import type { Store } from "./store";
import { loadProposalWithFallback } from "./json";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
  type GateInfo,
} from "../utils/context-snapshot";
import type { Change } from "../types";

/**
 * Resolve proposal content for a change with Temporal-first precedence
 * (KD-6). Checks `state.documents.proposal` (already on the Change object
 * returned by store.changes.get via mapTemporalChangeStateToChange) before
 * falling back to disk + scaffold via `loadProposalWithFallback`.
 *
 * Keeps the context-snapshot helpers free from a tool-layer import while
 * still routing reads through Temporal.
 */
async function loadProposalForSnapshot(
  store: Store,
  change: Change,
): Promise<{ content: string; warning?: string }> {
  const temporalContent = change.documents?.proposal;
  if (typeof temporalContent === "string" && temporalContent.length > 0) {
    return { content: temporalContent };
  }
  const changeDir = join(store.paths.changes, change.id);
  return loadProposalWithFallback(changeDir, change.title, {
    archiveDir: join(store.paths.root, ".adv", "archive"),
    changeId: change.id,
  });
}

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

  return buildChangeContextSnapshot({
    change,
    proposalText,
    gates: latestGates,
    workdir: store.paths.root,
  });
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
