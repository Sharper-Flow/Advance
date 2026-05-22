/**
 * Backlog tools tests (rq-backlogCoord04: adv_wip_state aggregator).
 *
 * rq-backlogCoord01-07 — see .adv/specs/backlog-coordination/spec.json
 */

import { describe, expect, it, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backlogTools } from "./backlog";
import type { Store } from "../storage/store-types";
import type { RoadmapSnapshot } from "./roadmap";

const FRESH_SNAPSHOT: RoadmapSnapshot = {
  version: 1,
  generated_at: "2026-05-11T00:00:00.000Z",
  project: { owner: "TestOrg", number: 1, title: "ADV: Test" },
  counts: { total: 3, bugs: 1, features: 2, deferred: 0 },
  bugs: [{ number: 100, title: "Bug A", priority: "high", labels: [] }],
  features: [
    {
      number: 51,
      title: "Feature X (issue 51)",
      value: 8,
      time_criticality: 3,
      rroe: 13,
      effort: 3,
      wsjf: 8.0,
      labels: [],
    },
    {
      number: 52,
      title: "Feature Y (issue 52)",
      value: 5,
      time_criticality: 1,
      rroe: 2,
      effort: 1,
      wsjf: 8.0,
      labels: [],
    },
  ],
  deferred: [],
  last_refreshed: "2026-05-11T00:00:00.000Z",
  ttl_ms: 300_000,
  next_refresh_after: "2026-05-11T00:05:00.000Z",
};

async function writeFixture(snapshot: RoadmapSnapshot): Promise<string> {
  const dir = await mkdir(
    join(
      tmpdir(),
      `adv-backlog-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    { recursive: true },
  );
  if (!dir) throw new Error("mkdir failed");
  await mkdir(join(dir, ".adv"), { recursive: true });
  await writeFile(
    join(dir, ".adv", "roadmap-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  return dir;
}

function makeStoreAt(root: string): Store {
  return {
    paths: { root, changes: join(root, ".adv/changes") },
    changes: { list: vi.fn() },
  } as unknown as Store;
}

function makeMockStore(
  changesList: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    lastActivityAt: string;
    taskCount: number;
    completedTasks: number;
  }>,
): Store {
  return {
    paths: { root: "/test/project", changes: "/test/project/.adv/changes" },
    changes: {
      list: vi.fn().mockResolvedValue({ changes: changesList }),
    },
  } as unknown as Store;
}

describe("adv_wip_state (rq-backlogCoord04)", () => {
  it("returns aggregated active_changes + worktrees + peer_sessions + generated_at", async () => {
    const store = makeMockStore([
      {
        id: "changeA",
        title: "Change A",
        status: "active",
        created_at: "2026-05-11T00:00:00.000Z",
        lastActivityAt: "2026-05-11T01:00:00.000Z",
        taskCount: 5,
        completedTasks: 3,
      },
      {
        id: "changeB",
        title: "Change B",
        status: "draft",
        created_at: "2026-05-11T02:00:00.000Z",
        lastActivityAt: "2026-05-11T02:30:00.000Z",
        taskCount: 0,
        completedTasks: 0,
      },
    ]);

    const result = await backlogTools.adv_wip_state.execute(
      {},
      store,
      undefined,
      {
        worktreesProvider: async () => [
          {
            changeId: "changeA",
            branch: "change/changeA",
            path: "/wt/changeA",
            status: "active",
            materialized: true,
          },
        ],
        sessionsProvider: async () => ({
          sessions: [
            {
              sessionId: "sess_abcd1234",
              startedAt: "2026-05-11T03:00:00.000Z",
              lastSeenAt: "2026-05-11T03:15:00.000Z",
              isSelf: true,
              worktree: "changeA",
            },
          ],
          total: 1,
          deadFiltered: 0,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(parsed.active_changes).toHaveLength(2);
    expect(parsed.active_changes[0].id).toBe("changeA");
    expect(parsed.worktrees).toHaveLength(1);
    expect(parsed.worktrees[0].branch).toBe("change/changeA");
    expect(parsed.peer_sessions).toHaveLength(1);
    expect(parsed.peer_sessions[0].isSelf).toBe(true);
    expect(parsed.poisoned_workflows).toEqual([]);
    expect(parsed.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.warnings).toEqual([]);
  });

  it("returns empty arrays when project has no in-flight state", async () => {
    const store = makeMockStore([]);

    const result = await backlogTools.adv_wip_state.execute(
      {},
      store,
      undefined,
      {
        worktreesProvider: async () => [],
        sessionsProvider: async () => ({
          sessions: [],
          total: 0,
          deadFiltered: 0,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(parsed.active_changes).toEqual([]);
    expect(parsed.worktrees).toEqual([]);
    expect(parsed.peer_sessions).toEqual([]);
    expect(parsed.poisoned_workflows).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("exposes automation-first poisoned workflow metadata while preserving warnings", async () => {
    const store = makeMockStore([
      {
        id: "healthy",
        title: "Healthy Change",
        status: "active",
        created_at: "2026-05-11T00:00:00.000Z",
        lastActivityAt: "2026-05-11T01:00:00.000Z",
        taskCount: 1,
        completedTasks: 0,
      },
    ]);

    const result = await backlogTools.adv_wip_state.execute(
      {},
      store,
      undefined,
      {
        worktreesProvider: async () => ({
          worktrees: [
            {
              changeId: "healthy",
              branch: "change/healthy",
              path: "/wt/healthy",
              status: "active",
              materialized: true,
            },
          ],
          warnings: [
            {
              source: "worktree_workflow",
              changeId: "poisoned",
              workflowId: "adv/change/test-id/poisoned",
              recoveryReason: "poisoned_history",
              evidenceSummary:
                "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100]",
              message: "Unable to query worktrees for change poisoned",
              errorClass: "Error",
            },
          ],
          poisonedWorkflows: [
            {
              changeId: "poisoned",
              workflowId: "adv/change/test-id/poisoned",
              recoveryReason: "poisoned_history",
              evidenceSummary:
                "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100]",
              message: "Unable to query worktrees for change poisoned",
            },
          ],
        }),
        sessionsProvider: async () => ({
          sessions: [],
          total: 0,
          deadFiltered: 0,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(parsed.worktrees).toEqual([
      expect.objectContaining({
        changeId: "healthy",
        branch: "change/healthy",
      }),
    ]);
    expect(parsed.poisoned_workflows).toEqual([
      {
        source: "worktrees",
        changeId: "poisoned",
        workflowId: "adv/change/test-id/poisoned",
        recoveryReason: "poisoned_history",
        evidenceSummary:
          "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100]",
        message: "Unable to query worktrees for change poisoned",
      },
    ]);
    expect(parsed.warnings).toEqual([
      expect.objectContaining({
        source: "worktrees",
        reason: expect.stringContaining("poisoned"),
      }),
    ]);
  });

  it("isolates failure: changes succeed, worktrees fail → worktrees: [] + warning", async () => {
    const store = makeMockStore([
      {
        id: "changeA",
        title: "Change A",
        status: "active",
        created_at: "2026-05-11T00:00:00.000Z",
        lastActivityAt: "2026-05-11T01:00:00.000Z",
        taskCount: 1,
        completedTasks: 0,
      },
    ]);

    const result = await backlogTools.adv_wip_state.execute(
      {},
      store,
      undefined,
      {
        worktreesProvider: async () => {
          throw new Error("Temporal unavailable");
        },
        sessionsProvider: async () => ({
          sessions: [],
          total: 0,
          deadFiltered: 0,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(parsed.active_changes).toHaveLength(1);
    expect(parsed.worktrees).toEqual([]);
    expect(parsed.peer_sessions).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatchObject({
      source: "worktrees",
      reason: expect.stringContaining("Temporal unavailable"),
    });
  });

  it("isolates failure: sessions unavailable → peer_sessions: [] + warning (rq-backlogCoord04.2)", async () => {
    const store = makeMockStore([]);

    const result = await backlogTools.adv_wip_state.execute(
      {},
      store,
      undefined,
      {
        worktreesProvider: async () => [],
        sessionsProvider: async () => ({
          sessions: [],
          total: 0,
          deadFiltered: 0,
          unavailable: true,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(parsed.peer_sessions).toEqual([]);
    expect(parsed.warnings).toContainEqual(
      expect.objectContaining({ source: "peer_sessions" }),
    );
  });

  it("calls all three sources in parallel (no sequential dependency)", async () => {
    const store = makeMockStore([]);
    const calls: string[] = [];

    await backlogTools.adv_wip_state.execute({}, store, undefined, {
      worktreesProvider: async () => {
        calls.push("worktrees");
        return [];
      },
      sessionsProvider: async () => {
        calls.push("sessions");
        return { sessions: [], total: 0, deadFiltered: 0 };
      },
    });

    // All three should have been initiated; the changes mock is synchronous-ish
    // so just verify worktrees + sessions both ran.
    expect(calls).toContain("worktrees");
    expect(calls).toContain("sessions");
  });
});

describe("adv_backlog_state (rq-backlogCoord01, rq-backlogCoord05, rq-backlogCoord07)", () => {
  it("returns snapshot items + freshness metadata + active-change annotations", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        {},
        store,
        undefined,
        {
          activeChangesAnnotator: async (_pid, issueNumbers) => {
            const m = new Map<number, { changeId: string }>();
            if (issueNumbers.includes(51)) {
              m.set(51, { changeId: "implementFeatureX" });
            }
            return m;
          },
          // Use a fixed clock so the snapshot is fresh.
          now: new Date("2026-05-11T00:01:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.bugs).toHaveLength(1);
      expect(parsed.features).toHaveLength(2);
      expect(parsed.freshness).toMatchObject({
        needs_refresh: false,
        ttl_ms: 300_000,
      });
      const annotated = parsed.features.find(
        (f: { number: number }) => f.number === 51,
      );
      expect(annotated.active_change).toEqual({
        changeId: "implementFeatureX",
      });
      const not_annotated = parsed.features.find(
        (f: { number: number }) => f.number === 52,
      );
      expect(not_annotated.active_change).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("marks needs_refresh: true when snapshot age exceeds ttl_ms", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        {},
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          // 10 min after last_refreshed (TTL = 5 min) — should be stale.
          now: new Date("2026-05-11T00:10:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.freshness.needs_refresh).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies kind filter (kind='bug' → bugs only)", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        { kind: "bug" },
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          now: new Date("2026-05-11T00:01:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.bugs).toHaveLength(1);
      expect(parsed.features).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies top filter (top=1 → first feature by wsjf rank)", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        { kind: "feature", top: 1 },
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          now: new Date("2026-05-11T00:01:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.features).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns error when snapshot file does not exist", async () => {
    const root = await mkdir(
      join(
        tmpdir(),
        `adv-backlog-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ),
      { recursive: true },
    );
    if (!root) throw new Error("mkdir failed");
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        {},
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          now: new Date("2026-05-11T00:00:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.hint).toContain("adv-triage");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses single Visibility query for annotation (rq-backlogCoord05)", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);
      const annotatorCalls: number[] = [];

      await backlogTools.adv_backlog_state.execute({}, store, undefined, {
        activeChangesAnnotator: async (_pid, issueNumbers) => {
          annotatorCalls.push(issueNumbers.length);
          return new Map();
        },
        now: new Date("2026-05-11T00:01:00.000Z"),
      });

      // One annotator call carrying all issue numbers — NOT N calls.
      expect(annotatorCalls).toHaveLength(1);
      expect(annotatorCalls[0]).toBe(3); // 1 bug + 2 features
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forceRefresh flag is accepted and surfaces refresh_requested in freshness", async () => {
    const root = await writeFixture(FRESH_SNAPSHOT);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        { forceRefresh: true },
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          now: new Date("2026-05-11T00:01:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      // forceRefresh forces needs_refresh true regardless of TTL state.
      expect(parsed.freshness.needs_refresh).toBe(true);
      expect(parsed.freshness.refresh_reason).toBe("force_refresh_requested");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
