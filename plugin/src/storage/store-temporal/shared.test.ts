import { describe, expect, test, vi } from "vitest";
import type { Store } from "../store-types";
import {
  AdvProjectContextMismatchError,
  getGuardedChangeHandle,
  mapTemporalChangeStateToChange,
  type TemporalStoreBackendInput,
  type WorkflowHandleLike,
} from "./shared";
import { createChangeWorkflowState } from "../../temporal/change-state";

function createInput(args: {
  projectId?: string;
  changesGet: ReturnType<typeof vi.fn>;
  getHandle?: ReturnType<typeof vi.fn>;
}): { input: TemporalStoreBackendInput; getHandle: ReturnType<typeof vi.fn> } {
  const handle: WorkflowHandleLike = {
    query: vi.fn(),
    executeUpdate: vi.fn(),
    signal: vi.fn(),
  };
  const getHandle = args.getHandle ?? vi.fn(() => handle);

  return {
    getHandle,
    input: {
      projectId: args.projectId ?? "project-a",
      legacy: {
        changes: {
          get: args.changesGet,
        },
      } as unknown as Store,
      temporal: {
        client: {
          workflow: {
            getHandle,
          },
        },
      },
    },
  };
}

describe("getGuardedChangeHandle owner guard cache", () => {
  test("caches successful owner-bearing validation while returning fresh handles", async () => {
    const changesGet = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: "project-a" },
    }));
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "change-a");
    await getGuardedChangeHandle(input, "change-a");

    expect(changesGet).toHaveBeenCalledTimes(1);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });

  test("does not cache ownerless legacy changes", async () => {
    const changesGet = vi.fn(async () => ({ success: true, data: {} }));
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "legacy-change");
    await getGuardedChangeHandle(input, "legacy-change");

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });

  test("does not cache owner mismatches", async () => {
    const changesGet = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: "other-project" },
    }));
    const { input, getHandle } = createInput({ changesGet });

    await expect(
      getGuardedChangeHandle(input, "foreign-change"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);
    await expect(
      getGuardedChangeHandle(input, "foreign-change"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).not.toHaveBeenCalled();
  });

  test("isolates cache entries per Temporal store input", async () => {
    const changesGetA = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: "project-a" },
    }));
    const changesGetB = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: "project-a" },
    }));
    const { input: inputA } = createInput({
      projectId: "project-a",
      changesGet: changesGetA,
    });
    const { input: inputB } = createInput({
      projectId: "project-b",
      changesGet: changesGetB,
    });

    await getGuardedChangeHandle(inputA, "shared-change-id");
    await getGuardedChangeHandle(inputA, "shared-change-id");
    await expect(
      getGuardedChangeHandle(inputB, "shared-change-id"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);

    expect(changesGetA).toHaveBeenCalledTimes(1);
    expect(changesGetB).toHaveBeenCalledTimes(1);
  });

  test("does not cache legacy read failures", async () => {
    const changesGet = vi.fn(async () => {
      throw new Error("disk unavailable");
    });
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "change-a");
    await getGuardedChangeHandle(input, "change-a");

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });
});

describe("mapTemporalChangeStateToChange", () => {
  test("preserves and normalizes sidecar sub-agent reports", () => {
    const state = createChangeWorkflowState({
      changeId: "legacy-sidecar",
      title: "Legacy sidecar",
      createdAt: "2026-05-26T00:00:00.000Z",
    });
    state.subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "legacy-sidecar",
        task_id: "tk-legacy",
        scope: { kind: "task", task_id: "tk-legacy" },
        attempt: 1,
        agent: "adv-engineer",
        status: "complete",
        files_touched: [],
        verification: [{ command: "test", exit_code: 0, summary: "pass" }],
        decisions: [],
        blockers: [],
        follow_ups: [],
        related_scan: "none",
        workdir_used: "/tmp/worktree",
        context_update_for_adv: {
          what_ads_needs_to_know: "legacy",
          suggested_next_action: "continue",
        },
      } as never,
    ];

    const change = mapTemporalChangeStateToChange(state);

    expect(change.subagent_reports).toHaveLength(1);
    expect(change.subagent_reports?.[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
  });

  test("projects ops_followup and ops_followup_links into Change read model", () => {
    const state = createChangeWorkflowState({
      changeId: "ops-projection",
      title: "Ops projection",
      createdAt: "2026-06-20T04:00:00.000Z",
    });
    state.ops_followup = {
      kind: "cleanup",
      source: {
        source_change_id: "parent-1",
        source_kind: "manual",
      },
      relationship: "cleanup_after",
      status: "cleanup_needed",
      created_at: "2026-06-20T04:00:00.000Z",
      evidence: [
        {
          id: "ev-1",
          recorded_at: "2026-06-20T04:01:00.000Z",
          env: "prod",
          action: "drop temp table",
          status: "complete",
          summary: "Cleanup done",
        },
      ],
    };
    state.ops_followup_links = [
      {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "not_started",
        linked_at: "2026-06-20T04:00:00.000Z",
      },
    ];

    const change = mapTemporalChangeStateToChange(state);

    expect(change.ops_followup?.kind).toBe("cleanup");
    expect(change.ops_followup?.evidence).toHaveLength(1);
    expect(change.ops_followup_links).toHaveLength(1);
    expect(change.ops_followup_links?.[0]?.changeId).toBe("child-1");
  });

  test("projects epic_membership into Change read model", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-projection",
      title: "Epic projection",
      createdAt: "2026-06-20T04:00:00.000Z",
    });
    state.epic_membership = {
      epic_id: "addAuthEpic",
      entry_id: "ent-1",
      order: 0,
      title: "Add auth",
      linked_at: "2026-06-20T04:00:00.000Z",
    };

    const change = mapTemporalChangeStateToChange(state);

    expect(change.epic_membership).toEqual(state.epic_membership);
  });

  test("leaves epic_membership undefined when workflow state lacks it", () => {
    const state = createChangeWorkflowState({
      changeId: "no-epic",
      title: "No epic",
      createdAt: "2026-06-20T04:00:00.000Z",
    });

    const change = mapTemporalChangeStateToChange(state);

    expect(change.epic_membership).toBeUndefined();
  });
});
