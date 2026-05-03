/**
 * Smoke tests for ADV worktree tool wrappers.
 */

import { describe, expect, it, vi } from "vitest";

const worktreeMock = vi.hoisted(() => ({
  advWorktreeCreate: vi.fn(),
  advWorktreeDelete: vi.fn(),
  advWorktreeCleanup: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  initStateDb: vi.fn(),
}));

const triageMock = vi.hoisted(() => ({
  triageWorktrees: vi.fn(),
}));

vi.mock("./worktree", () => worktreeMock);
vi.mock("./worktree/state", () => stateMock);
vi.mock("./worktree/triage", () => triageMock);

import { advWorktreeTools } from "./adv-worktree";
import type { Store } from "../storage/store-types";

const store = {
  paths: { root: "/repo" },
} as Store;

describe("advWorktreeTools", () => {
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
      expect.objectContaining({ projectRoot: "/repo", database }),
    );
    expect(out).toContain('"ok":true');
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
    );

    expect(worktreeMock.advWorktreeCleanup).toHaveBeenCalledWith(
      "retry cleanup",
      expect.objectContaining({ projectRoot: "/repo", database }),
    );
    expect(out).toContain("change/done");
    expect(out).toContain("change/live");
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
