import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import { getWorktreeRegistrySnapshot, type WorktreeStateAccess } from "./state";
import { createInventoryBudget } from "./inventory-budget";

async function fixture(): Promise<{
  root: string;
  access: WorktreeStateAccess;
}> {
  const root = await createTempDir("worktree-snapshot-");
  execSync("git init -b trunk", { cwd: root, stdio: "ignore" });
  execSync(
    "git config user.email test@example.com && git config user.name test",
    { cwd: root },
  );
  writeFileSync(join(root, "README.md"), "fixture\n");
  execSync("git add README.md && git commit -m initial", {
    cwd: root,
    stdio: "ignore",
  });
  const worktree = join(root, "worktree");
  mkdirSync(worktree);
  execSync("git worktree add -b change/c1 " + worktree, {
    cwd: root,
    stdio: "ignore",
  });
  return {
    root,
    access: {
      projectDir: root,
      projectId: "0000123000000000000000000000000000000000",
    },
  };
}

describe("getWorktreeRegistrySnapshot (disk census)", () => {
  it("returns complete local records when inspection is available", async () => {
    const value = await fixture();
    try {
      const result = await getWorktreeRegistrySnapshot(value.access);
      expect(result.complete).toBe(true);
      expect(result.stopReason).toBeUndefined();
      expect(result.records.map((record) => record.branch)).toContain(
        "change/c1",
      );
      expect(result.inspectedCount).toBeGreaterThan(0);
    } finally {
      await cleanupTempDir(value.root);
    }
  });

  it("returns an incomplete result when the caller budget is already exhausted", async () => {
    const value = await fixture();
    try {
      const result = await getWorktreeRegistrySnapshot(value.access, {
        budget: createInventoryBudget({ timeoutMs: 0 }),
      });
      expect(result.complete).toBe(false);
      expect(result.stopReason).toBe("internal_budget_exhausted");
      expect(result.records).toEqual([]);
    } finally {
      await cleanupTempDir(value.root);
    }
  });
});
