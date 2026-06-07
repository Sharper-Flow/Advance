import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  resolveMainCheckout: vi.fn(() => "/tmp/main"),
  detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
  detectArchivedUnmergedBranches: vi.fn(() => ({
    status: "ok",
    branches: [
      {
        changeId: "archived-one",
        branch: "change/archived-one",
        remoteRef: "refs/heads/change/archived-one",
        sha: "aaa",
        unmergedCommits: ["aaa archived commit"],
      },
    ],
  })),
  redriveArchivedUnmergedBranch: vi.fn(() => ({
    status: "pending_merge",
    mainCheckout: "/tmp/main",
    defaultBranch: "trunk",
    route: "pr_auto_merge",
    pushStatus: "pushed",
    prBranch: "change/archived-one",
    prNumber: 42,
    prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
    autoMergeArmed: true,
  })),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    resolveMainCheckout: mocks.resolveMainCheckout,
    detectDefaultBranch: mocks.detectDefaultBranch,
    detectArchivedUnmergedBranches: mocks.detectArchivedUnmergedBranches,
    redriveArchivedUnmergedBranch: mocks.redriveArchivedUnmergedBranch,
  };
});

function archivedChange(id: string): Change {
  return {
    id,
    title: id,
    status: "archived",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
  } as Change;
}

function createMockStore(): Store {
  const changes = [
    archivedChange("archived-one"),
    archivedChange("already-merged"),
  ];
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/.adv/changes",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(async () => ({ changes })),
      get: vi.fn(async (changeId: string) => ({
        success: true,
        data: changes.find((change) => change.id === changeId) ?? null,
      })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_archive_repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("scan lists archived origin change branches not reachable from origin/default", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_archive_repair.execute(
      { action: "scan" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("scan");
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.branches[0]).toMatchObject({
      changeId: "archived-one",
      branch: "change/archived-one",
    });
    expect(store.changes.list).toHaveBeenCalledWith({
      status: "archived",
      includeArchived: true,
    });
    expect(mocks.detectArchivedUnmergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["archived-one", "already-merged"],
    });
  });

  test("redrive opens or reuses PR and arms auto-merge for one archived branch", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_archive_repair.execute(
      { action: "redrive", changeId: "archived-one" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("redrive");
    expect(parsed.outcome).toMatchObject({
      status: "pending_merge",
      prNumber: 42,
      autoMergeArmed: true,
    });
    expect(mocks.redriveArchivedUnmergedBranch).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      changeId: "archived-one",
    });
  });
});
