/**
 * Tests for session-lifecycle helpers in state.ts (T21).
 *
 * ProjectWorkflow (PSW) was retired; session registry is now process-fact
 * based only. These helpers are no-ops and must not throw.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";

// Note: do NOT mock ./state here — the test needs the real implementation.
// Mocking it with importOriginal causes module-resolution ordering issues
// when sibling files (e.g. branch-integration.ts) also import from state.

const workflowList = vi.hoisted(() =>
  vi.fn(() =>
    (async function* () {
      // default: no workflows
    })(),
  ),
);
const changeWorkflowQuery = vi.hoisted(() => vi.fn(async () => ({})));
const changeWorkflowDescribe = vi.hoisted(() => vi.fn(async () => ({})));
const workflowGetHandle = vi.hoisted(() =>
  vi.fn(() => ({
    query: changeWorkflowQuery,
    describe: changeWorkflowDescribe,
  })),
);

vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() =>
    createMockOwnerFromClient({
      client: {
        workflow: {
          list: workflowList,
          getHandle: workflowGetHandle,
        },
      },
    }),
  ),
}));

import {
  addSession,
  inferChangeIdFromBranch,
  getWorktreePath,
  getSession,
  getSessionRecord,
  listSessions,
  registerSession,
  removeSession,
  unregisterSession,
  updateSessionActivity,
  buildWorktreeBranchVisibilityQuery,
  buildActiveWorktreeChangesVisibilityQuery,
  findBranchOwnersAcrossChanges,
  listWorktreesAcrossChanges,
  getWorktreeRegistrySnapshot,
  listWorktrees,
  getChangeSummaries,
  setPendingDelete,
  getPendingDeletes,
  incrementPendingDeleteAttempts,
  clearPendingDelete,
  type WorktreeStateAccess,
} from "./state";
import { synthesizeTestProjectId } from "../../utils/project-id";

const access: WorktreeStateAccess = {
  projectDir: "/test/project",
  projectId: "0e000d0000000000000000000000000000000000",
};

describe("session lifecycle helpers (T21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowList.mockImplementation(() =>
      (async function* () {
        // default: no workflows
      })(),
    );
    changeWorkflowQuery.mockResolvedValue({});
    changeWorkflowDescribe.mockResolvedValue({});
  });

  it("registerSession is a no-op after projectWorkflow retirement", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      worktreePath: "/work",
      pid: 1234,
      now: "2026-05-01T00:00:00Z",
      worktreeBranch: "trunk",
    };
    // Should not throw.
    await expect(registerSession(access, payload)).resolves.toBeUndefined();
  });

  it("unregisterSession is a no-op after projectWorkflow retirement", async () => {
    await expect(
      unregisterSession(access, "sess_AAAA1111"),
    ).resolves.toBeUndefined();
  });

  it("updateSessionActivity is a no-op after projectWorkflow retirement", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      now: "2026-05-01T00:01:00Z",
      activeChangeId: "ch1",
      currentTaskId: "tk1",
      activeGate: "execution",
    };
    await expect(
      updateSessionActivity(access, payload),
    ).resolves.toBeUndefined();
  });

  it("addSession is a no-op after projectWorkflow retirement", async () => {
    await expect(
      addSession(
        access,
        {
          sessionId: "sess_AAAA1111",
          branch: "change/feat",
          path: "/work/feat",
        },
        undefined,
        "feat",
      ),
    ).resolves.toBeUndefined();
  });

  it("removeSession is a no-op after projectWorkflow retirement", async () => {
    await expect(removeSession(access, "change/feat")).resolves.toBeUndefined();
  });

  it("getSession always returns null after projectWorkflow retirement", async () => {
    await expect(getSession(access, "sess_AAAA1111")).resolves.toBeNull();
  });

  it("getSessionRecord always returns null (stub compatibility surface)", async () => {
    await expect(getSessionRecord(access, "sess_AAAA1111")).resolves.toBeNull();
  });

  it("listSessions always returns an empty array (stub compatibility surface)", async () => {
    await expect(listSessions(access)).resolves.toEqual([]);
  });

  it("silently no-ops when project workflow is not reachable", async () => {
    // Should NOT throw.
    await expect(
      registerSession(access, {
        sessionId: "sess_X",
        worktreePath: "/p",
        pid: 1,
        now: "2026-05-01T00:00:00Z",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("cross-change worktree visibility helpers (T22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds branch-in-use query from AdvAffectedProjects, AdvWorktreeBranches, and open lifecycle", () => {
    expect(buildWorktreeBranchVisibilityQuery("proj", "change/feature")).toBe(
      'AdvAffectedProjects = "proj" AND AdvWorktreeBranches = "change/feature" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
    );
  });

  it("escapes quotes and backslashes in visibility query values", () => {
    expect(
      buildWorktreeBranchVisibilityQuery('proj\\"id', 'change/a"b\\c'),
    ).toBe(
      'AdvAffectedProjects = "proj\\\\\\"id" AND AdvWorktreeBranches = "change/a\\"b\\\\c" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
    );
  });

  it("lists active owner change ids for a worktree branch and excludes current change", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/current",
        };
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/other",
        };
        yield { workflowId: "adv/project/test-id" };
      })(),
    );

    await expect(
      findBranchOwnersAcrossChanges(access, "change/feature", "current"),
    ).resolves.toEqual(["other"]);
  });

  it("builds active worktree owner query from project, open lifecycle, running executions, and worktree branch presence", () => {
    expect(buildActiveWorktreeChangesVisibilityQuery("proj")).toBe(
      'AdvAffectedProjects = "proj" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running" AND AdvWorktreeBranches IS NOT NULL',
    );
  });

  it("uses the active worktree owner query so non-owner workflows are not queried", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/owner",
        };
      })(),
    );
    changeWorkflowQuery.mockResolvedValueOnce({
      changeId: "owner",
      status: "active",
      tasks: [],
      worktrees: {
        "change/owner": {
          branch: "change/owner",
          path: "/work/owner",
          baseRef: "main",
          headSha: "abc123",
          status: "created",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      },
    });

    await listWorktreesAcrossChanges(access);

    expect(workflowList).toHaveBeenCalledWith({
      query:
        'AdvAffectedProjects = "0e000d0000000000000000000000000000000000" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running" AND AdvWorktreeBranches IS NOT NULL',
    });
    expect(workflowGetHandle).toHaveBeenCalledTimes(1);
    expect(workflowGetHandle).toHaveBeenCalledWith(
      "adv/change/0e000d0000000000000000000000000000000000/owner",
      undefined,
    );
  });

  it("aggregates materialized worktrees from active change workflow search results", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/change-a",
        };
      })(),
    );
    changeWorkflowQuery.mockResolvedValueOnce({
      changeId: "change-a",
      status: "active",
      tasks: [],
      worktrees: {
        "change/change-a": {
          branch: "change/change-a",
          path: "/work/change-a",
          baseRef: "main",
          headSha: "abc123",
          status: "created",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
        "change/deleted": {
          branch: "change/deleted",
          path: "/work/deleted",
          status: "deleted",
        },
      },
    });

    await expect(listWorktreesAcrossChanges(access)).resolves.toMatchObject({
      records: [
        expect.objectContaining({
          branch: "change/change-a",
          path: "/work/change-a",
          changeId: "change-a",
          status: "active",
        }),
      ],
      warnings: [],
      poisonedWorkflows: [],
    });
  });

  it("exposes an authoritative registry snapshot and compatibility views", async () => {
    workflowList.mockImplementation(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/change-a",
        };
      })(),
    );
    changeWorkflowQuery.mockResolvedValue({
      changeId: "change-a",
      status: "active",
      tasks: [
        {
          id: "tk-a",
          title: "Task A",
          status: "done",
          touched_files: ["src/a.ts", "src/b.ts"],
        },
      ],
      worktrees: {
        "change/change-a": {
          branch: "change/change-a",
          path: "/work/change-a",
          baseRef: "main",
          headSha: "abc123",
          status: "created",
          createdAt: "2026-05-01T00:00:00.000Z",
          lastSeenAt: "2026-05-01T00:00:00.000Z",
          source: "tool",
          sourceVersion: 1,
        },
      },
    });

    await expect(getWorktreeRegistrySnapshot(access)).resolves.toMatchObject({
      records: [
        expect.objectContaining({
          changeId: "change-a",
          branch: "change/change-a",
          path: "/work/change-a",
        }),
      ],
      changeSummaries: {
        "change-a": {
          status: "active",
          touched_files: ["src/a.ts", "src/b.ts"],
        },
      },
      warnings: [],
    });

    await expect(listWorktrees(access)).resolves.toEqual([
      expect.objectContaining({
        changeId: "change-a",
        branch: "change/change-a",
        path: "/work/change-a",
      }),
    ]);
    await expect(getChangeSummaries(access)).resolves.toEqual({
      "change-a": {
        branch: "change/change-a",
        status: "active",
        touched_files: ["src/a.ts", "src/b.ts"],
      },
    });
  });

  it("isolates a poisoned workflow query and keeps healthy worktrees", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/healthy",
        };
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/poisoned",
        };
      })(),
    );
    changeWorkflowQuery
      .mockResolvedValueOnce({
        changeId: "healthy",
        status: "active",
        tasks: [],
        worktrees: {
          "change/healthy": {
            branch: "change/healthy",
            path: "/work/healthy",
            baseRef: "main",
            headSha: "abc123",
            status: "created",
            createdAt: "2026-05-01T00:00:00.000Z",
            lastSeenAt: "2026-05-01T00:00:00.000Z",
            source: "tool",
            sourceVersion: 1,
          },
        },
      })
      .mockRejectedValueOnce(
        new Error("Failed to query Workflow: TMPRL1100 Nondeterminism error"),
      );
    changeWorkflowDescribe.mockResolvedValueOnce({
      workflowExecutionInfo: {
        closeStatus: null,
        taskQueue: "advance-test-id",
      },
      lastFailure: {
        message:
          "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100] Nondeterminism error",
      },
    });

    const result = await listWorktreesAcrossChanges(access);

    expect(result.records).toEqual([
      expect.objectContaining({
        branch: "change/healthy",
        path: "/work/healthy",
        changeId: "healthy",
        status: "active",
      }),
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        source: "worktree_workflow",
        changeId: "poisoned",
        workflowId:
          "adv/change/0e000d0000000000000000000000000000000000/poisoned",
        recoveryReason: "poisoned_history",
        evidenceSummary: expect.stringContaining("TMPRL1100"),
      }),
    ]);
    expect(result.poisonedWorkflows).toEqual([
      expect.objectContaining({
        changeId: "poisoned",
        workflowId:
          "adv/change/0e000d0000000000000000000000000000000000/poisoned",
        recoveryReason: "poisoned_history",
        evidenceSummary: expect.stringContaining("TMPRL1100"),
      }),
    ]);
  });

  it("does not classify as poisoned when error class is generic even if describe matches (C2)", async () => {
    // C2 (fixPoisonedRecovery reviewer-block remediation): describe() must NOT
    // authorize poison classification alone. A generic query error must NOT
    // produce recoveryReason=poisoned_history even when describe() carries
    // poisoned markers — error class is the sole authority.
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield {
          workflowId:
            "adv/change/0e000d0000000000000000000000000000000000/generic-error",
        };
      })(),
    );
    changeWorkflowQuery.mockRejectedValueOnce(
      new Error("Failed to query Workflow"),
    );
    changeWorkflowDescribe.mockResolvedValueOnce({
      workflowExecutionInfo: {
        closeStatus: null,
        taskQueue: "advance-test-id",
      },
      lastFailure: {
        message:
          "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100] Nondeterminism error",
      },
    });

    const result = await listWorktreesAcrossChanges(access);

    expect(result.poisonedWorkflows).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        changeId: "generic-error",
        source: "worktree_workflow",
      }),
    ]);
    expect(result.warnings[0]?.recoveryReason).toBeUndefined();
  });

  it("keeps 250 healthy owners while surfacing one poisoned workflow", async () => {
    const healthyIds = Array.from(
      { length: 250 },
      (_, index) => `healthy-${index.toString().padStart(3, "0")}`,
    );
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        for (const id of [...healthyIds, "poisoned-scale"]) {
          yield {
            workflowId: `adv/change/0e000d0000000000000000000000000000000000/${id}`,
          };
        }
      })(),
    );
    workflowGetHandle.mockImplementation((workflowId: string) => {
      const changeId = workflowId.split("/").pop() ?? "unknown";
      if (changeId === "poisoned-scale") {
        return {
          query: vi.fn(async () => {
            throw new Error(
              "Failed to query Workflow: TMPRL1100 Nondeterminism error",
            );
          }),
          describe: vi.fn(async () => ({
            workflowExecutionInfo: {
              closeStatus: null,
              taskQueue: "advance-test-id",
            },
            lastFailure: {
              message:
                "WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100] Nondeterminism error",
            },
          })),
        };
      }
      return {
        query: vi.fn(async () => ({
          changeId,
          status: "active",
          tasks: [],
          worktrees: {
            [`change/${changeId}`]: {
              branch: `change/${changeId}`,
              path: `/work/${changeId}`,
              baseRef: "main",
              headSha: "abc123",
              status: "created",
              createdAt: "2026-05-01T00:00:00.000Z",
              source: "tool",
              sourceVersion: 1,
            },
          },
        })),
        describe: vi.fn(),
      };
    });

    const result = await listWorktreesAcrossChanges(access);

    expect(result.candidateCount).toBe(251);
    expect(result.records).toHaveLength(250);
    expect(result.poisonedWorkflows).toEqual([
      expect.objectContaining({
        changeId: "poisoned-scale",
        recoveryReason: "poisoned_history",
        evidenceSummary: expect.stringContaining("TMPRL1100"),
      }),
    ]);
    expect(
      result.records.some((row) => row.changeId === "poisoned-scale"),
    ).toBe(false);
  });
});

describe("pending delete lifecycle", () => {
  it("persists pending deletes under the external project state root", async () => {
    const originalXdg = process.env.XDG_DATA_HOME;
    const xdg = mkdtempSync(join(tmpdir(), "adv-pending-delete-"));
    process.env.XDG_DATA_HOME = xdg;

    try {
      const worktreePath = `${xdg}/opencode/worktree/test-id/change/pending-cleanup`;
      await setPendingDelete(
        access,
        "change/pending-cleanup",
        worktreePath,
        "worktree still in use",
        "2026-05-20T00:00:00.000Z",
      );

      await expect(getPendingDeletes(access)).resolves.toEqual([
        {
          branch: "change/pending-cleanup",
          path: worktreePath,
          reason: "worktree still in use",
          recordedAt: "2026-05-20T00:00:00.000Z",
          attempts: 0,
        },
      ]);

      await incrementPendingDeleteAttempts(access, "change/pending-cleanup");
      await expect(getPendingDeletes(access)).resolves.toEqual([
        expect.objectContaining({ attempts: 1 }),
      ]);

      await clearPendingDelete(access, "change/pending-cleanup");
      await expect(getPendingDeletes(access)).resolves.toEqual([]);
    } finally {
      if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = originalXdg;
      rmSync(xdg, { recursive: true, force: true });
    }
  });
});

describe("worktree path helpers", () => {
  it("infers change id from canonical change branch names", () => {
    expect(
      inferChangeIdFromBranch("change/fixAdvWorktreeRegistryCleanup"),
    ).toBe("fixAdvWorktreeRegistryCleanup");
    expect(inferChangeIdFromBranch("change/foo/bar")).toBe("foo/bar");
  });

  it("does not infer change id from empty or non-change branches", () => {
    expect(inferChangeIdFromBranch("change/")).toBeUndefined();
    expect(inferChangeIdFromBranch("feature/foo")).toBeUndefined();
    expect(inferChangeIdFromBranch("trunk")).toBeUndefined();
  });

  it("uses XDG_DATA_HOME via centralized project-id helper", async () => {
    const originalXdg = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = "/custom/data";
    try {
      await expect(getWorktreePath(process.cwd(), "change/test")).resolves.toBe(
        `/custom/data/opencode/worktree/${synthesizeTestProjectId(process.cwd())}/change/test`,
      );
    } finally {
      if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = originalXdg;
    }
  });
});
