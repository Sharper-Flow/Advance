# Executive Summary

## Outcome

The local deployment script has reported `ADV CLI: ❌ 1 issue(s)` on every run since July 28, regardless of whether anything was wrong. This change fixes that permanently-red validator so it passes on a healthy install and can still catch a real regression.

## Why It Matters

A validator that always fails carries no signal. It trains operators to ignore the exact line where a genuine CLI regression would appear — and it prints misleading remediation advice ("repair PATH or rerun --fix") that cannot resolve anything, because nothing is wrong.

## Verdict

APPROVED

## What Was Built

1. **The liveness check now works.** A whole-document substring grep that matched an unrelated nested field was replaced with a root-scoped structural assertion. The check passes on a healthy install and still rejects a stale disk-only response.
2. **Failures now explain themselves.** When the check fails, it reports the observed values (source, schema_version) rather than a fixed expectation string, so the next divergence is diagnosable in one run.
3. **A regression guard prevents recurrence.** A new test drives the real shell function against all three payload shapes, including the exact one that defeated the original check. A negative guard in the existing content-pin test prevents the old heuristic from returning.

## What Was Verified

- Verdict: APPROVED with 1 finding (issue, fixed during review — a broken negative-guard regex that did not actually match the old pattern)
- Tests: 10/10 bun tests, 72/72 content-pin tests, 8,496 unit tests pass (7 pre-existing base failures, none caused by this change)
- Decisive end-to-end proof: old function and new function run against the real installed CLI back-to-back — old FAIL, new PASS, same binary, same moment
- Contract matrix: 14 of 14 required rows pass or respected, 0 failing

## Remaining Concerns

- **Non-blocking:** seven test assertions fail on the main branch itself (proven base-attributable by an independent verifier). Owned by `fix/trunk-ci-redness`.
- **No migration, no data change, no user-visible behavior change.** This is a deploy-time validator fix; it affects only what `scripts/deploy-local.sh` prints after a local deployment.

## Supporting Evidence

Tasks tk-709fb9d6317c, tk-3b34bd0868e8, tk-140f9d17e12b. Independent adv-verifier gate run (caught the stale content-pin regression). Contract review matrix (14 rows). End-to-end real-CLI proof (old function FAIL, new function PASS). RCA with verified source anchors and timeline in problem-statement.md.

## Consequence Context

| Category | Status | Evidence |
|---|---|---|
| Delivered value | delivered | Deploy validator passes on healthy install; diagnostic failure output added. Matrix 14/14. |
| Enabling-only dependency | none | Self-contained. |
| Ops readiness | ready | bash -n exit 0; check exit 0; no migration, config, or runtime toggle. |
| Migration / data impact | n/a | Shell validator only; no data, no migration. |
| Frontend / preview | not_applicable | Deploy script; no browser-visible surface. |
| Collision / release risk | low | No file contested by other active changes. |
| Open follow-ups | 1 non-blocking | Trunk baseline redness owned by fix/trunk-ci-redness. |
| Next action | ready | Acceptance approval proceeds inline to /adv-harden. |
