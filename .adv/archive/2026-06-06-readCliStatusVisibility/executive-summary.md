# Executive Summary

## Outcome
`adv status` now reads active-change rows from Temporal Visibility search attributes — worker-free. Projects with no open ADV session show live rows via `warp-project-launcher`. Fail-closed semantics preserved.

## Verdict
APPROVED

## What Was Built
1. `bin/lib/live-status.ts` — new Visibility-summary read path: `summariesFromVisibility`, `buildSummaryFromSearchAttributes`, `loadLiveSummaries`, `buildLiveStatusPayloadFromSummaries`. No per-change `getState` workflow queries.
2. `bin/adv` — `runStatus` uses `loadLiveSummaries` instead of `loadLiveStatus`/`listLiveChangeStates`.
3. `bin/lib/live-status.test.ts` — 12 tests covering search-attribute decoding, gate synthesis, terminal exclusion, fail-closed, sparse-attr fallback.
4. `plugin/src/cli-bridge-contract.test.ts` — updated contract test asserting Visibility read path (no getState query).
5. `.adv/specs/advance-meta/spec.json` + `docs/specs/advance-meta.md` — `rq-visibilityStatusRead01` spec law.

## What Was Verified
- Verdict: contract review matrix 17/17 passed/respected; 0 failures.
- Tests: 12 bun tests pass (live-status); 262 plugin test files pass (3545 tests); `pnpm run check` clean.
- No workflow/worker/dist changes required — CLI read path only.

## Remaining Concerns
None.