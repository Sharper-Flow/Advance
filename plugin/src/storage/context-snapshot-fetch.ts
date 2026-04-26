import { join } from "node:path";
import type { Store } from "./store";
import { loadProposalWithFallback } from "./json";
import {
  buildChangeContextSnapshot,
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
