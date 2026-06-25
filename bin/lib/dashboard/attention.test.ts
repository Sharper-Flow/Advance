import { describe, expect, test } from "bun:test";

import { buildAttentionLanes } from "./attention";

describe("dashboard attention lanes", () => {
  test("groups project-first activity into attention, running, linked, and unlinked lanes", () => {
    const lanes = buildAttentionLanes({
      linked: [
        { kind: "workflow_run", changeId: "addLocalDashboard", status: "in_progress", evidence: "run.head_sha: abc" },
        { kind: "pull", changeId: "addLocalDashboard", status: "open", evidence: "branch: change/addLocalDashboard" },
        {
          kind: "deployment",
          changeId: "addLocalDashboard",
          status: "failure",
          evidence: "deployment.sha: abc",
          source_states: { github_deployment: "failure", adv_ops: "success" },
        },
      ],
      unlinked: [{ kind: "workflow_run", reason: "no structural match", status: "queued" }],
      degradedSources: [{ source: "github", code: "GITHUB_PRIMARY_RATE_LIMIT", message: "GitHub primary rate limit reached." }],
    });

    expect(lanes.attention.map((item) => item.kind)).toEqual(["deployment", "degraded_source"]);
    expect(lanes.running.map((item) => item.kind)).toEqual(["workflow_run", "workflow_run"]);
    expect(lanes.linked.map((item) => item.kind)).toEqual(["pull"]);
    expect(lanes.unlinked).toHaveLength(1);
    expect(lanes.attention[0]?.source_states).toEqual({ github_deployment: "failure", adv_ops: "success" });
  });
});
