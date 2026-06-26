import {
  readDashboardAdvProject,
  type DashboardAdvProjectSnapshot,
} from "./adv";
import { buildAttentionLanes } from "./attention";
import { correlateDashboardItems } from "./correlation";
import {
  createGitHubDashboardClient,
  type GitHubDashboardResult,
} from "./github";
import { sanitizeDashboardState } from "./config";
import { renderDashboardHtml } from "./ui";
import type {
  DashboardConfig,
  DashboardDegradedSource,
  DashboardProjectConfig,
} from "./types";

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
  readerTimeoutMs?: number;
  advReader?: (
    project: DashboardProjectConfig,
  ) => Promise<DashboardAdvProjectSnapshot>;
  githubReader?: (
    project: DashboardProjectConfig,
  ) => Promise<GitHubDashboardResult>;
}

export interface DashboardStateProviderOptions extends DashboardStateDeps {
  stateBuilder?: () => Promise<DashboardApiState>;
}

export function createDashboardStateProvider(
  config: DashboardConfig,
  options: DashboardStateProviderOptions = {},
): () => Promise<DashboardApiState> {
  const now = options.now ?? (() => new Date());
  const ttlMs = config.refresh_seconds * 1000;
  let cached: { state: DashboardApiState; expiresAtMs: number } | undefined;
  let inFlight: Promise<DashboardApiState> | undefined;

  async function refresh(): Promise<DashboardApiState> {
    const state = options.stateBuilder
      ? await options.stateBuilder()
      : await buildDashboardState(config, {
          now,
          readerTimeoutMs: options.readerTimeoutMs,
          advReader: options.advReader,
          githubReader: options.githubReader,
        });
    cached = { state, expiresAtMs: now().getTime() + ttlMs };
    return state;
  }

  return function getDashboardState(): Promise<DashboardApiState> {
    const nowMs = now().getTime();
    if (cached && nowMs < cached.expiresAtMs) return Promise.resolve(cached.state);
    if (inFlight) return inFlight;
    inFlight = refresh().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}

export async function buildDashboardState(
  config: DashboardConfig,
  deps: DashboardStateDeps = {},
): Promise<DashboardApiState> {
  const now = deps.now?.() ?? new Date();
  const readerTimeoutMs = deps.readerTimeoutMs ?? 10_000;
  const githubClient = createGitHubDashboardClient({ now: () => now });
  const advReader = deps.advReader ?? readDashboardAdvProject;
  const githubReader =
    deps.githubReader ??
    ((project: DashboardProjectConfig) =>
      githubClient.readRepository(project.github));

  const projects = await Promise.all(
    config.projects.map(async (project): Promise<DashboardProjectState> => {
      const [adv, github] = await Promise.all([
        readAdvProjectSafely(project, advReader, now, readerTimeoutMs),
        readGitHubProjectSafely(project, githubReader, now, readerTimeoutMs),
      ]);
      const degradedSources = [...adv.degradedSources];
      const githubData = github.ok
        ? github.data
        : {
            pulls: [],
            workflow_runs: [],
            deployments: [],
            deployment_statuses: {},
          };
      if (!github.ok) degradedSources.push(github.degraded);
      const correlated = correlateDashboardItems({
        changes: adv.changes,
        pulls: githubData.pulls,
        workflow_runs: githubData.workflow_runs,
        deployments: withDeploymentSourceStates(
          githubData.deployments,
          githubData.deployment_statuses,
        ),
        ops: adv.changes
          .map((change) => change.ops_followup)
          .filter((value) => value !== undefined),
      });

      return {
        id: project.id,
        label: project.label,
        path: project.path,
        project_id: adv.project_id,
        generated_at: adv.generated_at,
        changes: adv.changes,
        lanes: buildAttentionLanes({
          changes: adv.changes,
          ...correlated,
          degradedSources,
        }),
        degradedSources,
      };
    }),
  );

  return sanitizeDashboardState({
    schema_version: 1,
    generated_at: now.toISOString(),
    refresh_seconds: config.refresh_seconds,
    projects,
  });
}

function withDeploymentSourceStates(
  deployments: unknown[],
  deploymentStatuses: Record<string, unknown>,
): unknown[] {
  return deployments.map((deployment) => {
    const item = record(deployment);
    if (!item || item.id === undefined) return deployment;
    const status = deploymentStatusValue(deploymentStatuses[String(item.id)]);
    if (!status) return deployment;
    return {
      ...item,
      source_states: {
        ...record(item.source_states),
        github_deployment: status,
      },
    };
  });
}

function deploymentStatusValue(status: unknown): string | undefined {
  const item = record(status);
  const value = item?.state ?? item?.status;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function readAdvProjectSafely(
  project: DashboardProjectConfig,
  advReader: (
    project: DashboardProjectConfig,
  ) => Promise<DashboardAdvProjectSnapshot>,
  now: Date,
  timeoutMs: number,
): Promise<DashboardAdvProjectSnapshot> {
  try {
    return await withTimeout(
      advReader(project),
      timeoutMs,
      () => new Error("ADV_READ_TIMEOUT"),
    );
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "ADV_READ_TIMEOUT";
    return {
      ok: true,
      project: { id: project.id, label: project.label, path: project.path },
      project_id: "unknown",
      generated_at: now.toISOString(),
      changes: [],
      degradedSources: [
        {
          source: "adv",
          code: timedOut ? "ADV_READ_TIMEOUT" : "ADV_READ_FAILED",
          message: timedOut
            ? "ADV read timed out; other sources remain visible."
            : "ADV read failed; other sources remain visible.",
        },
      ],
    };
  }
}

async function readGitHubProjectSafely(
  project: DashboardProjectConfig,
  githubReader: (
    project: DashboardProjectConfig,
  ) => Promise<GitHubDashboardResult>,
  now: Date,
  timeoutMs: number,
): Promise<GitHubDashboardResult> {
  try {
    return await withTimeout(
      githubReader(project),
      timeoutMs,
      () => new Error("GITHUB_READ_TIMEOUT"),
    );
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "GITHUB_READ_TIMEOUT";
    return {
      ok: false,
      fetched_at: now.toISOString(),
      degraded: {
        source: "github",
        code: timedOut ? "GITHUB_READ_TIMEOUT" : "GITHUB_READ_FAILED",
        message: timedOut
          ? "GitHub read timed out; other sources remain visible."
          : "GitHub read failed; other sources remain visible.",
      },
    };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
}

export interface DashboardHandlerOptions {
  config: DashboardConfig;
  stateBuilder?: () => Promise<DashboardApiState>;
  html?: string;
}

export function createDashboardHandler(options: DashboardHandlerOptions) {
  const stateBuilder =
    options.stateBuilder ?? createDashboardStateProvider(options.config);
  return async function handleDashboardRequest(
    request: Request,
  ): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET" },
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      const state = await stateBuilder();
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

export function normalizeDashboardServerOptions(
  options: DashboardServerOptions,
): Required<DashboardServerOptions> {
  const host = options.host ?? "127.0.0.1";
  if (!options.allowNetworkHost && !isLoopbackHost(host)) {
    throw new Error(
      "dashboard host must be loopback; pass explicit non-loopback opt-in to use a network host",
    );
  }
  return {
    host,
    port: options.port ?? 8765,
    allowNetworkHost: options.allowNetworkHost ?? false,
  };
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function defaultDashboardHtml(): string {
  return renderDashboardHtml();
}
