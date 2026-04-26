import { describe, expect, it, vi } from "vitest";
import {
  ensureChangeWorkflowStarted,
  ensureProjectWorkflowStarted,
  migrateProjectState,
  reExportChangeArtifacts,
  reImportChangeState,
} from "./migration";

describe("temporal migration helpers", () => {
  it("starts ProjectWorkflow with seeded agenda/wisdom state", async () => {
    const handle = {
      executeUpdate: vi.fn(async () => null),
      query: vi.fn(async () => ({})),
    };
    const start = vi.fn(async () => handle);
    const getHandle = vi.fn(() => handle);

    await ensureProjectWorkflowStarted(
      { workflow: { start, getHandle } } as any,
      {
        projectId: "proj1",
        initializedAt: "2026-04-19T00:00:00.000Z",
        agenda: [
          {
            id: "ag-1",
            title: "existing item",
            priority: "medium",
            status: "pending",
            created_at: "2026-04-19T00:00:00.000Z",
            tdd_phase: "none",
          },
        ],
        projectWisdom: [],
        migrationLedger: [],
      },
    );

    expect(start).toHaveBeenCalledTimes(1);
    const options = start.mock.calls[0][1];
    expect(options.workflowId).toBe("adv/project/proj1");
    expect(options.args[0].agenda).toHaveLength(1);
  });

  it("falls back to getHandle when ProjectWorkflow already exists", async () => {
    const handle = {
      executeUpdate: vi.fn(async () => null),
      query: vi.fn(async () => ({})),
    };
    const start = vi.fn(async () => {
      throw new Error("Workflow execution already started");
    });
    const getHandle = vi.fn(() => handle);

    const result = await ensureProjectWorkflowStarted(
      { workflow: { start, getHandle } } as any,
      {
        projectId: "proj1",
        initializedAt: "2026-04-19T00:00:00.000Z",
        agenda: [],
        projectWisdom: [],
        migrationLedger: [],
      },
    );

    expect(getHandle).toHaveBeenCalledWith("adv/project/proj1");
    expect(result).toBe(handle);
  });

  it("starts ChangeWorkflow with seeded change state preserving tasks/gates/wisdom", async () => {
    const handle = {
      executeUpdate: vi.fn(async () => null),
      query: vi.fn(async () => ({})),
    };
    const start = vi.fn(async () => handle);
    const getHandle = vi.fn(() => handle);

    await ensureChangeWorkflowStarted(
      { workflow: { start, getHandle } } as any,
      {
        projectId: "proj1",
        changeId: "chg1",
        title: "Change 1",
        initializedAt: "2026-04-19T00:00:00.000Z",
        seedState: {
          status: "active",
          tasks: [
            {
              id: "tk-1",
              title: "task",
              status: "pending",
              priority: 0,
              created_at: "2026-04-19T00:00:00.000Z",
              tdd_phase: "none",
            },
          ],
          wisdom: [
            {
              id: "ws-1",
              type: "pattern",
              content: "test",
              recorded_at: "2026-04-19T00:00:00.000Z",
            },
          ],
          gates: {
            proposal: {
              status: "done",
              completed_at: "2026-04-19T00:00:00.000Z",
              completed_by: "agent",
            },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
          reentry_history: [],
          artifacts: {},
        },
      },
    );

    const options = start.mock.calls[0][1];
    expect(options.workflowId).toBe("adv/change/proj1/chg1");
    expect(options.args[0].seedState.tasks).toHaveLength(1);
    expect(options.args[0].seedState.wisdom).toHaveLength(1);
    expect(options.args[0].seedState.gates.proposal.status).toBe("done");
  });

  it("re-imports change state with task-run ledger state", async () => {
    const handle = {
      executeUpdate: vi.fn(async () => null),
      query: vi.fn(async () => ({})),
    };
    const start = vi.fn(async () => handle);
    const getHandle = vi.fn(() => handle);

    await reImportChangeState({ workflow: { start, getHandle } } as any, {
      projectId: "proj1",
      change: {
        id: "chg1",
        title: "Change 1",
        status: "draft",
        created_at: "2026-04-19T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        task_runs: {
          "tk-1": {
            taskId: "tk-1",
            runId: "run-1",
            phase: "green",
            updatedAt: "2026-04-19T00:05:00.000Z",
            resumeHint: "Checkpoint before completion.",
            requiredNextAction: "checkpoint",
            seenIdempotencyKeys: ["tk-1:start"],
            events: [
              {
                idempotencyKey: "tk-1:start",
                type: "start",
                recordedAt: "2026-04-19T00:01:00.000Z",
                payload: {},
              },
            ],
          },
        },
      } as any,
    });

    const options = start.mock.calls[0][1];
    expect(options.args[0].seedState.task_runs["tk-1"].phase).toBe("green");
    expect(options.args[0].seedState.task_runs["tk-1"].requiredNextAction).toBe(
      "checkpoint",
    );
  });

  it("migration records a single terminal done ledger entry on success", async () => {
    const handle = {
      executeUpdate: vi.fn(async () => null),
      query: vi.fn(async () => ({})),
    };
    const start = vi.fn(async () => handle);
    const getHandle = vi.fn(() => handle);

    await migrateProjectState(
      { workflow: { start, getHandle } } as any,
      {
        projectId: "proj1",
        initializedAt: "2026-04-19T00:00:00.000Z",
        agenda: [],
        projectWisdom: [],
      },
      {
        key: "project-import",
        source: "json",
        detail: "imported from agenda/wisdom files",
      },
    );

    expect(handle.executeUpdate).toHaveBeenCalledTimes(1);
    const only = handle.executeUpdate.mock.calls[0][1].args[0];
    expect(only.status).toBe("done");
    expect(only.key).toBe("project-import");
  });

  it("reExportChangeArtifacts reads current workflow state and returns artifact metadata", async () => {
    const handle = {
      query: vi.fn(async () => ({
        artifacts: {
          design: {
            path: "/tmp/design.md",
            updatedAt: "2026-04-19T00:00:00.000Z",
            contentHash: "abc123",
          },
        },
      })),
    };
    const getHandle = vi.fn(() => handle);

    const result = await reExportChangeArtifacts(
      { workflow: { getHandle } } as any,
      { projectId: "proj1", changeId: "chg1" },
    );

    expect(result.design?.path).toBe("/tmp/design.md");
    expect(getHandle).toHaveBeenCalledWith("adv/change/proj1/chg1");
  });
});
