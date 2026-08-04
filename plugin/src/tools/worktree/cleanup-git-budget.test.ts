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
});
