/**
 * Release-gate structural enforcement for rq-releaseFinalization01.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { gateTools } from "./gate";
import type { Store } from "../storage/store";
import type { Change, Gates, OpsFollowupLink } from "../types";

const mocks = vi.hoisted(() => {
  const handleMock = { signal: vi.fn(), query: vi.fn() };
  return {
    handleMock,
    getService: vi.fn(() => ({ client: { workflow: { getHandle: vi.fn() } } })),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    detectArchiveMode: vi.fn(() => ({ archiveMode: "direct", autoPush: true })),
    resolveMainCheckout: vi.fn(() => "/tmp/main"),
    detectDefaultBranch: vi.fn(() => ({
      branch: "trunk",
      source: "local-trunk",
    })),
    verifyChangeBranchReachable: vi.fn(() => ({
      reachable: false,
      unmergedCommits: ["abc123 task commit"],
    })),
    verifyChangeBranchPushed: vi.fn(() => ({
      pushed: false,
      reason: "change/example not found on origin",
    })),
    verifyDefaultBranchPushed: vi.fn(() => ({
      pushed: false,
      reason: "origin/trunk behind local trunk",
    })),
    classifyFinalizationRoute: vi.fn(() => ({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    })),
    resolveReleaseReachability: vi.fn(() => ({
      reachable: false,
      proof: "origin_unmerged",
      details: ["abc123 task commit"],
    })),
  };
});

vi.mock("../temporal/service", () => ({ getService: mocks.getService }));
vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});
vi.mock("./_adapters", () => ({
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
  // Faithful poll loop over the mocked querySignal so release-gate enforcement
  // tests exercise the same query sequence the real shared helper would (STRUCT-003).
  waitForGateCompletion: async (
    handle: unknown,
    gateId: unknown,
  ): Promise<unknown> => {
    let latest: { status?: string } | undefined;
    for (let i = 0; i < 60; i++) {
      latest = await mocks.querySignal(handle, undefined, gateId);
      if (latest?.status === "done" || latest?.status === "stuck") {
        return latest;
      }
    }
    return latest;
  },
}));
vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    detectArchiveMode: mocks.detectArchiveMode,
    resolveMainCheckout: mocks.resolveMainCheckout,
    detectDefaultBranch: mocks.detectDefaultBranch,
    verifyChangeBranchReachable: mocks.verifyChangeBranchReachable,
    verifyChangeBranchPushed: mocks.verifyChangeBranchPushed,
    verifyDefaultBranchPushed: mocks.verifyDefaultBranchPushed,
    classifyFinalizationRoute: mocks.classifyFinalizationRoute,
    resolveReleaseReachability: mocks.resolveReleaseReachability,
  };
});

function releaseReadyGates(): Gates {
  return {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: { status: "pending" },
  } as Gates;
}

function createMockStore(overrides?: {
  archiveMode?: string;
  autoPush?: boolean;
  ops_followup_links?: OpsFollowupLink[];
}): Store {
  const gates = releaseReadyGates();
  const change: Change = {
    id: "example",
    title: "Example",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates,
    ops_followup_links: overrides?.ops_followup_links,
  };

  return {
    paths: {
      root: "/tmp/worktree/change/example",
      changes: "/tmp/worktree/.adv/changes",
    } as Store["paths"],
    config: {
      name: "test",
      archive_mode: overrides?.archiveMode ?? "direct",
      auto_push: overrides?.autoPush ?? true,
      features: { worktree_guard_enforce: false },
    } as unknown as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("release gate trunk-merge enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.querySignal.mockReset();
    mocks.querySignal.mockResolvedValueOnce(releaseReadyGates());
    mocks.querySignal.mockResolvedValueOnce({ status: "done" });
    mocks.classifyFinalizationRoute.mockReturnValue({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    });
    mocks.resolveReleaseReachability.mockReturnValue({
      reachable: false,
      proof: "origin_unmerged",
      details: ["abc123 task commit"],
    });
  });

  test("rejects release completion when the change branch is not reachable from default branch (direct mode)", async () => {
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_TRUNK_MERGE");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.remediation).toContain("/adv-archive example");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects release completion when direct-mode merge is local-only", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_push_unverified",
      details: ["origin/trunk behind local trunk"],
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_DEFAULT_BRANCH_PUSH");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects release completion when local merge is not reachable from origin/default", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });
    mocks.verifyDefaultBranchPushed.mockReturnValueOnce({ pushed: true });
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_unmerged",
      details: ["abc123 task commit"],
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_TRUNK_MERGE");
    expect(parsed.unmergedCommits).toContain("abc123 task commit");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("allows release completion when the change branch is reachable and pushed (direct mode)", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });
    mocks.verifyDefaultBranchPushed.mockReturnValueOnce({
      pushed: true,
    });
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "origin_default",
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("allows release completion when direct route ancestry fails but PR is squash-merged", async () => {
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "pr_merged",
      prNumber: 159,
      mergeCommitOid: "squash-merge-sha",
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("revalidates origin reachability before release gate recovery", async () => {
    mocks.resolveReleaseReachability
      .mockReturnValueOnce({ reachable: true, proof: "origin_default" })
      .mockReturnValueOnce({
        reachable: false,
        proof: "origin_unmerged",
        details: ["abc123 task commit"],
      });
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("workflow execution already completed"),
    );

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "example",
        gateId: "release",
        completedBy: "user:signoff",
        compatibilityReason: "legacy completed workflow",
        recoveryReason: "release gate recovery after completed workflow",
        recoveryEvidence: "workflow execution already completed",
      },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_TRUNK_MERGE");
    expect(parsed.unmergedCommits).toContain("abc123 task commit");
  });

  test("rejects release completion when change branch is not pushed (pr mode)", async () => {
    mocks.detectArchiveMode.mockReturnValueOnce({
      archiveMode: "pr",
      autoPush: true,
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore({ archiveMode: "pr" }),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_PR_HANDOFF");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.remediation).toContain("/adv-archive example");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("blocks release completion when ops follow-up blocks link is incomplete", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });
    mocks.verifyDefaultBranchPushed.mockReturnValueOnce({
      pushed: true,
    });
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "origin_default",
    });
    mocks.querySignal.mockReset();
    mocks.querySignal.mockResolvedValueOnce(releaseReadyGates());
    mocks.querySignal.mockResolvedValueOnce({
      status: "stuck",
      stuck_reason: "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      readiness_blockers: [
        {
          code: "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
          gateId: "release",
          message: "Blocking ops follow-up is incomplete",
          remediation: "Complete the blocking ops follow-up before releasing",
        },
      ],
    });

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "example",
        gateId: "release",
        completedBy: "user:signoff",
      },
      createMockStore({
        ops_followup_links: [
          {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "blocks",
            status: "not_started",
            required_handoff: false,
            linked_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("workflow readiness blocked");
    expect(parsed.readinessBlockers).toContainEqual(
      expect.objectContaining({
        code: "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
        gateId: "release",
      }),
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("blocks release completion when required_handoff follow-up is incomplete", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });
    mocks.verifyDefaultBranchPushed.mockReturnValueOnce({
      pushed: true,
    });
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "origin_default",
    });
    mocks.querySignal.mockReset();
    mocks.querySignal.mockResolvedValueOnce(releaseReadyGates());
    mocks.querySignal.mockResolvedValueOnce({
      status: "stuck",
      stuck_reason: "OPS_FOLLOWUP_HANDOFF_INCOMPLETE",
      readiness_blockers: [
        {
          code: "OPS_FOLLOWUP_HANDOFF_INCOMPLETE",
          gateId: "release",
          message: "Surviving-obligation handoff is incomplete",
          remediation: "Complete the required handoff before releasing",
        },
      ],
    });

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "example",
        gateId: "release",
        completedBy: "user:signoff",
      },
      createMockStore({
        ops_followup_links: [
          {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "follows_release",
            status: "not_started",
            required_handoff: true,
            linked_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("workflow readiness blocked");
    expect(parsed.readinessBlockers).toContainEqual(
      expect.objectContaining({
        code: "OPS_FOLLOWUP_HANDOFF_INCOMPLETE",
        gateId: "release",
      }),
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("allows release completion when change branch is pushed (pr mode)", async () => {
    mocks.detectArchiveMode.mockReturnValueOnce({
      archiveMode: "pr",
      autoPush: true,
    });
    mocks.verifyChangeBranchPushed.mockReturnValueOnce({
      pushed: true,
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore({ archiveMode: "pr" }),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });
});
