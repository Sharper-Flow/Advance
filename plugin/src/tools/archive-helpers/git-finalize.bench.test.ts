/**
 * Warn-only Phase 9 archive bench (rq-optimizePhase9GitCalls SC1/SC2/SC3/SC4).
 *
 * Wires per UD1 (user decision): committed but skipped by default. Opt-in via
 * `BENCH=1` env var. Never fails the build — emits console.warn on threshold
 * exceedance.
 *
 * SC1 (≤1 network fetch on no-op path) and SC2 (≤12 git subprocess calls on
 * no-op path) are asserted as soft checks inside the bench run. SC3 (≥30%
 * wall-clock reduction) requires comparison against pre-change HEAD — see
 * "Calibration" section below.
 *
 * Usage:
 *   BENCH=1 npx vitest run src/tools/archive-helpers/git-finalize.bench.test.ts
 *
 * Calibration procedure for SC3:
 *   1. git checkout trunk (pre-change)
 *   2. BENCH=1 npx vitest run src/tools/archive-helpers/git-finalize.bench.test.ts
 *      (file exists on trunk only after this change lands; for true baseline,
 *       copy this bench file to a pre-change worktree manually)
 *   3. Record pre-change ms
 *   4. git checkout change/optimizeArchivePhase9GitCalls
 *   5. Re-run; record post-change ms
 *   6. Verify (pre - post) / pre >= 0.30
 *   7. Update NO_OP_BASELINE_MS below to post-change p50 + 20% buffer
 */

import { describe, it } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { spawnSync } from "child_process";
import { createTempDir } from "../../__tests__/setup";
import { finalizeRelease } from "./git-finalize";

/**
 * Post-calibration baseline in milliseconds. Until real calibration runs,
 * this is a placeholder set conservatively high so the bench warns only on
 * extreme regressions. Replace after first measurement on reference hardware.
 *
 * Pre-change baseline (estimate from proposal): 8000-20000ms
 * Post-change target:                          ≤5600ms (≥30% reduction)
 */
const NO_OP_BASELINE_MS = 5600;

/** Soft threshold for SC2: max git subprocess calls on no-op path. */
const SC2_MAX_GIT_CALLS = 12;

/** Soft threshold for SC1: max fetch invocations on no-op path. */
const SC1_MAX_FETCHES = 1;

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

async function initRepo(root: string, defaultBranch = "trunk"): Promise<void> {
  git(root, ["init", "-q", "-b", defaultBranch]);
  git(root, ["config", "user.email", "adv-test@example.invalid"]);
  git(root, ["config", "user.name", "ADV Test"]);
  await writeFile(join(root, "README.md"), "initial\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial"]);
}

const BENCH_ENABLED = process.env.BENCH === "1";

describe.skipIf(!BENCH_ENABLED)(
  "Phase 9 no-op archive bench (rq-optimizePhase9GitCalls SC1-4)",
  () => {
    it("measures finalizeRelease on no-op fixture; warns on SC regressions", async () => {
      const tempRoot = await createTempDir("adv-finalize-bench-");
      try {
        const main = join(tempRoot, "main");
        const worktree = join(tempRoot, "wt");
        await mkdir(main);
        await initRepo(main);
        // No remote configured → route = no_remote; no real push happens.
        git(main, ["worktree", "add", "-b", "change/example", worktree]);
        // Worktree has one artifact to commit (otherwise commitArchiveArtifacts
        // is a no-op which doesn't exercise the same code paths).
        await writeFile(join(worktree, "bundle.txt"), "archive bundle\n");
        git(worktree, ["add", "bundle.txt"]);

        let fetchCount = 0;
        let remoteGetUrlCount = 0;
        let totalGitCalls = 0;

        const recordingRunGit = (
          cwd: string,
          args: string[],
          timeoutMs?: number,
        ) => {
          totalGitCalls++;
          if (args[0] === "fetch") fetchCount++;
          if (args[0] === "remote" && args[1] === "get-url") {
            remoteGetUrlCount++;
          }
          return spawnSync("git", args, {
            cwd,
            encoding: "utf8",
            timeout: timeoutMs,
          }) as any;
        };

        const startMs = performance.now();
        const result = await finalizeRelease(
          {
            changeId: "example",
            workdir: worktree,
            archiveMode: "direct",
            autoPush: false,
            artifactPaths: ["bundle.txt"],
          },
          { runGit: recordingRunGit },
        );
        const elapsedMs = performance.now() - startMs;

        // Surface measurements (always informational, never fail the bench).
        const lines = [
          `[bench] Phase 9 no-op archive: ${elapsedMs.toFixed(1)}ms`,
          `[bench]   total git calls:        ${totalGitCalls}`,
          `[bench]   fetch invocations:      ${fetchCount}`,
          `[bench]   remote get-url calls:   ${remoteGetUrlCount}`,
          `[bench]   outcome.status:         ${result.status}`,
          `[bench]   outcome.route:          ${result.route ?? "(none)"}`,
          `[bench]   baseline (NO_OP_BASELINE_MS): ${NO_OP_BASELINE_MS}ms`,
        ];

        // SC1: ≤1 fetch on no-op path
        if (fetchCount > SC1_MAX_FETCHES) {
          lines.push(
            `[bench] WARN SC1: expected ≤${SC1_MAX_FETCHES} fetch, got ${fetchCount}`,
          );
        } else {
          lines.push(`[bench] OK   SC1: fetch count within budget`);
        }

        // SC2: ≤12 git subprocess calls
        if (totalGitCalls > SC2_MAX_GIT_CALLS) {
          lines.push(
            `[bench] WARN SC2: expected ≤${SC2_MAX_GIT_CALLS} git calls, got ${totalGitCalls}`,
          );
        } else {
          lines.push(`[bench] OK   SC2: git call count within budget`);
        }

        // SC3: wall-clock vs baseline (warn-only)
        if (elapsedMs > NO_OP_BASELINE_MS) {
          const overshoot = elapsedMs - NO_OP_BASELINE_MS;
          const pct = ((overshoot / NO_OP_BASELINE_MS) * 100).toFixed(1);
          lines.push(
            `[bench] WARN SC3: ${overshoot.toFixed(1)}ms (${pct}%) over baseline`,
          );
        } else {
          const reduction = NO_OP_BASELINE_MS - elapsedMs;
          const pct = ((reduction / NO_OP_BASELINE_MS) * 100).toFixed(1);
          lines.push(
            `[bench] OK   SC3: ${reduction.toFixed(1)}ms (${pct}%) under baseline`,
          );
        }

        // SC4 (existing tests pass) is verified by the test suite as a whole,
        // not by this bench. Recorded here for completeness.
        lines.push(
          `[bench] SC4: verified separately by full git-finalize.test.ts run`,
        );

        console.warn(lines.join("\n"));

        // Soft assertion (does not throw): bench always reports, never fails.
        // The fixture itself should produce a "shipped" outcome.
        if (result.status !== "shipped") {
          console.warn(
            `[bench] UNEXPECTED status: ${result.status} (expected shipped)`,
          );
        }
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  },
);
