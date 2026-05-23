import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { cleanupTempDir } from "./setup";
import { cleanupSyntheticAdvDirs } from "./synthetic-cleanup";

describe("synthetic ADV cleanup guard", () => {
  test("removes stale and newly created synthetic dirs while preserving real project IDs", async () => {
    const dataHome = await mkdtemp(join(tmpdir(), "adv-synth-clean-"));
    try {
      const stale = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000stalestalestalest",
      );
      const created = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000createdcreatedcreat",
      );
      const real = join(
        dataHome,
        "opencode/plugins/advance/bdf259aa162ae192af5b18899ccdc653b085528d",
      );

      await mkdir(stale, { recursive: true });
      await mkdir(created, { recursive: true });
      await mkdir(real, { recursive: true });

      const removed = await cleanupSyntheticAdvDirs(dataHome);

      expect(removed.sort()).toEqual([created, stale].sort());
      expect(existsSync(stale)).toBe(false);
      expect(existsSync(created)).toBe(false);
      expect(existsSync(real)).toBe(true);
    } finally {
      await cleanupTempDir(dataHome);
    }
  });

  test("preserves pre-baseline synthetic dirs with marker mismatch", async () => {
    const dataHome = await mkdtemp(join(tmpdir(), "adv-synth-clean-"));
    try {
      const staleOwned = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000staleownedownedown",
      );
      const staleUnowned = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000staleunownunownun",
      );

      await mkdir(staleOwned, { recursive: true });
      await writeFile(join(staleOwned, ".adv-test-owner"), "other-run");
      await mkdir(staleUnowned, { recursive: true });

      const removed = await cleanupSyntheticAdvDirs(dataHome, {
        runId: "this-run",
      });

      expect(removed).toEqual([staleUnowned]);
      expect(existsSync(staleOwned)).toBe(true);
      expect(existsSync(staleUnowned)).toBe(false);
    } finally {
      await cleanupTempDir(dataHome);
    }
  });

  test("skips synthetic dirs with non-empty marker mismatch", async () => {
    const dataHome = await mkdtemp(join(tmpdir(), "adv-synth-clean-"));
    try {
      const created = join(
        dataHome,
        "opencode/worktree/0000000000000000createdcreatedcreat",
      );
      await mkdir(created, { recursive: true });
      await writeFile(join(created, ".adv-test-owner"), "other-run");

      const removed = await cleanupSyntheticAdvDirs(dataHome, {
        runId: "this-run",
      });

      expect(removed).toEqual([]);
      expect(existsSync(created)).toBe(true);
      expect(await readdir(created)).toContain(".adv-test-owner");
    } finally {
      await cleanupTempDir(dataHome);
    }
  });
});
