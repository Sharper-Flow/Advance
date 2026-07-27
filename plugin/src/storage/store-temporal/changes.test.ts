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
const getCurrentSessionIdMock = vi.hoisted(() => vi.fn());
const removeChangeDirMock = vi.hoisted(() => vi.fn());

vi.mock("../../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted,
}));

vi.mock("../../archive/terminal-history", () => ({
  renderTerminalHistory: vi.fn(),
  TERMINAL_HISTORY_DEADLINE_BUDGET_MS: 20_000,
}));

vi.mock("../../utils/session-id", () => ({
  getCurrentSessionId: getCurrentSessionIdMock,
  generateSessionId: vi.fn(() => "sess_generated"),
  setCurrentSessionId: vi.fn(),
}));

// rq-creationRequestHash01: hijack removeChangeDir from the json module
// so the P1.4 rollback assertion in the conflict test can observe the
// call. The hoisted mock keeps the rest of ../json intact by deferring
// to the real implementation via vi.importActual.
vi.mock("../json", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    removeChangeDir: removeChangeDirMock,
  };
});

const listSummaryChanges = vi.hoisted(() => vi.fn());

vi.mock("../change-summary-shard", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    commitChangeProjectionWithSummary: vi.fn().mockResolvedValue({
      kind: "committed",
      snapshotRevision: 1,
    }),
  };
});

vi.mock("../change-summary-shard-reader", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listSummaryChanges,
  };
});

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

  test("threads current sessionId into new change workflow input (rq-isolSessionTaskQueue01, KD-10)", async () => {
    ensureChangeWorkflowStarted.mockResolvedValue(undefined);
    getCurrentSessionIdMock.mockReturnValue("sess_test_routing_id");

    const createdChange = {
      id: "sessionRoutingTest",
      title: "Session routing test",
      status: "draft",
      created_at: "2026-07-21T00:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: {},
      reentry_history: [],
    };

    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        create: vi.fn().mockResolvedValue({ changeId: createdChange.id }),
        get: vi.fn().mockResolvedValue({ success: true, data: createdChange }),
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

    await ops.create("Session routing test", {});

    expect(ensureChangeWorkflowStarted).toHaveBeenCalledWith(
      workflowClient,
      expect.objectContaining({
        sessionId: "sess_test_routing_id",
      }),
    );

    getCurrentSessionIdMock.mockReset();
  });

  test("seeds cross_project_origin into new change workflow at start", async () => {
    ensureChangeWorkflowStarted.mockResolvedValue(undefined);

    const crossProjectOrigin = {
      source_project: "toolbox",
      source_path: "/home/jon/toolbox",
      source_change_id: "sourceChange",
      linked_at: "2026-06-06T20:00:00.000Z",
    };
    let createdChange = {
      id: "targetFollowup",
      title: "Target followup",
      status: "draft",
      created_at: "2026-06-06T20:00:00.000Z",
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
          const options = args[1] as
            | {
                initialMetadata?: {
                  cross_project_origin?: typeof crossProjectOrigin;
                };
              }
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
        projectId: "pid-target",
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

    await ops.create("Target followup", {
      capability: "advance-meta",
      initialMetadata: { cross_project_origin: crossProjectOrigin } as never,
    });

    expect(ensureChangeWorkflowStarted).toHaveBeenCalledWith(
      workflowClient,
      expect.objectContaining({
        seedState: expect.objectContaining({
          cross_project_origin: crossProjectOrigin,
        }),
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

  /**
   * rq-creationRequestHash01 (tk-74c358188ffb) — creation-request hash
   * threading on the store-temporal `create` path.
   *
   * Covers design D2 / AC4 / AC11: the canonical hash is computed from
   * stable create fields, threaded into both `seedState.creation_request_hash`
   * (so the workflow records it once at start) and the top-level
   * `creationRequestHash` (so the "already started" path can reconcile
   * retries), and stamped onto the disk projection so disk-first readers
   * see it without a workflow query round-trip.
   */
  describe("creation_request_hash threading (rq-creationRequestHash01)", () => {
    function buildOps({
      changeId,
      summary,
    }: {
      changeId: string;
      summary: string;
    }) {
      ensureChangeWorkflowStarted.mockResolvedValue(undefined);
      const createdChange = {
        id: changeId,
        title: summary,
        status: "draft",
        created_at: "2026-07-22T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
      };
      const saveMock = vi.fn().mockResolvedValue(undefined);
      const legacy = {
        paths: { changes: "/tmp/changes", root: "/tmp/project" },
        changes: {
          create: vi.fn().mockResolvedValue({ changeId }),
          get: vi
            .fn()
            .mockResolvedValue({ success: true, data: createdChange }),
          save: saveMock,
        },
      };
      const workflowClient = {
        workflow: { start: vi.fn(), getHandle: vi.fn() },
      };
      const ops = createChangeOps({
        input: {
          legacy,
          temporal: { client: workflowClient },
          projectId: "pid-cr",
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
      return { ops, saveMock, legacy, workflowClient };
    }

    test("threads creationRequestHash + seedState.creation_request_hash into ensureChangeWorkflowStarted", async () => {
      const { ops } = buildOps({
        changeId: "hashThreaded",
        summary: "Hash threaded",
      });

      await ops.create("Hash threaded", {
        capability: "advance-meta",
      });

      const call = ensureChangeWorkflowStarted.mock.calls.at(-1)!;
      const passedInput = call[1] as {
        creationRequestHash?: string;
        seedState?: { creation_request_hash?: string };
      };
      expect(passedInput.creationRequestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(passedInput.seedState?.creation_request_hash).toBe(
        passedInput.creationRequestHash,
      );
    });

    test("stamps creation_request_hash on the disk projection (changeWithOwner)", async () => {
      const { ops, saveMock } = buildOps({
        changeId: "diskStamped",
        summary: "Disk stamped",
      });

      await ops.create("Disk stamped", {});

      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "diskStamped",
          creation_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
    });

    test("hash differs when capability differs (distinguishes same-summary conflicts)", async () => {
      const { ops: ops1 } = buildOps({
        changeId: "sameIdDiffCap",
        summary: "Same id diff cap",
      });
      await ops1.create("Same id diff cap", { capability: "auth" });
      const hash1 = (
        ensureChangeWorkflowStarted.mock.calls.at(-1)![1] as {
          creationRequestHash: string;
        }
      ).creationRequestHash;

      const { ops: ops2 } = buildOps({
        changeId: "sameIdDiffCap",
        summary: "Same id diff cap",
      });
      await ops2.create("Same id diff cap", { capability: "billing" });
      const hash2 = (
        ensureChangeWorkflowStarted.mock.calls.at(-1)![1] as {
          creationRequestHash: string;
        }
      ).creationRequestHash;

      expect(hash1).not.toBe(hash2);
    });

    test("P1.4 rollback fires on ChangeCreationHashConflictError and rethrows (post-commit-timeout conflict path)", async () => {
      // Simulate the post-commit-timeout + different-retry scenario:
      // the workflow exists with a different hash → ensureChangeWorkflowStarted
      // throws ChangeCreationHashConflictError. The disk scaffold written
      // by legacy.changes.create must be rolled back so a subsequent retry
      // with the original request can succeed.
      const { ChangeCreationHashConflictError } =
        await import("./creation-hash");
      const conflictError = new ChangeCreationHashConflictError({
        changeId: "conflictRollback",
        existingHash:
          "1111111111111111111111111111111111111111111111111111111111111111",
        computedHash:
          "2222222222222222222222222222222222222222222222222222222222222222",
      });
      ensureChangeWorkflowStarted.mockRejectedValueOnce(conflictError);
      removeChangeDirMock.mockClear();

      const createdChange = {
        id: "conflictRollback",
        title: "Conflict rollback",
        status: "draft",
        created_at: "2026-07-22T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
      };
      const saveMock = vi.fn();
      const legacy = {
        paths: { changes: "/tmp/changes-crh", root: "/tmp/project" },
        changes: {
          create: vi.fn().mockResolvedValue({ changeId: "conflictRollback" }),
          get: vi
            .fn()
            .mockResolvedValue({ success: true, data: createdChange }),
          save: saveMock,
        },
      };
      const workflowClient = {
        workflow: { start: vi.fn(), getHandle: vi.fn() },
      };
      const ops = createChangeOps({
        input: {
          legacy,
          temporal: { client: workflowClient },
          projectId: "pid-conflict",
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

      await expect(
        ops.create("Conflict rollback", { capability: "different" }),
      ).rejects.toBeInstanceOf(ChangeCreationHashConflictError);

      // The disk scaffold was rolled back so the existing change isn't
      // masked by our conflicting write.
      expect(removeChangeDirMock).toHaveBeenCalledWith(
        "/tmp/changes-crh",
        "conflictRollback",
      );
      // And the disk projection save was NOT called (we threw before it).
      expect(saveMock).not.toHaveBeenCalled();
    });
  });

  test("save overlays source-side cross-project coordination metadata", async () => {
    const updateOverlayMock = vi.fn();
    const signalMock = vi.fn().mockResolvedValue(undefined);
    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        save: vi.fn().mockResolvedValue(undefined),
      },
    };
    const workflowClient = {
      workflow: {
        start: vi.fn(),
        getHandle: vi.fn(() => ({ signal: signalMock })),
      },
    };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-source",
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

    await ops.save({
      id: "sourceChange",
      title: "Source change",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      cross_project_links: [
        {
          target_path: "/repo/target",
          target_project_id: "pid-target",
          changeId: "targetFollowup",
          relationship: "follow_up",
          linked_at: "2026-06-06T20:00:00.000Z",
        },
      ],
      external_dependencies: [
        {
          target_path: "/repo/target",
          changeId: "targetFollowup",
          relationship: "requires",
        },
      ],
    } as never);

    expect(updateOverlayMock).toHaveBeenCalledWith(
      "sourceChange",
      expect.objectContaining({
        cross_project_links: [
          expect.objectContaining({ changeId: "targetFollowup" }),
        ],
        external_dependencies: [
          expect.objectContaining({ changeId: "targetFollowup" }),
        ],
      }),
    );
    expect(signalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cross_project_links: [
          expect.objectContaining({ changeId: "targetFollowup" }),
        ],
        external_dependencies: [
          expect.objectContaining({ changeId: "targetFollowup" }),
        ],
      }),
    );
  });

  test("refuses terminal archive state for accepted deltas without projection proof", async () => {
    const signalMock = vi.fn();
    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: { save: vi.fn() },
    };
    const workflowClient = {
      workflow: {
        start: vi.fn(),
        getHandle: vi.fn(() => ({ signal: signalMock })),
      },
    };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-proof",
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

    await expect(
      ops.save({
        id: "deltaArchive",
        title: "Delta archive",
        status: "archived",
        created_at: "2026-07-20T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        deltas: {
          example: [
            {
              id: "dl-example",
              operation: "add",
              requirement: {
                id: "rq-example01",
                title: "Example",
                body: "Example body",
                priority: "must",
              },
            },
          ],
        },
      } as never),
    ).rejects.toThrow("accepted deltas require archive_projection_proof");
    expect(signalMock).not.toHaveBeenCalled();
  });

  describe("listSummary (rq-changeSummaryReadModel01)", () => {
    function summaryShard(
      id: string,
      overrides: Partial<
        import("../change-summary-shard").ChangeSummaryShard
      > = {},
    ): import("../change-summary-shard").ChangeSummaryShard {
      return {
        schema_version: 1,
        id,
        title: `Change ${id}`,
        status: "draft",
        phase: "proposal",
        created_at: "2026-05-20T00:00:00.000Z",
        last_activity_at: "2026-05-20T00:00:00.000Z",
        task_count: 0,
        completed_tasks: 0,
        state_revision: 1,
        operation_id: "op-1",
        projection_revision: 1,
        capabilities: [],
        ...overrides,
      };
    }

    function buildOps(paths: {
      changes: string;
      summariesDir: string;
      root: string;
    }) {
      const workflowClient = { workflow: { getHandle: vi.fn() } };
      const getTemporalChange = vi.fn();
      return {
        ops: createChangeOps({
          input: {
            legacy: { paths, changes: { get: vi.fn() } },
            temporal: { client: workflowClient },
            projectId: "pid-summary",
          },
          legacy: { paths, changes: { get: vi.fn() } },
          invalidateChange: vi.fn(),
          updateOverlay: vi.fn(),
          emitChangeSummarySignal: vi.fn(),
          indexTasksFromState: vi.fn(),
          setCachedChange: vi.fn(),
          getTemporalChange,
          getTemporalWorkflowClient: () => workflowClient,
          dualWriteAfterMutation: vi.fn(),
          memo: new ChangeSummaryMemo(),
          changeCache: new Map(),
        } as never),
        getTemporalChange,
      };
    }

    test("serves rows from immutable summary shards without workflow hydration", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "ok",
        summaries: [
          summaryShard("changeA", {
            status: "draft",
            task_count: 4,
            completed_tasks: 2,
            phase: "execution",
            last_activity_at: "2026-05-26T00:00:00.000Z",
          }),
          summaryShard("changeB", {
            status: "draft",
            task_count: 0,
            completed_tasks: 0,
            last_activity_at: "2026-05-25T12:00:00.000Z",
          }),
        ],
      });
      const { ops, getTemporalChange } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

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
      expect(a.currentGate).toBe("execution");
      expect(a.status).toBe("draft");
    });

    test("includes archived/closed terminal rows when explicitly requested", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "ok",
        summaries: [
          summaryShard("activeA", { status: "draft" }),
          summaryShard("archivedB", { status: "archived" }),
          summaryShard("closedC", { status: "closed" }),
        ],
      });
      const { ops } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

      const result = await ops.listSummary!({ includeArchived: true });

      expect(result.changes.map((c) => c.id).sort()).toEqual([
        "activeA",
        "archivedB",
      ]);
      expect(result.changes.find((c) => c.id === "archivedB")?.status).toBe(
        "archived",
      );
    });

    test("filters by status, prefix, title, and timestamps", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "ok",
        summaries: [
          summaryShard("alpha-1", {
            title: "Alpha feature",
            created_at: "2026-05-10T00:00:00.000Z",
            last_activity_at: "2026-05-10T00:00:00.000Z",
          }),
          summaryShard("beta-2", {
            title: "Beta feature",
            created_at: "2026-05-15T00:00:00.000Z",
            last_activity_at: "2026-05-15T00:00:00.000Z",
          }),
          summaryShard("alpha-3", {
            title: "Alpha other",
            created_at: "2026-05-20T00:00:00.000Z",
            last_activity_at: "2026-05-21T00:00:00.000Z",
          }),
        ],
      });
      const { ops } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

      const byPrefix = await ops.listSummary!({ prefix: "alpha" });
      expect(byPrefix.changes.map((c) => c.id)).toEqual(["alpha-3", "alpha-1"]);

      const byTitle = await ops.listSummary!({ titleContains: "beta" });
      expect(byTitle.changes.map((c) => c.id)).toEqual(["beta-2"]);

      const byCreated = await ops.listSummary!({
        createdBefore: "2026-05-12T00:00:00.000Z",
      });
      expect(byCreated.changes.map((c) => c.id)).toEqual(["alpha-1"]);

      const byActivity = await ops.listSummary!({
        lastActivityBefore: "2026-05-20T00:00:00.000Z",
      });
      expect(byActivity.changes.map((c) => c.id).sort()).toEqual([
        "alpha-1",
        "beta-2",
      ]);
    });

    test("supports sort, offset, and pagination", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "ok",
        summaries: [
          summaryShard("old", {
            created_at: "2026-05-10T00:00:00.000Z",
            last_activity_at: "2026-05-11T00:00:00.000Z",
          }),
          summaryShard("new", {
            created_at: "2026-05-20T00:00:00.000Z",
            last_activity_at: "2026-05-21T00:00:00.000Z",
          }),
        ],
      });
      const { ops } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

      const stalest = await ops.listSummary!({ sort: "stalest", limit: 1 });
      expect(stalest.changes.map((c) => c.id)).toEqual(["old"]);

      const offset = await ops.listSummary!({ offset: 1, limit: 1 });
      expect(offset.changes.map((c) => c.id)).toEqual(["old"]);
    });

    test("default active/in-flight listSummary excludes terminal rows", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "ok",
        summaries: [
          summaryShard("activeA", { status: "draft" }),
          summaryShard("archivedB", { status: "archived" }),
          summaryShard("closedC", { status: "closed" }),
        ],
      });
      const { ops } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

      const result = await ops.listSummary!();

      expect(result.changes.map((c) => c.id)).toEqual(["activeA"]);
      expect(result.warnings).toBeUndefined();
    });

    test("surfaces degraded index state when summary shards cannot be read", async () => {
      listSummaryChanges.mockResolvedValue({
        kind: "error",
        error: "summaries directory unreadable",
      });
      const { ops } = buildOps({
        changes: "/tmp/changes",
        summariesDir: "/tmp/summaries",
        root: "/tmp/project",
      });

      const result = await ops.listSummary!();

      expect(result.changes).toEqual([]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "TERMINAL_SOURCE_DEGRADED",
            source: "active_disk",
          }),
        ]),
      );
    });
  });

  test("signals executiveSummary artifact metadata after artifact updates", async () => {
    const signalMock = vi.fn().mockResolvedValue(undefined);
    const legacy = {
      paths: {
        changes: "/tmp/changes",
        summariesDir: "/tmp/project/.adv/summaries",
        root: "/tmp/project",
      },
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
      workflow: {
        getHandle: vi.fn(() => ({
          signal: signalMock,
          query: vi.fn(async (queryDef, queryArg) => {
            if (queryDef.name === "adv.change.getOperationLedgerOutcome") {
              const envelope = signalMock.mock.calls
                .slice()
                .reverse()
                .find((call) => {
                  const payload = call[1] as
                    | Record<string, unknown>
                    | undefined;
                  return payload?.operation_id === queryArg;
                });
              const payload = (envelope?.[1] ?? {}) as Record<string, unknown>;
              return {
                operation_id: queryArg,
                command_kind: payload.command_kind ?? "executiveSummaryUpdated",
                payload_hash: payload.payload_hash ?? "hash",
                outcome: "accepted",
                state_revision: 1,
                accepted_at: "2026-07-19T20:00:00.000Z",
                last_seen_at: "2026-07-19T20:00:00.000Z",
              };
            }
            if (queryDef.name === "adv.change.getMutationReceipt") {
              return {
                id: queryArg,
                signalName: "executiveSummaryUpdated",
                recordedAt: "2026-07-19T20:00:00.000Z",
              };
            }
            return {
              changeId: "summaryChange",
              state_revision: 1,
            };
          }),
        })),
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
          source: "temporal",
          readable: false,
          contentHash: createHash("sha256")
            .update("# Executive Summary")
            .digest("hex"),
        }),
      }),
    );
    expect(signalMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          path: "/tmp/changes/summaryChange/executive-summary.md",
        }),
      }),
    );
  });

  /**
   * AC9 (completeStateBackedGate) — updateArtifacts MUST invalidate the
   * change cache after firing content signals, matching save/close/
   * refresh/bulk-close. Without this, a store.changes.get() immediately
   * following adv_change_update returns stale cached state.documents /
   * state.artifacts content — the confirmed root cause of the
   * stale-contract symptom (re-mint required after adv_change_update).
   *
   * RED before the fix: updateArtifacts (changes.ts) fires the content
   * signal fan-out but never calls invalidateChange(changeId) before
   * returning, so this assertion fails.
   */
  test("invalidates change cache after updateArtifacts (AC9)", async () => {
    const signalMock = vi.fn().mockResolvedValue(undefined);
    const invalidateChangeMock = vi.fn();
    const legacy = {
      paths: {
        changes: "/tmp/changes",
        summariesDir: "/tmp/project/.adv/summaries",
        root: "/tmp/project",
      },
      changes: {
        get: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "cacheChange", adv_project_id: "pid-cache" },
        }),
        updateArtifacts: vi.fn().mockResolvedValue({
          success: true,
          executiveSummaryPath: "/tmp/changes/cacheChange/executive-summary.md",
        }),
      },
    };
    const workflowClient = {
      workflow: {
        getHandle: vi.fn(() => ({
          signal: signalMock,
          query: vi.fn(async (queryDef, queryArg) => {
            if (queryDef.name === "adv.change.getOperationLedgerOutcome") {
              const envelope = signalMock.mock.calls
                .slice()
                .reverse()
                .find((call) => {
                  const payload = call[1] as
                    | Record<string, unknown>
                    | undefined;
                  return payload?.operation_id === queryArg;
                });
              const payload = (envelope?.[1] ?? {}) as Record<string, unknown>;
              return {
                operation_id: queryArg,
                command_kind: payload.command_kind ?? "executiveSummaryUpdated",
                payload_hash: payload.payload_hash ?? "hash",
                outcome: "accepted",
                state_revision: 1,
                accepted_at: "2026-07-19T20:00:00.000Z",
                last_seen_at: "2026-07-19T20:00:00.000Z",
              };
            }
            if (queryDef.name === "adv.change.getMutationReceipt") {
              return {
                id: queryArg,
                signalName: "executiveSummaryUpdated",
                recordedAt: "2026-07-19T20:00:00.000Z",
              };
            }
            return { changeId: "cacheChange", state_revision: 1 };
          }),
        })),
      },
    };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-cache",
      },
      legacy,
      invalidateChange: invalidateChangeMock,
      updateOverlay: vi.fn(),
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      getTemporalChange: vi.fn(),
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
    } as never);

    await ops.updateArtifacts("cacheChange", {
      executiveSummary: "# Executive Summary",
    });

    expect(invalidateChangeMock).toHaveBeenCalledWith("cacheChange");
  });

  /**
   * AC2 (remediateSlopScanFindings / QUAL-002) — the Layer-1 aggregate-size
   * precheck MUST count existing `state.documents`. `getTemporalChange`
   * returns a `LoadResult` (`{ success, data }`); the previous code read
   * `.documents` off the wrapper (always `undefined`), so the aggregate cap
   * only ever measured the proposed payload. This test seeds ~1.75 MB of
   * existing documents and adds a 200 KB field within the per-artifact cap;
   * the projected aggregate (~1.95 MB) exceeds the ~1.8 MB hard cap and
   * `updateArtifacts` MUST reject.
   *
   * RED before the unwrap fix: `existingDocuments` resolves to `{}`, so the
   * projected aggregate is only 200 KB and no error is thrown.
   */
  test("aggregate-size precheck counts existing documents (AC2)", async () => {
    const filler = "z".repeat(350 * 1024); // 5 × 350 KB ≈ 1.75 MB existing
    const signalMock = vi.fn().mockResolvedValue(undefined);
    const legacy = {
      paths: { changes: "/tmp/changes", root: "/tmp/project" },
      changes: {
        get: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "capChange", adv_project_id: "pid-cap" },
        }),
        updateArtifacts: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    const workflowClient = {
      workflow: { getHandle: vi.fn(() => ({ signal: signalMock })) },
    };
    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "pid-cap",
      },
      legacy,
      invalidateChange: vi.fn(),
      updateOverlay: vi.fn(),
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      // Real LoadResult shape: documents live on `.data`, not the wrapper.
      getTemporalChange: vi.fn().mockResolvedValue({
        success: true,
        data: {
          documents: {
            proposal: filler,
            problemStatement: filler,
            agreement: filler,
            design: filler,
            executiveSummary: filler,
          },
        },
      }),
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
    } as never);

    // 200 KB acceptance field is within the per-artifact cap (256 KB) but
    // pushes the projected aggregate over the ~1.8 MB hard cap.
    await expect(
      ops.updateArtifacts("capChange", { acceptance: "a".repeat(200 * 1024) }),
    ).rejects.toThrow(/exceeds hard cap/i);
  });
});
