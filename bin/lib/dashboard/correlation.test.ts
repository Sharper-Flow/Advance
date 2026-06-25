import { describe, expect, test } from "bun:test";

import { correlateDashboardItems } from "./correlation";

const changes = [
  {
    id: "addLocalDashboard",
    title: "Add local dashboard",
    correlation_keys: {
      branches: ["change/addLocalDashboard"],
      head_shas: ["abc123"],
    },
    ops_followup: { env: "prod", completion_signal: "dashboard-ready" },
  },
  {
    id: "otherChange",
    title: "Other change",
    correlation_keys: {
      branches: ["change/otherChange"],
      head_shas: ["def456"],
    },
  },
];

describe("dashboard correlation", () => {
  test("links PRs, workflow runs, deployments, and ops evidence structurally", () => {
    const result = correlateDashboardItems({
      changes,
      pulls: [
        { number: 7, head: { ref: "change/addLocalDashboard", sha: "abc123" } },
      ],
      workflow_runs: [
        { id: 8, head_branch: "change/addLocalDashboard", head_sha: "abc123" },
      ],
      deployments: [
        {
          id: 9,
          ref: "change/addLocalDashboard",
          sha: "abc123",
          environment: "prod",
        },
      ],
      ops: [
        {
          id: "ops-1",
          environment: "prod",
          completion_signal: "dashboard-ready",
        },
      ],
    });

    expect(result.linked.map((item) => item.changeId)).toEqual([
      "addLocalDashboard",
      "addLocalDashboard",
      "addLocalDashboard",
      "addLocalDashboard",
    ]);
    expect(result.linked.map((item) => item.evidence)).toEqual([
      "branch: change/addLocalDashboard",
      "run.head_branch: change/addLocalDashboard",
      "deployment.ref: change/addLocalDashboard",
      "ops.environment+completion_signal: prod/dashboard-ready",
    ]);
  });

  test("uses workflow conclusions as visible status for completed CI runs", () => {
    const result = correlateDashboardItems({
      changes,
      pulls: [],
      workflow_runs: [
        {
          id: 8,
          head_branch: "change/addLocalDashboard",
          status: "completed",
          conclusion: "failure",
        },
      ],
      deployments: [],
      ops: [],
    });

    expect(result.linked[0]?.status).toBe("failure");
  });

  test("keeps unknown and ambiguous activity in unlinked lane", () => {
    const result = correlateDashboardItems({
      changes: [
        ...changes,
        {
          id: "duplicate",
          title: "Duplicate",
          correlation_keys: {
            branches: ["change/addLocalDashboard"],
            head_shas: [],
          },
        },
      ],
      pulls: [
        { number: 1, head: { ref: "change/missing", sha: "zzz999" } },
        {
          number: 2,
          head: { ref: "change/addLocalDashboard", sha: "nomatch" },
        },
      ],
      workflow_runs: [],
      deployments: [],
      ops: [],
    });

    expect(result.linked).toEqual([]);
    expect(result.unlinked.map((item) => item.reason)).toEqual([
      "no structural match",
      "ambiguous structural match",
    ]);
  });
});
