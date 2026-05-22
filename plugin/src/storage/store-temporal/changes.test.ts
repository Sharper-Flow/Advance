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

import { describe, test, expect, vi } from "vitest";
import { createChangeOps } from "./changes";
import { isWorkflowCompletedError } from "../../temporal/recovery-classification";

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
          const metadata = args[7] as
            | { initialMetadata?: { origin?: typeof origin } }
            | undefined;
          createdChange = {
            ...createdChange,
            ...metadata?.initialMetadata,
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

    await ops.create(
      "Backlog feature 51",
      "backlog-coordination",
      "",
      "",
      "",
      "",
      undefined,
      { initialMetadata: { origin } },
    );

    expect(legacy.changes.create).toHaveBeenCalledWith(
      "Backlog feature 51",
      "backlog-coordination",
      "",
      "",
      "",
      "",
      undefined,
      { initialMetadata: { origin } },
    );

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
});
