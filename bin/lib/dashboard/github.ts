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

export interface GhCliTokenExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type GhCliTokenExec = () => Promise<GhCliTokenExecResult>;

export interface GhCliTokenProviderOptions {
  exec?: GhCliTokenExec;
  timeoutMs?: number;
}

export interface DefaultGitHubTokenProviderOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  ghCliTokenProvider?: GitHubTokenProvider;
}

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
export const DEFAULT_DEPLOYMENT_STATUS_LIMIT = 6;
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

export function createGhCliTokenProvider(
  options: GhCliTokenProviderOptions = {},
): GitHubTokenProvider {
  const timeoutMs = options.timeoutMs ?? 2500;
  const exec = options.exec ?? (() => execGhAuthToken(timeoutMs));
  return async () => {
    try {
      const result = await withTimeout(
        exec(),
        timeoutMs + 100,
        () => new Error("GH_AUTH_TOKEN_TIMEOUT"),
      );
      if (result.exitCode !== 0) return null;
      const token = result.stdout.trim().split(/\s+/)[0] ?? "";
      return token.length > 0 ? token : null;
    } catch {
      return null;
    }
  };
}

export function createDefaultGitHubTokenProvider(
  options: DefaultGitHubTokenProviderOptions = {},
): GitHubTokenProvider {
  const envProvider = createEnvTokenProvider(options.env as NodeJS.ProcessEnv | undefined);
  const ghProvider = options.ghCliTokenProvider ?? createGhCliTokenProvider();
  return async () => (await envProvider()) ?? (await ghProvider());
}

export function createGitHubDashboardClient(
  options: GitHubDashboardClientOptions = {},
): GitHubDashboardClient {
  const tokenProvider = options.tokenProvider ?? createDefaultGitHubTokenProvider();
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
        return authUnavailable(fetchedAt);
      }

      try {
        const data: GitHubDashboardData = {
          pulls: [],
          workflow_runs: [],
          deployments: [],
          deployment_statuses: {},
        };
        await Promise.all(
          endpoints.map(async (endpoint) => {
            if (endpoint === "pulls") {
              data.pulls = asArray(await requestJson(repoUrl(repo, "pulls?state=open&per_page=100"), token));
            } else if (endpoint === "workflow_runs") {
              const runs = await requestJson(repoUrl(repo, "actions/runs?per_page=100"), token);
              data.workflow_runs = asArray(isRecord(runs) ? runs.workflow_runs : runs);
            } else if (endpoint === "deployments") {
              data.deployments = asArray(await requestJson(repoUrl(repo, "deployments?per_page=30"), token));
              const currentDeployments = data.deployments
                .filter((deployment) => isRecord(deployment) && deployment.id !== undefined)
                .slice(0, DEFAULT_DEPLOYMENT_STATUS_LIMIT) as Record<string, unknown>[];
              const statusEntries = await Promise.all(
                currentDeployments.map(async (deployment) => {
                  const id = String(deployment.id);
                  const statuses = asArray(
                    await requestJson(repoUrl(repo, `deployments/${encodeURIComponent(id)}/statuses?per_page=1`), token),
                  );
                  return [id, statuses[0] ?? null] as const;
                }),
              );
              for (const [id, status] of statusEntries) data.deployment_statuses[id] = status;
            }
          }),
        );
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

function authUnavailable(fetchedAt: string): GitHubDashboardResult {
  return {
    ok: false,
    degraded: {
      source: "github",
      code: "GITHUB_AUTH_UNAVAILABLE",
      message: "GitHub authentication unavailable.",
      setup: {
        title: "Connect GitHub locally",
        message: "Run GitHub CLI login or set GITHUB_TOKEN for pull request, Actions, and deployment data.",
        commands: ["gh auth login"],
        env_vars: ["GITHUB_TOKEN"],
      },
    },
    fetched_at: fetchedAt,
  };
}

async function execGhAuthToken(timeoutMs: number): Promise<GhCliTokenExecResult> {
  const bun = (globalThis as any).Bun;
  if (!bun || typeof bun.spawn !== "function") {
    return { exitCode: 1, stdout: "", stderr: "Bun.spawn unavailable" };
  }
  const proc = bun.spawn(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (typeof proc.kill === "function") proc.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode: timedOut ? 124 : exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
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

function isDegradedSource(error: unknown): error is DashboardDegradedSource {
  return isRecord(error) && error.source === "github" && typeof error.code === "string";
}
