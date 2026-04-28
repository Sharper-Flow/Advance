import { join } from "node:path";
import type { Store } from "./store";
import { loadProposalWithFallback } from "./json";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
  type GateInfo,
} from "../utils/context-snapshot";

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
  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    change.title,
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
