import type { DashboardDegradedSource, DashboardGithubConfig } from "./types";
import type { LinkedDashboardItem, UnlinkedDashboardItem } from "./correlation";
import type { DashboardAdvChange } from "./adv";

export interface AttentionInput {
  github?: DashboardGithubConfig;
  changes: DashboardAdvChange[];
  linked: LinkedDashboardItem[];
  unlinked: UnlinkedDashboardItem[];
  degradedSources: DashboardDegradedSource[];
}

export interface AttentionLanes {
  needs_attention: Array<ChangeStatusLaneItem | DegradedLaneItem>;
  running: ChangeStatusLaneItem[];
  ready_landed: ChangeStatusLaneItem[];
  backlog: ChangeStatusLaneItem[];
  unmatched_source: DashboardLaneItem[];
}

export type DashboardLaneItem =
  | ProjectedSourceLaneItem
  | AdvChangeLaneItem
  | ChangeStatusLaneItem
  | DegradedLaneItem
  | SummaryLaneItem
  | GroupedLaneItem;

export type ProjectedSourceLaneItem = (
  | LinkedDashboardItem
  | UnlinkedDashboardItem
) &
  LaneCardFields;

export interface LaneCardFields {
  title?: string;
  subtitle?: string;
  url?: string;
  updated_at?: string;
  metadata?: LaneCardMetadata[];
}

export interface LaneCardMetadata {
  label: string;
  value: string;
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

export interface ChangeStatusLaneItem {
  kind: "adv_change_status";
  changeId: string;
  title: string;
  status: string;
  gate: string;
  progress: string;
  completedGates: number;
  lastActivityAt: string;
  latest: {
    overall: "attention" | "running" | "ready_landed" | "backlog" | "unknown";
    pr?: SourceStatusSummary;
    ci?: SourceStatusSummary;
    deployment?: SourceStatusSummary;
  };
  sources: {
    prs: ProjectedSourceLaneItem[];
    workflow_runs: ProjectedSourceLaneItem[];
    deployments: ProjectedSourceLaneItem[];
  };
  metadata?: LaneCardMetadata[];
}

export interface SourceStatusSummary extends LaneCardFields {
  kind: "pull" | "workflow_run" | "deployment";
  title: string;
  status?: string;
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

export interface GroupedLaneItem {
  kind: "group";
  groupKind: "workflow_run" | "deployment" | "inventory";
  title: string;
  status?: string;
  count: number;
  latestUpdatedAt?: string;
  representative: ProjectedSourceLaneItem | AdvChangeLaneItem;
  items: Array<ProjectedSourceLaneItem | AdvChangeLaneItem>;
  collapsedByDefault: boolean;
  metadata?: LaneCardMetadata[];
}

const GATE_ORDER = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

export function buildAttentionLanes(input: AttentionInput): AttentionLanes {
  const degradedItems = input.degradedSources.map(
    (source): DegradedLaneItem => ({
      kind: "degraded_source",
      source: source.source,
      code: source.code,
      message: source.message,
    }),
  );

  const changes = buildChangeStatusItems(input);
  const unmatched = buildUnmatchedSource(input);

  return {
    needs_attention: [
      ...degradedItems,
      ...sortChangeStatusItems(
        changes.filter((item) => item.latest.overall === "attention"),
      ),
    ],
    running: sortChangeStatusItems(
      changes.filter((item) => item.latest.overall === "running"),
    ),
    ready_landed: sortChangeStatusItems(
      changes.filter((item) => item.latest.overall === "ready_landed"),
    ),
    backlog: sortChangeStatusItems(
      changes.filter(
        (item) =>
          item.latest.overall === "backlog" || item.latest.overall === "unknown",
      ),
    ),
    unmatched_source: unmatched,
  };
}

interface ChangeStatusAccumulator {
  change: DashboardAdvChange;
  prs: ProjectedSourceLaneItem[];
  workflow_runs: ProjectedSourceLaneItem[];
  deployments: ProjectedSourceLaneItem[];
}

function buildChangeStatusItems(input: AttentionInput): ChangeStatusLaneItem[] {
  const byChange = new Map<string, ChangeStatusAccumulator>();
  for (const change of input.changes) {
    byChange.set(change.id, { change, prs: [], workflow_runs: [], deployments: [] });
  }

  for (const raw of input.linked) {
    const item = projectSourceItem(raw, input.github);
    const accumulator = byChange.get(raw.changeId);
    if (!accumulator) continue;
    if (item.kind === "pull") accumulator.prs.push(item);
    else if (item.kind === "workflow_run") accumulator.workflow_runs.push(item);
    else if (item.kind === "deployment") accumulator.deployments.push(item);
  }

  return [...byChange.values()].map(changeStatusItem);
}

function buildUnmatchedSource(input: AttentionInput): DashboardLaneItem[] {
  const unmatched: DashboardLaneItem[] = [];
  const successfulHistory = new Map<string, ProjectedSourceLaneItem[]>();
  for (const raw of input.unlinked) {
    const item = projectSourceItem(raw, input.github);
    if (isSuccessfulHistory(item)) collectSuccessfulHistory(successfulHistory, item);
    else unmatched.push(item);
  }

  const historySummary = new Map<string, number>();
  for (const members of successfulHistory.values()) {
    if (members.length > 1) unmatched.push(sourceGroup(members));
    else increment(historySummary, summaryKey(members[0]!));
  }

  for (const [key, count] of historySummary) {
    unmatched.push({
      kind: "summary",
      title: `${count} ${key} item${count === 1 ? "" : "s"} summarized`,
      status: "success_history",
      count,
    });
  }

  return sortUnmatched(groupSourceItems(unmatched));
}

function changeStatusItem(accumulator: ChangeStatusAccumulator): ChangeStatusLaneItem {
  const latestPr = latestItemOrUndefined(accumulator.prs);
  const latestCi = latestBySourceIdentity(accumulator.workflow_runs, workflowIdentity);
  const latestDeployment = latestBySourceIdentity(
    accumulator.deployments,
    deploymentIdentity,
  );
  const latestWorkflowItems = [...latestCi.values()];
  const latestDeploymentItems = [...latestDeployment.values()];
  const latestSources = [...latestWorkflowItems, ...latestDeploymentItems];
  const overall = overallStatus(latestSources);
  const selectedWorkflow = representativeSource(latestWorkflowItems, overall);
  const selectedDeployment = representativeSource(latestDeploymentItems, overall);

  return {
    kind: "adv_change_status",
    changeId: accumulator.change.id,
    title: accumulator.change.title,
    status: accumulator.change.status,
    gate: accumulator.change.firstIncompleteGate ?? "complete",
    progress: accumulator.change.gateProgressStr,
    completedGates: completedGateCount(accumulator.change.firstIncompleteGate),
    lastActivityAt: accumulator.change.lastActivityAt,
    latest: {
      overall,
      pr: latestPr ? sourceSummary(latestPr) : undefined,
      ci: selectedWorkflow ? sourceSummary(selectedWorkflow) : undefined,
      deployment: selectedDeployment ? sourceSummary(selectedDeployment) : undefined,
    },
    sources: {
      prs: accumulator.prs,
      workflow_runs: accumulator.workflow_runs,
      deployments: accumulator.deployments,
    },
    metadata: compactMetadata([
      { label: "Gate", value: accumulator.change.firstIncompleteGate ?? "complete" },
    ]),
  };
}

function sortChangeStatusItems(items: ChangeStatusLaneItem[]): ChangeStatusLaneItem[] {
  return [...items].sort(compareChangeStatusItems);
}

function compareChangeStatusItems(
  a: ChangeStatusLaneItem,
  b: ChangeStatusLaneItem,
): number {
  const gateDelta = b.completedGates - a.completedGates;
  if (gateDelta !== 0) return gateDelta;
  if (a.lastActivityAt !== b.lastActivityAt) {
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  }
  const titleDelta = a.title.localeCompare(b.title);
  if (titleDelta !== 0) return titleDelta;
  return a.changeId.localeCompare(b.changeId);
}

function completedGateCount(firstIncompleteGate: string | null): number {
  if (firstIncompleteGate === null) return GATE_ORDER.length;
  const gateIndex = GATE_ORDER.indexOf(
    firstIncompleteGate as (typeof GATE_ORDER)[number],
  );
  return gateIndex >= 0 ? gateIndex : -1;
}

function representativeSource(
  items: ProjectedSourceLaneItem[],
  overall: ChangeStatusLaneItem["latest"]["overall"],
): ProjectedSourceLaneItem | undefined {
  if (overall === "attention") {
    return latestItemOrUndefined(items.filter(isAttentionStatus));
  }
  if (overall === "running") {
    return latestItemOrUndefined(items.filter(isRunningStatus));
  }
  if (overall === "ready_landed") {
    return latestItemOrUndefined(items.filter(isReadyStatus));
  }
  return latestItemOrUndefined(items);
}

function overallStatus(
  latestSources: ProjectedSourceLaneItem[],
): ChangeStatusLaneItem["latest"]["overall"] {
  if (latestSources.some(isAttentionStatus)) return "attention";
  if (latestSources.some(isRunningStatus)) return "running";
  if (latestSources.some(isReadyStatus)) return "ready_landed";
  return "backlog";
}

function sourceSummary(item: ProjectedSourceLaneItem): SourceStatusSummary {
  return {
    kind: item.kind as SourceStatusSummary["kind"],
    title: item.title ?? item.kind,
    status: item.status,
    url: item.url,
    updated_at: latestTimestamp(item) ?? item.updated_at,
    metadata: item.metadata,
  };
}

function latestBySourceIdentity(
  items: ProjectedSourceLaneItem[],
  identityFor: (item: ProjectedSourceLaneItem) => string,
): Map<string, ProjectedSourceLaneItem> {
  const latest = new Map<string, ProjectedSourceLaneItem>();
  for (const item of items) {
    const key = identityFor(item);
    const existing = latest.get(key);
    if (!existing || compareSourceRecency(item, existing) > 0) latest.set(key, item);
  }
  return latest;
}

function workflowIdentity(item: ProjectedSourceLaneItem): string {
  const source = record(item.item);
  const workflow =
    stringOrNumberField(source, "workflow_id") ??
    stringField(source, "name") ??
    item.title ??
    "workflow_run";
  const branch = stringField(source, "head_branch") ?? metadataValue(item.metadata, "Branch") ?? "";
  return `${workflow}\u0000${branch}`;
}

function deploymentIdentity(item: ProjectedSourceLaneItem): string {
  const source = record(item.item);
  const environment = stringField(source, "environment") ?? item.title ?? "deployment";
  const ref = stringField(source, "ref") ?? metadataValue(item.metadata, "Ref") ?? "";
  return `${environment}\u0000${ref}`;
}

function compareSourceRecency(
  a: ProjectedSourceLaneItem,
  b: ProjectedSourceLaneItem,
): number {
  const aTimestamp = latestTimestamp(a);
  const bTimestamp = latestTimestamp(b);
  if (isIsoLikeTimestamp(aTimestamp) && !isIsoLikeTimestamp(bTimestamp)) return 1;
  if (!isIsoLikeTimestamp(aTimestamp) && isIsoLikeTimestamp(bTimestamp)) return -1;
  if (!isIsoLikeTimestamp(aTimestamp) || !isIsoLikeTimestamp(bTimestamp)) return 0;
  return aTimestamp! > bTimestamp! ? 1 : aTimestamp! < bTimestamp! ? -1 : 0;
}

function latestTimestamp(item: ProjectedSourceLaneItem): string | undefined {
  const source = record(item.item);
  const candidates = [
    stringField(source, "run_started_at"),
    stringField(source, "created_at"),
    stringField(source, "updated_at"),
    item.updated_at,
  ].filter(isIsoLikeTimestamp);
  return candidates.sort().at(-1);
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

function projectSourceItem<T extends LinkedDashboardItem | UnlinkedDashboardItem>(
  item: T,
  github: DashboardGithubConfig | undefined,
): T & LaneCardFields {
  return { ...item, ...sourceFields(item, github) };
}

function sourceFields(
  item: LinkedDashboardItem | UnlinkedDashboardItem,
  github: DashboardGithubConfig | undefined,
): LaneCardFields {
  if (item.kind === "pull") return pullFields(item.item, github);
  if (item.kind === "workflow_run") return workflowRunFields(item.item, github);
  if (item.kind === "deployment") return deploymentFields(item.item, github);
  return baseFields(item.item, github);
}

function pullFields(
  value: unknown,
  github: DashboardGithubConfig | undefined,
): LaneCardFields {
  const item = record(value);
  const number = numberField(item, "number");
  const title = stringField(item, "title") ?? "Pull request";
  const branch = stringField(record(item?.head), "ref");
  return {
    title: number ? `#${number} ${title}` : title,
    url: stringField(item, "html_url"),
    updated_at: stringField(item, "updated_at"),
    metadata: compactMetadata([
      repoMetadata(github),
      branch ? { label: "Branch", value: branch } : undefined,
      stringField(record(item?.head), "sha")
        ? { label: "SHA", value: shortSha(stringField(record(item?.head), "sha")!) }
        : undefined,
    ]),
  };
}

function workflowRunFields(
  value: unknown,
  github: DashboardGithubConfig | undefined,
): LaneCardFields {
  const item = record(value);
  const name =
    stringField(item, "name") ??
    stringField(item, "workflow_name") ??
    stringField(item, "display_title") ??
    "Workflow run";
  const displayTitle = stringField(item, "display_title");
  const conclusion = stringField(item, "conclusion");
  return {
    title: name,
    subtitle: displayTitle && displayTitle !== name ? displayTitle : undefined,
    url: stringField(item, "html_url"),
    updated_at: stringField(item, "updated_at"),
    metadata: compactMetadata([
      repoMetadata(github),
      stringField(item, "head_branch")
        ? { label: "Branch", value: stringField(item, "head_branch")! }
        : undefined,
      conclusion ? { label: "Conclusion", value: conclusion } : undefined,
      stringField(item, "head_sha")
        ? { label: "SHA", value: shortSha(stringField(item, "head_sha")!) }
        : undefined,
    ]),
  };
}

function deploymentFields(
  value: unknown,
  github: DashboardGithubConfig | undefined,
): LaneCardFields {
  const item = record(value);
  const environment = stringField(item, "environment");
  const ref = stringField(item, "ref");
  const sourceStates = record(item?.source_states);
  const deploymentStatus = stringField(sourceStates, "github_deployment");
  return {
    title: environment ? `Deployment: ${environment}` : "Deployment",
    url: stringField(item, "html_url") ?? stringField(item, "url"),
    updated_at: stringField(item, "updated_at") ?? stringField(item, "created_at"),
    metadata: compactMetadata([
      repoMetadata(github),
      ref ? { label: "Ref", value: ref } : undefined,
      deploymentStatus
        ? { label: "Deployment", value: deploymentStatus }
        : undefined,
      stringField(item, "sha")
        ? { label: "SHA", value: shortSha(stringField(item, "sha")!) }
        : undefined,
    ]),
  };
}

function baseFields(
  value: unknown,
  github: DashboardGithubConfig | undefined,
): LaneCardFields {
  const item = record(value);
  return {
    title: stringField(item, "title") ?? stringField(item, "name"),
    url: stringField(item, "html_url") ?? stringField(item, "url"),
    updated_at: stringField(item, "updated_at"),
    metadata: compactMetadata([repoMetadata(github)]),
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

function isReadyStatus(item: { status?: string }): boolean {
  return /^(success|skipped|inactive|success_history)$/i.test(item.status ?? "");
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

function collectSuccessfulHistory(
  grouped: Map<string, ProjectedSourceLaneItem[]>,
  item: ProjectedSourceLaneItem,
): void {
  const key = groupKey(item);
  const existing = grouped.get(key);
  if (existing) existing.push(item);
  else grouped.set(key, [item]);
}

function groupSourceItems(items: DashboardLaneItem[]): DashboardLaneItem[] {
  const grouped = new Map<string, ProjectedSourceLaneItem[]>();
  const result: DashboardLaneItem[] = [];

  for (const item of items) {
    if (!isGroupableSourceItem(item)) {
      result.push(item);
      continue;
    }
    const key = groupKey(item);
    const existing = grouped.get(key);
    if (existing) existing.push(item);
    else {
      grouped.set(key, [item]);
      result.push(item);
    }
  }

  return result.map((item) => {
    if (!isGroupableSourceItem(item)) return item;
    const members = grouped.get(groupKey(item)) ?? [item];
    return members.length > 1 ? sourceGroup(members) : item;
  });
}

function summarizeDraftInventory(items: DashboardLaneItem[]): DashboardLaneItem[] {
  const drafts = items.filter(isDraftAdvChange);
  if (drafts.length <= 5) return items;
  const rest = items.filter((item) => !isDraftAdvChange(item));
  return [
    {
      kind: "group",
      groupKind: "inventory",
      title: `${drafts.length} draft ADV changes`,
      status: "draft",
      count: drafts.length,
      latestUpdatedAt: undefined,
      representative: drafts[0]!,
      items: drafts,
      collapsedByDefault: true,
      metadata: [{ label: "Preview", value: "5 shown on expand" }],
    },
    ...rest,
  ];
}

function sourceGroup(items: ProjectedSourceLaneItem[]): GroupedLaneItem {
  const representative = latestItem(items);
  return {
    kind: "group",
    groupKind: representative.kind,
    title: representative.title ?? representative.kind,
    status: representative.status,
    count: items.length,
    latestUpdatedAt: representative.updated_at,
    representative,
    items,
    collapsedByDefault: true,
    metadata: representative.metadata,
  };
}

function latestItem<T extends { updated_at?: string }>(items: T[]): T {
  return items.reduce((latest, item) => {
    if (!isIsoLikeTimestamp(item.updated_at)) return latest;
    if (!isIsoLikeTimestamp(latest.updated_at)) return item;
    return item.updated_at! > latest.updated_at! ? item : latest;
  }, items[0]!);
}

function latestItemOrUndefined<T extends { updated_at?: string }>(
  items: T[],
): T | undefined {
  return items.length > 0 ? latestItem(items) : undefined;
}

function isGroupableSourceItem(
  item: DashboardLaneItem,
): item is ProjectedSourceLaneItem {
  return item.kind === "workflow_run" || item.kind === "deployment";
}

function isDraftAdvChange(item: DashboardLaneItem): item is AdvChangeLaneItem {
  return item.kind === "adv_change" && /^draft$/i.test(item.status);
}

function groupKey(item: ProjectedSourceLaneItem): string {
  return [
    item.kind,
    item.status ?? "",
    item.title ?? "",
    metadataValue(item.metadata, "Branch") ?? metadataValue(item.metadata, "Ref") ?? "",
  ].join("\u0000");
}

function metadataValue(
  metadata: LaneCardMetadata[] | undefined,
  label: string,
): string | undefined {
  return metadata?.find((entry) => entry.label === label)?.value;
}

function isIsoLikeTimestamp(value: string | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value ?? "");
}

function sortUnmatched(items: DashboardLaneItem[]): DashboardLaneItem[] {
  return [...items].sort((a, b) => unmatchedRank(a) - unmatchedRank(b));
}

function unmatchedRank(item: DashboardLaneItem): number {
  if (item.kind === "pull" && /^open$/i.test(item.status ?? "")) return 0;
  if (item.kind === "group" && item.groupKind === "deployment") return 2;
  return 1;
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

function repoMetadata(
  github: DashboardGithubConfig | undefined,
): LaneCardMetadata | undefined {
  return github ? { label: "Repo", value: `${github.owner}/${github.repo}` } : undefined;
}

function compactMetadata(
  entries: Array<LaneCardMetadata | undefined>,
): LaneCardMetadata[] | undefined {
  const metadata = entries.filter((entry): entry is LaneCardMetadata => !!entry);
  return metadata.length > 0 ? metadata : undefined;
}

function shortSha(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrNumberField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
