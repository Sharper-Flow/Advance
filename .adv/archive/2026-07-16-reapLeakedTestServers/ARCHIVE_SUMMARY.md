# Archive: Reap leaked test servers

**Change ID:** reapLeakedTestServers
**Archived:** 2026-07-16T18:32:11.321Z
**Created:** 2026-07-15T21:27:16.034Z

## Tasks Completed

- ✅ Helper-owned test-env constructors + docstring correction
  > Task checkpoint completed
- ✅ Conservative stale-only orphan reaper in bin/oc-test
  > Task checkpoint completed
- ✅ check-test-isolation guard forbidding raw TestWorkflowEnvironment.create*
  > Task checkpoint completed
- ✅ Signal-aware teardown regression tests
  > Task checkpoint completed
- ✅ Residue-free proof for the reaper
  > Task checkpoint completed
- ✅ Prove real Temporal test-server failure cleanup
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** In plugin/, `pnpm test -- <file>` did NOT apply the positional filter — the full suite ran (timed out at 120s with unrelated worker/worktree noise). `pnpm exec vitest list <file>` confirmed the filter itself is valid; use `pnpm exec vitest run <file>` for targeted runs. AGENTS.md's `pnpm test -- src/tools/foo.test.ts` guidance is unreliable in this checkout.
- **[gotcha]** Host environment gotcha: `bun test bin/adv.test.ts` test "adv slop-scan dispatcher > --json exits 1 ... when required detectors are unavailable" fails deterministically on this host (exit 143 after its hardcoded 5000ms timeout) because `sg` (ast-grep) IS installed at /usr/bin/sg — the test expects a degraded no-detector environment but never scrubs PATH, so the real scan runs and exceeds 5s. Reproduces on clean trunk; unrelated to any bin/oc-test work. Also: macOS ps(1) supports `etime` but NOT `etimes` (procps-only) — verified via Apple man page; use etime + a [[dd-]hh:]mm:ss parser for portable elapsed-seconds.
- **[gotcha]** Host coreutils is a multicall binary that dispatches on argv[0]: renamed copies or symlinks of `sleep` fail with `coreutils: unknown program '<name>'`. For process-identity tests needing a fake argv[0] (e.g. temporal-test-server-sdk-typescript-* doubles), use bash `exec -a "$0" bash -c '<loop>'` doubles instead — bash ignores argv[0] and stays TERM-able/KILL-able.
- **[pattern]** Process-age from /proc/<pid>/stat starttime computed as integer seconds (now - btime - start/HZ) truncates and makes threshold comparisons a coin flip at the boundary (observed flake: fresh peer reaped at age==MIN_AGE, nondeterministically). Compute age with awk float precision and compare with awk, and keep test age margins >=1s on both sides of the threshold.
