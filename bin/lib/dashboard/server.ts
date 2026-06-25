import { readDashboardAdvProject, type DashboardAdvProjectSnapshot } from "./adv";
import { buildAttentionLanes } from "./attention";
import { correlateDashboardItems } from "./correlation";
import { createGitHubDashboardClient, type GitHubDashboardResult } from "./github";
import type { DashboardConfig, DashboardDegradedSource, DashboardProjectConfig } from "./types";

export interface DashboardProjectState {
  id: string;
  label: string;
  path: string;
  project_id: string;
  generated_at: string;
  changes: DashboardAdvProjectSnapshot["changes"];
  lanes: ReturnType<typeof buildAttentionLanes>;
  degradedSources: DashboardDegradedSource[];
}

export interface DashboardApiState {
  schema_version: 1;
  generated_at: string;
  refresh_seconds: number;
  projects: DashboardProjectState[];
}

export interface DashboardStateDeps {
  now?: () => Date;
  advReader?: (project: DashboardProjectConfig) => Promise<DashboardAdvProjectSnapshot>;
  githubReader?: (project: DashboardProjectConfig) => Promise<GitHubDashboardResult>;
}

export async function buildDashboardState(
  config: DashboardConfig,
  deps: DashboardStateDeps = {},
): Promise<DashboardApiState> {
  const now = deps.now?.() ?? new Date();
  const githubClient = createGitHubDashboardClient({ now: () => now });
  const advReader = deps.advReader ?? readDashboardAdvProject;
  const githubReader =
    deps.githubReader ??
    ((project: DashboardProjectConfig) => githubClient.readRepository(project.github));

  const projects: DashboardProjectState[] = [];
  for (const project of config.projects) {
    const adv = await advReader(project);
    const github = await githubReader(project);
    const degradedSources = [...adv.degradedSources];
    const githubData = github.ok
      ? github.data
      : { pulls: [], workflow_runs: [], deployments: [], deployment_statuses: {} };
    if (!github.ok) degradedSources.push(github.degraded);
    const correlated = correlateDashboardItems({
      changes: adv.changes,
      pulls: githubData.pulls,
      workflow_runs: githubData.workflow_runs,
      deployments: githubData.deployments,
      ops: adv.changes.map((change) => change.ops_followup).filter((value) => value !== undefined),
    });

    projects.push({
      id: project.id,
      label: project.label,
      path: project.path,
      project_id: adv.project_id,
      generated_at: adv.generated_at,
      changes: adv.changes,
      lanes: buildAttentionLanes({ ...correlated, degradedSources }),
      degradedSources,
    });
  }

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    refresh_seconds: config.refresh_seconds,
    projects,
  };
}

export interface DashboardHandlerOptions {
  config: DashboardConfig;
  stateBuilder?: () => Promise<DashboardApiState>;
  html?: string;
}

export function createDashboardHandler(options: DashboardHandlerOptions) {
  return async function handleDashboardRequest(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      const state = await (options.stateBuilder ?? (() => buildDashboardState(options.config)))();
      return Response.json(state);
    }
    if (url.pathname === "/") {
      return new Response(options.html ?? defaultDashboardHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };
}

export interface DashboardServerOptions {
  host?: string;
  port?: number;
  allowNetworkHost?: boolean;
}

export function normalizeDashboardServerOptions(options: DashboardServerOptions): Required<DashboardServerOptions> {
  const host = options.host ?? "127.0.0.1";
  if (!options.allowNetworkHost && !isLoopbackHost(host)) {
    throw new Error("dashboard host must be loopback; pass explicit non-loopback opt-in to use a network host");
  }
  return { host, port: options.port ?? 8765, allowNetworkHost: options.allowNetworkHost ?? false };
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function defaultDashboardHtml(): string {
  return "<!doctype html><html><head><title>ADV Dashboard</title></head><body><main id=\"app\">ADV Dashboard</main></body></html>";
}
