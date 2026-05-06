/**
 * Tests for session-lifecycle helpers in state.ts (T21).
 *
 * Verifies that registerSession / unregisterSession / updateSessionActivity
 * call the correct workflow updates with the correct payload shape and
 * silently fall back when the project workflow is unreachable.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Note: do NOT mock ./state here — the test needs the real implementation.
// Mocking it with importOriginal causes module-resolution ordering issues
// when sibling files (e.g. branch-integration.ts) also import from state.

// Capture executeUpdate calls.
const executeUpdate = vi.hoisted(() => vi.fn(async () => undefined));
const projectWorkflowQuery = vi.hoisted(() => vi.fn(async () => ({})));
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

const getBoundedProjectWorkflowAccess = vi.hoisted(() =>
  vi.fn(async () => ({
    mode: "workflow-backed" as const,
    handle: {
      query: projectWorkflowQuery,
      executeUpdate,
    },
  })),
);

vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess,
}));

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
  type WorktreeStateAccess,
} from "./state";
import { synthesizeTestProjectId } from "../../utils/project-id";
import {
  registerSessionUpdate,
  unregisterSessionUpdate,
  updateSessionActivityUpdate,
} from "../../temporal/messages";

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

  it("registerSession dispatches registerSessionUpdate with payload", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      worktreePath: "/work",
      pid: 1234,
      now: "2026-05-01T00:00:00Z",
      worktreeBranch: "trunk",
    };
    await registerSession(access, payload);

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(registerSessionUpdate, {
      args: [payload],
    });
  });

  it("unregisterSession dispatches unregisterSessionUpdate with sessionId only", async () => {
    await unregisterSession(access, "sess_AAAA1111");

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(unregisterSessionUpdate, {
      args: [{ sessionId: "sess_AAAA1111" }],
    });
  });

  it("updateSessionActivity dispatches updateSessionActivityUpdate with full payload", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      now: "2026-05-01T00:01:00Z",
      activeChangeId: "ch1",
      currentTaskId: "tk1",
      activeGate: "execution",
    };
    await updateSessionActivity(access, payload);

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(updateSessionActivityUpdate, {
      args: [payload],
    });
  });

  it("silently falls back when project workflow is not reachable", async () => {
    const helper = await import("../project-workflow-helper");
    vi.mocked(helper.getBoundedProjectWorkflowAccess).mockResolvedValueOnce({
      mode: "unavailable",
      projectId: "test-id",
      reason: "test fallback",
    });

    // Should NOT throw, should NOT call executeUpdate.
    await registerSession(access, {
      sessionId: "sess_X",
      worktreePath: "/p",
      pid: 1,
      now: "2026-05-01T00:00:00Z",
    });

    expect(executeUpdate).not.toHaveBeenCalled();
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
