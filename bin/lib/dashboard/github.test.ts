import { describe, expect, test } from "bun:test";

import {
  createDefaultGitHubTokenProvider,
  createGitHubDashboardClient,
  createGhCliTokenProvider,
  createStaticTokenProvider,
  DEFAULT_DEPLOYMENT_STATUS_LIMIT,
  type DashboardFetch,
} from "./github";

function jsonResponse(
  body: unknown,
  init: ResponseInit & { etag?: string } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.etag) headers.set("etag", init.etag);
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe("dashboard GitHub client", () => {
  test("uses bearer auth, GitHub headers, and bounded GET requests", async () => {
    const seen: Array<{ url: string; auth: string | null; method: string | undefined }> = [];
    const fetcher: DashboardFetch = async (url, init) => {
      seen.push({
        url: String(url),
        auth: new Headers(init?.headers).get("authorization"),
        method: init?.method,
      });
      if (String(url).includes("/deployments?")) return jsonResponse([{ id: 99 }], { status: 200 });
      return jsonResponse([], { status: 200 });
    };
    const client = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher,
    });

    const snapshot = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(snapshot.ok).toBe(true);
    expect(seen).toHaveLength(4);
    expect(seen.every((request) => request.method === "GET")).toBe(true);
    expect(seen.every((request) => request.auth === "Bearer ghp_secret123")).toBe(true);
    expect(seen[0]?.url).toContain("/pulls?state=open&per_page=100");
  });

  test("prioritizes current status by capping deployment status lookups", async () => {
    const seen: string[] = [];
    const deployments = Array.from({ length: 30 }, (_, index) => ({ id: index + 1 }));
    const fetcher: DashboardFetch = async (url) => {
      const text = String(url);
      seen.push(text);
      if (text.includes("/pulls?")) return jsonResponse([{ number: 7 }], { status: 200 });
      if (text.includes("/actions/runs?")) {
        return jsonResponse({ workflow_runs: [{ id: 8, status: "in_progress" }] }, { status: 200 });
      }
      if (text.includes("/deployments?")) return jsonResponse(deployments, { status: 200 });
      return jsonResponse([{ state: "in_progress" }], { status: 200 });
    };
    const client = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher,
    });

    const snapshot = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error("expected snapshot");
    expect(snapshot.data.pulls).toEqual([{ number: 7 }]);
    expect(snapshot.data.workflow_runs).toEqual([{ id: 8, status: "in_progress" }]);
    expect(snapshot.data.deployments).toHaveLength(30);
    expect(Object.keys(snapshot.data.deployment_statuses)).toEqual(
      Array.from({ length: DEFAULT_DEPLOYMENT_STATUS_LIMIT }, (_, index) => String(index + 1)),
    );
    expect(seen.filter((url) => url.includes("/statuses?")).length).toBe(
      DEFAULT_DEPLOYMENT_STATUS_LIMIT,
    );
  });

  test("runs bounded deployment status lookups concurrently", async () => {
    let inFlightStatuses = 0;
    let maxInFlightStatuses = 0;
    const fetcher: DashboardFetch = async (url) => {
      const text = String(url);
      if (text.includes("/deployments?")) {
        return jsonResponse(
          Array.from({ length: DEFAULT_DEPLOYMENT_STATUS_LIMIT }, (_, index) => ({ id: index + 1 })),
          { status: 200 },
        );
      }
      if (text.includes("/statuses?")) {
        inFlightStatuses++;
        maxInFlightStatuses = Math.max(maxInFlightStatuses, inFlightStatuses);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlightStatuses--;
        return jsonResponse([{ state: "success" }], { status: 200 });
      }
      return jsonResponse([], { status: 200 });
    };
    const client = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher,
    });

    const snapshot = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(snapshot.ok).toBe(true);
    expect(maxInFlightStatuses).toBeGreaterThan(1);
  });

  test("reuses cached body for etag 304 responses", async () => {
    let calls = 0;
    const fetcher: DashboardFetch = async (_url, init) => {
      calls++;
      if (calls === 1) return jsonResponse([{ number: 1 }], { status: 200, etag: "abc" });
      expect(new Headers(init?.headers).get("if-none-match")).toBe("abc");
      return new Response(null, { status: 304 });
    };
    const client = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher,
      endpoints: ["pulls"],
    });

    const first = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });
    const second = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected cached response");
    expect(second.data.pulls).toEqual([{ number: 1 }]);
  });

  test("degrades without exposing token material", async () => {
    const client = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider(null),
      fetcher: async () => jsonResponse([]),
    });

    const snapshot = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(snapshot.ok).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("ghp_");
    expect(JSON.stringify(snapshot)).not.toContain("token");
    if (snapshot.ok) throw new Error("expected degraded result");
    expect(snapshot.degraded.code).toBe("GITHUB_AUTH_UNAVAILABLE");
    expect(snapshot.degraded.setup?.commands).toContain("gh auth login");
    expect(JSON.stringify(snapshot.degraded)).not.toContain("stderr");
  });

  test("falls back to gh auth token when GITHUB_TOKEN is absent", async () => {
    const tokenProvider = createDefaultGitHubTokenProvider({
      env: {},
      ghCliTokenProvider: createGhCliTokenProvider({
        exec: async () => ({ exitCode: 0, stdout: "ghp_from_cli\n", stderr: "" }),
      }),
    });
    const seen: string[] = [];
    const client = createGitHubDashboardClient({
      tokenProvider,
      fetcher: async (_url, init) => {
        seen.push(new Headers(init?.headers).get("authorization") ?? "");
        return jsonResponse([], { status: 200 });
      },
      endpoints: ["pulls"],
    });

    const snapshot = await client.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(snapshot.ok).toBe(true);
    expect(seen).toEqual(["Bearer ghp_from_cli"]);
  });

  test("distinguishes secondary and primary rate-limit signals", async () => {
    const secondaryClient = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher: async () => new Response("slow down", { status: 403, headers: { "retry-after": "9" } }),
      endpoints: ["pulls"],
    });
    const primaryClient = createGitHubDashboardClient({
      tokenProvider: createStaticTokenProvider("ghp_secret123"),
      fetcher: async () =>
        new Response("rate limited", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1782424800" },
        }),
      endpoints: ["pulls"],
    });

    const secondary = await secondaryClient.readRepository({ owner: "Sharper-Flow", repo: "Advance" });
    const primary = await primaryClient.readRepository({ owner: "Sharper-Flow", repo: "Advance" });

    expect(secondary.ok).toBe(false);
    expect(primary.ok).toBe(false);
    if (secondary.ok || primary.ok) throw new Error("expected degraded results");
    expect(secondary.degraded.code).toBe("GITHUB_SECONDARY_RATE_LIMIT");
    expect(secondary.degraded.retry_after_seconds).toBe(9);
    expect(primary.degraded.code).toBe("GITHUB_PRIMARY_RATE_LIMIT");
    expect(primary.degraded.rate_limit_reset_at).toBe("2026-06-25T22:00:00.000Z");
  });
});
