import { describe, expect, test } from "bun:test";

import { parseDashboardConfig } from "./config";
import {
  buildDashboardState,
  createDashboardHandler,
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

  test("keeps GitHub deployment status and ADV ops evidence separately visible", async () => {
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

    const linked = state.projects[0]?.lanes.linked ?? [];
    const deployment = linked.find((item) => item.kind === "deployment");
    const ops = linked.find((item) => item.kind === "ops");

    expect(deployment?.source_states).toEqual({ github_deployment: "failure" });
    expect(ops?.status).toBe("success");
    expect(deployment?.evidence).toBe(
      "deployment.ref: change/addLocalDashboard",
    );
    expect(ops?.evidence).toBe(
      "ops.environment+completion_signal: prod/dashboard-ready",
    );
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
