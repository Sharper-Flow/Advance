import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import {
  getWorktreeRecord,
  worktreeExistsForChange,
  type WorktreeStateAccess,
} from "./state";

async function createGitFixture(): Promise<{
  root: string;
  access: WorktreeStateAccess;
  worktree: string;
}> {
  const root = await createTempDir("worktree-record-");
  execSync("git init -b trunk", { cwd: root, stdio: "ignore" });
  execSync("git config user.email test@example.com", { cwd: root });
  execSync("git config user.name test", { cwd: root });
  writeFileSync(join(root, "README.md"), "fixture\n");
  execSync("git add README.md && git commit -m initial", {
    cwd: root,
    stdio: "ignore",
  });

  const worktree = join(root, "worktree");
  mkdirSync(worktree, { recursive: true });
  execSync("git worktree add -b change/myChange " + worktree, {
    cwd: root,
    stdio: "ignore",
  });
  return {
    root,
    worktree,
    access: {
      projectDir: root,
      projectId: "0000123000000000000000000000000000000000",
    },
  };
}

describe("disk-owned worktree record probes", () => {
  it("returns the local census record for a change branch", async () => {
    const fixture = await createGitFixture();
    try {
      const record = await getWorktreeRecord(fixture.access, "change/myChange");
      expect(record).not.toBeNull();
      expect(record?.path).toBe(fixture.worktree);
      expect(record?.changeId).toBe("myChange");
      expect(record?.setupReady).toBe(true);
      expect(await worktreeExistsForChange(fixture.access, "myChange")).toBe(
        true,
      );
    } finally {
      await cleanupTempDir(fixture.root);
    }
  });

  it("returns null/false for non-change and unknown branches", async () => {
    const fixture = await createGitFixture();
    try {
      await expect(
        getWorktreeRecord(fixture.access, "feature/foo"),
      ).resolves.toBeNull();
      await expect(
        getWorktreeRecord(fixture.access, "change/missing"),
      ).resolves.toBeNull();
      await expect(
        worktreeExistsForChange(fixture.access, "missing"),
      ).resolves.toBe(false);
    } finally {
      await cleanupTempDir(fixture.root);
    }
  });
});
