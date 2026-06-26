import { describe, expect, test } from "bun:test";

import { parseDashboardConfig } from "./config";
import {
  buildDashboardState,
  createDashboardHandler,
  createDashboardStateProvider,
  normalizeDashboardServerOptions,
} from "./server";

function config() {
  const parsed = parseDashboardConfig({
    schema_version: 1,
    refresh_seconds: 45,
    projects: [
      {
        id: "advance",
        label: "Advance",
        path: "/repo/advance",
        github: { owner: "Sharper-Flow", repo: "Advance" },
      },
      {
        id: "toolbox",
        label: "Toolbox",
        path: "/repo/toolbox",
        github: { owner: "Sharper-Flow", repo: "toolbox" },
      },
    ],
  });
  if (!parsed.ok) throw new Error("config parse failed");
  return parsed.config;
}

describe("dashboard server state", () => {
  test("composes projects independently and degrades one source only", async () => {
    const state = await buildDashboardState(config(), {
      now: () => new Date("2026-06-25T22:00:00.000Z"),
      advReader: async (project) => ({
        ok: true,
        project: { id: project.id, label: project.label, path: project.path },
        project_id: `${project.id}-pid`,
        generated_at: "2026-06-25T22:00:00.000Z",
        changes: [],
        degradedSources: [],
      }),
      githubReader: async (project) =>
        project.id === "toolbox"
          ? {
              ok: false,
              degraded: {
                source: "github",
                code: "GITHUB_AUTH_UNAVAILABLE",
                message: "GitHub auth unavailable.",
              },
              fetched_at: "2026-06-25T22:00:00.000Z",
            }
          : {
              ok: true,
              data: {
                pulls: [],
                workflow_runs: [],
                deployments: [],
                deployment_statuses: {},
              },
              fetched_at: "2026-06-25T22:00:00.000Z",
            },
    });

    expect(state.schema_version).toBe(1);
    expect(state.refresh_seconds).toBe(45);
    expect(state.projects.map((project) => project.id)).toEqual([
      "advance",
      "toolbox",
    ]);
    expect(state.projects[0]?.degradedSources).toEqual([]);
    expect(
      state.projects[1]?.degradedSources.map((source) => source.code),
    ).toEqual(["GITHUB_AUTH_UNAVAILABLE"]);
  });

  test("contains thrown reader failures to the affected project and source", async () => {
    const state = await buildDashboardState(config(), {
      now: () => new Date("2026-06-25T22:00:00.000Z"),
      advReader: async (project) => {
        if (project.id === "toolbox")
          throw new Error("Temporal token ghp_secret123 leaked");
        return {
          ok: true,
          project: { id: project.id, label: project.label, path: project.path },
          project_id: `${project.id}-pid`,
          generated_at: "2026-06-25T22:00:00.000Z",
          changes: [],
          degradedSources: [],
        };
      },
      githubReader: async (project) => {
        if (project.id === "advance")
          throw new Error("GitHub token ghp_secret123 leaked");
        return {
          ok: true,
          data: {
            pulls: [],
            workflow_runs: [],
            deployments: [],
            deployment_statuses: {},
          },
          fetched_at: "2026-06-25T22:00:00.000Z",
        };
      },
    });

    expect(state.projects.map((project) => project.id)).toEqual([
      "advance",
      "toolbox",
    ]);
    expect(
      state.projects[0]?.degradedSources.map((source) => source.code),
    ).toEqual(["GITHUB_READ_FAILED"]);
    expect(
      state.projects[1]?.degradedSources.map((source) => source.code),
    ).toEqual(["ADV_READ_FAILED"]);
    expect(JSON.stringify(state)).not.toContain("ghp_secret123");
    expect(JSON.stringify(state)).not.toContain("token");
  });

  test("bounds reader stalls so later projects still render", async () => {
    const state = await buildDashboardState(config(), {
      now: () => new Date("2026-06-25T22:00:00.000Z"),
      readerTimeoutMs: 1,
      advReader: async (project) => ({
        ok: true,
        project: { id: project.id, label: project.label, path: project.path },
        project_id: `${project.id}-pid`,
        generated_at: "2026-06-25T22:00:00.000Z",
        changes: [],
        degradedSources: [],
      }),
      githubReader: async (project) => {
        if (project.id === "advance") return new Promise(() => {});
        return {
          ok: true,
          data: {
            pulls: [],
            workflow_runs: [],
            deployments: [],
            deployment_statuses: {},
          },
          fetched_at: "2026-06-25T22:00:00.000Z",
        };
      },
    });

    expect(state.projects.map((project) => project.id)).toEqual([
      "advance",
      "toolbox",
    ]);
    expect(
      state.projects[0]?.degradedSources.map((source) => source.code),
    ).toEqual(["GITHUB_READ_TIMEOUT"]);
    expect(state.projects[1]?.degradedSources).toEqual([]);
  });

  test("attaches latest deployment failure to the linked ADV change", async () => {
    const state = await buildDashboardState(config(), {
      now: () => new Date("2026-06-25T22:00:00.000Z"),
      advReader: async (project) => ({
        ok: true,
        project: { id: project.id, label: project.label, path: project.path },
        project_id: `${project.id}-pid`,
        generated_at: "2026-06-25T22:00:00.000Z",
        changes:
          project.id === "advance"
            ? [
                {
                  id: "addLocalDashboard",
                  title: "Add local dashboard",
                  status: "active",
                  gateProgressStr: "review",
                  firstIncompleteGate: "review",
                  lastActivityAt: "2026-06-25T22:00:00.000Z",
                  ops_followup: {
                    env: "prod",
                    completion_signal: "dashboard-ready",
                    status: "success",
                  },
                  correlation_keys: {
                    branches: ["change/addLocalDashboard"],
                    head_shas: [],
                  },
                },
              ]
            : [],
        degradedSources: [],
      }),
      githubReader: async (project) => ({
        ok: true,
        data: {
          pulls: [],
          workflow_runs: [],
          deployments:
            project.id === "advance"
              ? [{ id: 9, ref: "change/addLocalDashboard" }]
              : [],
          deployment_statuses:
            project.id === "advance" ? { "9": { state: "failure" } } : {},
        },
        fetched_at: "2026-06-25T22:00:00.000Z",
      }),
    });

    const needsAttention = state.projects[0]?.lanes.needs_attention ?? [];
    const advChange = needsAttention.find(
      (item) => item.kind === "adv_change_status",
    );

    expect(advChange).toMatchObject({
      changeId: "addLocalDashboard",
      title: "Add local dashboard",
      latest: {
        overall: "attention",
        deployment: expect.objectContaining({
          status: "failure",
          title: "Deployment",
          metadata: expect.arrayContaining([
            { label: "Repo", value: "Sharper-Flow/Advance" },
            { label: "Ref", value: "change/addLocalDashboard" },
            { label: "Deployment", value: "failure" },
          ]),
        }),
      },
    });
    expect(advChange?.sources.deployments[0]?.evidence).toBe(
      "deployment.ref: change/addLocalDashboard",
    );
  });

  test("builds change-centered lanes and keeps unmatched source secondary", async () => {
    const state = await buildDashboardState(config(), {
      now: () => new Date("2026-06-26T05:00:00.000Z"),
      advReader: async (project) => ({
        ok: true,
        project: { id: project.id, label: project.label, path: project.path },
        project_id: `${project.id}-pid`,
        generated_at: "2026-06-26T05:00:00.000Z",
        changes:
          project.id === "advance"
            ? [
                {
                  id: "evaluatePrintingIdentityField",
                  title: "Evaluate printing identity field",
                  status: "active",
                  gateProgressStr: "execution",
                  firstIncompleteGate: "execution",
                  lastActivityAt: "2026-06-25T20:00:00.000Z",
                  correlation_keys: {
                    branches: ["change/evaluatePrintingIdentityField"],
                    head_shas: [],
                  },
                },
                ...Array.from({ length: 3 }, (_, index) => ({
                  id: `draft${index}`,
                  title: `Draft ${index}`,
                  status: "draft",
                  gateProgressStr:
                    "proposal ○ discovery ○ design ○ planning ○ execution ○ acceptance ○ release ○",
                  firstIncompleteGate: "proposal",
                  lastActivityAt: `2026-06-25T20:0${index}:00.000Z`,
                  correlation_keys: {
                    branches: [`change/draft${index}`],
                    head_shas: [],
                  },
                })),
              ]
            : [],
        degradedSources: [],
      }),
      githubReader: async (project) => ({
        ok: true,
        data: {
          pulls:
            project.id === "advance"
              ? [
                  {
                    number: 567,
                    title: "Fan out image migration keys",
                    html_url: "https://github.com/Sharper-Flow/Advance/pull/567",
                    state: "open",
                    updated_at: "2026-06-19T15:45:19Z",
                    head: {
                      ref: "change/fanOutImageMigrationDuplicate",
                      sha: "f0aae45e5fe2",
                    },
                  },
                ]
              : [],
          workflow_runs:
            project.id === "advance"
              ? [
                  {
                    id: 1,
                    name: "PR Gate",
                    status: "completed",
                    conclusion: "failure",
                    html_url: "https://github.com/Sharper-Flow/Advance/actions/runs/1",
                    head_branch: "change/evaluatePrintingIdentityField",
                    head_sha: "111111111111",
                    updated_at: "2026-06-25T16:31:44Z",
                  },
                  {
                    id: 2,
                    name: "PR Gate",
                    status: "completed",
                    conclusion: "failure",
                    html_url: "https://github.com/Sharper-Flow/Advance/actions/runs/2",
                    head_branch: "change/evaluatePrintingIdentityField",
                    head_sha: "222222222222",
                    updated_at: "2026-06-25T17:22:39Z",
                  },
                ]
              : [],
          deployments:
            project.id === "advance"
              ? [
                  {
                    id: 10,
                    environment: "production",
                    ref: "main",
                    updated_at: "2026-06-25T20:00:00Z",
                  },
                  {
                    id: 11,
                    environment: "production",
                    ref: "main",
                    updated_at: "2026-06-25T21:00:00Z",
                  },
                ]
              : [],
          deployment_statuses:
            project.id === "advance"
              ? {
                  "10": { state: "inactive", updated_at: "2026-06-25T22:56:25Z" },
                  "11": { state: "inactive", updated_at: "2026-06-26T01:06:22Z" },
                }
              : {},
        },
        fetched_at: "2026-06-26T05:00:00.000Z",
      }),
    });

    const lanes = state.projects[0]?.lanes;
    expect(Object.keys(lanes ?? {})).toEqual([
      "needs_attention",
      "running",
      "ready_landed",
      "backlog",
      "unmatched_source",
    ]);
    expect(lanes?.needs_attention).toHaveLength(1);
    expect(lanes?.needs_attention[0]).toMatchObject({
      kind: "adv_change_status",
      changeId: "evaluatePrintingIdentityField",
      latest: { overall: "attention", ci: { status: "failure" } },
    });
    expect(lanes?.unmatched_source.map((item) => item.kind)).toEqual([
      "pull",
      "group",
    ]);
    expect(lanes?.unmatched_source[1]).toMatchObject({
      kind: "group",
      groupKind: "deployment",
      count: 2,
      latestUpdatedAt: "2026-06-26T01:06:22Z",
    });
    expect(lanes?.backlog.map((item) => item.changeId)).toEqual([
      "draft0",
      "draft1",
      "draft2",
    ]);
  });

  test("serves GET routes and rejects mutation methods", async () => {
    const handler = createDashboardHandler({
      config: config(),
      stateBuilder: async () => ({
        schema_version: 1,
        generated_at: "2026-06-25T22:00:00.000Z",
        refresh_seconds: 45,
        projects: [],
      }),
      html: "<html><body>Dashboard</body></html>",
    });

    const api = await handler(new Request("http://127.0.0.1/api/state"));
    const page = await handler(new Request("http://127.0.0.1/"));
    const post = await handler(
      new Request("http://127.0.0.1/api/state", { method: "POST" }),
    );

    expect(api.status).toBe(200);
    expect(await api.json()).toMatchObject({
      schema_version: 1,
      refresh_seconds: 45,
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Dashboard");
    expect(post.status).toBe(405);
  });

  test("caches and coalesces /api/state refreshes for one refresh interval", async () => {
    let calls = 0;
    let nowMs = Date.parse("2026-06-25T22:00:00.000Z");
    const provider = createDashboardStateProvider(config(), {
      now: () => new Date(nowMs),
      stateBuilder: async () => {
        calls++;
        await Promise.resolve();
        return {
          schema_version: 1,
          generated_at: new Date(nowMs).toISOString(),
          refresh_seconds: 45,
          projects: [],
        };
      },
    });

    await Promise.all([provider(), provider(), provider()]);
    expect(calls).toBe(1);

    await provider();
    expect(calls).toBe(1);

    nowMs += 46_000;
    await Promise.all([provider(), provider()]);
    expect(calls).toBe(2);
  });

  test("defaults to loopback and requires explicit opt-in for non-loopback host", () => {
    expect(normalizeDashboardServerOptions({}).host).toBe("127.0.0.1");
    expect(() => normalizeDashboardServerOptions({ host: "0.0.0.0" })).toThrow(
      "non-loopback",
    );
    expect(
      normalizeDashboardServerOptions({
        host: "0.0.0.0",
        allowNetworkHost: true,
      }).host,
    ).toBe("0.0.0.0");
  });
});
