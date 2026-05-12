/**
 * Pre-execution rebase tests — pure unit tests with injected deps.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  defaultIsWorktree,
  preExecutionRebase,
  PreRebaseDeps,
  PreRebaseResult,
} from "./pre-rebase";

describe("preExecutionRebase", () => {
  const defaultBranch = "main";

  // Helper to build minimal deps
  const makeDeps = (overrides: Partial<PreRebaseDeps> = {}): PreRebaseDeps => ({
    resolveDefaultBranch: async () => defaultBranch,
    fetchOrigin: async () => ({ ok: true }),
    isAhead: async () => true,
    rebase: async () => ({ ok: true }),
    isWorktree: async () => true,
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // RED 1: Clean rebase
  // ---------------------------------------------------------------------------
  it("returns rebased when ahead and rebase succeeds", async () => {
    const deps = makeDeps({
      isAhead: async () => true,
      rebase: async () => ({ ok: true }),
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(true);
    expect((result as Extract<PreRebaseResult, { ok: true }>).status).toBe(
      "rebased",
    );
    expect(
      (result as Extract<PreRebaseResult, { ok: true }>).defaultBranch,
    ).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // RED 2: Conflict detection
  // ---------------------------------------------------------------------------
  it("returns conflict when rebase fails with conflicts", async () => {
    const deps = makeDeps({
      isAhead: async () => true,
      rebase: async () => ({
        ok: false,
        conflictFiles: ["src/foo.ts"],
      }),
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(false);
    expect((result as Extract<PreRebaseResult, { ok: false }>).reason).toBe(
      "conflict",
    );
    expect(
      (result as Extract<PreRebaseResult, { ok: false }>).conflictFiles,
    ).toEqual(["src/foo.ts"]);
  });

  // ---------------------------------------------------------------------------
  // RED 3: Up-to-date no-op
  // ---------------------------------------------------------------------------
  it("returns up_to_date when not ahead of origin/main", async () => {
    const deps = makeDeps({
      isAhead: async () => false,
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(true);
    expect((result as Extract<PreRebaseResult, { ok: true }>).status).toBe(
      "up_to_date",
    );
    expect(
      (result as Extract<PreRebaseResult, { ok: true }>).defaultBranch,
    ).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // BONUS: default_branch_unresolvable
  // ---------------------------------------------------------------------------
  it("returns default_branch_unresolvable when branch cannot be resolved", async () => {
    const deps = makeDeps({
      resolveDefaultBranch: async () => null,
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(false);
    expect((result as Extract<PreRebaseResult, { ok: false }>).reason).toBe(
      "default_branch_unresolvable",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: fetch failure handling (no_remote path)
  // ---------------------------------------------------------------------------
  it("returns no_remote when fetch fails with no remote error", async () => {
    const deps = makeDeps({
      fetchOrigin: async () => ({
        ok: false,
        error: "fatal: no remote configured for this repository",
      }),
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(false);
    expect((result as Extract<PreRebaseResult, { ok: false }>).reason).toBe(
      "no_remote",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: fetch failure handling (generic fetch failure → rebase_failed)
  // ---------------------------------------------------------------------------
  it("returns rebase_failed when fetch fails for non-remote reasons", async () => {
    const deps = makeDeps({
      fetchOrigin: async () => ({
        ok: false,
        error: "fatal: unable to access: Could not resolve host",
      }),
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(false);
    expect((result as Extract<PreRebaseResult, { ok: false }>).reason).toBe(
      "rebase_failed",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: rebase failure without conflicts
  // ---------------------------------------------------------------------------
  it("returns rebase_failed when rebase fails without conflicts", async () => {
    const deps = makeDeps({
      isAhead: async () => true,
      rebase: async () => ({
        ok: false,
        error: "Rebase failed: patch does not apply",
      }),
    });

    const result = await preExecutionRebase("/fake/worktree", deps);

    expect(result.ok).toBe(false);
    expect((result as Extract<PreRebaseResult, { ok: false }>).reason).toBe(
      "rebase_failed",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: up_to_date skips rebase entirely
  // ---------------------------------------------------------------------------
  it("does not call rebase when already up to date", async () => {
    let rebaseCalled = false;
    const deps = makeDeps({
      isAhead: async () => false,
      rebase: async () => {
        rebaseCalled = true;
        return { ok: true };
      },
    });

    await preExecutionRebase("/fake/worktree", deps);

    expect(rebaseCalled).toBe(false);
  });

  describe("defaultIsWorktree", () => {
    it("returns false for main checkout, true for linked worktree, and false for non-git dir", async () => {
      const root = mkdtempSync(join(tmpdir(), "adv-pre-rebase-"));
      const main = join(root, "main");
      const linked = join(root, "linked");
      const nonGit = join(root, "non-git");

      try {
        execFileSync("git", ["init", "-b", "main", main], {
          stdio: "ignore",
        });
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

        expect(await defaultIsWorktree(main)).toBe(false);
        expect(await defaultIsWorktree(linked)).toBe(true);
        expect(await defaultIsWorktree(nonGit)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
