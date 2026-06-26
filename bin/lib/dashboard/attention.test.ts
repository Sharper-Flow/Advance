import { describe, expect, test } from "bun:test";

import { buildAttentionLanes } from "./attention";

describe("dashboard attention lanes", () => {
  test("groups project-first activity into actionability lanes", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
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

  test("projects GitHub payload metadata into source card summaries", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [],
      linked: [],
      unlinked: [
        {
          kind: "pull",
          reason: "no structural match",
          status: "open",
          item: {
            number: 567,
            title: "Fan out image migration keys",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/pull/567",
            head: { ref: "change/fanOutImageMigrationDuplicate" },
            updated_at: "2026-06-19T15:45:19Z",
          },
        },
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "failure",
          item: {
            name: "Deploy to Production",
            display_title: "Deploy release",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/1",
            head_branch: "main",
            conclusion: "failure",
            updated_at: "2026-06-26T01:07:00Z",
          },
        },
      ],
      degradedSources: [],
    });

    expect(lanes.unmatched[0]).toMatchObject({
      kind: "pull",
      title: "#567 Fan out image migration keys",
      url: "https://github.com/Sharper-Flow/PokeEdge/pull/567",
      updated_at: "2026-06-19T15:45:19Z",
      metadata: expect.arrayContaining([
        { label: "Repo", value: "Sharper-Flow/PokeEdge" },
        { label: "Branch", value: "change/fanOutImageMigrationDuplicate" },
      ]),
    });
    expect(lanes.attention[0]).toMatchObject({
      kind: "workflow_run",
      title: "Deploy to Production",
      subtitle: "Deploy release",
      url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/1",
      updated_at: "2026-06-26T01:07:00Z",
      metadata: expect.arrayContaining([
        { label: "Repo", value: "Sharper-Flow/PokeEdge" },
        { label: "Branch", value: "main" },
        { label: "Conclusion", value: "failure" },
      ]),
    });
  });
});
