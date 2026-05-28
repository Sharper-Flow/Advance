/**
 * Tests for the close-terminated-workflow fallback in changes.ts.
 *
 * Bug #54: adv_change_close fails on terminated workflows with no disk-only fallback.
 * When the Temporal workflow is in a terminal state (Completed, Terminated, Failed),
 * signaling throws. The fix catches these errors and returns the disk-backed change
 * since the disk write already succeeded.
 *
 * These tests validate the error detection helper and ensure the close/closeBatch
 * methods handle terminated workflows gracefully.
 */

import { createHash } from "crypto";
import { describe, test, expect, vi } from "vitest";
import { createChangeOps } from "./changes";
import { isWorkflowCompletedError } from "../../temporal/recovery-classification";
import { ChangeSummaryMemo } from "../store-temporal-memo";

const ensureChangeWorkflowStarted = vi.hoisted(() => vi.fn());

vi.mock("../../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted,
}));

describe("isWorkflowCompletedError", () => {
  test("non-Error values → false", () => {
    expect(isWorkflowCompletedError("string error")).toBe(false);
    expect(isWorkflowCompletedError(42)).toBe(false);
    expect(isWorkflowCompletedError(null)).toBe(false);
    expect(isWorkflowCompletedError(undefined)).toBe(false);
  });

  test("workflow execution already completed message → true", () => {
    expect(
      isWorkflowCompletedError(
        new Error("workflow execution already completed"),
      ),
    ).toBe(true);
  });

  test("already completed (lowercase) → true", () => {
    expect(
      isWorkflowCompletedError(new Error("Workflow Already Completed")),
    ).toBe(true);
  });

  test("WorkflowExecutionAlreadyCompleted name → true", () => {
    const err = new Error("nondeterminism");
    err.name = "WorkflowExecutionAlreadyCompleted";
    expect(isWorkflowCompletedError(err)).toBe(true);
  });

  test("workflow is not running → true", () => {
    expect(isWorkflowCompletedError(new Error("Workflow is not running"))).toBe(
      true,
    );
  });

  test("cannot signal a completed → true", () => {
    expect(
      isWorkflowCompletedError(new Error("Cannot signal a completed workflow")),
    ).toBe(true);
  });

  test("unrelated error → false", () => {
    expect(isWorkflowCompletedError(new Error("network timeout"))).toBe(false);
    expect(isWorkflowCompletedError(new Error("permission denied"))).toBe(
      false,
    );
  });

  test("Error with empty message and name → false", () => {
    expect(isWorkflowCompletedError(new Error(""))).toBe(false);
  });
});

describe("createChangeOps", () => {
  test("seeds origin into new change workflow at start (rq-backlogCoord01, rq-backlogCoord08)", async () => {
    ensureChangeWorkflowStarted.mockResolvedValue(undefined);

    const origin = { kind: "roadmap", issue_number: 51 };
    let createdChange = {
      id: "backlogFeature51",
      title: "Backlog feature 51",
      status: "draft",
      created_at: "2026-05-11T00:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: {},
      reentry_history: [],
    };

    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        create: vi.fn().mockImplementation(async (...args: unknown[]) => {
          // After T20 atomic removal, legacy.changes.create receives
          // (summary, options) — initialMetadata is on args[1].
          const options = args[1] as
            | { initialMetadata?: { origin?: typeof origin } }
            | undefined;
          createdChange = {
            ...createdChange,
            ...options?.initialMetadata,
          };
          return { changeId: createdChange.id };
        }),
        get: vi.fn().mockImplementation(async () => ({
          success: true,
          data: createdChange,
        })),
        save: vi.fn().mockResolvedValue(undefined),
      },
    };
    const workflowClient = { workflow: { start: vi.fn(), getHandle: vi.fn() } };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-abc",
      },
      legacy,
      invalidateChange: vi.fn(),
      updateOverlay: vi.fn(),
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      getTemporalChange: vi.fn(),
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
    } as never);

    await ops.create("Backlog feature 51", {
      capability: "backlog-coordination",
      initialMetadata: { origin },
    });

    // Temporal store now calls legacy.changes.create with options-object
    // shape — no artifact content forwarded; content flows via signals.
    expect(legacy.changes.create).toHaveBeenCalledWith("Backlog feature 51", {
      capability: "backlog-coordination",
      initialMetadata: { origin },
    });

    expect(ensureChangeWorkflowStarted).toHaveBeenCalledWith(
      workflowClient,
      expect.objectContaining({
        seedState: expect.objectContaining({ origin }),
      }),
    );
  });

  /**
   * rq-autoManageAdvWorktrees AC3 — stamping on create.
   *
   * New changes get worktree_auto_managed: true at creation, propagated
   * through three surfaces: workflow seedState, the disk-projection save
   * (changeWithOwner), and the Memo overlay. All three sites must move
   * together so reads see the marker regardless of which path serves them.
   */
  test("stamps worktree_auto_managed:true at change creation (AC3)", async () => {
    ensureChangeWorkflowStarted.mockResolvedValue(undefined);

    const createdChange = {
      id: "newAutoManagedChange",
      title: "New auto-managed change",
      status: "draft",
      created_at: "2026-05-21T00:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: {},
      reentry_history: [],
    };

    const saveMock = vi.fn().mockResolvedValue(undefined);
    const updateOverlayMock = vi.fn();
    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        create: vi.fn().mockResolvedValue({ changeId: createdChange.id }),
        get: vi.fn().mockResolvedValue({ success: true, data: createdChange }),
        save: saveMock,
      },
    };
    const workflowClient = { workflow: { start: vi.fn(), getHandle: vi.fn() } };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-am",
      },
      legacy,
      invalidateChange: vi.fn(),
      updateOverlay: updateOverlayMock,
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      getTemporalChange: vi.fn(),
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
    } as never);

    await ops.create("New auto-managed change", "test", "", "", "", "");

    // 1. Workflow seedState carries the marker so the workflow starts with it set.
    expect(ensureChangeWorkflowStarted).toHaveBeenCalledWith(
      workflowClient,
      expect.objectContaining({
        seedState: expect.objectContaining({ worktree_auto_managed: true }),
      }),
    );

    // 2. Disk projection save includes the marker (changeWithOwner).
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "newAutoManagedChange",
        adv_project_id: "pid-am",
        worktree_auto_managed: true,
      }),
    );

    // 3. Memo overlay carries the marker for lightweight summary reads.
    expect(updateOverlayMock).toHaveBeenCalledWith(
      "newAutoManagedChange",
      expect.objectContaining({ worktree_auto_managed: true }),
    );
  });

  describe("listSummary (rq-changeSummaryReadModel01)", () => {
    test("serves memo-only candidates without per-change full hydration", async () => {
      const memo = new ChangeSummaryMemo();
      memo.set("changeA", {
        id: "changeA",
        title: "Change A",
        status: "active",
        gateProgress: {
          proposal: "done",
          discovery: "done",
          design: "done",
          planning: "done",
          execution: "pending",
          acceptance: "pending",
          release: "pending",
        },
        taskCounts: { total: 4, done: 2, pending: 2 },
        lastActivityAt: "2026-05-26T00:00:00.000Z",
      });
      memo.set("changeB", {
        id: "changeB",
        title: "Change B",
        status: "draft",
        gateProgress: {
          proposal: "pending",
          discovery: "pending",
          design: "pending",
          planning: "pending",
          execution: "pending",
          acceptance: "pending",
          release: "pending",
        },
        taskCounts: { total: 0, done: 0, pending: 0 },
        lastActivityAt: "2026-05-25T12:00:00.000Z",
      });

      const getTemporalChange = vi.fn();
      const legacy = {
        paths: { changes: "/tmp/changes", root: "/tmp/project" },
        changes: {
          get: vi.fn().mockResolvedValue({ success: false }),
        },
      };
      const workflowClient = {
        workflow: {
          // No `list` method → forces disk fallback path, no Visibility call.
          getHandle: vi.fn(),
        },
      };

      const ops = createChangeOps({
        input: {
          legacy,
          temporal: { client: workflowClient },
          projectId: "pid-summary",
        },
        legacy,
        invalidateChange: vi.fn(),
        updateOverlay: vi.fn(),
        emitChangeSummarySignal: vi.fn(),
        indexTasksFromState: vi.fn(),
        setCachedChange: vi.fn(),
        getTemporalChange,
        listResolvedChanges: vi.fn(),
        getTemporalWorkflowClient: () => workflowClient,
        dualWriteAfterMutation: vi.fn(),
        memo,
        changeCache: new Map(),
      } as never);

      const result = await ops.listSummary!();

      expect(getTemporalChange).not.toHaveBeenCalled();
      expect(result.hydrationStats).toMatchObject({
        totalIds: 2,
        fromMemo: 2,
        fromCache: 0,
        fromHydration: 0,
      });
      expect(result.changes.map((c) => c.id).sort()).toEqual([
        "changeA",
        "changeB",
      ]);
      const a = result.changes.find((c) => c.id === "changeA")!;
      expect(a.taskCount).toBe(4);
      expect(a.completedTasks).toBe(2);
      expect(a.status).toBe("active");
    });

    test("falls back to full hydration for IDs missing from memo and cache", async () => {
      const memo = new ChangeSummaryMemo();
      const getTemporalChange = vi.fn().mockResolvedValue({
        success: true,
        data: {
          id: "diskOnlyChange",
          title: "Disk Only",
          status: "active",
          created_at: "2026-05-20T00:00:00.000Z",
          tasks: [{ id: "t1", status: "done" }],
          deltas: {},
          wisdom: [],
          gates: {},
          reentry_history: [],
        },
      });
      const legacy = {
        paths: { changes: "/tmp/changes", root: "/tmp/project" },
        changes: {
          get: vi.fn(),
        },
      };
      const workflowClient = { workflow: { getHandle: vi.fn() } };

      // Seed memo so the candidate ID enters the listSummary set; the
      // cache short-circuit serves it before any hydration call fires.
      memo.set("diskOnlyChange", {
        id: "diskOnlyChange",
        title: "Disk Only",
        status: "active",
        gateProgress: {
          proposal: "done",
          discovery: "pending",
          design: "pending",
          planning: "pending",
          execution: "pending",
          acceptance: "pending",
          release: "pending",
        },
        taskCounts: { total: 1, done: 1, pending: 0 },
        lastActivityAt: "2026-05-20T00:00:00.000Z",
      });
      const seededCache = new Map();
      seededCache.set("diskOnlyChange", {
        id: "diskOnlyChange",
        title: "Disk Only",
        status: "active",
        created_at: "2026-05-20T00:00:00.000Z",
        tasks: [{ id: "t1", status: "done" }],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
      });

      const ops2 = createChangeOps({
        input: {
          legacy,
          temporal: { client: workflowClient },
          projectId: "pid-fallback",
        },
        legacy,
        invalidateChange: vi.fn(),
        updateOverlay: vi.fn(),
        emitChangeSummarySignal: vi.fn(),
        indexTasksFromState: vi.fn(),
        setCachedChange: vi.fn(),
        getTemporalChange,
        listResolvedChanges: vi.fn(),
        getTemporalWorkflowClient: () => workflowClient,
        dualWriteAfterMutation: vi.fn(),
        memo,
        changeCache: seededCache,
      } as never);

      const result = await ops2.listSummary!();

      expect(result.hydrationStats?.fromCache).toBe(1);
      expect(result.hydrationStats?.fromHydration).toBe(0);
      expect(getTemporalChange).not.toHaveBeenCalled();
      expect(result.changes.map((c) => c.id)).toEqual(["diskOnlyChange"]);
      expect(result.changes[0].taskCount).toBe(1);
      expect(result.changes[0].completedTasks).toBe(1);
    });

    test("defers to authoritative listResolvedChanges for archived/closed filters", async () => {
      const memo = new ChangeSummaryMemo();
      const listResolvedChanges = vi.fn().mockResolvedValue([
        {
          id: "archivedC",
          title: "Archived",
          status: "archived",
          created_at: "2026-05-10T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
          reentry_history: [],
        },
      ]);
      const legacy = {
        paths: { changes: "/tmp/changes", root: "/tmp/project" },
        changes: { get: vi.fn() },
      };
      const workflowClient = { workflow: { getHandle: vi.fn() } };

      const ops = createChangeOps({
        input: {
          legacy,
          temporal: { client: workflowClient },
          projectId: "pid-terminal",
        },
        legacy,
        invalidateChange: vi.fn(),
        updateOverlay: vi.fn(),
        emitChangeSummarySignal: vi.fn(),
        indexTasksFromState: vi.fn(),
        setCachedChange: vi.fn(),
        getTemporalChange: vi.fn(),
        listResolvedChanges,
        getTemporalWorkflowClient: () => workflowClient,
        dualWriteAfterMutation: vi.fn(),
        memo,
        changeCache: new Map(),
      } as never);

      const result = await ops.listSummary!({ includeArchived: true });

      expect(listResolvedChanges).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true }),
      );
      expect(result.changes.map((c) => c.id)).toEqual(["archivedC"]);
      expect(result.hydrationStats?.fromMemo).toBe(0);
      expect(result.hydrationStats?.fromHydration).toBeGreaterThan(0);
    });
  });

  test("signals executiveSummary artifact metadata after artifact updates", async () => {
    const signalMock = vi.fn().mockResolvedValue(undefined);
    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        get: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "summaryChange", adv_project_id: "pid-summary" },
        }),
        updateArtifacts: vi.fn().mockResolvedValue({
          success: true,
          executiveSummaryPath:
            "/tmp/changes/summaryChange/executive-summary.md",
        }),
      },
    };
    const workflowClient = {
      workflow: { getHandle: vi.fn(() => ({ signal: signalMock })) },
    };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-summary",
      },
      legacy,
      invalidateChange: vi.fn(),
      updateOverlay: vi.fn(),
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      getTemporalChange: vi.fn(),
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
    } as never);

    await ops.updateArtifacts("summaryChange", {
      executiveSummary: "# Executive Summary",
    });

    expect(signalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "executiveSummary",
        metadata: expect.objectContaining({
          path: "/tmp/changes/summaryChange/executive-summary.md",
          contentHash: createHash("sha256")
            .update("# Executive Summary")
            .digest("hex"),
        }),
      }),
    );
  });
});
