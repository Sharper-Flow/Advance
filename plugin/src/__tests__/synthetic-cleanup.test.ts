import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { cleanupTempDir } from "./setup";
import {
  listSyntheticAdvDirs,
  cleanupNewSyntheticAdvDirs,
} from "./synthetic-cleanup";

describe("synthetic ADV cleanup guard", () => {
  test("removes only synthetic dirs created after baseline", async () => {
    const dataHome = await mkdtemp(join(tmpdir(), "adv-synth-clean-"));
    try {
      const existing = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000existingexistingexist",
      );
      const created = join(
        dataHome,
        "opencode/plugins/advance/0000000000000000createdcreatedcreat",
      );
      const real = join(
        dataHome,
        "opencode/plugins/advance/bdf259aa162ae192af5b18899ccdc653b085528d",
      );

      await mkdir(existing, { recursive: true });
      const baseline = await listSyntheticAdvDirs(dataHome);

      await mkdir(created, { recursive: true });
      await mkdir(real, { recursive: true });

      const removed = await cleanupNewSyntheticAdvDirs(dataHome, baseline);

      expect(removed).toEqual([created]);
      expect(existsSync(existing)).toBe(true);
      expect(existsSync(created)).toBe(false);
      expect(existsSync(real)).toBe(true);
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

      const removed = await cleanupNewSyntheticAdvDirs(dataHome, new Set(), {
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
