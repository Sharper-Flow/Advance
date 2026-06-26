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
  attention: DashboardLaneItem[];
  active: DashboardLaneItem[];
  unmatched: DashboardLaneItem[];
  inventory: DashboardLaneItem[];
}

export type DashboardLaneItem =
  | LinkedDashboardItem
  | UnlinkedDashboardItem
  | AdvChangeLaneItem
  | DegradedLaneItem
  | SummaryLaneItem;

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

export interface SummaryLaneItem {
  kind: "summary";
  title: string;
  status: string;
  count: number;
}

export function buildAttentionLanes(input: AttentionInput): AttentionLanes {
  const active: DashboardLaneItem[] = [];
  const inventory: DashboardLaneItem[] = [];
  for (const change of input.changes) {
    const item = advChangeItem(change);
    if (isDashboardActionableAdvStatus(change.status)) active.push(item);
    else inventory.push(item);
  }

  const degradedItems = input.degradedSources.map(
    (source): DegradedLaneItem => ({
      kind: "degraded_source",
      source: source.source,
      code: source.code,
      message: source.message,
    }),
  );
  const attention: DashboardLaneItem[] = [...degradedItems];
  const unmatched: DashboardLaneItem[] = [];
  const historySummary = new Map<string, number>();

  for (const item of input.linked) {
    if (isSuccessfulHistory(item)) increment(historySummary, summaryKey(item));
    else if (isAttentionStatus(item)) attention.unshift(item);
    else if (isRunningStatus(item) || isOpenStatus(item)) active.push(item);
    else inventory.push(item);
  }

  for (const item of input.unlinked) {
    if (isSuccessfulHistory(item)) increment(historySummary, summaryKey(item));
    else if (isAttentionStatus(item)) attention.unshift(item);
    else if (isRunningStatus(item)) active.push(item);
    else unmatched.push(item);
  }

  for (const [key, count] of historySummary) {
    inventory.push({
      kind: "summary",
      title: `${count} ${key} item${count === 1 ? "" : "s"} summarized`,
      status: "success_history",
      count,
    });
  }

  return {
    attention,
    active: active.sort(activeSort),
    unmatched,
    inventory,
  };
}

function advChangeItem(change: DashboardAdvChange): AdvChangeLaneItem {
  return {
    kind: "adv_change",
    changeId: change.id,
    title: change.title,
    evidence: `adv.change: ${change.id}`,
    status: change.status,
    source_states: {
      gate: change.firstIncompleteGate ?? "complete",
      progress: change.gateProgressStr,
    },
  };
}

function isDashboardActionableAdvStatus(status: string): boolean {
  return /^(pending|active)$/i.test(status);
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

function isOpenStatus(item: { status?: string }): boolean {
  return /^open$/i.test(item.status ?? "");
}

function isSuccessfulHistory(item: { kind: string; status?: string }): boolean {
  return (
    /^(workflow_run|deployment)$/i.test(item.kind) &&
    /^(success|skipped)$/i.test(item.status ?? "")
  );
}

function summaryKey(item: { kind: string; status?: string }): string {
  return `${item.status ?? "completed"} ${item.kind}`;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function activeSort(a: DashboardLaneItem, b: DashboardLaneItem): number {
  return activeKindRank(a.kind) - activeKindRank(b.kind);
}

function activeKindRank(kind: string): number {
  if (kind === "adv_change") return 0;
  if (kind === "workflow_run") return 1;
  if (kind === "pull") return 2;
  return 3;
}
