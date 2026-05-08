/**
 * Git Mutation Guard Tests
 *
 * Tests for the command analysis pipeline, alias resolution,
 * context resolution, decision matrix, and main entry point.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  splitCommand,
  extractGitSubcommand,
  extractGitCFlag,
  extractGitDirFlag,
  extractPushFlags,
  classifySubcommand,
  classifyCommand,
  resolveWorkdir,
  evaluateDecision,
  checkBashCommand,
  parseWorktreePaths,
  resetAliasCache,
  stripHeredocs,
  type GuardContext,
  type GuardDeps,
  type GitCommandCategory,
} from "./git-guard";

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockDeps(overrides?: Partial<GuardDeps>): GuardDeps {
  return {
    getDefaultBranch: vi.fn().mockResolvedValue("main"),
    execGit: vi.fn().mockResolvedValue(""),
    getWorktreePaths: vi.fn().mockResolvedValue([]),
    getProjectRoot: vi.fn().mockReturnValue("/project"),
    ...overrides,
  };
}

function createMockContext(overrides?: Partial<GuardContext>): GuardContext {
  return {
    workdir: "/project",
    gitRoot: "/project",
    branch: "main",
    isDefaultBranch: true,
    isDirty: false,
    isWorktree: false,
    dirtyFiles: [],
    ...overrides,
  };
}

// ─── splitCommand ───────────────────────────────────────────────────────────

describe("splitCommand", () => {
  it("splits on && operator", () => {
    expect(splitCommand("git add -A && git commit -m 'x'")).toEqual([
      "git add -A",
      "git commit -m 'x'",
    ]);
  });

  it("splits on || operator", () => {
    expect(splitCommand("git push || echo failed")).toEqual([
      "git push",
      "echo failed",
    ]);
  });

  it("splits on semicolon", () => {
    expect(splitCommand("git status; git log")).toEqual([
      "git status",
      "git log",
    ]);
  });

  it("splits on pipe", () => {
    expect(splitCommand("git log | grep commit")).toEqual([
      "git log",
      "grep commit",
    ]);
  });

  it("splits on mixed operators", () => {
    expect(
      splitCommand("git add -A && git commit -m x; git push || echo fail"),
    ).toEqual(["git add -A", "git commit -m x", "git push", "echo fail"]);
  });

  it("returns single segment for no operators", () => {
    expect(splitCommand("git status")).toEqual(["git status"]);
  });

  it("returns empty array for empty string", () => {
    expect(splitCommand("")).toEqual([]);
  });
});

// ─── extractGitSubcommand ───────────────────────────────────────────────────

describe("extractGitSubcommand", () => {
  it("extracts commit from git commit", () => {
    expect(extractGitSubcommand("git commit -m 'test'")).toBe("commit");
  });

  it("extracts push from git push", () => {
    expect(extractGitSubcommand("git push origin main")).toBe("push");
  });

  it("extracts subcommand after global flags", () => {
    expect(extractGitSubcommand("git -C /tmp status")).toBe("status");
    expect(extractGitSubcommand("git --git-dir /tmp/.git push")).toBe("push");
  });

  it("extracts subcommand after leading whitespace", () => {
    expect(extractGitSubcommand("  git log --oneline")).toBe("log");
  });

  it("returns null for non-git command", () => {
    expect(extractGitSubcommand("echo hello")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractGitSubcommand("")).toBeNull();
  });
});

// ─── extractGitCFlag ────────────────────────────────────────────────────────

describe("extractGitCFlag", () => {
  it("extracts unquoted -C path", () => {
    expect(extractGitCFlag("git -C /tmp status")).toBe("/tmp");
  });

  it("extracts single-quoted -C path", () => {
    expect(extractGitCFlag("git -C '/tmp dir' status")).toBe("/tmp dir");
  });

  it("extracts double-quoted -C path", () => {
    expect(extractGitCFlag('git -C "/tmp dir" status')).toBe("/tmp dir");
  });

  it("returns null when no -C flag", () => {
    expect(extractGitCFlag("git status")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractGitCFlag("")).toBeNull();
  });
});

// ─── extractGitDirFlag ──────────────────────────────────────────────────────

describe("extractGitDirFlag", () => {
  it("extracts --git-dir path", () => {
    expect(extractGitDirFlag("git --git-dir /tmp/.git status")).toBe("/tmp");
  });

  it("extracts --git-dir=path", () => {
    expect(extractGitDirFlag("git --git-dir=/tmp/.git status")).toBe("/tmp");
  });

  it("returns null when absent", () => {
    expect(extractGitDirFlag("git status")).toBeNull();
  });
});

// ─── extractPushFlags ──────────────────────────────────────────────────────

describe("extractPushFlags", () => {
  it("returns all false for plain push", () => {
    expect(extractPushFlags("git push origin trunk")).toEqual({
      force: false,
      forceWithLease: false,
      hasRefspec: false,
    });
  });

  it("detects --force flag", () => {
    expect(extractPushFlags("git push --force origin trunk")).toMatchObject({
      force: true,
    });
  });

  it("detects -f shorthand", () => {
    expect(extractPushFlags("git push -f origin trunk")).toMatchObject({
      force: true,
    });
  });

  it("detects --force-with-lease flag", () => {
    expect(
      extractPushFlags("git push --force-with-lease origin trunk"),
    ).toMatchObject({ forceWithLease: true });
  });

  it("detects --force-with-lease=ref form", () => {
    expect(
      extractPushFlags("git push --force-with-lease=trunk origin trunk"),
    ).toMatchObject({ forceWithLease: true });
  });

  it("detects refspec arguments", () => {
    expect(
      extractPushFlags("git push origin trunk:other-branch"),
    ).toMatchObject({ hasRefspec: true });
  });

  it("returns all false for non-push commands", () => {
    expect(extractPushFlags("git status")).toEqual({
      force: false,
      forceWithLease: false,
      hasRefspec: false,
    });
  });

  it("does not flag remote URL with colon as refspec", () => {
    // origin URL has colon but it's not a refspec arg
    expect(
      extractPushFlags("git push git@github.com:owner/repo.git trunk"),
    ).toMatchObject({ hasRefspec: false });
  });
});

// ─── parseWorktreePaths ─────────────────────────────────────────────────────

describe("parseWorktreePaths", () => {
  it("parses worktree paths from porcelain output", () => {
    expect(
      parseWorktreePaths(
        "worktree /repo\nHEAD abc\n\nworktree /repo-wt\nHEAD def\nbranch refs/heads/change/test\n",
      ),
    ).toEqual(["/repo", "/repo-wt"]);
  });

  it("returns empty array for empty or malformed output", () => {
    expect(parseWorktreePaths("")).toEqual([]);
    expect(parseWorktreePaths("HEAD abc\nbranch refs/heads/main\n")).toEqual(
      [],
    );
  });
});

// ─── classifySubcommand ─────────────────────────────────────────────────────

describe("classifySubcommand", () => {
  it.each([
    ["commit", "MUTATION"],
    ["merge", "MUTATION"],
    ["rebase", "MUTATION"],
    ["push", "MUTATION"],
    ["cherry-pick", "MUTATION"],
    ["revert", "MUTATION"],
    ["reset", "MUTATION"],
    ["amend", "MUTATION"],
  ] as [string, GitCommandCategory][])(
    "classifies %s as %s",
    (subcmd, expected) => {
      expect(classifySubcommand(subcmd)).toBe(expected);
    },
  );

  it.each([
    ["add", "STAGING"],
    ["rm", "STAGING"],
    ["mv", "STAGING"],
  ] as [string, GitCommandCategory][])(
    "classifies %s as %s",
    (subcmd, expected) => {
      expect(classifySubcommand(subcmd)).toBe(expected);
    },
  );

  it.each([
    ["log", "READ_ONLY"],
    ["diff", "READ_ONLY"],
    ["status", "READ_ONLY"],
    ["rev-parse", "READ_ONLY"],
    ["show", "READ_ONLY"],
    ["branch", "READ_ONLY"],
    ["remote", "READ_ONLY"],
    ["config", "READ_ONLY"],
    ["fetch", "READ_ONLY"], // fetch overrides to READ_ONLY
  ] as [string, GitCommandCategory][])(
    "classifies %s as %s",
    (subcmd, expected) => {
      expect(classifySubcommand(subcmd)).toBe(expected);
    },
  );

  it("classifies worktree as WORKTREE_MGMT", () => {
    expect(classifySubcommand("worktree")).toBe("WORKTREE_MGMT");
  });

  it("classifies unknown subcommands as UNKNOWN", () => {
    expect(classifySubcommand("foo-bar")).toBe("UNKNOWN");
  });

  it("classifies stash as RECOVERY", () => {
    expect(classifySubcommand("stash")).toBe("RECOVERY");
  });

  it("classifies checkout as RECOVERY", () => {
    expect(classifySubcommand("checkout")).toBe("RECOVERY");
  });

  it("classifies switch as RECOVERY", () => {
    expect(classifySubcommand("switch")).toBe("RECOVERY");
  });
});

// ─── classifyCommand ────────────────────────────────────────────────────────

describe("classifyCommand", () => {
  beforeEach(() => {
    resetAliasCache();
  });

  it("classifies simple commit command as MUTATION", async () => {
    const deps = createMockDeps();
    const result = await classifyCommand(
      "git commit -m 'test'",
      deps.execGit,
      "/project",
    );
    expect(result).toBe("MUTATION");
  });

  it("classifies read-only command as READ_ONLY", async () => {
    const deps = createMockDeps();
    const result = await classifyCommand(
      "git status",
      deps.execGit,
      "/project",
    );
    expect(result).toBe("READ_ONLY");
  });

  it("classifies compound command with mutation as MUTATION", async () => {
    const deps = createMockDeps();
    const result = await classifyCommand(
      "git add -A && git commit -m x",
      deps.execGit,
      "/project",
    );
    expect(result).toBe("MUTATION");
  });

  it("classifies non-git command as READ_ONLY", async () => {
    const deps = createMockDeps();
    const result = await classifyCommand(
      "echo hello",
      deps.execGit,
      "/project",
    );
    expect(result).toBe("READ_ONLY");
  });

  it("resolves aliases via git config", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockResolvedValue("alias.ci commit\nalias.st status\n"),
    });
    // "git ci" should resolve to "commit" → MUTATION
    const result = await classifyCommand(
      "git ci -m 'test'",
      deps.execGit,
      "/project",
    );
    expect(result).toBe("MUTATION");
  });
});

// ─── resolveWorkdir ─────────────────────────────────────────────────────────

describe("resolveWorkdir", () => {
  it("uses -C flag when present", () => {
    expect(resolveWorkdir("git -C /tmp status", undefined, "/project")).toBe(
      "/tmp",
    );
  });

  it("uses argsWorkdir when no -C flag", () => {
    expect(resolveWorkdir("git status", "/worktree", "/project")).toBe(
      "/worktree",
    );
  });

  it("falls back to project root", () => {
    expect(resolveWorkdir("git status", undefined, "/project")).toBe(
      "/project",
    );
  });

  it("-C flag takes priority over argsWorkdir", () => {
    expect(resolveWorkdir("git -C /tmp status", "/worktree", "/project")).toBe(
      "/tmp",
    );
  });
});

// ─── evaluateDecision ───────────────────────────────────────────────────────

describe("evaluateDecision", () => {
  it("allows READ_ONLY commands regardless of context", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: true });
    const result = evaluateDecision("READ_ONLY", ctx, "status");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows WORKTREE_MGMT commands regardless of context", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: true });
    const result = evaluateDecision("WORKTREE_MGMT", ctx, "worktree");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows mutations from ADV worktree", () => {
    const ctx = createMockContext({ isWorktree: true });
    const result = evaluateDecision("MUTATION", ctx, "commit");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows plain push from default branch (canonical archive path)", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("MUTATION", ctx, "push");
    expect(result.decision).toBe("ALLOW");
  });

  it("blocks --force push from default branch", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("MUTATION", ctx, "push", {
      force: true,
      forceWithLease: false,
      hasRefspec: false,
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("force");
  });

  it("blocks --force-with-lease push from default branch", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("MUTATION", ctx, "push", {
      force: false,
      forceWithLease: true,
      hasRefspec: false,
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("force-with-lease");
  });

  it("blocks refspec push from default branch", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("MUTATION", ctx, "push", {
      force: false,
      forceWithLease: false,
      hasRefspec: true,
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("refspec");
  });

  it("allows mutations from clean default branch (archive path)", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("MUTATION", ctx, "commit");
    expect(result.decision).toBe("ALLOW");
  });

  it("blocks mutations from dirty default branch", () => {
    const ctx = createMockContext({
      isDefaultBranch: true,
      isDirty: true,
      dirtyFiles: ["src/foo.ts", "README.md"],
    });
    const result = evaluateDecision("MUTATION", ctx, "commit");
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("dirty");
    expect(result.reason).toContain("2 uncommitted file(s)");
  });

  it("blocks staging from dirty default branch", () => {
    const ctx = createMockContext({
      isDefaultBranch: true,
      isDirty: true,
      dirtyFiles: ["src/bar.ts"],
    });
    const result = evaluateDecision("STAGING", ctx, "add");
    expect(result.decision).toBe("BLOCK");
  });

  it("blocks mutations on non-default non-worktree branch", () => {
    const ctx = createMockContext({
      isDefaultBranch: false,
      isWorktree: false,
      branch: "feature/test",
    });
    const result = evaluateDecision("MUTATION", ctx, "commit");
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("not a recognized ADV worktree");
  });

  it("allows staging from clean default branch", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("STAGING", ctx, "add");
    expect(result.decision).toBe("ALLOW");
  });

  // ── Recovery commands on dirty default branch ──

  it("allows stash on dirty default branch (recovery)", () => {
    const ctx = createMockContext({
      isDefaultBranch: true,
      isDirty: true,
      dirtyFiles: ["src/foo.ts"],
    });
    const result = evaluateDecision("RECOVERY", ctx, "stash");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows checkout on dirty default branch (recovery)", () => {
    const ctx = createMockContext({
      isDefaultBranch: true,
      isDirty: true,
      dirtyFiles: ["src/foo.ts"],
    });
    const result = evaluateDecision("RECOVERY", ctx, "checkout");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows switch on dirty default branch (recovery)", () => {
    const ctx = createMockContext({
      isDefaultBranch: true,
      isDirty: true,
      dirtyFiles: ["src/foo.ts"],
    });
    const result = evaluateDecision("RECOVERY", ctx, "switch");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows recovery commands on clean default branch", () => {
    const ctx = createMockContext({ isDefaultBranch: true, isDirty: false });
    const result = evaluateDecision("RECOVERY", ctx, "stash");
    expect(result.decision).toBe("ALLOW");
  });

  it("allows recovery commands in worktree", () => {
    const ctx = createMockContext({ isWorktree: true });
    const result = evaluateDecision("RECOVERY", ctx, "stash");
    expect(result.decision).toBe("ALLOW");
  });
});

// ─── checkBashCommand (integration) ─────────────────────────────────────────

describe("checkBashCommand", () => {
  beforeEach(() => {
    resetAliasCache();
  });

  it("allows non-git commands immediately", async () => {
    const deps = createMockDeps();
    const result = await checkBashCommand("echo hello", undefined, deps);
    expect(result.decision).toBe("ALLOW");
    expect(result.category).toBe("READ_ONLY");
  });

  it("allows git status without context checks", async () => {
    const deps = createMockDeps();
    const result = await checkBashCommand("git status", undefined, deps);
    expect(result.decision).toBe("ALLOW");
    expect(result.category).toBe("READ_ONLY");
    // Should NOT have called execGit for context resolution (status is read-only)
    // Alias resolution may call execGit once, but no git status/rev-parse calls
    const calls = (deps.execGit as ReturnType<typeof vi.fn>).mock.calls;
    const contextCalls = calls.filter((c: string[][]) => c[0][0] !== "config");
    expect(contextCalls).toHaveLength(0);
  });

  it("allows git log without context checks", async () => {
    const deps = createMockDeps();
    const result = await checkBashCommand("git log --oneline", undefined, deps);
    expect(result.decision).toBe("ALLOW");
  });

  it("allows git commit from ADV worktree", async () => {
    const deps = createMockDeps({
      getWorktreePaths: () => ["/worktree/change/test"],
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/worktree/change/test";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "change/test";
        if (args[0] === "status") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git commit -m 'test'",
      "/worktree/change/test",
      deps,
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("blocks git commit from dirty main checkout", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/project";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "M src/foo.ts\n?? bar.ts";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git commit -m 'test'",
      undefined,
      deps,
    );
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("dirty");
  });

  it("allows plain git push from clean default branch (canonical archive path)", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git push origin main",
      undefined,
      deps,
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("blocks --force push from default branch", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git push --force origin main",
      undefined,
      deps,
    );
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("force");
  });

  it("allows git commit from clean default branch (archive path)", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git commit -m 'archive bundle'",
      undefined,
      deps,
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("handles git worktree commands as allowed", async () => {
    const deps = createMockDeps();
    const result = await checkBashCommand(
      "git worktree list --porcelain",
      undefined,
      deps,
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.category).toBe("WORKTREE_MGMT");
  });

  it("resolves -C flag for workdir", async () => {
    const deps = createMockDeps({
      getWorktreePaths: () => ["/worktree/change/test"],
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/worktree/change/test";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "change/test";
        if (args[0] === "status") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git -C /worktree/change/test commit -m 'x'",
      undefined,
      deps,
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("blocks mutations on non-default non-worktree branch", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "feature/test";
        if (args[0] === "status") return "M foo.ts";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand("git commit -m 'x'", undefined, deps);
    expect(result.decision).toBe("BLOCK");
  });

  it("extracts push subcommand correctly with -C flag (force-push blocked from default)", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git -C /project push --force origin main",
      undefined,
      deps,
    );
    expect(result.decision).toBe("BLOCK");
    expect(result.subcommand).toBe("push");
    expect(result.reason).toContain("force");
  });

  it("handles compound commands with mutation", async () => {
    const deps = createMockDeps({
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "main";
        if (args[0] === "status") return "M foo.ts";
        if (args[0] === "config") return "";
        return "";
      }),
    });
    const result = await checkBashCommand(
      "git add -A && git commit -m x",
      undefined,
      deps,
    );
    expect(result.decision).toBe("BLOCK");
  });

  // AC10: Multi-worktree independent commit
  it("allows independent commits from different worktrees", async () => {
    // Worktree A
    const depsA = createMockDeps({
      getWorktreePaths: () => ["/wt/a", "/wt/b"],
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/wt/a";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "change/feature-a";
        if (args[0] === "status") return "";
        return "";
      }),
    });
    const resultA = await checkBashCommand(
      "git commit -m 'feature A'",
      "/wt/a",
      depsA,
    );
    expect(resultA.decision).toBe("ALLOW");

    // Worktree B
    const depsB = createMockDeps({
      getWorktreePaths: () => ["/wt/a", "/wt/b"],
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/wt/b";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "change/feature-b";
        if (args[0] === "status") return "";
        return "";
      }),
    });
    const resultB = await checkBashCommand(
      "git commit -m 'feature B'",
      "/wt/b",
      depsB,
    );
    expect(resultB.decision).toBe("ALLOW");
  });

  // Edge cases
  it("handles empty command string", async () => {
    const deps = createMockDeps();
    const result = await checkBashCommand("", undefined, deps);
    expect(result.decision).toBe("ALLOW");
  });

  it("handles git command in backticks (not a direct invocation)", async () => {
    const deps = createMockDeps();
    // This has "git" in the string but not as a direct command invocation
    const result = await checkBashCommand(
      "echo $(git status)",
      undefined,
      deps,
    );
    // The regex should still detect "git status" as a subcommand in the segment
    expect(result.decision).toBe("ALLOW");
    expect(result.category).toBe("READ_ONLY");
  });
});

// ─── stripHeredocs ─────────────────────────────────────────────────────────

describe("stripHeredocs", () => {
  it("strips heredoc content between quoted delimiters", () => {
    const input = `cat <<'EOF'\ngit commit -m "x"\nEOF`;
    const result = stripHeredocs(input);
    expect(result).not.toContain('git commit -m "x"');
    expect(result).toContain("EOF");
  });

  it("strips heredoc content between unquoted delimiters", () => {
    const input = `cat <<DELIM\ngit add -A && git commit -m "y"\nDELIM`;
    const result = stripHeredocs(input);
    expect(result).not.toContain("git add");
    expect(result).not.toContain("git commit");
  });

  it("strips heredoc content with dash prefix", () => {
    const input = `cat <<-MARKER\n  git push\nMARKER`;
    const result = stripHeredocs(input);
    expect(result).not.toContain("git push");
  });

  it("preserves commands outside heredocs", () => {
    const input = `git status\ncat <<'EOF'\ngit commit -m "x"\nEOF`;
    const result = stripHeredocs(input);
    expect(result).toContain("git status");
    expect(result).not.toContain('git commit -m "x"');
  });

  it("returns input unchanged when no heredocs present", () => {
    const input = "git status && git log";
    expect(stripHeredocs(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(stripHeredocs("")).toBe("");
  });

  it("integration: heredoc with git commit inside on dirty trunk does not block", async () => {
    const deps = createMockDeps({
      getWorktreePaths: () => [],
      execGit: vi.fn().mockImplementation(async (args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
          return "/project";
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref")
          return "trunk";
        if (args[0] === "status") return " M src/foo.ts";
        return "";
      }),
    });
    const command = `cat <<'EOF'\ngit commit -m "x"\nEOF`;
    const result = await checkBashCommand(command, undefined, deps);
    expect(result.decision).toBe("ALLOW");
  });
});
