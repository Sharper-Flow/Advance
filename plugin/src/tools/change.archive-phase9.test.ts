/**
 * adv_change_archive Phase 9 integration contract tests.
 *
 * Behavior-level tests verifying finalization ordering, blocked-finalization
 * handling, and PR mode outcomes.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Store } from "../storage/store";
import type { Change, Gates } from "../types";

const mocks = vi.hoisted(() => {
  const workflow = {
    gates: {} as Gates,
    signalPayloads: [] as Array<Record<string, unknown>>,
    handle: {
      signal: vi.fn(
        async (_signal: unknown, payload: Record<string, unknown>) => {
          workflow.signalPayloads.push(payload);
          const gateId = payload.gateId as keyof Gates | undefined;
          if (gateId) {
            workflow.gates = {
              ...workflow.gates,
              [gateId]: {
                ...(workflow.gates[gateId] ?? {}),
                status: "done",
                completed_at: payload.completedAt as string,
                completed_by: payload.completedBy as string,
                approval_evidence: payload.approvalEvidence as string,
              },
            } as Gates;
          }
        },
      ),
      query: vi.fn(async (_query: unknown, gateId?: keyof Gates) =>
        gateId ? workflow.gates[gateId] : workflow.gates,
      ),
    },
  };

  return {
    workflow,
    archiveChange: vi.fn(() =>
      Promise.resolve({
        success: true,
        changeId: "example",
        specsUpdated: [],
        docsGenerated: [],
        archivePath: "/tmp/archive/example",
        errors: [],
      }),
    ),
    finalizeRelease: vi.fn(() =>
      Promise.resolve({
        status: "shipped",
        mainCheckout: "/tmp/main",
        defaultBranch: "trunk",
        mergeCommitSha: "abc123",
        pushStatus: "pushed",
      }),
    ),
    detectArchiveMode: vi.fn(() => ({ archiveMode: "direct", autoPush: true })),
    detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
    validateChangeWorktree: vi.fn(() => ({
      valid: true,
      mainCheckout: "/tmp/main",
      currentBranch: "change/example",
    })),
    verifyChangeBranchReachable: vi.fn(() => ({
      reachable: true,
      unmergedCommits: [],
    })),
    verifyDefaultBranchPushed: vi.fn(() => ({ pushed: true })),
    verifyChangeBranchPushed: vi.fn(() => ({ pushed: true })),
    closeLinkedIssue: vi.fn(() =>
      Promise.resolve({ issue_closed: [], close_eligible: false }),
    ),
    validateChange: vi.fn(() => Promise.resolve({ errors: [], warnings: [] })),
    getArchiveContractProofErrors: vi.fn(() => []),
    loadSpecsMap: vi.fn(() => Promise.resolve(new Map())),
    findArchiveBundle: vi.fn(() => Promise.resolve(null)),
    getProjectId: vi.fn(() => Promise.resolve("test-project")),
    getService: vi.fn(() => ({
      client: {
        workflow: {
          getHandle: vi.fn(() => workflow.handle),
        },
      },
    })),
    saveRecoveredGateCompletion: vi.fn(
      async (input: {
        change: Change;
        gateId: keyof Gates;
        completion: Gates[keyof Gates];
      }) => {
        const gates = {
          ...(input.change.gates ?? {}),
          [input.gateId]: input.completion,
        } as Gates;
        mocks.workflow.gates = gates;
        return {
          ...input.change,
          gates,
        };
      },
    ),
  };
});

vi.mock("../archive", () => ({
  archiveChange: mocks.archiveChange,
  findArchiveBundle: mocks.findArchiveBundle,
  getArchiveContractProofErrors: mocks.getArchiveContractProofErrors,
  reconcileInRepoArchive: vi.fn(),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    finalizeRelease: mocks.finalizeRelease,
    detectArchiveMode: mocks.detectArchiveMode,
    detectDefaultBranch: mocks.detectDefaultBranch,
    validateChangeWorktree: mocks.validateChangeWorktree,
    verifyChangeBranchReachable: mocks.verifyChangeBranchReachable,
    verifyDefaultBranchPushed: mocks.verifyDefaultBranchPushed,
    verifyChangeBranchPushed: mocks.verifyChangeBranchPushed,
  };
});

vi.mock("../validator", () => ({
  validateChange: mocks.validateChange,
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

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("./_recovery-writers", () => ({
  saveRecoveredGateCompletion: mocks.saveRecoveredGateCompletion,
}));

function createMockStore(
  options: {
    releaseDone?: boolean;
    status?: Change["status"];
    durableReleasePending?: boolean;
  } = {},
): Store {
  const gates: Gates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: { status: options.releaseDone ? "done" : "pending" },
  };
  const change: Change = {
    id: "example",
    title: "Example",
    status: options.status ?? "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [
      {
        id: "tk-1",
        title: "Task 1",
        status: "done",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates,
  };

  mocks.workflow.gates = gates;

  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/.adv/changes",
      archive: "/tmp/.adv/archive",
    } as Store["paths"],
    config: {
      name: "test",
      features: {},
    } as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(() => Promise.resolve({ specs: [] })),
      get: vi.fn(() => Promise.resolve({ success: false, error: "not found" })),
    } as unknown as Store["specs"],
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
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
    gates: {
      get: vi.fn(async () => ({
        ...mocks.workflow.gates,
        ...(options.durableReleasePending
          ? { release: { status: "pending" } }
          : {}),
      })),
    } as unknown as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_change_archive Phase 9 behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workflow.gates = {} as Gates;
    mocks.workflow.signalPayloads = [];
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) =>
        gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates,
    );
    mocks.workflow.handle.signal.mockImplementation(
      async (_signal: unknown, payload: Record<string, unknown>) => {
        mocks.workflow.signalPayloads.push(payload);
        const gateId = payload.gateId as keyof Gates | undefined;
        if (gateId) {
          mocks.workflow.gates = {
            ...mocks.workflow.gates,
            [gateId]: {
              ...(mocks.workflow.gates[gateId] ?? {}),
              status: "done",
              completed_at: payload.completedAt as string,
              completed_by: payload.completedBy as string,
              approval_evidence: payload.approvalEvidence as string,
            },
          } as Gates;
        }
      },
    );
  });

  test("completes release gate after finalization and before retiring the change", async () => {
    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      mergeCommitSha: "abc123",
      pushStatus: "pushed",
    });
    expect(mocks.validateChangeWorktree).toHaveBeenCalledWith(
      "/tmp/worktree",
      "example",
      { requireCleanWorktree: true },
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        workdir: "/tmp/worktree",
        expectedMainCheckout: "/tmp/main",
      }),
    );
    expect(mocks.workflow.handle.signal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gateId: "release",
        completedBy: "adv-archive",
      }),
    );
    expect(mocks.workflow.signalPayloads[0]?.approvalEvidence).toContain(
      "Phase 9 finalization shipped",
    );
    expect(mocks.workflow.handle.signal).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    expect(parsed.continueFrom).toEqual({ path: "/tmp/main", branch: "trunk" });
  });

  test("blocks archive success when store-backed release proof remains pending", async () => {
    const store = createMockStore({ durableReleasePending: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseProjectionDurability01");
    expect(parsed.error).toContain("durable release gate proof");
    expect(parsed.releaseGateStatus).toBe("pending");
    expect(store.gates.get).toHaveBeenCalledWith("example");
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  test("skips finalization when phase9=skip", async () => {
    const store = createMockStore({ releaseDone: true });
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", phase9: "skip" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toBeUndefined();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
  });

  test("does not archive when finalization is blocked", async () => {
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "blocked",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      pushStatus: "not_attempted",
      blocked: {
        reason: "DIRTY_MAIN_CHECKOUT",
        remediation: "Clean the main checkout",
      },
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  test("reconciles release gate from existing bundle without worktree", async () => {
    mocks.findArchiveBundle.mockResolvedValueOnce("/tmp/archive/example");
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(mocks.validateChangeWorktree).not.toHaveBeenCalled();
    expect(mocks.verifyChangeBranchReachable).toHaveBeenCalledWith(
      "/tmp/main",
      "trunk",
      "example",
    );
    expect(mocks.verifyDefaultBranchPushed).toHaveBeenCalledWith(
      "/tmp/main",
      "trunk",
    );
    expect(mocks.workflow.handle.signal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gateId: "release",
        completedBy: "adv-archive",
      }),
    );
    expect(store.changes.save).toHaveBeenCalled();
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      pushStatus: "pushed",
    });
  });

  test("blocks no-worktree reconciliation when Phase 9 evidence is missing", async () => {
    mocks.findArchiveBundle.mockResolvedValueOnce("/tmp/archive/example");
    mocks.verifyDefaultBranchPushed.mockReturnValueOnce({
      pushed: false,
      reason: "origin/trunk is behind",
    });
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    expect(parsed.details).toContain("origin/trunk is behind");
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("repairs release projection when workflow already completed", async () => {
    mocks.findArchiveBundle.mockResolvedValueOnce("/tmp/archive/example");
    mocks.workflow.handle.query.mockRejectedValue(
      Object.assign(new Error("workflow execution already completed"), {
        name: "WorkflowNotFoundError",
      }),
    );
    const store = createMockStore({ status: "archived" });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    expect(mocks.saveRecoveredGateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
        completion: expect.objectContaining({
          status: "done",
          completed_by: "adv-archive",
        }),
      }),
    );
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("recovers release projection when workflow completes during confirmation poll", async () => {
    mocks.findArchiveBundle.mockResolvedValueOnce("/tmp/archive/example");
    let releaseGateQueries = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          releaseGateQueries++;
          if (releaseGateQueries > 1) {
            throw Object.assign(
              new Error("workflow execution already completed"),
              {
                name: "WorkflowNotFoundError",
              },
            );
          }
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );
    const store = createMockStore({ status: "archived" });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    expect(mocks.saveRecoveredGateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
      }),
    );
  });

  test("includes continueFrom when release gate confirmation is blocked", async () => {
    let releaseGateQueries = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          releaseGateQueries++;
          if (releaseGateQueries > 1) {
            return {
              status: "stuck",
              stuck_reason: "contract proof missing",
              readiness_blockers: ["matrix missing"],
            };
          }
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive release gate completion blocked");
    expect(parsed.continueFrom).toEqual({ path: "/tmp/main", branch: "trunk" });
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("rejects invalid worktree before archive writes", async () => {
    mocks.validateChangeWorktree.mockReturnValueOnce({
      valid: false,
      mainCheckout: "/tmp/main",
      error: "wrong branch",
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("returns pr_pushed outcome in PR mode", async () => {
    mocks.detectArchiveMode.mockReturnValueOnce({
      archiveMode: "pr",
      autoPush: true,
    });
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "pr_pushed",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      prBranch: "change/example",
      pushStatus: "pushed",
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toMatchObject({
      status: "pr_pushed",
      prBranch: "change/example",
    });
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  // rq-releaseFinalization01 AC1: release gate completion must happen BEFORE
  // archive status transition. This test verifies the structural ordering
  // guarantee: signal fires before save, even when the release gate poll
  // requires multiple attempts (simulating Temporal processing latency).
  test("completes release gate before archive status even with delayed gate confirmation", async () => {
    let queryCount = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          queryCount++;
          // Simulate Temporal processing delay: first query returns pending,
          // second query returns done (signal was processed).
          if (queryCount === 1) {
            return { status: "pending" };
          }
          return mocks.workflow.gates.release;
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    // Release gate signal must fire before archive status save
    expect(mocks.workflow.handle.signal).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    // Finalization must also fire before archive status save
    expect(mocks.finalizeRelease).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
  });

  // rq-releaseProjectionDurability01 AC2: release completion is recorded only
  // after structural Phase 9 evidence exists. When the durable proof check
  // fails (store-backed gate still shows pending), archive must NOT proceed
  // to status transition.
  test("blocks archive status transition when durable release proof fails after signal", async () => {
    // Signal succeeds, but the store-backed gate read returns pending
    // (simulating a race where the projection hasn't landed yet).
    const store = createMockStore({ durableReleasePending: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseProjectionDurability01");
    expect(parsed.error).toContain("durable release gate proof");
    // Archive status must NOT be saved when proof fails
    expect(store.changes.save).not.toHaveBeenCalled();
  });
});
