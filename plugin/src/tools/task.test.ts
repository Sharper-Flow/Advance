/**
 * Task Tools — Signal/Query Adapter Tests
 *
 * TDD tests for task.ts helpers against mocked Temporal client.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { taskTools } from "./task";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const targetStore = {
    paths: { root: "/tmp/target", changes: "/tmp/target/.adv/changes" },
    changes: { get: vi.fn() },
    gates: { get: vi.fn(), complete: vi.fn(), reopenFrom: vi.fn() },
    tasks: { show: vi.fn(), get: vi.fn(), list: vi.fn() },
    close: vi.fn(),
  };
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };

  return {
    signalMock,
    queryMock,
    handleMock,
    targetStore,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    fetchChangeContextTicker: vi.fn(async () => null),
    withTargetPathStore: vi.fn(async (_input, fn) =>
      fn({
        context: {
          root: "/tmp/target",
          projectId: "target-project-id",
          externalRoot: "/tmp/target-external",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    ),
    withOptionalTargetPathStore: vi.fn(async ({ store }, fn) => fn(store)),
    formatTargetProjectContext: vi.fn((context) => ({
      root: context.root,
      projectId: context.projectId,
      trusted: context.trusted,
      trustSource: context.trustSource,
      stateMode: context.stateMode,
    })),
  };
});

vi.mock("./target-project", async () => {
  const { z } = await import("zod");
  return {
    targetPathSchema: z.object({
      target_path: z.string().optional(),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    }),
    withTargetPathStore: mocks.withTargetPathStore,
    withOptionalTargetPathStore: mocks.withOptionalTargetPathStore,
    formatTargetProjectContext: mocks.formatTargetProjectContext,
    appendTargetProjectContextOutput: vi.fn((output: string) => output),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
}));

vi.mock("../storage/context-snapshot-fetch", () => ({
  fetchChangeContextTicker: mocks.fetchChangeContextTicker,
}));

function createMockStore(
  overrides: {
    tasks?: Partial<Store["tasks"]>;
    gates?: import("../types").Gates;
  } = {},
): Store {
  const defaultGates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "pending" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  } as import("../types").Gates;

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          tasks: [
            {
              id: "tk-current",
              title: "Current Task",
              status: "in_progress",
            },
          ],
        },
      })),
    } as unknown as Store["changes"],
    tasks: {
      show: vi.fn(async (taskId: string) => ({
        task: {
          id: taskId,
          title: "Test Task",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        } as import("../types").Task,
        changeId: "test-change",
      })),
      get: vi.fn(
        async (taskId: string) =>
          ({
            id: taskId,
            title: "Test Task",
            status: "pending",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
          }) as import("../types").Task,
      ),
      list: vi.fn(),
      ready: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
      ...overrides.tasks,
    } as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => overrides.gates ?? defaultGates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
  } as unknown as Store;
}

describe("task tools — signal/query adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.targetStore.gates.get.mockResolvedValue({
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("adv_task_show", () => {
    test("queries changeTaskQuery for task details", async () => {
      const store = createMockStore();
      const mockTask = {
        id: "tk-abc123",
        title: "Test Task",
        status: "pending",
      };
      mocks.querySignal.mockResolvedValue(mockTask);

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-abc123" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.task).toEqual(mockTask);
      expect(parsed.changeId).toBe("test-change");
      expect(mocks.querySignal).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "test-change",
      );
    });

    test("returns error when task not found", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue(null);

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-missing" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Task not found");
    });
  });

  describe("adv_task_list", () => {
    test("queries changeTasksQuery with status filter", async () => {
      const store = createMockStore();
      const mockTasks = [
        { id: "tk-1", title: "Task 1", status: "pending" },
        { id: "tk-2", title: "Task 2", status: "done" },
      ];
      mocks.querySignal.mockResolvedValue(mockTasks);

      const result = await taskTools.adv_task_list.execute(
        { changeId: "test-change", status: "pending" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.tasks).toHaveLength(2);
      expect(mocks.querySignal).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "pending",
        undefined,
      );
    });
  });

  describe("adv_task_ready", () => {
    test("queries changeReadyQuery for unblocked tasks", async () => {
      const store = createMockStore();
      const mockResult = {
        ready: [{ id: "tk-1", title: "Ready Task", status: "pending" }],
        blocked: [],
      };
      mocks.querySignal.mockResolvedValue(mockResult);

      const result = await taskTools.adv_task_ready.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ready).toHaveLength(1);
      expect(parsed._todoProjection.rows).toEqual([
        {
          taskId: "tk-current",
          title: "Current Task",
          status: "in_progress",
          content: "tk-current — Current Task",
        },
        {
          taskId: "tk-1",
          title: "Ready Task",
          status: "pending",
          content: "tk-1 — Ready Task",
        },
      ]);
      expect(mocks.querySignal).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("adv_task_update", () => {
    test("routes in_progress to taskAssignedSignal", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
      });

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-abc", status: "in_progress" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        sessionId: "agent",
      });
    });

    test("routes blocked to taskBlockedSignal", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "blocked",
      });

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-abc", status: "blocked", notes: "Blocked reason" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        reason: "Blocked reason",
      });
    });

    test("routes other partials to taskUpdatedSignal", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
      });

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-abc", status: "pending", notes: "Updated" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        partial: { status: "pending", notes: "Updated" },
      });
    });

    test("patches contract_refs on an already done task without recompleting it", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Done Task",
              status: "done",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "done",
        contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
          contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[3]).toBeDefined();
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        partial: {
          status: "done",
          contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
        },
      });
      expect(signalCall[4]).not.toHaveProperty("verification");
    });

    test("routes done status to taskCompletedSignal with verification text", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "done",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
          notes: "Focused tests passed",
          implementation_summary: "Implemented signal path",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification: "Focused tests passed",
        summary: "Implemented signal path",
      });
      expect(signalCall[4]).not.toHaveProperty("partial");
    });

    test("extracts structured_output from <adv-output> in implementation_summary when done", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "done",
      });

      const implementationSummary = `Implemented feature.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/foo.ts", "linesAdded": 10}],\n  "testsAdded": 2\n}\n</adv-output>`;

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
          implementation_summary: implementationSummary,
          notes: "Tests passed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        structured_output: {
          filesChanged: [{ path: "src/foo.ts", linesAdded: 10 }],
          testsAdded: 2,
        },
      });
    });

    test("rejects direct cancellation", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-abc", status: "cancelled" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("adv_task_cancel");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });

  describe("adv_task_add", () => {
    test("fires taskAddedSignal with new task", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        { changeId: "test-change", content: "New Task" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.taskId).toBeDefined();
      expect(parsed.task).toBeDefined();
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        task: expect.objectContaining({
          title: "New Task",
          status: "pending",
          metadata: { tdd_intent: "inline" },
        }),
      });
    });

    test("rejects task creation after planning gate is done", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        } as import("../types").Gates,
      });

      const result = await taskTools.adv_task_add.execute(
        { changeId: "test-change", content: "New Task" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("planning gate");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("routes target_path task creation through the target store", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "target-change",
          content: "Target Task",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        } as Parameters<typeof taskTools.adv_task_add.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.taskId).toBeDefined();
      expect(parsed._projectContext).toMatchObject({ root: "/tmp/target" });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        }),
        expect.any(Function),
      );
      expect(mocks.targetStore.gates.get).toHaveBeenCalledWith("target-change");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({
          task: expect.objectContaining({ title: "Target Task" }),
        }),
      );
    });

    test("attaches contract_refs to added tasks", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "change-123",
          content: "Implement contract proof",
          contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.task.contract_refs).toEqual({
        implements: ["AC1"],
        verifies: ["AC1"],
      });
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        store,
        "change-123",
        expect.anything(),
        expect.objectContaining({
          task: expect.objectContaining({
            contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
          }),
        }),
      );
    });
  });

  describe("adv_task_completed", () => {
    test("fires taskCompletedSignal with verification", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_completed.execute(
        {
          taskId: "tk-abc",
          verification: "Tests passed",
          summary: "Implemented feature",
          filesTouched: ["src/foo.ts"],
          checkpointSha: "abc123",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification: "Tests passed",
        summary: "Implemented feature",
        filesTouched: ["src/foo.ts"],
        checkpointSha: "abc123",
      });
    });

    test("extracts structured_output from <adv-output> in verification", async () => {
      const store = createMockStore();

      const verification = `Tests passed.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/bar.ts", "linesAdded": 5}],\n  "testsAdded": 1\n}\n</adv-output>`;

      const result = await taskTools.adv_task_completed.execute(
        {
          taskId: "tk-abc",
          verification,
          summary: "Implemented feature",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        structured_output: {
          filesChanged: [{ path: "src/bar.ts", linesAdded: 5 }],
          testsAdded: 1,
        },
      });
    });
  });

  describe("adv_task_cancel", () => {
    test("fires taskCancelledSignal per task", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-abc", "tk-def"],
          reasons: { "tk-abc": "No longer needed", "tk-def": "Merged" },
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
    });

    test("rejects cancellation without approval evidence", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-abc"],
          reasons: { "tk-abc": "No longer needed" },
          approvedByUser: true,
          approvalEvidence: "",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("approvalEvidence");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("rejects cancellation without reasons instead of throwing", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-abc"],
          approvedByUser: true,
          approvalEvidence: "User approved",
        } as Parameters<typeof taskTools.adv_task_cancel.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Missing cancellation reason");
      expect(parsed.missingReasons).toEqual(["tk-abc"]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("routes target_path cancellation through the target store", async () => {
      const store = createMockStore();
      mocks.targetStore.tasks.show.mockResolvedValue({
        task: {
          id: "tk-target",
          title: "Target Task",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        },
        changeId: "target-change",
      });

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-target"],
          reasons: { "tk-target": "No longer needed" },
          approvedByUser: true,
          approvalEvidence: "User approved",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        } as Parameters<typeof taskTools.adv_task_cancel.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._projectContext).toMatchObject({ root: "/tmp/target" });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        }),
        expect.any(Function),
      );
      expect(mocks.targetStore.tasks.show).toHaveBeenCalledWith("tk-target");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({
          taskId: "tk-target",
          reason: "No longer needed",
        }),
      );
    });

    test("dryRun validates cancellation without firing signals", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-abc"],
          reasons: { "tk-abc": "No longer needed" },
          approvedByUser: true,
          approvalEvidence: "User approved",
          dryRun: true,
        } as Parameters<typeof taskTools.adv_task_cancel.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.wouldCancel).toEqual([
        { id: "tk-abc", title: "Test Task" },
      ]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("target_path dryRun uses target store without mutation trust", async () => {
      const store = createMockStore();
      mocks.targetStore.tasks.show.mockResolvedValue({
        task: {
          id: "tk-target",
          title: "Target Task",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        },
        changeId: "target-change",
      });

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-target"],
          reasons: { "tk-target": "No longer needed" },
          approvedByUser: true,
          approvalEvidence: "User approved",
          target_path: "/tmp/target",
          dryRun: true,
        } as Parameters<typeof taskTools.adv_task_cancel.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed._projectContext).toMatchObject({ root: "/tmp/target" });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          mutation: false,
        }),
        expect.any(Function),
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });

  describe("adv_task_reclassify_tdd", () => {
    test("fires taskUpdatedSignal with metadata.tdd_intent", async () => {
      const store = createMockStore();
      const task = {
        id: "tk-abc",
        title: "Test",
        status: "pending",
        metadata: { tdd_intent: "inline" },
      } as import("../types").Task;

      vi.mocked(store.tasks.show).mockResolvedValue({
        task,
        changeId: "test-change",
      });

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-abc",
          toIntent: "not_applicable",
          reason: "Docs task",
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        partial: {
          metadata: { tdd_intent: "not_applicable" },
        },
      });
    });

    test("routes target_path TDD reclassification through the target store", async () => {
      const store = createMockStore();
      const task = {
        id: "tk-target",
        title: "Target Task",
        status: "pending",
        metadata: { tdd_intent: "inline" },
      } as import("../types").Task;
      mocks.targetStore.tasks.show.mockResolvedValue({
        task,
        changeId: "target-change",
      });

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-target",
          toIntent: "not_applicable",
          reason: "Docs task",
          approvedByUser: true,
          approvalEvidence: "User approved",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        } as Parameters<typeof taskTools.adv_task_reclassify_tdd.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._projectContext).toMatchObject({ root: "/tmp/target" });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        }),
        expect.any(Function),
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({
          taskId: "tk-target",
          partial: {
            metadata: { tdd_intent: "not_applicable" },
          },
        }),
      );
    });
  });
});
