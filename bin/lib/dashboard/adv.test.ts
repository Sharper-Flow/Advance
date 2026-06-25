import { describe, expect, test } from "bun:test";

import { buildSummaryFromSearchAttributes } from "../live-status";
import type { ChangeRecord, ChangeSummary } from "../types";
import { readDashboardAdvProject } from "./adv";
import type { DashboardProjectConfig } from "./config";

const project: DashboardProjectConfig = {
  id: "advance",
  label: "Advance",
  path: "/home/jon/dev/advance",
  github: { owner: "Sharper-Flow", repo: "Advance" },
};

const baseSummary: ChangeSummary = {
  id: "addLocalDashboard",
  title: "Add local dashboard",
  status: "draft",
  lifecycleState: "open",
  recency: "hot",
  lastActivityAt: "2026-06-25T21:00:00.000Z",
  minutesSinceActivity: 5,
  tasksDone: 0,
  tasksTotal: 8,
  firstIncompleteGate: "execution",
  gateProgressStr: "✓ ✓ ✓ ✓ ○ ○ ○",
  worktreeBranches: ["change/addLocalDashboard"],
};

describe("dashboard ADV project reader", () => {
  test("keeps worker-free base visible when ops enrichment fails", async () => {
    const snapshot = await readDashboardAdvProject(project, {
      resolveProjectId: async () => "project123",
      loadBaseSummaries: async () => [baseSummary],
      loadOpsChanges: async () => {
        throw new Error("worker unavailable");
      },
      now: () => new Date("2026-06-25T21:05:00.000Z"),
    });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.project.id).toBe("advance");
    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0]?.correlation_keys.branches).toEqual([
      "change/addLocalDashboard",
    ]);
    expect(snapshot.degradedSources.map((source) => source.code)).toEqual([
      "ADV_OPS_ENRICHMENT_UNAVAILABLE",
    ]);
  });

  test("adds ops and worktree headSha enrichment when worker query succeeds", async () => {
    const opsChange = {
      id: "addLocalDashboard",
      title: "Add local dashboard",
      status: "draft",
      created_at: "2026-06-25T19:00:00.000Z",
      tasks: [],
      ops_followup: { status: "complete" },
      ops_followup_links: [{ child_change_id: "child" }],
      worktrees: [{ branch: "change/addLocalDashboard", headSha: "abc123" }],
    } satisfies ChangeRecord & { ops_followup: unknown; ops_followup_links: unknown[]; worktrees: unknown[] };

    const snapshot = await readDashboardAdvProject(project, {
      resolveProjectId: async () => "project123",
      loadBaseSummaries: async () => [baseSummary],
      loadOpsChanges: async () => [opsChange],
      now: () => new Date("2026-06-25T21:05:00.000Z"),
    });

    expect(snapshot.degradedSources).toEqual([]);
    expect(snapshot.changes[0]?.ops_followup).toEqual({ status: "complete" });
    expect(snapshot.changes[0]?.ops_followup_links).toEqual([{ child_change_id: "child" }]);
    expect(snapshot.changes[0]?.correlation_keys.head_shas).toEqual(["abc123"]);
  });

  test("visibility summary extracts worktree branch search attributes", () => {
    const summary = buildSummaryFromSearchAttributes(
      "addLocalDashboard",
      {
        AdvChangeTitle: ["Add local dashboard"],
        AdvCurrentGate: ["execution"],
        AdvWorktreeBranches: ["change/addLocalDashboard"],
        AdvWorktreePaths: ["/tmp/change/addLocalDashboard"],
      },
      new Date("2026-06-25T21:00:00.000Z"),
    );

    expect(summary?.worktreeBranches).toEqual(["change/addLocalDashboard"]);
    expect(summary?.worktreePaths).toEqual(["/tmp/change/addLocalDashboard"]);
  });
});
