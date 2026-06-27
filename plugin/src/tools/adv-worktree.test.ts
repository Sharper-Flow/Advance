/**
 * Smoke tests for ADV worktree tool wrappers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const worktreeMock = vi.hoisted(() => ({
  advWorktreeCreate: vi.fn(),
  advWorktreeResume: vi.fn(),
  advWorktreeDelete: vi.fn(),
  advWorktreeCleanup: vi.fn(),
  loadWorktreeConfig: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  initStateDb: vi.fn(),
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
  appendTargetProjectContextOutput: vi.fn((output: string) => output),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./worktree", () => worktreeMock);
vi.mock("./worktree/state", () => stateMock);
vi.mock("./worktree/triage", () => triageMock);
vi.mock("../utils/workspace-warp", () => workspaceWarpMock);
vi.mock("./target-project", () => targetProjectMock);

import {
  advWorktreeTools,
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
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input, fn) =>
        fn({
          context: {
            root: "/target",
            projectId: "target-project",
            externalRoot: "/external/target-project",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: targetStore,
        }),
    );
  });

  it("adv_worktree_create delegates to advWorktreeCreate", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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

  it("adv_worktree_resume passes store for cache refresh on materialization", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeResume.mockResolvedValue({ ok: true, path: "/wt" });

    await advWorktreeTools.adv_worktree_resume.execute(
      { changeId: "change-x" },
      store,
    );

    expect(worktreeMock.advWorktreeResume).toHaveBeenCalledWith(
      { changeId: "change-x", branch: undefined },
      { base: undefined, force: undefined },
      expect.objectContaining({ projectRoot: "/repo", database, store }),
    );
  });

  it("adv_worktree_delete delegates to advWorktreeDelete", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
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

  it("adv_worktree_delete passes dryRun to advWorktreeDelete", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/target", projectId: "target-project" };
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
      },
      store,
    );

    expect(targetProjectMock.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/repo",
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(stateMock.initStateDb).toHaveBeenCalledWith("/target");
    expect(worktreeMock.advWorktreeDelete).toHaveBeenCalledWith(
      "change/x",
      expect.any(Object),
      expect.objectContaining({
        projectRoot: "/target",
        database,
        store: targetStore,
      }),
    );
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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

  it("adv_worktree_cleanup routes target_path mutations through target store", async () => {
    const database = { projectDir: "/target", projectId: "target-project" };
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
        stateRequirement: "temporal-required",
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
    const database = { projectDir: "/repo", projectId: "p" };
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

  // rq-worktreeBoundedCleanup02 AC1: central safe budget constant exported
  it("exports WORKTREE_TOOL_SAFE_TIMEOUT_MS = 8000", async () => {
    // Will fail until the constant is exported from adv-worktree
    const mod = await import("./adv-worktree");
    expect(mod.WORKTREE_TOOL_SAFE_TIMEOUT_MS).toBe(8000);
  });

  // rq-worktreeBoundedCleanup02 AC2: oversize timeoutMs is clamped to safe budget
  it("adv_worktree_cleanup clamps oversize timeoutMs to safe budget and reports effectiveTimeoutMs", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCleanup.mockResolvedValue({
      removed: 0,
      retained: 0,
    });

    const out = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "test clamp", timeoutMs: 30_000 },
      store,
    );

    expect(out).toContain("effectiveTimeoutMs");
    expect(out).toContain("8000");
    // Should succeed (not time out) since the mock resolves instantly
    expect(out).toContain('"success":true');
  });

  // rq-worktreeBoundedCleanup02 AC4: default timeout is the safe budget (8000ms)
  it("adv_worktree_cleanup uses safe budget default when no timeoutMs provided", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
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
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeDelete.mockImplementation(
      () => new Promise(() => {}),
    );

    // The delete tool currently hardcodes the safe budget (8s) internally
    // with no caller override, so we must allow a longer test timeout.
    const out = await advWorktreeTools.adv_worktree_delete.execute(
      { branch: "change/test-timeout" },
      store,
    );

    expect(out).toContain("timedOut");
    expect(out).toContain("timed out after");
    expect(out).toContain("effectiveTimeoutMs");
  }, 12_000);

  it("adv_worktree_triage delegates to triageWorktrees", async () => {
    triageMock.triageWorktrees.mockResolvedValue({
      orphans: [{ class: "missing_from_disk", branch: "change/x" }],
      total: 1,
    });

    const out = await advWorktreeTools.adv_worktree_triage.execute(
      { projectRoot: "/override" },
      store,
    );

    expect(triageMock.triageWorktrees).toHaveBeenCalledWith(
      "/override",
      undefined,
      { currentProjectRoot: "/repo" },
    );
    expect(out).toContain("missing_from_disk");
  });
});
