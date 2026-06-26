import { describe, expect, test } from "bun:test";

import type { ChangeRecord, ChangeSummary } from "../types";
import { readDashboardAdvProject } from "./adv";
import type { DashboardProjectConfig } from "./config";

const project: DashboardProjectConfig = {
  id: "advance",
  label: "Advance",
  path: "/home/jon/dev/advance",
  github: { owner: "Sharper-Flow", repo: "Advance" },
};

const baseSummary: ChangeSummary & { worktreeBranches: string[] } = {
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
  test("routine state does not call per-change ops enrichment", async () => {
    let opsCalls = 0;
    const snapshot = await readDashboardAdvProject(project, {
      resolveProjectId: async () => "project123",
      loadBaseSummaries: async () => [baseSummary],
      loadOpsChanges: async () => {
        opsCalls += 1;
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
    expect(snapshot.changes[0]?.correlation_keys.head_shas).toEqual([]);
    expect(snapshot.degradedSources).toEqual([]);
    expect(opsCalls).toBe(0);
  });

  test("uses Visibility-projected worktree branches and paths only", async () => {
    const summary = {
      ...baseSummary,
      worktreeBranches: ["change/addLocalDashboard", "", "change/secondary"],
      worktreePaths: ["/tmp/wt/add", "  ", "/tmp/wt/secondary"],
    } satisfies ChangeSummary & { worktreeBranches: string[]; worktreePaths: string[] };
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
      loadBaseSummaries: async () => [summary],
      loadOpsChanges: async () => [opsChange],
      now: () => new Date("2026-06-25T21:05:00.000Z"),
    });

    expect(snapshot.degradedSources).toEqual([]);
    expect(snapshot.changes[0]?.ops_followup).toBeUndefined();
    expect(snapshot.changes[0]?.ops_followup_links).toBeUndefined();
    expect(snapshot.changes[0]?.correlation_keys.branches).toEqual([
      "change/addLocalDashboard",
      "change/secondary",
    ]);
    expect(snapshot.changes[0]?.correlation_keys.paths).toEqual([
      "/tmp/wt/add",
      "/tmp/wt/secondary",
    ]);
    expect(snapshot.changes[0]?.correlation_keys.head_shas).toEqual([]);
  });
});
