# Executive Summary

## Outcome
Archive conflict validation now decides only from complete active authority, so terminal-history volume and poisoned terminal workflows cannot delay a clean active no-conflict conclusion. Terminal history remains available through a separate bounded read path.

## Delivered value
- Active conflict authority retains the fixed 8-second aggregate deadline, fails closed when active evidence is incomplete, and does not read archive bundles or treat cache state as authority.
- New archive bundles write schema-validated `summary.v1.json` beside `change.json` in both archive destinations. Generated files cannot be overwritten by copied sibling files.
- Archived/closed history renders valid summaries without full Change hydration; invalid summaries use one legacy `change.json` fallback, then return typed omission if both forms fail.
- Explicit terminal history has its own fixed 20-second deadline and returns resolved rows plus typed source warnings and bounded omitted IDs after degradation.
- Canonical-ID deduplication and terminal dominance over stale active shadows are preserved.
- Deterministic benchmark coverage exercises 50 poisoned active plus 50 terminal records across concurrency 1/2/4/8, 30 cold and 30 warm runs each; it asserts zero omissions, maximum authority completion at or below 8 seconds, and nearest-rank p95 at or below 6.4 seconds.

## Verification
- `bin/oc-test full` passed through `adv_run_test` (run `tr_mrqmm4j8_43abb048`).
- Focused authority/benchmark tests passed: 13 tests.
- Scoped acceptance suite passed: 55 tests.
- `pnpm run check` passed.
- Independent acceptance review verdict: `READY`; remediation checkpoint `7c311527` keeps archive history out of authority.

## Risks and follow-ups
- Benchmark uses fake timers for deterministic CI coverage; structural deadline and fail-closed tests remain the correctness authority.
- Branch-local spec delta materialization is archive-owned and will occur during archive.
