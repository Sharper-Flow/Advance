import type { DashboardDegradedSource } from "./types";
import type { LinkedDashboardItem, UnlinkedDashboardItem } from "./correlation";
import type { DashboardAdvChange } from "./adv";

export interface AttentionInput {
  changes: DashboardAdvChange[];
  linked: LinkedDashboardItem[];
  unlinked: UnlinkedDashboardItem[];
  degradedSources: DashboardDegradedSource[];
}

export interface AttentionLanes {
  attention: Array<
    LinkedDashboardItem | UnlinkedDashboardItem | DegradedLaneItem
  >;
  running: Array<LinkedDashboardItem | UnlinkedDashboardItem>;
  linked: Array<LinkedDashboardItem | AdvChangeLaneItem>;
  unlinked: UnlinkedDashboardItem[];
}

export interface AdvChangeLaneItem {
  kind: "adv_change";
  changeId: string;
  title: string;
  evidence: string;
  status: string;
  source_states: {
    gate: string;
    progress: string;
  };
}

export interface DegradedLaneItem {
  kind: "degraded_source";
  source: DashboardDegradedSource["source"];
  code: string;
  message: string;
}

export function buildAttentionLanes(input: AttentionInput): AttentionLanes {
  const advItems = input.changes.map(
    (change): AdvChangeLaneItem => ({
      kind: "adv_change",
      changeId: change.id,
      title: change.title,
      evidence: `adv.change: ${change.id}`,
      status: change.status,
      source_states: {
        gate: change.firstIncompleteGate ?? "complete",
        progress: change.gateProgressStr,
      },
    }),
  );
  const degradedItems = input.degradedSources.map(
    (source): DegradedLaneItem => ({
      kind: "degraded_source",
      source: source.source,
      code: source.code,
      message: source.message,
    }),
  );
  const attentionLinked = input.linked.filter(isAttentionStatus);
  const attentionUnlinked = input.unlinked.filter(isAttentionStatus);
  const runningLinked = input.linked.filter(isRunningStatus);
  const runningUnlinked = input.unlinked.filter(isRunningStatus);

  return {
    attention: [...attentionLinked, ...attentionUnlinked, ...degradedItems],
    running: [...runningLinked, ...runningUnlinked],
    linked: [
      ...advItems,
      ...input.linked.filter(
        (item) => !isAttentionStatus(item) && !isRunningStatus(item),
      ),
    ],
    unlinked: input.unlinked,
  };
}

function isAttentionStatus(item: { status?: string }): boolean {
  return /^(failure|failed|error|cancelled|timed_out|stale|degraded)$/i.test(
    item.status ?? "",
  );
}

function isRunningStatus(item: { status?: string }): boolean {
  return /^(queued|requested|waiting|pending|in_progress|running)$/i.test(
    item.status ?? "",
  );
}
