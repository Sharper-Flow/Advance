/**
 * Smoke tests for ADV worktree tool wrappers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const worktreeMock = vi.hoisted(() => ({
  advWorktreeCreate: vi.fn(),
  advWorktreeResume: vi.fn(),
  advWorktreeDelete: vi.fn(),
  advWorktreeCleanup: vi.fn(),
  advWorktreeDetachBatch: vi.fn(),
  loadWorktreeConfig: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  initStateDb: vi.fn(),
  getPendingDeletes: vi.fn(),
}));

const triageMock = vi.hoisted(() => ({
  triageWorktrees: vi.fn(),
}));

const workspaceWarpMock = vi.hoisted(() => ({
  createAdvWorkspace: vi.fn(),
  deleteAdvWorkspace: vi.fn(),
  getSessionWorkspaceID: vi.fn(),
  warpFlagEnabled: vi.fn(),
  warpSession: vi.fn(),
  workspaceAndWarpAvailable: vi.fn(),
}));

const targetProjectMock = vi.hoisted(() => ({
  appendTargetProjectContextOutput: vi.fn(
    (output: string, context: unknown) => {
      const parsed = JSON.parse(output);
      parsed._projectContext = context;
      return JSON.stringify(parsed);
    },
  ),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./worktree", () => worktreeMock);
vi.mock("./worktree/state", () => stateMock);
vi.mock("./worktree/triage", () => triageMock);
vi.mock("../utils/workspace-warp", () => workspaceWarpMock);
vi.mock("./target-project", () => targetProjectMock);

import {
  advWorktreeTools,
  discoveryGitBudgetForToolBudget,
  WORKTREE_TOOL_SAFE_TIMEOUT_MS,
} from "./adv-worktree";
import type { Store } from "../storage/store-types";
import type { OpencodeClient } from "../utils/opencode-types";

const store = {
  paths: { root: "/repo" },
} as Store;

const targetStore = {
  paths: { root: "/target" },
} as Store;

const mockClient = { session: { get: vi.fn() } } as unknown as OpencodeClient;

describe("advWorktreeTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateMock.getPendingDeletes.mockResolvedValue([]);
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input, fn) =>
        fn({
          context: {
            root: "/target",
            projectId: "0a00e00000ec0000000000000000000000000000",
            externalRoot: "/external/target-project",
            trusted: false,
            trustSource: "explicit",
            stateMode: "authoritative",
          },
          store: targetStore,
        }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adv_worktree_create delegates to advWorktreeCreate", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({ ok: true, path: "/wt" });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk", force: true },
      store,
    );

    expect(worktreeMock.advWorktreeCreate).toHaveBeenCalledWith(
      "change/x",
      { base: "trunk", force: true },
      expect.objectContaining({
        projectRoot: "/repo",
        database,
      }),
    );
    expect(out).toContain('"ok":true');
  });

  it("adv_worktree_create warps the current OpenCode session when runtime context is available", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: null,
    });
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockResolvedValue(undefined);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.getSessionWorkspaceID).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: new URL("http://127.0.0.1:4096"),
        directory: "/repo",
        client: mockClient,
      }),
      "ses-1",
    );
    expect(workspaceWarpMock.createAdvWorkspace).toHaveBeenCalledWith(
      expect.any(Object),
      { directory: "/wt", branch: "change/x" },
    );
    expect(workspaceWarpMock.warpSession).toHaveBeenCalledWith(
      expect.any(Object),
      { workspaceID: "ws-123", sessionID: "ses-1" },
    );
    expect(out).toContain('"mode":"warp"');
    expect(out).toContain('"workspaceID":"ws-123"');
  });

  it("adv_worktree_create emits downgrade_reason: missing_server when runtime.serverUrl is absent", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x" },
      store,
      { sessionID: "ses-1", client: mockClient },
    );

    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"downgrade_reason"');
    expect(out).toContain('"kind":"missing_server"');
  });

  it("adv_worktree_create emits downgrade_reason: missing_session when sessionID is unavailable", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        client: mockClient,
      },
    );

    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"kind":"missing_session"');
    expect(out).toContain("sessionID");
  });

  it("adv_worktree_create emits downgrade_reason: missing_client when client is absent", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        // No client.
      },
    );

    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"kind":"missing_client"');
  });

  it("adv_worktree_create downgrades to terminal mode before endpoint probing when the workspace flag is off", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(false);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.workspaceAndWarpAvailable).not.toHaveBeenCalled();
    expect(workspaceWarpMock.createAdvWorkspace).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"workdir":"/wt"');
    expect(out).toContain('"kind":"flag_disabled"');
  });

  it("adv_worktree_create blocks already-warped sessions before endpoint probing", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: "ws-current",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.workspaceAndWarpAvailable).not.toHaveBeenCalled();
    expect(worktreeMock.advWorktreeCreate).not.toHaveBeenCalled();
    expect(out).toContain('"error":"SESSION_ALREADY_WARPED"');
    expect(out).toContain('"workspaceID":"ws-current"');
    // SESSION_ALREADY_WARPED is a block, not a downgrade — no downgrade_reason.
    expect(out).not.toContain('"downgrade_reason"');
  });

  it("adv_worktree_create emits downgrade_reason: lookup_failed when session lookup tuple is { ok: false }", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: false,
      status: 404,
      detail: "session not found",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.createAdvWorkspace).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"kind":"lookup_failed"');
    expect(out).toContain('"status":404');
    expect(out).toContain("session not found");
  });

  it("adv_worktree_create emits downgrade_reason: lookup_failed (no status) on network error tuple", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: false,
      detail: "ECONNREFUSED 127.0.0.1:4096",
    });

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"kind":"lookup_failed"');
    expect(out).toContain("ECONNREFUSED");
    expect(out).not.toContain('"status"');
  });

  it("adv_worktree_create emits downgrade_reason: endpoint_unreachable when workspace endpoint is unavailable", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: null,
    });
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(false);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.getSessionWorkspaceID).toHaveBeenCalledWith(
      expect.any(Object),
      "ses-1",
    );
    expect(workspaceWarpMock.createAdvWorkspace).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"kind":"endpoint_unreachable"');
    expect(out).toContain("/experimental/workspace");
  });

  it("adv_worktree_create emits downgrade_reason: warp_failed after post-create warp failure", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: null,
    });
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockRejectedValue(new Error("warp boom"));
    workspaceWarpMock.deleteAdvWorkspace.mockResolvedValue(undefined);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(workspaceWarpMock.deleteAdvWorkspace).toHaveBeenCalledWith(
      expect.any(Object),
      "ws-123",
    );
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"workdir":"/wt"');
    expect(out).toContain('"kind":"warp_failed"');
    expect(out).toContain("warp boom");
  });

  it("adv_worktree_create reports cleanupFailed=true when orphan workspace cleanup also fails", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: null,
    });
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockRejectedValue(new Error("warp boom"));
    workspaceWarpMock.deleteAdvWorkspace.mockRejectedValue(
      new Error("delete boom"),
    );

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(out).toContain('"kind":"warp_failed"');
    expect(out).toContain('"cleanupFailed":true');
    expect(out).toContain("warp boom");
  });

  it("adv_worktree_create preserves legacy warning string alongside downgrade_reason", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(false);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    expect(out).toContain('"warning"');
    expect(out).toContain('"downgrade_reason"');
  });

  it("adv_worktree_create constructs WarpDeps with directory and client", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue({
      ok: true,
      workspaceID: null,
    });
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockResolvedValue(undefined);

    await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x" },
      store,
      {
        serverUrl: new URL("http://127.0.0.1:4096"),
        sessionID: "ses-1",
        client: mockClient,
      },
    );

    // Every workspace-warp call should receive the same WarpDeps with the
    // project root as `directory` and the SDK client.
    const expectedDeps = expect.objectContaining({
      serverUrl: new URL("http://127.0.0.1:4096"),
      directory: "/repo",
      client: mockClient,
    });
    expect(workspaceWarpMock.workspaceAndWarpAvailable).toHaveBeenCalledWith(
      expectedDeps,
    );
    expect(workspaceWarpMock.createAdvWorkspace).toHaveBeenCalledWith(
      expectedDeps,
      expect.any(Object),
    );
    expect(workspaceWarpMock.warpSession).toHaveBeenCalledWith(
      expectedDeps,
      expect.any(Object),
    );
  });

  it("adv_worktree_delete delegates to advWorktreeDelete", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
    });

    const out = await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", force: false },
      store,
    );

    expect(worktreeMock.advWorktreeDelete).toHaveBeenCalledWith(
      "change/x",
      { force: false },
      expect.objectContaining({
        projectRoot: "/repo",
        database,
        operationTimeoutMs: expect.any(Number),
      }),
    );
    const [, , deps] = worktreeMock.advWorktreeDelete.mock.calls.at(-1)!;
    expect(deps.operationTimeoutMs).toBeLessThan(WORKTREE_TOOL_SAFE_TIMEOUT_MS);
    expect(out).toContain('"ok":true');
  });

  // AC6 / C6 regression guard: the cleanup-derived git budget must NOT leak
  // into the standalone delete path, which shares the same git helpers and
  // must keep their 30000ms default.
  it("adv_worktree_delete does not receive the cleanup discovery git budget", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
    });

    await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", force: false },
      store,
    );

    const [, , deps] = worktreeMock.advWorktreeDelete.mock.calls.at(-1)!;
    expect(deps.gitTimeoutMs).toBeUndefined();
  });

  it("adv_worktree_cleanup forwards a discovery git budget below the safe tool budget", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 0,
      retained: 0,
    });

    await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "bounded discovery" },
      store,
    );

    const [, deps] = worktreeMock.advWorktreeCleanup.mock.calls.at(-1)!;
    expect(deps.gitTimeoutMs).toBeGreaterThan(0);
    expect(deps.gitTimeoutMs).toBeLessThan(WORKTREE_TOOL_SAFE_TIMEOUT_MS);
  });

  it("adv_worktree_delete passes dryRun to advWorktreeDelete", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
      dryRun: true,
    });

    const out = await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", force: false, dryRun: true },
      store,
    );

    expect(worktreeMock.advWorktreeDelete).toHaveBeenCalledWith(
      "change/x",
      { force: false, dryRun: true },
      expect.objectContaining({ projectRoot: "/repo", database }),
    );
    expect(out).toContain('"dryRun":true');
  });

  it("adv_worktree_delete routes target_path mutations through target store", async () => {
    const database = {
      projectDir: "/target",
      projectId: "0a00e00000ec0000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
    });

    await advWorktreeTools.adv_worktree_delete.execute(
      {
        branch: "change/x",
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
        planToken: "target-plan-token",
        approvalEvidence: "User approved exact target deletion plan",
      },
      store,
    );

    expect(targetProjectMock.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/repo",
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
        stateRequirement: "snapshot-ok",
        mutation: true,
      }),
      expect.any(Function),
    );
    expect(stateMock.initStateDb).toHaveBeenCalledWith("/target");
    expect(worktreeMock.advWorktreeDelete).toHaveBeenCalledWith(
      "change/x",
      expect.objectContaining({
        planToken: "target-plan-token",
        approvalEvidence: "User approved exact target deletion plan",
      }),
      expect.objectContaining({
        projectRoot: "/target",
        database,
        store: targetStore,
      }),
    );
  });

  it("adv_worktree_delete routes dry-run target reads through snapshot access without mutation trust", async () => {
    const database = {
      projectDir: "/target",
      projectId: "0a00e00000ec0000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
      dryRun: true,
    });

    await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", dryRun: true, target_path: "/target" },
      store,
    );

    expect(targetProjectMock.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        stateRequirement: "snapshot-ok",
        mutation: false,
      }),
      expect.any(Function),
    );
  });

  it("adv_worktree_delete passes only the remaining target-routing budget to planning", async () => {
    const database = {
      projectDir: "/target",
      projectId: "0a00e00000ec0000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockResolvedValue({
      ok: true,
      branch: "change/x",
    });
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input, fn) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return fn({
          context: {
            root: "/target",
            projectId: "0a00e00000ec0000000000000000000000000000",
            externalRoot: "/external/target-project",
            trusted: true,
            trustSource: "explicit",
            stateMode: "disk-snapshot",
          },
          store: targetStore,
        });
      },
    );

    await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", target_path: "/target", dryRun: true },
      store,
    );

    const [, , deps] = worktreeMock.advWorktreeDelete.mock.calls.at(-1)!;
    expect(deps.operationTimeoutMs).toBeLessThan(
      WORKTREE_TOOL_SAFE_TIMEOUT_MS - 500,
    );
    expect(deps.operationTimeoutMs).toBeGreaterThan(1);
  });

  it("adv_worktree_delete returns a typed target-resolution timeout and blocks a late callback", async () => {
    vi.useFakeTimers();
    let releaseTarget!: () => void;
    let lateRoute!: Promise<unknown>;
    const targetPending = new Promise<void>((resolve) => {
      releaseTarget = resolve;
    });
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input, fn) => {
        await targetPending;
        lateRoute = fn({
          context: {
            root: "/target",
            projectId: "0a00e00000ec0000000000000000000000000000",
            externalRoot: "/external/target-project",
            trusted: true,
            trustSource: "explicit",
            stateMode: "disk-snapshot",
          },
          store: targetStore,
        });
        return lateRoute;
      },
    );

    const resultPromise = advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", target_path: "/target", dryRun: true },
      store,
    );
    await vi.advanceTimersByTimeAsync(WORKTREE_TOOL_SAFE_TIMEOUT_MS - 500 + 1);

    const parsed = JSON.parse(await resultPromise);
    expect(parsed).toMatchObject({
      timedOut: true,
      status: "deadline_exceeded",
      stage: "target_resolution",
    });

    releaseTarget();
    await vi.runAllTicks();
    await lateRoute;
    expect(worktreeMock.advWorktreeDelete).not.toHaveBeenCalled();
  });

  it("adv_worktree_delete rejects unconfirmed target mutation before deleting", async () => {
    targetProjectMock.withTargetPathStore.mockRejectedValue(
      new Error("target confirmation required"),
    );

    await expect(
      advWorktreeTools.adv_worktree_delete.execute(
        { branch: "change/x", target_path: "/target" },
        store,
      ),
    ).rejects.toThrow("target confirmation required");

    expect(worktreeMock.advWorktreeDelete).not.toHaveBeenCalled();
  });

  it("adv_worktree_cleanup formats removed and retained branches", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: ["change/done"],
      retained: ["change/live"],
    });

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "retry cleanup" },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), client: mockClient },
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "retry cleanup",
      expect.objectContaining({
        projectRoot: "/repo",
        database,
        store,
        warpDeps: expect.objectContaining({
          serverUrl: new URL("http://127.0.0.1:4096"),
          directory: "/repo",
          client: mockClient,
        }),
      }),
    );
    expect(out).toContain("change/done");
    expect(out).toContain("change/live");
  });

  it("adv_worktree_cleanup passes dryRun to advWorktreeCleanup", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 0,
      retained: 1,
      dryRun: true,
    });

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "retry cleanup", dryRun: true },
      store,
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "retry cleanup",
      expect.objectContaining({
        projectRoot: "/repo",
        database,
        dryRun: true,
        store,
      }),
    );
    expect(out).toContain('"dryRun":true');
  });

  it("adv_worktree_cleanup drains queued entries without discovery when skipDiscovery is true", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    const discoverTerminalCleanupCandidates = vi.fn();
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      async (_reason, deps) => {
        if (deps.discover !== false) discoverTerminalCleanupCandidates();
        return { removed: 1, retained: 0 };
      },
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "drain timed-out cleanup", skipDiscovery: true },
      store,
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "drain timed-out cleanup",
      expect.objectContaining({ discover: false }),
    );
    expect(discoverTerminalCleanupCandidates).not.toHaveBeenCalled();
    expect(out).toContain('"removed":1');
  });

  it("adv_worktree_cleanup returns zeroes without discovery when the queue is empty", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    const discoverTerminalCleanupCandidates = vi.fn();
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      async (_reason, deps) => {
        if (deps.discover !== false) discoverTerminalCleanupCandidates();
        return { removed: 0, retained: 0 };
      },
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "drain empty queue", skipDiscovery: true },
      store,
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "drain empty queue",
      expect.objectContaining({ discover: false }),
    );
    expect(discoverTerminalCleanupCandidates).not.toHaveBeenCalled();
    expect(out).toContain('"removed":0');
    expect(out).toContain('"retained":0');
  });

  it("adv_worktree_cleanup routes target_path mutations through target store", async () => {
    const database = {
      projectDir: "/target",
      projectId: "0a00e00000ec0000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: ["change/done"],
      retained: [],
    });

    await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "retry target cleanup",
        dryRun: true,
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
      },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), client: mockClient },
    );

    expect(targetProjectMock.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/repo",
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
        stateRequirement: "authoritative",
      }),
      expect.any(Function),
    );
    expect(stateMock.initStateDb).toHaveBeenCalledWith("/target");
    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "retry target cleanup",
      expect.objectContaining({
        projectRoot: "/target",
        database,
        dryRun: true,
        store: targetStore,
        warpDeps: expect.objectContaining({ directory: "/target" }),
      }),
    );
  });

  // rq-extend-poisoned-recovery AC7 / rq-worktreeBoundedCleanup02 AC1:
  // cleanup tool returns a graceful timeout response when the underlying
  // cleanup hangs (e.g. workflow query on a poisoned workflow) so it
  // doesn't exceed the SDK's 10s tool-execution timeout.
  it("adv_worktree_cleanup returns a timeout response instead of hanging", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      () => new Promise(() => {}),
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "retry cleanup", timeoutMs: 25 },
      store,
    );

    expect(out).toContain("timedOut");
    expect(out).toContain("timed out after");
    expect(out).toContain("effectiveTimeoutMs");
  });

  // AC1 — a clamped caller must not be told to raise a value that was just
  // clamped away. The safe budget is a structural ceiling.
  it("does not advise a larger timeoutMs when the request was clamped (worktrees)", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      () => new Promise(() => {}),
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "clamped cleanup", timeoutMs: 60_000 },
      store,
    );

    const parsed = JSON.parse(out);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.remediation).not.toContain("larger timeoutMs");
    expect(parsed.remediation).toMatch(/skipDiscovery|adv_worktree_triage/);
  }, 50_000);

  // AC2 — with no clamp, offering a larger timeoutMs is still reachable.
  it("may still advise a larger timeoutMs when no clamp was applied (worktrees)", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      () => new Promise(() => {}),
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "unclamped cleanup", timeoutMs: 25 },
      store,
    );

    const parsed = JSON.parse(out);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.remediation).toContain("larger timeoutMs");
  });

  // AC3 — no poison assertion and no unconditional adv_doctor referral,
  // because no poison detection runs anywhere on the cleanup path.
  it("asserts no poisoned workflow and does not refer to adv_doctor on timeout", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      () => new Promise(() => {}),
    );

    for (const timeoutMs of [25, 60_000]) {
      const out = await advWorktreeTools.adv_worktree_cleanup.execute(
        { reason: "no poison guess", timeoutMs },
        store,
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).not.toMatch(/poison/i);
      expect(parsed.error).not.toContain("adv_doctor");
      expect(parsed.remediation).not.toMatch(/poison/i);
      expect(parsed.remediation).not.toContain("adv_doctor");
    }
  }, 50_000);

  it("reports discovery stage and pending-delete count when cleanup hangs in discovery", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    stateMock.getPendingDeletes.mockResolvedValue([
      { branch: "change/one" },
      { branch: "change/two" },
    ]);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      async (_reason, deps) => {
        deps.onStageEnter?.("discovery");
        return new Promise(() => {});
      },
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "discovery timeout", timeoutMs: 25 },
      store,
    );

    expect(out).toContain('"stage":"discovery"');
    expect(out).toContain('"pendingDeleteCount":2');
  });

  it("reports drain stage and pending-delete count when cleanup hangs in drain", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    stateMock.getPendingDeletes.mockResolvedValue([
      { branch: "change/one" },
      { branch: "change/two" },
      { branch: "change/three" },
    ]);
    worktreeMock.advWorktreeCleanup.mockImplementation(
      async (_reason, deps) => {
        deps.onStageEnter?.("discovery");
        deps.onStageEnter?.("drain");
        return new Promise(() => {});
      },
    );

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "drain timeout", timeoutMs: 25 },
      store,
    );

    expect(out).toContain('"stage":"drain"');
    expect(out).toContain('"pendingDeleteCount":3');
  });

  // rq-worktreeBoundedCleanup02 AC1: central safe budget constant exported
  it("derives a discovery git budget strictly below the safe tool budget", () => {
    expect(discoveryGitBudgetForToolBudget(WORKTREE_TOOL_SAFE_TIMEOUT_MS)).toBe(
      2_000,
    );
    expect(
      discoveryGitBudgetForToolBudget(WORKTREE_TOOL_SAFE_TIMEOUT_MS),
    ).toBeLessThan(WORKTREE_TOOL_SAFE_TIMEOUT_MS);
  });

  it("scales the discovery git budget down for smaller caller budgets", () => {
    expect(discoveryGitBudgetForToolBudget(4_000)).toBe(1_000);
    expect(discoveryGitBudgetForToolBudget(400)).toBe(100);
  });

  it("never derives a non-positive discovery git budget", () => {
    expect(discoveryGitBudgetForToolBudget(1)).toBeGreaterThan(0);
  });

  it("exports WORKTREE_TOOL_SAFE_TIMEOUT_MS = 45000", async () => {
    // Will fail until the constant is exported from adv-worktree
    const mod = await import("./adv-worktree");
    expect(mod.WORKTREE_TOOL_SAFE_TIMEOUT_MS).toBe(45_000);
  });

  // rq-worktreeBoundedCleanup02 AC2: oversize timeoutMs is clamped to safe budget
  it("adv_worktree_cleanup clamps oversize timeoutMs to safe budget and reports effectiveTimeoutMs", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 0,
      retained: 0,
    });

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "test clamp", timeoutMs: 60_000 },
      store,
    );

    expect(out).toContain("effectiveTimeoutMs");
    expect(out).toContain("45000");
    // Should succeed (not time out) since the mock resolves instantly
    expect(out).toContain('"success":true');
  });

  // rq-worktreeBoundedCleanup02 AC4: default timeout is the safe budget (45000ms)
  it("adv_worktree_cleanup uses safe budget default when no timeoutMs provided", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 1,
      retained: 0,
    });

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "default budget" },
      store,
    );

    // Should succeed and report the default effective timeout
    expect(out).toContain('"success":true');
    expect(out).toContain("effectiveTimeoutMs");
  });

  it("adv_worktree_cleanup passes an internal cleanup item timeout below the wrapper budget", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 0,
      retained: 1,
    });

    await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "bounded internal cleanup" },
      store,
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "bounded internal cleanup",
      expect.objectContaining({
        cleanupItemTimeoutMs: expect.any(Number),
      }),
    );
    const [, deps] = worktreeMock.advWorktreeCleanup.mock.calls.at(-1)!;
    expect(deps.cleanupItemTimeoutMs).toBeLessThan(
      WORKTREE_TOOL_SAFE_TIMEOUT_MS,
    );
  });

  // rq-worktreeBoundedCleanup02 AC1: delete tool also uses safe budget
  it("adv_worktree_delete returns a timeout response instead of hanging", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockImplementation(
      (_branch, _opts, deps) =>
        new Promise((resolve) => {
          deps.operation?.signal.addEventListener(
            "abort",
            () =>
              resolve({
                ok: false,
                timedOut: true,
                status: "deadline_exceeded",
                error: "DEADLINE_EXCEEDED: timed out after shared cancellation",
                effectiveTimeoutMs: 7_500,
                remediation: "retry with a fresh plan",
              }),
            { once: true },
          );
        }),
    );

    // The delete tool hardcodes the safe budget (45s) internally with no
    // caller override, so the timeout path genuinely waits it out.
    const out = await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/test-timeout" },
      store,
    );

    expect(out).toContain("timedOut");
    expect(out).toContain("timed out after");
    expect(out).toContain("effectiveTimeoutMs");
  }, 50_000);

  it("adv_worktree_triage delegates to triageWorktrees", async () => {
    triageMock.triageWorktrees.mockResolvedValue({
      orphans: [{ class: "stale_head", branch: "change/x" }],
      total: 1,
    });

    const out = await advWorktreeTools.adv_worktree_triage.execute(
      { projectRoot: "/override" },
      store,
    );

    expect(triageMock.triageWorktrees).toHaveBeenCalledWith(
      "/override",
      undefined,
      {
        currentProjectRoot: "/repo",
        callerSignal: undefined,
        timeoutMs: 55_000,
      },
    );
    expect(out).toContain("stale_head");
  });

  it("reports incomplete triage as actionable partial inventory", async () => {
    triageMock.triageWorktrees.mockResolvedValue({
      orphans: [],
      total: 0,
      complete: false,
      stopReason: "internal_budget_exhausted",
      stoppedStage: "dirty_uncommitted_work",
      inspectedCount: 4,
      candidateCount: 36,
      omitted: [{ scope: "dirty_uncommitted_work", reason: "budget" }],
    });

    const out = await advWorktreeTools.adv_worktree_triage.execute({}, store);
    const parsed = JSON.parse(out);

    expect(parsed).toMatchObject({
      success: false,
      complete: false,
      stopReason: "internal_budget_exhausted",
      stoppedStage: "dirty_uncommitted_work",
      inspectedCount: 4,
      candidateCount: 36,
    });
    expect(parsed.omitted).toHaveLength(1);
  });

  // Same defect class as the cleanup timeout branch (AC3): these paths race a
  // setTimeout sentinel, not a rejection, so there is no error object to
  // classify. rq-worktreePoisonVisibility01 forbids naming poisoned history
  // without error-class plus structured evidence.
  it("adv_worktree_delete does not assert a poisoned workflow or refer to adv_doctor on timeout", async () => {
    const database = {
      projectDir: "/repo",
      projectId: "0000000000000000000000000000000000000000",
    };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockImplementation(
      (_branch, _opts, deps) =>
        new Promise((resolve) => {
          deps.operation?.signal.addEventListener(
            "abort",
            () =>
              resolve({
                ok: false,
                timedOut: true,
                status: "deadline_exceeded",
                error: "DEADLINE_EXCEEDED: timed out after shared cancellation",
                effectiveTimeoutMs: 7_500,
                remediation: "retry with a fresh plan",
              }),
            { once: true },
          );
        }),
    );

    const out = await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/x", force: false },
      store,
    );

    const parsed = JSON.parse(out);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.error).not.toMatch(/poison/i);
    expect(parsed.error).not.toContain("adv_doctor");
    expect(parsed.remediation).not.toMatch(/poison/i);
    expect(parsed.remediation).not.toContain("adv_doctor");
  }, 50_000);
});
