import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { resolveGitSessionContext } from "./git-session";

describe("resolveGitSessionContext", () => {
  test("distinguishes main checkout, linked worktree, and fallback worktree hint", () => {
    const root = mkdtempSync(join(tmpdir(), "adv-git-session-"));
    const main = join(root, "main");
    const linked = join(root, "linked");

    try {
      execFileSync("git", ["init", "-b", "main", main], { stdio: "ignore" });
      writeFileSync(join(main, "README.md"), "# test\n");
      execFileSync("git", ["add", "README.md"], { cwd: main });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=ADV Test",
          "-c",
          "user.email=adv-test@example.invalid",
          "commit",
          "-m",
          "init",
        ],
        { cwd: main, stdio: "ignore" },
      );
      execFileSync("git", ["worktree", "add", linked, "-b", "linked"], {
        cwd: main,
        stdio: "ignore",
      });

      expect(resolveGitSessionContext(main, undefined)).toMatchObject({
        isMainCheckout: true,
        isWorktree: false,
        mainCheckoutPath: main,
      });
      expect(resolveGitSessionContext(linked, undefined)).toMatchObject({
        isMainCheckout: false,
        isWorktree: true,
        mainCheckoutPath: main,
      });
      expect(resolveGitSessionContext(root, linked)).toMatchObject({
        isMainCheckout: false,
        isWorktree: true,
        mainCheckoutPath: main,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back safely outside git", () => {
    const root = mkdtempSync(join(tmpdir(), "adv-git-session-fallback-"));

    try {
      expect(resolveGitSessionContext(root, undefined)).toEqual({
        isMainCheckout: true,
        isWorktree: false,
      });
      expect(resolveGitSessionContext(root, join(root, "worktree"))).toEqual({
        isMainCheckout: false,
        isWorktree: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
