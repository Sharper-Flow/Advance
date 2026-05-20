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

vi.mock("./worktree", () => worktreeMock);
vi.mock("./worktree/state", () => stateMock);
vi.mock("./worktree/triage", () => triageMock);
vi.mock("../utils/workspace-warp", () => workspaceWarpMock);

import { advWorktreeTools } from "./adv-worktree";
import type { Store } from "../storage/store-types";

const store = {
  paths: { root: "/repo" },
} as Store;

describe("advWorktreeTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    worktreeMock.loadWorktreeConfig.mockResolvedValue({ mode: "warp" });
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
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue(null);
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockResolvedValue(undefined);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), sessionID: "ses-1" },
    );

    expect(workspaceWarpMock.getSessionWorkspaceID).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: new URL("http://127.0.0.1:4096") }),
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
      { serverUrl: new URL("http://127.0.0.1:4096"), sessionID: "ses-1" },
    );

    expect(workspaceWarpMock.workspaceAndWarpAvailable).not.toHaveBeenCalled();
    expect(workspaceWarpMock.createAdvWorkspace).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"workdir":"/wt"');
  });

  it("adv_worktree_create downgrades to terminal mode when sessionID is unavailable", async () => {
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
      { serverUrl: new URL("http://127.0.0.1:4096") },
    );

    expect(worktreeMock.loadWorktreeConfig).toHaveBeenCalledWith(
      "/repo",
      expect.any(Object),
    );
    expect(workspaceWarpMock.workspaceAndWarpAvailable).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain("sessionID");
  });

  it("adv_worktree_create blocks already-warped sessions before endpoint probing", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue("ws-current");

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), sessionID: "ses-1" },
    );

    expect(workspaceWarpMock.workspaceAndWarpAvailable).not.toHaveBeenCalled();
    expect(worktreeMock.advWorktreeCreate).not.toHaveBeenCalled();
    expect(out).toContain('"error":"SESSION_ALREADY_WARPED"');
    expect(out).toContain('"workspaceID":"ws-current"');
  });

  it("adv_worktree_create downgrades when workspace endpoint is unavailable after session lookup", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue(null);
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(false);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), sessionID: "ses-1" },
    );

    expect(workspaceWarpMock.getSessionWorkspaceID).toHaveBeenCalledWith(
      expect.any(Object),
      "ses-1",
    );
    expect(workspaceWarpMock.createAdvWorkspace).not.toHaveBeenCalled();
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain("/experimental/workspace");
  });

  it("adv_worktree_create falls back to terminal mode after post-create warp failure", async () => {
    const database = { projectDir: "/repo", projectId: "p" };
    stateMock.initStateDb.mockResolvedValue(database);
    worktreeMock.advWorktreeCreate.mockResolvedValue({
      ok: true,
      branch: "change/x",
      path: "/wt",
    });
    workspaceWarpMock.warpFlagEnabled.mockReturnValue(true);
    workspaceWarpMock.getSessionWorkspaceID.mockResolvedValue(null);
    workspaceWarpMock.workspaceAndWarpAvailable.mockResolvedValue(true);
    workspaceWarpMock.createAdvWorkspace.mockResolvedValue({
      workspaceID: "ws-123",
    });
    workspaceWarpMock.warpSession.mockRejectedValue(new Error("warp boom"));
    workspaceWarpMock.deleteAdvWorkspace.mockResolvedValue(undefined);

    const out = await advWorktreeTools.adv_worktree_create.execute(
      { branch: "change/x", base: "trunk" },
      store,
      { serverUrl: new URL("http://127.0.0.1:4096"), sessionID: "ses-1" },
    );

    expect(workspaceWarpMock.deleteAdvWorkspace).toHaveBeenCalledWith(
      expect.any(Object),
      "ws-123",
    );
    expect(out).toContain('"mode":"terminal"');
    expect(out).toContain('"workdir":"/wt"');
    expect(out).toContain("warp boom");
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
      expect.objectContaining({ projectRoot: "/repo", database }),
    );
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
      { serverUrl: new URL("http://127.0.0.1:4096") },
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "retry cleanup",
      expect.objectContaining({
        projectRoot: "/repo",
        database,
        store,
        warpDeps: { serverUrl: new URL("http://127.0.0.1:4096") },
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

  it("adv_worktree_triage delegates to triageWorktrees", async () => {
    triageMock.triageWorktrees.mockResolvedValue({
      orphans: [{ class: "missing_from_disk", branch: "change/x" }],
      total: 1,
    });

    const out = await advWorktreeTools.adv_worktree_triage.execute(
      { projectRoot: "/override" },
      store,
    );

    expect(triageMock.triageWorktrees).toHaveBeenCalledWith("/override");
    expect(out).toContain("missing_from_disk");
  });
});
