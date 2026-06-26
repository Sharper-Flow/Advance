import { sanitizeDashboardState } from "./config";
import type { DashboardDegradedSource } from "./types";

export type DashboardFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export type GitHubEndpoint = "pulls" | "workflow_runs" | "deployments";

export interface GitHubDashboardData {
  pulls: unknown[];
  workflow_runs: unknown[];
  deployments: unknown[];
  deployment_statuses: Record<string, unknown>;
}

export type GitHubDashboardResult =
  | { ok: true; data: GitHubDashboardData; fetched_at: string }
  | { ok: false; degraded: DashboardDegradedSource; fetched_at: string };

export type GitHubTokenProvider = () => Promise<string | null>;

interface CacheEntry {
  etag?: string;
  body: unknown;
}

export interface GitHubDashboardClientOptions {
  tokenProvider?: GitHubTokenProvider;
  fetcher?: DashboardFetch;
  now?: () => Date;
  endpoints?: GitHubEndpoint[];
}

export interface GitHubDashboardClient {
  readRepository(repo: GitHubRepoRef): Promise<GitHubDashboardResult>;
}

const DEFAULT_ENDPOINTS: GitHubEndpoint[] = ["pulls", "workflow_runs", "deployments"];
const API_ROOT = "https://api.github.com";

export function createStaticTokenProvider(token: string | null): GitHubTokenProvider {
  return async () => token;
}

export function createEnvTokenProvider(env: NodeJS.ProcessEnv = process.env): GitHubTokenProvider {
  return async () => {
    const token = env.GITHUB_TOKEN?.trim();
    return token && token.length > 0 ? token : null;
  };
}

export function createGitHubDashboardClient(
  options: GitHubDashboardClientOptions = {},
): GitHubDashboardClient {
  const tokenProvider = options.tokenProvider ?? createEnvTokenProvider();
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
  const cache = new Map<string, CacheEntry>();

  async function requestJson(url: string, token: string): Promise<unknown> {
    const cached = cache.get(url);
    const headers = new Headers({
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    });
    if (cached?.etag) headers.set("if-none-match", cached.etag);

    const response = await fetcher(url, { method: "GET", headers });
    if (response.status === 304 && cached) return cached.body;
    if (!response.ok) throw githubFailure(response);

    const body = (await response.json()) as unknown;
    const etag = response.headers.get("etag") ?? undefined;
    cache.set(url, { etag, body });
    return body;
  }

  return {
    async readRepository(repo: GitHubRepoRef): Promise<GitHubDashboardResult> {
      const fetchedAt = now().toISOString();
      const token = await tokenProvider();
      if (!token) {
        return degraded("GITHUB_AUTH_UNAVAILABLE", "GitHub authentication unavailable.", fetchedAt);
      }

      try {
        const data: GitHubDashboardData = {
          pulls: [],
          workflow_runs: [],
          deployments: [],
          deployment_statuses: {},
        };
        for (const endpoint of endpoints) {
          if (endpoint === "pulls") {
            data.pulls = asArray(await requestJson(repoUrl(repo, "pulls?state=open&per_page=100"), token));
          } else if (endpoint === "workflow_runs") {
            const runs = await requestJson(repoUrl(repo, "actions/runs?per_page=100"), token);
            data.workflow_runs = asArray(isRecord(runs) ? runs.workflow_runs : runs);
          } else if (endpoint === "deployments") {
            data.deployments = asArray(await requestJson(repoUrl(repo, "deployments?per_page=30"), token));
            for (const deployment of data.deployments) {
              if (!isRecord(deployment) || deployment.id === undefined) continue;
              const id = String(deployment.id);
              const statuses = asArray(
                await requestJson(repoUrl(repo, `deployments/${encodeURIComponent(id)}/statuses?per_page=1`), token),
              );
              data.deployment_statuses[id] = statuses[0] ?? null;
            }
          }
        }
        return sanitizeDashboardState({ ok: true, data, fetched_at: fetchedAt }) as GitHubDashboardResult;
      } catch (error) {
        return sanitizeDashboardState(failureToResult(error, fetchedAt)) as GitHubDashboardResult;
      }
    },
  };
}

function repoUrl(repo: GitHubRepoRef, suffix: string): string {
  return `${API_ROOT}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${suffix}`;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function githubFailure(response: Response): DashboardDegradedSource {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return {
      source: "github",
      code: "GITHUB_SECONDARY_RATE_LIMIT",
      message: "GitHub secondary rate limit reached.",
      retry_after_seconds: retryAfter,
    };
  }

  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    return {
      source: "github",
      code: "GITHUB_PRIMARY_RATE_LIMIT",
      message: "GitHub primary rate limit reached.",
      rate_limit_reset_at: Number.isFinite(resetSeconds)
        ? new Date(resetSeconds * 1000).toISOString()
        : undefined,
    };
  }

  return {
    source: "github",
    code: `GITHUB_HTTP_${response.status}`,
    message: `GitHub read failed with HTTP ${response.status}.`,
  };
}

function failureToResult(error: unknown, fetchedAt: string): GitHubDashboardResult {
  if (isDegradedSource(error)) return { ok: false, degraded: error, fetched_at: fetchedAt };
  const message = error instanceof Error ? error.message : String(error);
  return degraded("GITHUB_READ_FAILED", message, fetchedAt);
}

function degraded(code: string, message: string, fetchedAt: string): GitHubDashboardResult {
  return { ok: false, degraded: { source: "github", code, message }, fetched_at: fetchedAt };
}

function isDegradedSource(error: unknown): error is DashboardDegradedSource {
  return isRecord(error) && error.source === "github" && typeof error.code === "string";
}
