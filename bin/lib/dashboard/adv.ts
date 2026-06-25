import { loadLiveStatus, loadLiveSummaries, QUERY_TIMEOUT_MS } from "../live-status";
import { resolveProjectId } from "../project";
import type { ChangeRecord, ChangeSummary } from "../types";
import { sanitizeDashboardState } from "./config";
import type { DashboardDegradedSource, DashboardProjectConfig } from "./types";

export interface DashboardAdvCorrelationKeys {
  branches: string[];
  head_shas: string[];
}

export interface DashboardAdvChange {
  id: string;
  title: string;
  status: string;
  gateProgressStr: string;
  firstIncompleteGate: string | null;
  lastActivityAt: string;
  ops_followup?: unknown;
  ops_followup_links?: unknown[];
  correlation_keys: DashboardAdvCorrelationKeys;
}

export interface DashboardAdvProjectSnapshot {
  ok: true;
  project: Pick<DashboardProjectConfig, "id" | "label" | "path">;
  project_id: string;
  generated_at: string;
  changes: DashboardAdvChange[];
  degradedSources: DashboardDegradedSource[];
}

export interface DashboardAdvReaderDeps {
  resolveProjectId?: (path: string) => Promise<string | null>;
  loadBaseSummaries?: (projectId: string, now: Date, timeoutMs: number) => Promise<ChangeSummary[]>;
  loadOpsChanges?: (projectId: string, timeoutMs: number) => Promise<ChangeRecord[]>;
  now?: () => Date;
  timeoutMs?: number;
}

export async function readDashboardAdvProject(
  project: DashboardProjectConfig,
  deps: DashboardAdvReaderDeps = {},
): Promise<DashboardAdvProjectSnapshot> {
  const now = deps.now?.() ?? new Date();
  const timeoutMs = deps.timeoutMs ?? QUERY_TIMEOUT_MS;
  const projectId = await (deps.resolveProjectId ?? resolveProjectId)(project.path);
  if (!projectId) {
    return sanitizeDashboardState({
      ok: true,
      project: projectIdentity(project),
      project_id: "unknown",
      generated_at: now.toISOString(),
      changes: [],
      degradedSources: [degraded("ADV_PROJECT_ID_UNAVAILABLE", "ADV project id could not be resolved.")],
    });
  }

  const loadBase = deps.loadBaseSummaries ?? loadLiveSummaries;
  const baseSummaries = await loadBase(projectId, now, timeoutMs);
  const degradedSources: DashboardDegradedSource[] = [];
  let opsById = new Map<string, ChangeRecord>();

  try {
    const loadOps = deps.loadOpsChanges ?? loadLiveStatus;
    opsById = new Map((await loadOps(projectId, timeoutMs)).map((change) => [change.id, change]));
  } catch {
    degradedSources.push(
      degraded("ADV_OPS_ENRICHMENT_UNAVAILABLE", "ADV ops enrichment unavailable; base ADV state remains visible."),
    );
  }

  const changes = baseSummaries.map((summary) => mergeAdvChange(summary, opsById.get(summary.id)));
  return sanitizeDashboardState({
    ok: true,
    project: projectIdentity(project),
    project_id: projectId,
    generated_at: now.toISOString(),
    changes,
    degradedSources,
  });
}

function mergeAdvChange(summary: ChangeSummary, opsChange: ChangeRecord | undefined): DashboardAdvChange {
  const opsLinks = getOpsLinks(opsChange);
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    gateProgressStr: summary.gateProgressStr,
    firstIncompleteGate: summary.firstIncompleteGate,
    lastActivityAt: summary.lastActivityAt,
    ops_followup: getField(opsChange, "ops_followup"),
    ops_followup_links: opsLinks,
    correlation_keys: {
      branches: unique([...(summaryWorktreeBranches(summary) ?? []), ...worktreeBranches(opsChange)]),
      head_shas: unique(worktreeHeadShas(opsChange)),
    },
  };
}

function summaryWorktreeBranches(summary: ChangeSummary): string[] | undefined {
  const value = (summary as ChangeSummary & { worktreeBranches?: unknown }).worktreeBranches;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function projectIdentity(project: DashboardProjectConfig) {
  return { id: project.id, label: project.label, path: project.path };
}

function getField(record: unknown, key: string): unknown | undefined {
  return isRecord(record) ? record[key] : undefined;
}

function getOpsLinks(record: unknown): unknown[] | undefined {
  const value = getField(record, "ops_followup_links");
  return Array.isArray(value) ? value : undefined;
}

function worktreeBranches(record: unknown): string[] {
  return worktreeRecords(record)
    .map((worktree) => stringField(worktree, "branch"))
    .filter((value): value is string => value !== undefined);
}

function worktreeHeadShas(record: unknown): string[] {
  return worktreeRecords(record)
    .map((worktree) => stringField(worktree, "headSha"))
    .filter((value): value is string => value !== undefined);
}

function worktreeRecords(record: unknown): Record<string, unknown>[] {
  const value = getField(record, "worktrees");
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function degraded(code: string, message: string): DashboardDegradedSource {
  return { source: "adv", code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
