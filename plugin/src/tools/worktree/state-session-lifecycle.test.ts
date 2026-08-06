/** Session compatibility and filesystem-owned worktree state tests. */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearPendingDelete,
  getPendingDeletes,
  getSessionRecord,
  getWorktreePath,
  inferChangeIdFromBranch,
  incrementPendingDeleteAttempts,
  setPendingDelete,
  type WorktreeStateAccess,
} from "./state";
import { synthesizeTestProjectId } from "../../utils/project-id";

const access: WorktreeStateAccess = {
  projectDir: "/test/project",
  projectId: "0e000d0000000000000000000000000000000000",
};

describe("session compatibility helpers", () => {
  it("returns an empty compatibility record after session registry removal", async () => {
    await expect(getSessionRecord(access, "sess_AAAA1111")).resolves.toBeNull();
  });
});

describe("pending delete lifecycle", () => {
  it("persists, increments, and clears pending deletes under isolated state", async () => {
    const originalXdg = process.env.XDG_DATA_HOME;
    const xdg = mkdtempSync(join(tmpdir(), "adv-pending-delete-"));
    process.env.XDG_DATA_HOME = xdg;

    try {
      const worktreePath = `${xdg}/opencode/worktree/test-id/change/pending-cleanup`;
      await setPendingDelete(
        access,
        "change/pending-cleanup",
        worktreePath,
        "worktree still in use",
        "2026-05-20T00:00:00.000Z",
      );
      await expect(getPendingDeletes(access)).resolves.toEqual([
        expect.objectContaining({
          branch: "change/pending-cleanup",
          path: worktreePath,
          attempts: 0,
        }),
      ]);

      await incrementPendingDeleteAttempts(access, "change/pending-cleanup");
      await expect(getPendingDeletes(access)).resolves.toEqual([
        expect.objectContaining({ attempts: 1 }),
      ]);
      await clearPendingDelete(access, "change/pending-cleanup");
      await expect(getPendingDeletes(access)).resolves.toEqual([]);
    } finally {
      if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = originalXdg;
      rmSync(xdg, { recursive: true, force: true });
    }
  });
});

describe("worktree path helpers", () => {
  it("infers change ids only from canonical change branches", () => {
    expect(inferChangeIdFromBranch("change/fixRegistry")).toBe("fixRegistry");
    expect(inferChangeIdFromBranch("change/foo/bar")).toBe("foo/bar");
    expect(inferChangeIdFromBranch("feature/foo")).toBeUndefined();
  });

  it("uses XDG_DATA_HOME via the centralized project-id helper", async () => {
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
