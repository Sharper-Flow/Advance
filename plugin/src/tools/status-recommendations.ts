import type { GateId } from "../types";

export type StatusRecommendationKind =
  | "next_gate"
  | "clarify"
  | "stale"
  | "release_ready"
  | "cleanup"
  | "health"
  | "blocked_or_stuck";

export type StatusRecommendationPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type StatusRecommendationSource =
  | "gate"
  | "clarify"
  | "recency"
  | "session_debt"
  | "health"
  | "branch_hygiene"
  | "release_readiness";

export interface StatusRecommendationItem {
  kind: StatusRecommendationKind;
  priority: StatusRecommendationPriority;
  changeId?: string;
  gateId?: GateId;
  title: string;
  detail: string;
  action: string;
  message?: string;
  source: StatusRecommendationSource;
  minutesSinceActivity?: number;
}

export interface StatusRecommendationGroup {
  kind: StatusRecommendationKind;
  priorityRank: number;
  total: number;
  shown: StatusRecommendationItem[];
  omitted: number;
}

export interface StatusRecommendationSummary {
  total: number;
  omitted: number;
  groups: StatusRecommendationGroup[];
  drilldown: {
    changes: 'adv_status view:"changes"';
    hygiene: 'adv_status view:"hygiene"';
  };
}

export interface StatusRecommendationGroupLimits {
  perGroup: number;
}

export const STATUS_RECOMMENDATION_KIND_ORDER: StatusRecommendationKind[] = [
  "blocked_or_stuck",
  "health",
  "release_ready",
  "clarify",
  "next_gate",
  "cleanup",
  "stale",
];

const PRIORITY_RANK: Record<StatusRecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function kindRank(kind: StatusRecommendationKind): number {
  const index = STATUS_RECOMMENDATION_KIND_ORDER.indexOf(kind);
  return index === -1 ? STATUS_RECOMMENDATION_KIND_ORDER.length : index;
}

function compareRecommendationItems(
  a: StatusRecommendationItem,
  b: StatusRecommendationItem,
): number {
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;

  const aActivity = a.minutesSinceActivity ?? Number.POSITIVE_INFINITY;
  const bActivity = b.minutesSinceActivity ?? Number.POSITIVE_INFINITY;
  if (aActivity !== bActivity) return aActivity - bActivity;

  const change = (a.changeId ?? "").localeCompare(b.changeId ?? "");
  if (change !== 0) return change;

  return a.title.localeCompare(b.title);
}

export function statusRecommendationToString(
  item: StatusRecommendationItem,
): string {
  if (item.message) return item.message;
  return `${item.title} — ${item.detail} — ${item.action}`;
}

export function buildStatusRecommendationGroups(
  items: readonly StatusRecommendationItem[],
  limits: StatusRecommendationGroupLimits,
): StatusRecommendationSummary {
  const perGroup = Math.max(1, Math.floor(limits.perGroup));
  const byKind = new Map<
    StatusRecommendationKind,
    StatusRecommendationItem[]
  >();

  for (const item of items) {
    const existing = byKind.get(item.kind) ?? [];
    existing.push(item);
    byKind.set(item.kind, existing);
  }

  const groups = [...byKind.entries()]
    .sort(([a], [b]) => kindRank(a) - kindRank(b))
    .map(([kind, groupItems]) => {
      const sorted = [...groupItems].sort(compareRecommendationItems);
      const shown = sorted.slice(0, perGroup);
      return {
        kind,
        priorityRank: kindRank(kind),
        total: sorted.length,
        shown,
        omitted: Math.max(0, sorted.length - shown.length),
      } satisfies StatusRecommendationGroup;
    });

  const total = items.length;
  const shownTotal = groups.reduce((sum, group) => sum + group.shown.length, 0);

  return {
    total,
    omitted: Math.max(0, total - shownTotal),
    groups,
    drilldown: {
      changes: 'adv_status view:"changes"',
      hygiene: 'adv_status view:"hygiene"',
    },
  };
}
