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
  return {
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
    validateChangeWorktree: vi.fn(() => ({
      valid: true,
      mainCheckout: "/tmp/main",
      currentBranch: "change/example",
    })),
    closeLinkedIssue: vi.fn(() =>
      Promise.resolve({ issue_closed: [], close_eligible: false }),
    ),
    validateChange: vi.fn(() => Promise.resolve({ errors: [], warnings: [] })),
    getArchiveContractProofErrors: vi.fn(() => []),
    loadSpecsMap: vi.fn(() => Promise.resolve(new Map())),
    findArchiveBundle: vi.fn(() => Promise.resolve(null)),
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
    validateChangeWorktree: mocks.validateChangeWorktree,
  };
});

vi.mock("../validator", () => ({
  validateChange: mocks.validateChange,
}));

function createMockStore(options: { releaseDone?: boolean } = {}): Store {
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
    status: "active",
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
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_change_archive Phase 9 behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("runs finalization before retiring the change and returns the outcome", async () => {
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
    expect(mocks.finalizeRelease).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
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
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
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
});
