/** Filesystem-owned worktree state tests. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearPendingDelete,
  getPendingDeletes,
  getWorktreePath,
  incrementPendingDeleteAttempts,
  setPendingDelete,
  type WorktreeStateAccess,
} from "./state";
import { inferChangeIdFromBranch } from "./branch-parser";
import { synthesizeTestProjectId } from "../../utils/project-id";

const access: WorktreeStateAccess = {
  projectDir: "/test/project",
  projectId: "0e000d0000000000000000000000000000000000",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function createGitProject(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), "adv-state-project-"));
  execSync("git init", { cwd: projectRoot, stdio: "ignore" });
  execSync("git config user.email test@example.com", {
    cwd: projectRoot,
    stdio: "ignore",
  });
  execSync("git config user.name Test", {
    cwd: projectRoot,
    stdio: "ignore",
  });
  writeFileSync(join(projectRoot, "README.md"), "# isolated test project\n");
  execSync("git add README.md", { cwd: projectRoot, stdio: "ignore" });
  execSync("git commit -m initial", { cwd: projectRoot, stdio: "ignore" });
  return projectRoot;
}

describe("pending delete lifecycle", () => {
  it("persists, increments, and clears pending deletes under isolated state", async () => {
    const xdg = mkdtempSync(join(tmpdir(), "adv-pending-delete-"));
    vi.stubEnv("XDG_DATA_HOME", xdg);
    vi.stubEnv("ADV_TEST_DATA_HOME", "0");

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
    const projectRoot = createGitProject();
    const xdg = mkdtempSync(join(tmpdir(), "adv-state-xdg-"));
    vi.stubEnv("XDG_DATA_HOME", xdg);
    vi.stubEnv("ADV_TEST_DATA_HOME", "0");
    try {
      await expect(getWorktreePath(projectRoot, "change/test")).resolves.toBe(
        `${xdg}/opencode/worktree/${synthesizeTestProjectId(projectRoot)}/change/test`,
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(xdg, { recursive: true, force: true });
    }
  });
});
