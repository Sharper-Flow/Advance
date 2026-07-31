/**
 * Task Tools — Signal/Query Adapter Tests
 *
 * TDD tests for task.ts helpers against mocked Temporal client.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { taskTools } from "./task";
import type { Store } from "../storage/store";
import { ContractEvidencePolicySchema, TaskTypeSchema } from "../types";
import { taskUpdatedSignal } from "../temporal/messages";

async function seedProjection(
  change: import("../types").Change,
): Promise<void> {
  const dir = "/tmp/test/.adv/changes/test-change";
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "change.json"),
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

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
    saveRecoveredTaskMutation: vi.fn(async (input) => {
      await seedProjection(input.change);
      const actual = await vi.importActual<
        typeof import("./_recovery-writers")
      >("./_recovery-writers");
      return actual.saveRecoveredTaskMutation(input);
    }),
    saveRecoveredTaskAdd: vi.fn(async (input) => {
      await seedProjection(input.change);
      const actual = await vi.importActual<
        typeof import("./_recovery-writers")
      >("./_recovery-writers");
      return actual.saveRecoveredTaskAdd(input);
    }),
    resolveGitSessionContext: vi.fn(() => ({
      isWorktree: true,
      isMainCheckout: false,
      mainCheckoutPath: "/repo/main",
    })),
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
    resolveTargetAwareMutationCwd: vi.fn(
      ({ store, target_path }: { store: Store; target_path?: string }) =>
        target_path ? store.paths.root : process.cwd(),
    ),
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
    resolveTargetAwareMutationCwd: mocks.resolveTargetAwareMutationCwd,
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
  maybeAttachChangeTicker: vi.fn(
    async (
      output: Record<string, unknown>,
      include: { snapshot?: boolean } | undefined,
      _store: unknown,
      _changeId: string,
    ) => {
      if (!include?.snapshot) return;
      const snapshot = await mocks.fetchChangeContextTicker();
      if (snapshot) output._contextSnapshot = snapshot;
    },
  ),
}));

vi.mock("./_recovery-writers", async () => {
  const actual = await vi.importActual<typeof import("./_recovery-writers")>(
    "./_recovery-writers",
  );
  return {
    ...actual,
    saveRecoveredTaskMutation: mocks.saveRecoveredTaskMutation,
    saveRecoveredTaskAdd: mocks.saveRecoveredTaskAdd,
  };
});

vi.mock("../utils/git-session", () => ({
  resolveGitSessionContext: mocks.resolveGitSessionContext,
}));

function createMockStore(
  overrides: {
    tasks?: Partial<Store["tasks"]>;
    gates?: import("../types").Gates;
    change?: import("../types").Change;
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

  const defaultChange = {
    id: "test-change",
    title: "Test Change",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [
      {
        id: "tk-current",
        title: "Current Task",
        status: "in_progress",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: overrides.gates ?? defaultGates,
  } as unknown as import("../types").Change;

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
      list: vi.fn(async () => ({
        changes: [
          {
            id: "test-change",
            title: "Test Change",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      })),
      get: vi.fn(async () => ({
        success: true,
        data: overrides.change ?? defaultChange,
      })),
      save: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
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
    wisdom: {
      search: vi.fn(async () => []),
      list: vi.fn(async () => []),
      listAll: vi.fn(async () => []),
      add: vi.fn(),
    } as unknown as Store["wisdom"],
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
    mocks.querySignal.mockReset();
    mocks.querySignal.mockResolvedValue([]);
    mocks.fireSignalAndRefresh.mockReset();
    mocks.fireSignalAndRefresh.mockResolvedValue(undefined);
    mocks.resolveGitSessionContext.mockImplementation(() => ({
      isWorktree: true,
      isMainCheckout: false,
      mainCheckoutPath: "/repo/main",
    }));
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

    test("falls back to active workflow task scan when task reverse index is stale", async () => {
      const fallbackTask = {
        id: "tk-reentry",
        title: "Re-entry Task",
        status: "pending",
      };
      const store = createMockStore({
        tasks: { show: vi.fn(async () => null) },
      });
      mocks.querySignal
        .mockResolvedValueOnce([fallbackTask])
        .mockResolvedValueOnce(fallbackTask);

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-reentry" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.changeId).toBe("test-change");
      expect(parsed.task).toEqual(fallbackTask);
      expect(store.changes.list).toHaveBeenCalledTimes(1);
      expect(mocks.querySignal).toHaveBeenCalledTimes(2);
      expect(mocks.querySignal.mock.calls[0]?.slice(2)).toEqual([
        undefined,
        undefined,
      ]);
      expect(mocks.querySignal.mock.calls[1]?.[2]).toBe("tk-reentry");
    });

    test("falls back to active workflow task scan when stale fast path throws", async () => {
      const fallbackTask = {
        id: "tk-reentry-throw",
        title: "Re-entry Task From Live State",
        status: "pending",
      };
      const store = createMockStore({
        tasks: {
          show: vi.fn(async () => Promise.reject(new Error("stale workflow"))),
        },
      });
      mocks.querySignal
        .mockResolvedValueOnce([fallbackTask])
        .mockResolvedValueOnce(fallbackTask);

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-reentry-throw" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.changeId).toBe("test-change");
      expect(parsed.task).toEqual(fallbackTask);
      expect(store.changes.list).toHaveBeenCalledTimes(1);
    });

    // rq-schemaDriftToolLayer: schema errors from store.tasks.show must
    // propagate verbatim. They are not recoverable via the structural fallback
    // scan (which also reads change.json), so masking them as "Task not found"
    // hides a real corruption signal. Pre-fix this throws nothing and returns
    // "Task not found"; post-fix resolveChangeId rethrows schema errors.
    test("propagates schema errors from store.tasks.show verbatim instead of masking as 'Task not found'", async () => {
      const schemaErrorText =
        'Schema validation failed for change "test-change":\n  status: invalid';
      const store = createMockStore({
        tasks: {
          show: vi.fn(async () => Promise.reject(new Error(schemaErrorText))),
        },
      });

      await expect(
        taskTools.adv_task_show.execute({ taskId: "tk-schema-broken" }, store),
      ).rejects.toThrow(/Schema validation failed/);
    });

    // -------------------------------------------------------------------------
    // rq-wisdomAutoSurfacing01 — D1+D2 enrichment
    // -------------------------------------------------------------------------

    test("D1+D2: returns _relevantWisdom and _episodeRecallHint when contract_refs.implements is non-empty", async () => {
      // Recency-sort wins over FTS ranking: FTS fixture returns older-first
      // [ws-old, ws-new]; output must be newer-first [ws-new, ws-old] per AC1.
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Enriched Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              contract_refs: { implements: ["AC1", "AC2"] },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-1",
        title: "Enriched Task",
        status: "pending",
        contract_refs: { implements: ["AC1", "AC2"] },
      });
      (store.wisdom.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "ws-old",
          type: "pattern",
          content: "older entry",
          recorded_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "ws-new",
          type: "failure",
          content: "newer entry",
          recorded_at: "2026-07-01T00:00:00.000Z",
        },
      ]);

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-1" },
        store,
      );
      const parsed = JSON.parse(result);

      // D1: top 5 by recency — newer entry first
      expect(parsed._relevantWisdom).toHaveLength(2);
      expect(parsed._relevantWisdom[0].id).toBe("ws-new");
      expect(parsed._relevantWisdom[1].id).toBe("ws-old");
      // D2: capabilities-gated hint emitted; plugin does not call MCP
      expect(parsed._episodeRecallHint).toEqual({
        namespace: expect.any(String),
        query: "AC1 AC2",
        top_k: 3,
      });
      // FTS query routed the implements[] joined with spaces
      expect(store.wisdom.search).toHaveBeenCalledWith("AC1 AC2", {
        changeId: "test-change",
      });
    });

    test("D1+D2: caps _relevantWisdom to top 5 by recorded_at DESC", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "T",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              contract_refs: { implements: ["AC1"] },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-cap",
        contract_refs: { implements: ["AC1"] },
      });
      // 7 entries — expect 5 newest in DESC order
      (store.wisdom.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({
          id: `ws-${i}`,
          type: "pattern",
          content: `entry-${i}`,
          recorded_at: `2026-01-0${i + 1}T00:00:00.000Z`,
        })),
      );

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-cap" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._relevantWisdom).toHaveLength(5);
      // Newest first (recorded_at DESC)
      expect(parsed._relevantWisdom[0].id).toBe("ws-6");
      expect(parsed._relevantWisdom[4].id).toBe("ws-2");
    });

    test("D1: returns [] _relevantWisdom when contract_refs.implements is empty", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-noimp",
        contract_refs: { implements: [] },
      });

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-noimp" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._relevantWisdom).toEqual([]);
      expect(parsed._episodeRecallHint).toBeUndefined();
      expect(store.wisdom.search).not.toHaveBeenCalled();
    });

    test("D1: returns [] _relevantWisdom when contract_refs is undefined", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({ id: "tk-bare" });

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-bare" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._relevantWisdom).toEqual([]);
      expect(parsed._episodeRecallHint).toBeUndefined();
    });

    test("D1: falls back to [] when wisdom.search throws (advisory-only)", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "T",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              contract_refs: { implements: ["AC1"] },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-throw",
        contract_refs: { implements: ["AC1"] },
      });
      (store.wisdom.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("FTS index missing"),
      );

      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-throw" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._relevantWisdom).toEqual([]);
      // Hint still emitted — it does not depend on FTS
      expect(parsed._episodeRecallHint).toEqual({
        namespace: expect.any(String),
        query: "AC1",
        top_k: 3,
      });
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

    test("projects bounded routing metadata into formatted ready output", async () => {
      const store = createMockStore();
      const mockResult = {
        ready: [
          {
            id: "tk-route",
            title: "Routing Task",
            status: "pending",
            metadata: {
              delegation_hint: "delegate_preferred",
              frontend: "true",
              noise: "ignored",
            },
          },
        ],
        blocked: [],
      };
      mocks.querySignal.mockResolvedValue(mockResult);

      const result = await taskTools.adv_task_ready.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ready[0].metadata).toEqual(mockResult.ready[0].metadata);
      expect(parsed.formatted.readyList).toContain(
        "delegation_hint=delegate_preferred",
      );
      expect(parsed.formatted.readyList).toContain("frontend=true");
      expect(parsed.formatted.readyList).not.toContain("noise");
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
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        sessionId: "agent",
      });
    });

    test("anchors a frontend implementation cycle before assignment", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Frontend Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              metadata: { frontend: "true" },
            },
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-frontend",
        status: "in_progress",
        metadata: { frontend: "true" },
      });

      await taskTools.adv_task_update.execute(
        { taskId: "tk-frontend", status: "in_progress" },
        store,
      );

      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-frontend",
        applyCycle: {
          implementation_cycle_id: expect.any(String),
          kind: "initial",
        },
      });
    });

    test("uses active workflow task scan fallback before mutating stale-index task", async () => {
      const fallbackTask = {
        id: "tk-reentry",
        title: "Re-entry Task",
        status: "pending",
      };
      const store = createMockStore({
        tasks: { show: vi.fn(async () => null) },
      });
      mocks.querySignal
        .mockResolvedValueOnce([fallbackTask])
        .mockResolvedValueOnce({ ...fallbackTask, status: "in_progress" });

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-reentry", status: "in_progress" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(store.changes.list).toHaveBeenCalledTimes(1);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[2]).toBe("test-change");
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-reentry",
        sessionId: "agent",
      });
    });

    test("uses active workflow task scan fallback before mutating when stale fast path throws", async () => {
      const fallbackTask = {
        id: "tk-reentry-throw",
        title: "Re-entry Task From Live State",
        status: "pending",
      };
      const store = createMockStore({
        tasks: {
          show: vi.fn(async () => Promise.reject(new Error("stale workflow"))),
        },
      });
      mocks.querySignal
        .mockResolvedValueOnce([fallbackTask])
        .mockResolvedValueOnce({ ...fallbackTask, status: "in_progress" });

      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-reentry-throw", status: "in_progress" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(store.changes.list).toHaveBeenCalledTimes(1);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[2]).toBe("test-change");
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-reentry-throw",
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
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        reason: "Blocked reason",
      });
    });

    test("blocked with SEMANTIC error_recovery creates WisdomDraft (rq-wisdomAutoSurfacing01.3 / correctness-4)", async () => {
      // Without this fix, blocked-status bypassed draft creation; SEMANTIC
      // learning moments on blocked tasks were lost. Verify the
      // taskBlockedSignal now carries wisdom_drafts atomically.
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-blocked",
        status: "pending",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-blocked",
          status: "blocked",
          notes: "Hit a wall",
          error_recovery: {
            last_error: "TypeError",
            retry_count: 1,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [
              {
                attempt_number: 1,
                error: "TypeError",
                diagnosis: "missing null check",
                fix_tried: "added guard",
                outcome: "failed",
                attempted_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-blocked",
        reason: "Hit a wall",
        wisdom_drafts: [
          expect.objectContaining({
            suggested_type: "failure",
            suggested_content: "missing null check → added guard",
            status: "suggested",
          }),
        ],
      });
    });

    test("blocked without SEMANTIC error_recovery omits wisdom_drafts (DDC6 backward-compat)", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-blocked2",
        status: "pending",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-blocked2",
          status: "blocked",
          notes: "External dep missing",
          error_recovery: {
            last_error: "ServiceUnavailable",
            retry_count: 1,
            max_retries: 3,
            error_class: "TRANSIENT",
            attempts: [
              {
                attempt_number: 1,
                error: "503",
                diagnosis: "service down",
                fix_tried: "retry",
                outcome: "failed",
                attempted_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      // No wisdom_drafts field — TRANSIENT does not trigger draft creation
      expect(signalCall[4].wisdom_drafts).toBeUndefined();
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

    test("AC5: SEMANTIC error_recovery on taskUpdatedSignal clears blocked delegation_recovery", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Blocked Recovery Task",
              status: "in_progress",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              delegation_recovery: {
                empty_or_malformed_count: 2,
                narrower_retry_count: 1,
                inline_diagnosis_evidence: false,
                last_updated_at: "2026-07-30T01:00:00.000Z",
                blocked_scope: "task:tk-abc:agent:adv-engineer",
              },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
        delegation_recovery: {
          empty_or_malformed_count: 2,
          narrower_retry_count: 1,
          inline_diagnosis_evidence: true,
          last_updated_at: expect.any(String),
          blocked_scope: "task:tk-abc:agent:adv-engineer",
        },
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "Inline diagnosis recorded",
            retry_count: 1,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [
              {
                attempt_number: 1,
                error: "empty sub-agent report",
                diagnosis: "worker returned empty payload",
                fix_tried: "record inline diagnosis evidence",
                outcome: "failed" as const,
                attempted_at: "2026-07-30T01:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[3]).toBe(taskUpdatedSignal);
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        partial: {
          status: "pending",
          delegation_recovery: {
            empty_or_malformed_count: 2,
            narrower_retry_count: 1,
            inline_diagnosis_evidence: true,
            blocked_scope: "task:tk-abc:agent:adv-engineer",
          },
        },
      });
    });

    test("AC5: SEMANTIC error_recovery without attempts does not clear blocked delegation_recovery", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Blocked Recovery Task",
              status: "in_progress",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              delegation_recovery: {
                empty_or_malformed_count: 2,
                narrower_retry_count: 1,
                inline_diagnosis_evidence: false,
                last_updated_at: "2026-07-30T01:00:00.000Z",
                blocked_scope: "task:tk-abc:agent:adv-engineer",
              },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "Diagnosis lacks an attempt",
            retry_count: 0,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [],
          },
        },
        store,
      );

      expect(JSON.parse(result).success).toBe(true);
      expect(
        mocks.fireSignalAndRefresh.mock.calls[0][4].partial.delegation_recovery,
      ).toBeUndefined();
    });

    test.each([
      {
        error_class: "ENVIRONMENTAL" as const,
        error_recovery: {
          last_error: "Missing required service",
          retry_count: 0,
          max_retries: 0,
          error_class: "ENVIRONMENTAL" as const,
          attempts: [],
        },
      },
      {
        error_class: "FATAL" as const,
        error_recovery: {
          last_error: "Unsafe state",
          retry_count: 0,
          max_retries: 0,
          error_class: "FATAL" as const,
          attempts: [],
        },
      },
      {
        error_class: "CONTRACT_CONFLICT" as const,
        error_recovery: {
          last_error: "Task contract refs conflict",
          retry_count: 0,
          max_retries: 0,
          error_class: "CONTRACT_CONFLICT" as const,
          failure_attribution: {
            kind: "contract_conflict" as const,
            description: "AC1 is both implemented and verified",
            contract_conflict: {
              kind: "overlapping_implements_verifies" as const,
              contract_ids: ["AC1"],
              reason:
                "A task cannot both implement and verify the same acceptance criterion",
            },
          },
        },
      },
    ])(
      "AC5: $error_class error_recovery does not clear blocked delegation_recovery",
      async ({ error_recovery }) => {
        const store = createMockStore({
          tasks: {
            show: vi.fn(async (taskId: string) => ({
              task: {
                id: taskId,
                title: "Blocked Recovery Task",
                status: "in_progress",
                priority: 0,
                created_at: "2026-01-01T00:00:00Z",
                delegation_recovery: {
                  empty_or_malformed_count: 2,
                  narrower_retry_count: 1,
                  inline_diagnosis_evidence: false,
                  last_updated_at: "2026-07-30T01:00:00.000Z",
                  blocked_scope: "task:tk-abc:agent:adv-engineer",
                },
              } as import("../types").Task,
              changeId: "test-change",
            })),
          },
        });
        mocks.querySignal.mockResolvedValue({
          id: "tk-abc",
          status: "in_progress",
        });

        const result = await taskTools.adv_task_update.execute(
          { taskId: "tk-abc", status: "pending", error_recovery },
          store,
        );

        expect(JSON.parse(result).success).toBe(true);
        expect(
          mocks.fireSignalAndRefresh.mock.calls[0][4].partial
            .delegation_recovery,
        ).toBeUndefined();
      },
    );

    test("AC5: SEMANTIC evidence on an unblocked task does not mutate delegation_recovery", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Unblocked Recovery Task",
              status: "in_progress",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "Inline diagnosis recorded",
            retry_count: 1,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [
              {
                attempt_number: 1,
                error: "empty sub-agent report",
                diagnosis: "worker returned empty payload",
                fix_tried: "record inline diagnosis evidence",
                outcome: "failed" as const,
                attempted_at: "2026-07-30T01:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      expect(JSON.parse(result).success).toBe(true);
      expect(
        mocks.fireSignalAndRefresh.mock.calls[0][4].partial.delegation_recovery,
      ).toBeUndefined();
    });

    test("AC5: non-SEMANTIC error_recovery does not clear blocked delegation_recovery", async () => {
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Blocked Recovery Task",
              status: "in_progress",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              delegation_recovery: {
                empty_or_malformed_count: 2,
                narrower_retry_count: 1,
                inline_diagnosis_evidence: false,
                last_updated_at: "2026-07-30T01:00:00.000Z",
                blocked_scope: "task:tk-abc:agent:adv-engineer",
              },
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "transient network failure",
            retry_count: 1,
            max_retries: 3,
            error_class: "TRANSIENT",
            attempts: [
              {
                attempt_number: 1,
                error: "ECONNRESET",
                diagnosis: "network blip",
                fix_tried: "retry",
                outcome: "failed" as const,
                attempted_at: "2026-07-30T01:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[3]).toBe(taskUpdatedSignal);
      expect(signalCall[4].partial.delegation_recovery).toBeUndefined();
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

    // D4 internal monotonic recovery (rq-internalMonotonicRecovery01 / AC5):
    // signal-error path auto-classifies a completed-workflow error and falls
    // back to the disk-projection writer without operator-supplied evidence.
    test("recovers via signal-error classification when workflow is already completed", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "In-progress Task",
              status: "pending",
              type: "code",
              section: "Implementation",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
          ],
          deltas: {},
          wisdom: [],
          gates: {},
        } as import("../types").Change,
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "In-progress Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("workflow execution already completed"),
      );

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "in_progress",
          notes: "Recovered legacy work",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(parsed.reconciliationWarning).toContain("not healed");
    });

    // rq-extend-poisoned-recovery AC9: no disk-only recovery in normal mode.
    test("rejects done in normal mode before attempting disk fallback", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("adv_task_checkpoint");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    // D4 internal monotonic recovery (rq-internalMonotonicRecovery01 / AC5):
    // when describe() shows the workflow is poisoned, recovery happens
    // automatically via disk projection without operator-supplied evidence.
    test("recovers via D4 internal classification when describe shows poisoned", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "Done Task",
              status: "pending",
              type: "code",
              section: "Implementation",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
          ],
          deltas: {},
          wisdom: [],
          gates: {},
        } as import("../types").Change,
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Done Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.fireSignalAndRefresh.mockResolvedValue(undefined);
      (mocks.handleMock as { describe?: unknown }).describe = vi.fn(
        async () => ({
          searchAttributes: {
            TemporalReportedProblems: [
              "cause=WorkflowTaskFailedCauseNonDeterministicError",
            ],
          },
        }),
      );

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
          implementation_summary: "Recovered via D4 internal classification",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.saveRecoveredTaskMutation).toHaveBeenCalledTimes(1);
      expect(mocks.handleMock.describe).toHaveBeenCalled();
      delete (mocks.handleMock as { describe?: unknown }).describe;
    });

    // D4 internal monotonic recovery: when describe is healthy and operator
    // args are absent, the normal signal path proceeds (no recovery).
    test("proceeds with signal when describe is healthy and operator args absent", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "Pending Task",
              status: "pending",
              type: "code",
              section: "Implementation",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
          ],
          deltas: {},
          wisdom: [],
          gates: {},
        } as import("../types").Change,
      });
      mocks.fireSignalAndRefresh.mockResolvedValue(undefined);
      // describe() returns a healthy workflow — no poisoned markers.
      (mocks.handleMock as { describe?: unknown }).describe = vi.fn(
        async () => ({
          workflowExecutionInfo: { status: "RUNNING", historyLength: 12 },
        }),
      );

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "in_progress",
        },
        store,
      );

      // Signal-driven path ran; no recovery.
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.saveRecoveredTaskMutation).not.toHaveBeenCalled();
      // Result is a normal in_progress tool output (no error, no recovery).
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      delete (mocks.handleMock as { describe?: unknown }).describe;
    });

    test("does not expose adv_task_completed as a second public completion path", () => {
      expect(
        (taskTools as Record<string, unknown>).adv_task_completed,
      ).toBeUndefined();
    });

    test("rejects task contract_refs that do not reference the change contract", async () => {
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
      vi.mocked(store.changes.get).mockResolvedValue({
        success: true,
        data: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
          contract: {
            version: 1,
            rigor: "standard",
            source: {
              artifact: "agreement",
              approvedAt: "2026-01-01T00:00:00Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Known contract item",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
        } as import("../types").Change,
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "done",
          contract_refs: { implements: ["AC404"], verifies: ["AC1"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("unknown contract item");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("rejects first-time done status outside recovery mode", async () => {
      const store = createMockStore();

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
      expect(parsed.error).toContain("adv_task_checkpoint");
      expect(parsed.code).toBe("TASK_DONE_REQUIRES_CHECKPOINT");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("does not extract structured_output by completing through adv_task_update", async () => {
      const store = createMockStore();

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
      expect(parsed.error).toContain("adv_task_checkpoint");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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

    test("routes target_path task update isolation through target store root", async () => {
      const store = createMockStore();
      mocks.targetStore.tasks.show.mockResolvedValue({
        task: { id: "tk-abc", title: "Target task", status: "in_progress" },
        changeId: "test-change",
      });
      mocks.targetStore.changes.get.mockResolvedValue({
        success: true,
        data: { id: "test-change", tasks: [] },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "done",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "in_progress",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.resolveTargetAwareMutationCwd).toHaveBeenCalledWith({
        store: mocks.targetStore,
        target_path: "/tmp/target",
      });
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "test-change",
        expect.anything(),
        expect.objectContaining({ taskId: "tk-abc" }),
      );
    });

    test("repairs evidence policy before planning closes", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "Test Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              type: "research",
            },
          ],
          contract: {
            version: 1,
            rigor: "standard",
            source: {
              artifact: "agreement",
              approvedAt: "2026-01-01T00:00:00Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Coverage is projected",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
        } as import("../types").Change,
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
        type: "research",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          evidence_policy: "source_citation",
          evidence_rationale: "Cited source covers the behavior.",
          proof_target: "Authoritative source citation",
          contract_refs: { implements: ["AC1"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.success).toBe(true);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        partial: {
          evidence_plan: {
            policy: "source_citation",
            proof_target: "Authoritative source citation",
            rationale: "Cited source covers the behavior.",
            provenance: "new",
            stage: "stage-v2",
          },
        },
      });
      expect(parsed.contractCoverage.uncoveredAcceptanceCriteria).toHaveLength(
        0,
      );
    });

    test("rejects evidence plan repair after planning closes", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          evidence_policy: "source_citation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("after planning gate is complete");
      expect(parsed.code).toBe("EVIDENCE_PLAN_REPAIR_AFTER_PLANNING");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("rejects invalid evidence plan repair", async () => {
      const store = createMockStore();

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          evidence_policy: "not_applicable",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Invalid evidence plan repair");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("surfaces contract coverage in task update output", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "Test Task",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          contract: {
            version: 1,
            rigor: "standard",
            source: {
              artifact: "agreement",
              approvedAt: "2026-01-01T00:00:00Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Coverage is projected",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
        } as import("../types").Change,
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "in_progress",
        contract_refs: { implements: ["AC1"] },
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "in_progress",
          contract_refs: { implements: ["AC1"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.contractCoverage).toBeDefined();
      expect(parsed.contractCoverage.uncoveredAcceptanceCriteria).toHaveLength(
        0,
      );
      expect(parsed.contractCoverage.taskCoverage).toContainEqual(
        expect.objectContaining({ taskId: "tk-abc", implements: ["AC1"] }),
      );
    });

    test("surfaces cancellation metadata in task update contract coverage", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-cancelled",
              title: "Cancelled task",
              status: "cancelled",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              contract_refs: { implements: ["AC1"] },
            },
          ],
          contract: {
            version: 1,
            rigor: "standard",
            source: {
              artifact: "agreement",
              approvedAt: "2026-01-01T00:00:00Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Coverage is projected",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
        } as import("../types").Change,
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-cancelled",
        status: "cancelled",
      });

      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-cancelled",
          status: "pending",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.contractCoverage.cancelledTaskIds).toEqual([
        "tk-cancelled",
      ]);
      expect(parsed.contractCoverage.cancelledTaskCount).toBe(1);
    });

    // ---------------------------------------------------------------------------
    // rq-wisdomAutoSurfacing01 — WisdomDraft auto-creation on SEMANTIC recovery
    // ---------------------------------------------------------------------------

    test("auto-creates a WisdomDraft when error_recovery is SEMANTIC with attempts", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
      });

      await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "TypeError",
            retry_count: 1,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [
              {
                attempt_number: 1,
                error: "TypeError",
                diagnosis: "missing await",
                fix_tried: "add await",
                outcome: "failed",
                attempted_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      const partial = signalCall[4].partial;
      expect(partial.error_recovery.error_class).toBe("SEMANTIC");
      expect(partial.wisdom_drafts).toBeDefined();
      expect(partial.wisdom_drafts).toHaveLength(1);
      const draft = partial.wisdom_drafts[0];
      expect(draft.id).toMatch(/^dr-[0-9a-f]{8}$/);
      expect(draft.suggested_type).toBe("failure");
      expect(draft.suggested_content).toBe("missing await → add await");
      expect(draft.source_attempts).toEqual([1]);
      expect(draft.status).toBe("suggested");
    });

    test("does NOT create a WisdomDraft when error_class is not SEMANTIC", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
      });

      await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "Network timeout",
            retry_count: 1,
            max_retries: 3,
            error_class: "TRANSIENT",
            attempts: [
              {
                attempt_number: 1,
                error: "timeout",
                diagnosis: "slow net",
                fix_tried: "retry",
                outcome: "failed",
                attempted_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4].partial.wisdom_drafts).toBeUndefined();
    });

    test("does NOT create a WisdomDraft when attempts[] is empty", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
      });

      await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "TypeError",
            retry_count: 0,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [],
          },
        },
        store,
      );

      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4].partial.wisdom_drafts).toBeUndefined();
    });

    test("dedups: does not create a second suggested draft when one already exists", async () => {
      const existingDraft = {
        id: "dr-existing",
        suggested_type: "failure",
        suggested_content: "prior issue → prior fix",
        source_attempts: [1],
        status: "suggested",
        created_at: "2026-07-21T16:00:00.000Z",
      };
      const store = createMockStore({
        tasks: {
          show: vi.fn(async (taskId: string) => ({
            task: {
              id: taskId,
              title: "Sample",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
              wisdom_drafts: [existingDraft],
            } as import("../types").Task,
            changeId: "test-change",
          })),
        },
      });
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
        wisdom_drafts: [existingDraft],
      });

      await taskTools.adv_task_update.execute(
        {
          taskId: "tk-abc",
          status: "pending",
          error_recovery: {
            last_error: "TypeError",
            retry_count: 2,
            max_retries: 3,
            error_class: "SEMANTIC",
            attempts: [
              {
                attempt_number: 2,
                error: "different error",
                diagnosis: "new diag",
                fix_tried: "new fix",
                outcome: "failed",
                attempted_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        },
        store,
      );

      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      // No wisdom_drafts in the partial — dedup kept the existing draft untouched.
      expect(signalCall[4].partial.wisdom_drafts).toBeUndefined();
    });

    test("no error_recovery → no wisdom_drafts in partial", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue({
        id: "tk-abc",
        status: "pending",
      });

      await taskTools.adv_task_update.execute(
        { taskId: "tk-abc", status: "pending", notes: "regular update" },
        store,
      );

      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4].partial.wisdom_drafts).toBeUndefined();
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
      expect(parsed.error).toBeUndefined();
      expect(parsed.taskId).toBeDefined();
      expect(parsed.task).toBeDefined();
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        task: expect.objectContaining({
          title: "New Task",
          status: "pending",
          metadata: { tdd_intent: "inline" },
          evidence_plan: expect.objectContaining({
            policy: "test",
            proof_target: expect.any(String),
            provenance: "new",
            stage: "stage-v2",
          }),
        }),
      });
    });

    test("accepts task type and evidence_policy", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Research task",
          type: "research",
          evidence_policy: "source_citation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.task.type).toBe("research");
      expect(parsed.task.evidence_policy).toBe("source_citation");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        task: expect.objectContaining({
          type: "research",
          evidence_policy: "source_citation",
        }),
      });
    });

    test("accepts a stage-v2 behavior-critical review route with prep proof", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Review-only behavior change",
          type: "code",
          evidence_policy: "review",
          evidence_rationale:
            "A focused review proves this configuration-only invariant.",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.task.evidence_plan).toMatchObject({
        policy: "review",
        rationale: "A focused review proves this configuration-only invariant.",
        provenance: "new",
        stage: "stage-v2",
      });
      expect(parsed.task.evidence_plan.review_conclusion).toBeUndefined();
    });

    test("rejects a behavior-critical non-test route without its required proof", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Review-only behavior change",
          type: "code",
          evidence_policy: "review",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toMatch(/Invalid evidence plan.*rationale/i);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("derives metadata.tdd_intent from task type when missing", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const cases: Array<{
        type: Parameters<typeof taskTools.adv_task_add.execute>[0]["type"];
        expected: string;
      }> = [
        { type: "code", expected: "inline" },
        { type: "verification", expected: "separate_verification" },
        { type: "docs", expected: "not_applicable" },
        { type: "research", expected: "not_applicable" },
        { type: "approval", expected: "not_applicable" },
        { type: "ops", expected: "not_applicable" },
      ];

      for (const { type, expected } of cases) {
        vi.clearAllMocks();
        mocks.querySignal.mockResolvedValue([]);

        const result = await taskTools.adv_task_add.execute(
          { changeId: "test-change", content: `${type} task`, type },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.task.metadata.tdd_intent).toBe(expected);
      }
    });

    test("preserves explicit metadata.tdd_intent over derived default", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValue([]);

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Docs task with TDD",
          type: "docs",
          metadata: { tdd_intent: "inline" },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.task.metadata.tdd_intent).toBe("inline");
    });

    test("rejects invalid task type at schema level", () => {
      expect(() => TaskTypeSchema.parse("design")).toThrow();
    });

    test("rejects invalid evidence policy at schema level", () => {
      expect(() => ContractEvidencePolicySchema.parse("opinion")).toThrow();
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
      vi.spyOn(process, "cwd").mockReturnValue("/repo/main");
      mocks.resolveGitSessionContext.mockImplementation((cwd: string) => ({
        isWorktree: cwd === "/tmp/target",
        isMainCheckout: cwd === "/repo/main",
        mainCheckoutPath: "/repo/main",
      }));

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
      expect(parsed.error).toBeUndefined();
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
      expect(mocks.resolveGitSessionContext).toHaveBeenCalledWith(
        "/tmp/target",
        undefined,
      );
      expect(mocks.resolveTargetAwareMutationCwd).toHaveBeenCalledWith({
        store: mocks.targetStore,
        target_path: "/tmp/target",
      });
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

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Implement AC1",
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
        "test-change",
        expect.anything(),
        expect.objectContaining({
          task: expect.objectContaining({
            contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
          }),
        }),
      );
    });

    test("rejects added task contract_refs that do not reference the change contract", async () => {
      const store = createMockStore();
      vi.mocked(store.changes.get).mockResolvedValue({
        success: true,
        data: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
          contract: {
            version: 1,
            rigor: "standard",
            source: {
              artifact: "agreement",
              approvedAt: "2026-01-01T00:00:00Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Known contract item",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
        } as import("../types").Change,
      });

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Implement AC404",
          contract_refs: { implements: ["AC404"] },
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("unknown contract item");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    // D4 internal monotonic recovery (rq-internalMonotonicRecovery01 / AC5):
    // probe-first path auto-classifies a poisoned workflow from describe() and
    // recovers via disk projection without operator-supplied evidence.
    test("recovers via probe-first classification when describe shows poisoned", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        } as import("../types").Change,
      });
      mocks.querySignal.mockResolvedValue([]);
      mocks.fireSignalAndRefresh.mockResolvedValue(undefined);
      (mocks.handleMock as { describe?: unknown }).describe = vi.fn(
        async () => ({
          searchAttributes: {
            TemporalReportedProblems: [
              "cause=WorkflowTaskFailedCauseNonDeterministicError",
            ],
          },
        }),
      );

      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "test-change",
          content: "Probe-first task",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed._recoveryMutation).toBe(true);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.saveRecoveredTaskAdd).toHaveBeenCalledTimes(1);
      expect(mocks.saveRecoveredTaskAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          store,
          change: expect.objectContaining({ id: "test-change" }),
          task: expect.objectContaining({ title: "Probe-first task" }),
        }),
      );
      delete (mocks.handleMock as { describe?: unknown }).describe;
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

    // D4 internal monotonic recovery (rq-internalMonotonicRecovery01 / AC5):
    // signal-error path auto-classifies a poisoned workflow from the error +
    // describe() and recovers via disk projection without operator-supplied
    // evidence.
    test("recovers via signal-error classification when workflow is poisoned", async () => {
      const store = createMockStore({
        change: {
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [
            {
              id: "tk-abc",
              title: "Task to cancel",
              status: "pending",
              priority: 0,
              created_at: "2026-01-01T00:00:00Z",
            } as import("../types").Task,
          ],
          deltas: {},
          wisdom: [],
          gates: {},
        } as import("../types").Change,
      });
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100]"),
      );
      (mocks.handleMock as { describe?: unknown }).describe = vi.fn(
        async () => ({
          searchAttributes: {
            TemporalReportedProblems: [
              "cause=WorkflowTaskFailedCauseNonDeterministicError",
            ],
          },
        }),
      );

      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-abc"],
          reasons: { "tk-abc": "No longer needed" },
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.saveRecoveredTaskMutation).toHaveBeenCalledTimes(1);
      expect(mocks.saveRecoveredTaskMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          store,
          change: expect.objectContaining({ id: "test-change" }),
          taskId: "tk-abc",
        }),
      );
      delete (mocks.handleMock as { describe?: unknown }).describe;
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
        partial: expect.objectContaining({
          metadata: { tdd_intent: "not_applicable" },
          evidence_plan: expect.objectContaining({
            provenance: "reclassified",
          }),
        }),
      });
    });

    test("rejects reclassification that would create an invalid evidence plan", async () => {
      const store = createMockStore();
      const task = {
        id: "tk-review-route",
        title: "Review-only behavior change",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-07-17T00:00:00.000Z",
        metadata: { tdd_intent: "inline" },
        evidence_policy: "review",
      } as import("../types").Task;

      vi.mocked(store.tasks.show).mockResolvedValue({
        task,
        changeId: "test-change",
      });

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-review-route",
          toIntent: "not_applicable",
          reason: "Reassess evidence route",
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );

      const parsed = JSON.parse(result);
      // Stage-v2 plans defer reviewer-owned proof to completion; only the
      // bounded rationale is required at prep.
      expect(parsed.error).toMatch(/requires a bounded rationale/);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
          partial: expect.objectContaining({
            metadata: { tdd_intent: "not_applicable" },
          }),
        }),
      );
    });
  });
});
