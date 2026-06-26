import { describe, expect, test } from "bun:test";

import { buildAttentionLanes } from "./attention";

describe("dashboard attention lanes", () => {
  test("groups project-first activity into actionability lanes", () => {
    const lanes = buildAttentionLanes({
      changes: [
        {
          id: "draftNoise",
          title: "Draft noise",
          status: "draft",
          gateProgressStr: "proposal ○ discovery ○ design ○ planning ○ execution ○ acceptance ○ release ○",
          firstIncompleteGate: "proposal",
          lastActivityAt: "2026-06-25T20:00:00.000Z",
          correlation_keys: {
            branches: ["change/draftNoise"],
            head_shas: [],
          },
        },
        {
          id: "activeDashboard",
          title: "Active dashboard",
          status: "active",
          gateProgressStr:
            "proposal ✓ discovery ✓ design ✓ planning ✓ execution ✓ acceptance ○ release ○",
          firstIncompleteGate: "acceptance",
          lastActivityAt: "2026-06-25T22:00:00.000Z",
          correlation_keys: {
            branches: ["change/addLocalDashboard"],
            head_shas: [],
          },
        },
      ],
      linked: [
        {
          kind: "workflow_run",
          changeId: "activeDashboard",
          status: "in_progress",
          evidence: "run.head_sha: abc",
        },
        {
          kind: "pull",
          changeId: "activeDashboard",
          status: "open",
          evidence: "branch: change/addLocalDashboard",
        },
        {
          kind: "deployment",
          changeId: "activeDashboard",
          status: "failure",
          evidence: "deployment.sha: abc",
          source_states: { github_deployment: "failure", adv_ops: "success" },
        },
      ],
      unlinked: [
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "queued",
        },
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "success",
        },
      ],
      degradedSources: [
        {
          source: "github",
          code: "GITHUB_PRIMARY_RATE_LIMIT",
          message: "GitHub primary rate limit reached.",
        },
      ],
    });

    expect(lanes.attention.map((item) => item.kind)).toEqual([
      "deployment",
      "degraded_source",
    ]);
    expect(Object.keys(lanes)).toEqual([
      "attention",
      "active",
      "unmatched",
      "inventory",
    ]);
    expect(lanes.active.map((item) => item.kind)).toEqual([
      "adv_change",
      "workflow_run",
      "workflow_run",
      "pull",
    ]);
    expect(lanes.inventory.map((item) => item.kind)).toEqual([
      "adv_change",
      "summary",
    ]);
    expect(lanes.active[0]).toMatchObject({
      changeId: "activeDashboard",
      title: "Active dashboard",
      evidence: "adv.change: activeDashboard",
      source_states: { gate: "acceptance" },
    });
    expect(lanes.unmatched).toHaveLength(0);
    expect(lanes.attention[0]?.source_states).toEqual({
      github_deployment: "failure",
      adv_ops: "success",
    });
  });
});
