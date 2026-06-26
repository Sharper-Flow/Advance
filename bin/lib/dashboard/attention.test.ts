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

  test("groups duplicate source history and summarizes draft inventory", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: Array.from({ length: 7 }, (_, index) => ({
        id: `draft${index}`,
        title: `Draft ${index}`,
        status: "draft",
        gateProgressStr: "proposal ○ discovery ○ design ○ planning ○ execution ○ acceptance ○ release ○",
        firstIncompleteGate: "proposal",
        lastActivityAt: `2026-06-25T20:0${index}:00.000Z`,
        correlation_keys: { branches: [`change/draft${index}`], head_shas: [] },
      })),
      linked: [],
      unlinked: [
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "failure",
          item: {
            name: "PR Gate",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/1",
            head_branch: "change/evaluatePrintingIdentityField",
            conclusion: "failure",
            updated_at: "2026-06-25T16:31:44Z",
          },
        },
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "failure",
          item: {
            name: "PR Gate",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/2",
            head_branch: "change/evaluatePrintingIdentityField",
            conclusion: "failure",
            updated_at: "2026-06-25T17:22:39Z",
          },
        },
        {
          kind: "deployment",
          reason: "no structural match",
          status: "inactive",
          item: {
            environment: "production",
            ref: "main",
            updated_at: "2026-06-25T22:56:25Z",
            source_states: { github_deployment: "inactive" },
          },
        },
        {
          kind: "deployment",
          reason: "no structural match",
          status: "inactive",
          item: {
            environment: "production",
            ref: "main",
            updated_at: "2026-06-26T01:06:22Z",
            source_states: { github_deployment: "inactive" },
          },
        },
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
      ],
      degradedSources: [],
    });

    expect(lanes.attention).toHaveLength(1);
    expect(lanes.attention[0]).toMatchObject({
      kind: "group",
      groupKind: "workflow_run",
      title: "PR Gate",
      status: "failure",
      count: 2,
      latestUpdatedAt: "2026-06-25T17:22:39Z",
      metadata: expect.arrayContaining([
        { label: "Branch", value: "change/evaluatePrintingIdentityField" },
      ]),
    });
    expect(lanes.attention[0]).toHaveProperty("items");
    expect((lanes.attention[0] as { items: unknown[] }).items).toHaveLength(2);

    expect(lanes.unmatched.map((item) => item.kind)).toEqual(["pull", "group"]);
    expect(lanes.unmatched[1]).toMatchObject({
      kind: "group",
      groupKind: "deployment",
      title: "Deployment: production",
      status: "inactive",
      count: 2,
      latestUpdatedAt: "2026-06-26T01:06:22Z",
    });

    expect(lanes.inventory).toHaveLength(1);
    expect(lanes.inventory[0]).toMatchObject({
      kind: "group",
      groupKind: "inventory",
      title: "7 draft ADV changes",
      status: "draft",
      count: 7,
      collapsedByDefault: true,
    });
  });

  test("groups duplicate successful source history by title and branch", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [],
      linked: [],
      unlinked: [
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "success",
          item: {
            name: "PR Gate",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/1",
            head_branch: "change/sameBranch",
            updated_at: "2026-06-25T16:31:44Z",
          },
        },
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "success",
          item: {
            name: "PR Gate",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/2",
            head_branch: "change/sameBranch",
            updated_at: "2026-06-25T17:22:39Z",
          },
        },
        {
          kind: "workflow_run",
          reason: "no structural match",
          status: "success",
          item: {
            name: "PR Gate",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/actions/runs/3",
            head_branch: "change/otherBranch",
            updated_at: "2026-06-25T18:00:00Z",
          },
        },
      ],
      degradedSources: [],
    });

    expect(lanes.inventory[0]).toMatchObject({
      kind: "group",
      groupKind: "workflow_run",
      title: "PR Gate",
      status: "success",
      count: 2,
      latestUpdatedAt: "2026-06-25T17:22:39Z",
      metadata: expect.arrayContaining([
        { label: "Branch", value: "change/sameBranch" },
      ]),
    });
    expect(lanes.inventory[1]).toMatchObject({
      kind: "summary",
      title: "1 success workflow_run item summarized",
    });
  });
});
