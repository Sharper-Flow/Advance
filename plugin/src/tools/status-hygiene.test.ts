import { describe, expect, test, vi } from "vitest";
import { appendArchivedBranchHygieneRecommendations } from "./status-hygiene";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
  detectArchivedMergedBranches: vi.fn(() => ({
    status: "ok" as const,
    branches: [
      {
        changeId: "archived-one",
        branch: "change/archived-one",
        localSha: "abc123",
        mergeProof: { kind: "patch-equivalent" as const },
      },
    ],
  })),
  getCheckedOutChangeBranches: vi.fn(() => ({
    status: "ok" as const,
    branches: new Set<string>(),
    worktreePaths: {},
  })),
  runGit: vi.fn(),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    detectDefaultBranch: mocks.detectDefaultBranch,
    detectArchivedMergedBranches: mocks.detectArchivedMergedBranches,
    getCheckedOutChangeBranches: mocks.getCheckedOutChangeBranches,
  };
});

function createMockStore(
  archivedChanges: Array<{ id: string; status: string }> = [],
): Store {
  return {
    paths: { root: "/tmp/main" },
    changes: {
      list: vi.fn(async ({ status }: { status?: string } = {}) => ({
        changes: status === "archived" ? archivedChanges : [],
      })),
      listSummary: vi
        .fn()
        .mockRejectedValue(
          new Error("listSummary should not be used for terminal hygiene"),
        ),
    },
  } as unknown as Store;
}

describe("appendArchivedBranchHygieneRecommendations", () => {
  test("uses authoritative changes.list for terminal rows and ignores listSummary", async () => {
    const store = createMockStore([{ id: "archived-one", status: "archived" }]);
    const status = { recommendations: [] } as any;

    await appendArchivedBranchHygieneRecommendations(
      status,
      store,
      "/tmp/main",
      { runGit: mocks.runGit },
    );

    expect(store.changes.list).toHaveBeenCalledWith({
      status: "archived",
      includeArchived: true,
    });
    expect(store.changes.listSummary).not.toHaveBeenCalled();
    expect(status.archived_branch_hygiene).toBeDefined();
    expect(status.archived_branch_hygiene.count).toBe(1);
    expect(status.archived_branch_hygiene.recommendation).toContain(
      "adv_worktree_cleanup",
    );
    expect(status.archived_branch_hygiene.recommendation).toContain(
      "archived_branches",
    );
    expect(status.archived_branch_hygiene.recommendation).not.toContain(
      "retired_archive_repair_marker",
    );
  });

  test("ignores ResolvedChangeList warnings and hydrationStats", async () => {
    const store = createMockStore([{ id: "archived-one", status: "archived" }]);
    (store.changes.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      changes: [{ id: "archived-one", status: "archived" }],
      warnings: [
        {
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "archive",
          message: "degraded",
        },
      ],
      hydrationStats: { terminalCandidates: 1 },
    });
    const status = { recommendations: [] } as any;

    await appendArchivedBranchHygieneRecommendations(
      status,
      store,
      "/tmp/main",
      { runGit: mocks.runGit },
    );

    expect(status.archived_branch_hygiene).toBeDefined();
    expect(status.archived_branch_hygiene.count).toBe(1);
    expect(
      status.recommendations.some((r: string) => /cleanup-ready:/.test(r)),
    ).toBe(true);
  });
});
