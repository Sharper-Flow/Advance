import { loadLiveSummaries } from "../live-status";
import {
  loadLiveResumeProjection,
  type LiveResumeProjectionResult,
} from "../resume-projection-live";
import { resolveProjectId } from "../project";
import type { ChangeSummary } from "../types";
import { sanitizeDashboardState } from "./config";
import type { DashboardDegradedSource, DashboardProjectConfig } from "./types";

export interface DashboardAdvCorrelationKeys {
  branches: string[];
  paths: string[];
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
  resume_projection?: unknown;
  degradedSources: DashboardDegradedSource[];
}

export interface DashboardAdvReaderDeps {
  resolveProjectId?: (path: string) => Promise<string | null>;
  loadBaseSummaries?: (projectId: string, now: Date) => Promise<ChangeSummary[]>;
  loadResumeProjection?: (projectId: string) => Promise<LiveResumeProjectionResult>;
  loadOpsChanges?: (projectId: string, timeoutMs: number) => Promise<unknown[]>;
  now?: () => Date;
}

export async function readDashboardAdvProject(
  project: DashboardProjectConfig,
  deps: DashboardAdvReaderDeps = {},
): Promise<DashboardAdvProjectSnapshot> {
  const now = deps.now?.() ?? new Date();
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
  const loadResume = deps.loadResumeProjection ?? loadLiveResumeProjection;
  const [baseSummaries, resumeResult] = await Promise.all([
    loadBase(projectId, now),
    loadResume(projectId).catch(
      (err): LiveResumeProjectionResult => ({
        live: false,
        error: err instanceof Error ? err.message : String(err),
        remediation:
          "ADV resume projection unavailable. Verify the project state directory contains readable change and Epic projections.",
      }),
    ),
  ]);
  const degradedSources: DashboardDegradedSource[] = [];
  if (!resumeResult.live && resumeResult.error) {
    degradedSources.push(
      degraded("RESUME_PROJECTION_UNAVAILABLE", resumeResult.error),
    );
  }

  const changes = baseSummaries.map((summary) => mergeAdvChange(summary));
  return sanitizeDashboardState({
    ok: true,
    project: projectIdentity(project),
    project_id: projectId,
    generated_at: now.toISOString(),
    changes,
    resume_projection: resumeResult.resume_projection,
    degradedSources,
  });
}

function mergeAdvChange(summary: ChangeSummary): DashboardAdvChange {
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    gateProgressStr: summary.gateProgressStr,
    firstIncompleteGate: summary.firstIncompleteGate,
    lastActivityAt: summary.lastActivityAt,
    ops_followup: undefined,
    ops_followup_links: undefined,
    correlation_keys: {
      branches: unique(summaryStringArray(summary.worktreeBranches)),
      paths: unique(summaryStringArray(summary.worktreePaths)),
      head_shas: [],
    },
  };
}

function summaryStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : [];
}

function projectIdentity(project: DashboardProjectConfig) {
  return { id: project.id, label: project.label, path: project.path };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function degraded(code: string, message: string): DashboardDegradedSource {
  return { source: "adv", code, message };
}
