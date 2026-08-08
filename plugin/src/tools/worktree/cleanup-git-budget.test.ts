/**
 * AC6 — cleanup-path git subprocesses must be bounded strictly below the
 * 8000ms worktree tool budget (rq-worktreeBoundedCleanup02: "Internal
 * operations ... must each be bounded below the tool budget").
 *
 * Before this change the two local `git()` helpers on the cleanup discovery
 * path were bounded ABOVE the ceiling: `worktree/index.ts` at 30000ms and
 * `worktree/census.ts` at 10000ms. Only `utils/git.ts execGit` (5000ms) was
 * compliant. A single slow `git rev-parse` could therefore consume 30s inside
 * an 8s budget.
 *
 * C6 guard: the same helpers are shared with non-cleanup callers (standalone
 * delete, triage, archive). Tightening must be opt-in via an explicit
 * `gitTimeoutMs`, never a changed default.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gitAsyncFn = vi.hoisted(() => vi.fn());
const gitCbFn = vi.hoisted(() => vi.fn());

vi.mock("../../utils/git-binary", () => ({
  execFileGitAsync: gitAsyncFn,
  execFileGitCb: gitCbFn,
}));

import { scanGitWorkspaceFacts } from "./census";
import { advWorktreeCleanup } from "./index";

/** Collect the `timeout` option from every execFileGitAsync invocation. */
function asyncTimeouts(): Array<number | undefined> {
  return gitAsyncFn.mock.calls.map(
    (call) => (call[1] as { timeout?: number } | undefined)?.timeout,
  );
}

describe("AC6: cleanup discovery git subprocesses are bounded below the tool budget", () => {
  beforeEach(() => {
    gitAsyncFn.mockReset();
    gitCbFn.mockReset();
    gitAsyncFn.mockResolvedValue({ stdout: "", stderr: "" });
  });

  describe("census scanGitWorkspaceFacts", () => {
    it("threads an explicit gitTimeoutMs to every git invocation", async () => {
      await scanGitWorkspaceFacts("/repo", "trunk", 2_000);

      expect(gitAsyncFn).toHaveBeenCalled();
      const timeouts = asyncTimeouts();
      expect(timeouts.length).toBeGreaterThan(0);
      for (const timeout of timeouts) {
        expect(timeout).toBe(2_000);
      }
    });

    it("bounds every git invocation strictly below the 8000ms tool budget when the cleanup budget is applied", async () => {
      await scanGitWorkspaceFacts("/repo", "trunk", 2_000);

      for (const timeout of asyncTimeouts()) {
        expect(timeout).toBeDefined();
        expect(timeout as number).toBeLessThan(8_000);
      }
    });

    it("threads the budget to the per-worktree status scan, not just the parallel trio", async () => {
      // for-each-ref, branch --merged, worktree list --porcelain, then a
      // per-worktree `status --porcelain` for each change/* worktree.
      gitAsyncFn.mockImplementation(async (args: readonly string[]) => {
        if (args[0] === "worktree") {
          return {
            stdout:
              "worktree /wt/change-a\nHEAD abc123\nbranch refs/heads/change/a\n\n",
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      });

      await scanGitWorkspaceFacts("/repo", "trunk", 2_000);

      const statusCalls = gitAsyncFn.mock.calls.filter(
        (call) => (call[0] as readonly string[])[0] === "status",
      );
      expect(statusCalls.length).toBeGreaterThan(0);
      for (const call of statusCalls) {
        expect((call[1] as { timeout?: number }).timeout).toBe(2_000);
      }
    });

    // C6 regression guard — non-cleanup callers must keep the current default.
    it("preserves the 10000ms default when no gitTimeoutMs is supplied", async () => {
      await scanGitWorkspaceFacts("/repo", "trunk");

      expect(gitAsyncFn).toHaveBeenCalled();
      for (const timeout of asyncTimeouts()) {
        expect(timeout).toBe(10_000);
      }
    });
  });

  // The worktree/index.ts helper is the OTHER half of AC6. Cleanup discovery
  // must use the shared operation budget rather than a standalone 30000ms
  // default, or a hung PR probe can outlive the tool response.
  describe("worktree/index.ts git helper", () => {
    /** Drive the discovery path far enough to reach the local git() helper. */
    async function runDiscovery(gitTimeoutMs?: number) {
      const log = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      // scanGitWorkspaceFacts reports one change/* worktree; its owning change
      // resolves to a non-terminal status, which routes discovery into
      // getPrMergedBranchIntegration → the local git() helper (rev-parse).
      gitAsyncFn.mockImplementation(async (args: readonly string[]) => {
        if (args[0] === "worktree") {
          return {
            stdout:
              "worktree /wt/change-a\nHEAD abc123\nbranch refs/heads/change/a\n\n",
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      });
      gitCbFn.mockImplementation(
        (
          _args: readonly string[],
          _opts: unknown,
          cb: (e: unknown, o: string, s: string) => void,
        ) => cb(null, "", ""),
      );

      await advWorktreeCleanup("worktree_cleanup", {
        projectRoot: "/repo",
        database: {} as never,
        log: log as never,
        store: {
          changes: { get: async () => ({ success: true, data: {} }) },
        } as never,
        discover: true,
        ...(gitTimeoutMs !== undefined && { gitTimeoutMs }),
      }).catch(() => undefined);
    }

    /**
     * Timeouts for the LOCAL `git()` helper only.
     *
     * `utils/git.ts execGit` shares the same `execFileGitCb` boundary, and
     * `getDefaultBranch` runs on this path at its own 5000ms bound, so the raw
     * call list mixes two helpers. Select by command to assert on the one this
     * change actually threads.
     */
    function localHelperTimeouts(): Array<number | undefined> {
      const localCommands = new Set(["rev-parse", "fetch", "merge-base"]);
      return gitCbFn.mock.calls
        .filter((call) => localCommands.has((call[0] as string[])[0]))
        .map((call) => (call[1] as { timeout?: number } | undefined)?.timeout);
    }

    it("threads an explicit gitTimeoutMs to discovery-path git invocations", async () => {
      await runDiscovery(2_000);

      const timeouts = localHelperTimeouts();
      expect(timeouts.length).toBeGreaterThan(0);
      for (const timeout of timeouts) {
        expect(timeout).toBe(2_000);
        expect(timeout as number).toBeLessThan(8_000);
      }
    });

    it("uses the remaining operation budget when no gitTimeoutMs is supplied", async () => {
      await runDiscovery();

      const timeouts = localHelperTimeouts();
      expect(timeouts.length).toBeGreaterThan(0);
      for (const timeout of timeouts) {
        expect(timeout).toBeGreaterThan(0);
        expect(timeout as number).toBeLessThan(8_000);
      }
    });
  });

  // AC4 production emission. The tool-wrapper tests mock advWorktreeCleanup and
  // fire onStageEnter from their own mock, so they cannot catch a regression
  // that removes the callback from the real implementation. This can.
  describe("advWorktreeCleanup stage emission", () => {
    const log = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };

    it("emits drain, and emits discovery only when discovery actually runs", async () => {
      const withDiscovery: string[] = [];
      await advWorktreeCleanup("worktree_cleanup", {
        projectRoot: "/repo",
        database: {} as never,
        log: log as never,
        discover: true,
        onStageEnter: (stage) => withDiscovery.push(stage),
      }).catch(() => undefined);

      expect(withDiscovery).toContain("drain");

      const skipped: string[] = [];
      await advWorktreeCleanup("worktree_cleanup", {
        projectRoot: "/repo",
        database: {} as never,
        log: log as never,
        discover: false,
        onStageEnter: (stage) => skipped.push(stage),
      }).catch(() => undefined);

      expect(skipped).not.toContain("discovery");
      expect(skipped).toContain("drain");
    });
  });
});
