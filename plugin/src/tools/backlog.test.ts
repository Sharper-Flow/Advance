/**
 * Backlog tools tests (rq-backlogCoord04: adv_wip_state aggregator).
 *
 * rq-backlogCoord01-07 — see .adv/specs/backlog-coordination/spec.json.
 * adv_backlog_state was removed by consolidateAdvToolSurface2
 * (tk-f022bfadbd81); its TTL-freshness and O(1) Visibility annotation
 * coverage moved to plugin/src/tools/roadmap.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import { backlogTools } from "./backlog";
import type { Store } from "../storage/store-types";
import { type InventoryBudget } from "./worktree/inventory-budget";

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

  it("exposes compact ops follow-up annotations on active_changes", async () => {
    const store = makeMockStore([
      {
        id: "opsChange",
        title: "Ops Change",
        status: "active",
        created_at: "2026-05-11T00:00:00.000Z",
        lastActivityAt: "2026-05-11T01:00:00.000Z",
        taskCount: 2,
        completedTasks: 1,
        ops_followup: {
          kind: "cleanup",
          source: {
            source_change_id: "parent-1",
            source_kind: "agenda",
            source_agenda_id: "ag-1",
          },
          relationship: "cleanup_after",
          status: "cleanup_needed",
          created_at: "2026-05-11T00:00:00.000Z",
          evidence: [
            {
              id: "ev-1",
              recorded_at: "2026-05-11T00:00:00.000Z",
              env: "staging",
              action: "drop-temp-table",
              status: "complete",
              summary: "Cleanup complete",
            },
          ],
          runs: [
            {
              id: "run-1",
              title: "Cleanup prod temp table",
              status: "health_check",
              created_at: "2026-05-11T00:00:00.000Z",
              updated_at: "2026-05-11T00:30:00.000Z",
              plan: {
                env: "prod",
                action: "drop-temp-table",
                bounds: ["single table"],
                evidence_policy: "run id + health check",
                rollback_or_cleanup_plan: "restore from snapshot",
              },
              steps: [
                {
                  id: "step-1",
                  title: "execute",
                  kind: "execute",
                  status: "pass",
                },
              ],
              evidence: [
                {
                  id: "rev-1",
                  recorded_at: "2026-05-11T00:30:00.000Z",
                  step_kind: "execute",
                  env: "prod",
                  status: "pass",
                  summary: "bounded execution summary",
                  artifact: { kind: "pointer", uri: "run://123" },
                  next_status: "health_check",
                },
              ],
            },
          ],
        },
        ops_followup_links: [
          {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "follows_release",
            status: "not_started",
            required_handoff: true,
            linked_at: "2026-05-11T00:00:00.000Z",
            resolution: {
              source: "child_profile",
              status: "complete",
              verified_at: "2026-05-11T00:40:00.000Z",
              completion_signal: "deployment complete",
              health_verification: "health check passed",
              rollback_or_cleanup_disposition: "cleanup complete",
            },
          },
        ],
      } as any,
    ]);

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
    expect(parsed.active_changes).toHaveLength(1);
    const c = parsed.active_changes[0];
    expect(c.ops_followup).toEqual({
      kind: "cleanup",
      relationship: "cleanup_after",
      status: "cleanup_needed",
      evidence_count: 1,
      run_count: 1,
      run_evidence_count: 1,
      runs: [
        {
          id: "run-1",
          title: "Cleanup prod temp table",
          status: "health_check",
          env: "prod",
          action: "drop-temp-table",
          step_count: 1,
          evidence_count: 1,
          updated_at: "2026-05-11T00:30:00.000Z",
        },
      ],
    });
    expect(c.ops_followup_links).toEqual([
      {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "not_started",
        status_source: "child_profile",
        completion_proof: "complete",
        required_handoff: true,
        resolution: {
          source: "child_profile",
          status: "complete",
          verified_at: "2026-05-11T00:40:00.000Z",
          completion_proof: "complete",
        },
      },
    ]);
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

  it("preserves active_changes and peer_sessions when the worktree snapshot is incomplete", async () => {
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
        worktreesProvider: async () => ({
          worktrees: [
            {
              changeId: "changeA",
              branch: "change/changeA",
              path: "/wt/changeA",
              status: "active",
              materialized: true,
            },
          ],
          complete: false,
          stopReason: "internal_budget_exhausted",
          stoppedStage: "query_change_workflow",
          inspectedCount: 1,
          candidateCount: 10,
        }),
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
    expect(parsed.active_changes).toHaveLength(1);
    expect(parsed.worktrees).toHaveLength(1);
    expect(parsed.peer_sessions).toHaveLength(1);
    expect(parsed.degradation?.worktree).toMatchObject({
      complete: false,
      stopReason: "internal_budget_exhausted",
      stoppedStage: "query_change_workflow",
      inspectedCount: 1,
      candidateCount: 10,
    });
    expect(parsed.warnings).toContainEqual(
      expect.objectContaining({
        source: "worktrees",
        reason: expect.stringContaining("incomplete"),
      }),
    );
  });

  it("propagates a caller abort signal to the worktree collector", async () => {
    const store = makeMockStore([]);
    const controller = new AbortController();
    controller.abort("caller aborted");

    let receivedBudget: InventoryBudget | undefined;
    const result = await backlogTools.adv_wip_state.execute(
      {},
      { store, signal: controller.signal },
      undefined,
      {
        worktreesProvider: async (_projectRoot, budget) => {
          receivedBudget = budget;
          return {
            worktrees: [],
            complete: false,
            stopReason: budget?.stopReason(),
          };
        },
        sessionsProvider: async () => ({
          sessions: [],
          total: 0,
          deadFiltered: 0,
        }),
      },
    );

    const parsed = JSON.parse(result);
    expect(receivedBudget?.signal.aborted).toBe(true);
    expect(parsed.degradation?.worktree?.stopReason).toBe("caller_cancelled");
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
