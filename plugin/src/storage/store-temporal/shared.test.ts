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
});
