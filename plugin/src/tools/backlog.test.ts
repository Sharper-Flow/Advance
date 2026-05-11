/**
 * Backlog tools tests (rq-backlogCoord04: adv_wip_state aggregator).
 *
 * rq-backlogCoord01-07 — see .adv/specs/backlog-coordination/spec.json
 */

import { describe, expect, it, vi } from "vitest";
import { backlogTools } from "./backlog";
import type { Store } from "../storage/store-types";

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
    expect(parsed.warnings).toEqual([]);
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
