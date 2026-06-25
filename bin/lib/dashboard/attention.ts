import type { DashboardDegradedSource } from "./types";
import type { LinkedDashboardItem, UnlinkedDashboardItem } from "./correlation";

export interface AttentionInput {
  linked: LinkedDashboardItem[];
  unlinked: UnlinkedDashboardItem[];
  degradedSources: DashboardDegradedSource[];
}

export interface AttentionLanes {
  attention: Array<LinkedDashboardItem | UnlinkedDashboardItem | DegradedLaneItem>;
  running: Array<LinkedDashboardItem | UnlinkedDashboardItem>;
  linked: LinkedDashboardItem[];
  unlinked: UnlinkedDashboardItem[];
}

export interface DegradedLaneItem {
  kind: "degraded_source";
  source: DashboardDegradedSource["source"];
  code: string;
  message: string;
}

export function buildAttentionLanes(input: AttentionInput): AttentionLanes {
  const degradedItems = input.degradedSources.map((source): DegradedLaneItem => ({
    kind: "degraded_source",
    source: source.source,
    code: source.code,
    message: source.message,
  }));
  const attentionLinked = input.linked.filter(isAttentionStatus);
  const attentionUnlinked = input.unlinked.filter(isAttentionStatus);
  const runningLinked = input.linked.filter(isRunningStatus);
  const runningUnlinked = input.unlinked.filter(isRunningStatus);

  return {
    attention: [...attentionLinked, ...attentionUnlinked, ...degradedItems],
    running: [...runningLinked, ...runningUnlinked],
    linked: input.linked.filter((item) => !isAttentionStatus(item) && !isRunningStatus(item)),
    unlinked: input.unlinked,
  };
}

function isAttentionStatus(item: { status?: string }): boolean {
  return /^(failure|failed|error|cancelled|timed_out|stale|degraded)$/i.test(item.status ?? "");
}

function isRunningStatus(item: { status?: string }): boolean {
  return /^(queued|requested|waiting|pending|in_progress|running)$/i.test(item.status ?? "");
}
