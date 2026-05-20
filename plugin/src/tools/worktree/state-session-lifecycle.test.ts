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
const workflowGetHandle = vi.hoisted(() =>
  vi.fn(() => ({ query: changeWorkflowQuery })),
);

vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() => ({
    client: {
      workflow: {
        list: workflowList,
        getHandle: workflowGetHandle,
      },
    },
  })),
}));

import {
  inferChangeIdFromBranch,
  getWorktreePath,
  registerSession,
  unregisterSession,
  updateSessionActivity,
  buildWorktreeBranchVisibilityQuery,
  findBranchOwnersAcrossChanges,
  listWorktreesAcrossChanges,
  setPendingDelete,
  getPendingDeletes,
  incrementPendingDeleteAttempts,
  clearPendingDelete,
  type WorktreeStateAccess,
} from "./state";
import { synthesizeTestProjectId } from "../../utils/project-id";

const access: WorktreeStateAccess = {
  projectDir: "/test/project",
  projectId: "test-id",
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

  it("builds branch-in-use query from AdvAffectedProjects, AdvWorktreeBranches, and active status", () => {
    expect(buildWorktreeBranchVisibilityQuery("proj", "change/feature")).toBe(
      'AdvAffectedProjects = "proj" AND AdvWorktreeBranches = "change/feature" AND AdvChangeStatus = "active"',
    );
  });

  it("lists active owner change ids for a worktree branch and excludes current change", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield { workflowId: "adv/change/test-id/current" };
        yield { workflowId: "adv/change/test-id/other" };
        yield { workflowId: "adv/project/test-id" };
      })(),
    );

    await expect(
      findBranchOwnersAcrossChanges(access, "change/feature", "current"),
    ).resolves.toEqual(["other"]);
  });

  it("aggregates materialized worktrees from active change workflow search results", async () => {
    workflowList.mockImplementationOnce(() =>
      (async function* () {
        yield { workflowId: "adv/change/test-id/change-a" };
      })(),
    );
    changeWorkflowQuery.mockResolvedValueOnce({
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
    });

    await expect(listWorktreesAcrossChanges(access)).resolves.toEqual([
      expect.objectContaining({
        branch: "change/change-a",
        path: "/work/change-a",
        changeId: "change-a",
        status: "active",
      }),
    ]);
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
