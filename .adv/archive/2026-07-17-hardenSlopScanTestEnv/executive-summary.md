# Executive Summary

## Outcome

The slop-scan CLI degraded-path test is now hermetic: it deterministically exercises the "required detectors unavailable" branch on any host, whether or not detector tooling (ast-grep/eslint/knip/jscpd) is installed.

## Value

Kills a real environment-dependent test failure: the test passed in CI (detectors absent) but failed on developer machines with `/usr/bin/sg` installed. One less source of "full suite red for reasons unrelated to my change".

## Delivered

- CLI test launches ADV via `process.execPath` (reviewer also fixed one remaining bare `bun` launch)
- Child-only PATH pointing at an absolute empty temp directory, case-insensitively normalized (Windows `Path`/`PATH` safe); parent `process.env` never mutated
- Report schema-validated (`slop_scan_report.v1` via `validateSlopScanReport`) before content assertions; exit code exactly 1; `SLOP_SCAN_DEGRADED` with all four detectors asserted unavailable
- Fixture-local temp dir + cleanup in `finally`; parallel-test safe

## Verification

- Independent reviewer verdict: READY, 0 findings
- `bun test bin/adv.test.ts` + `bin/lib/slop-scan/`: 58 pass, 0 fail; `pnpm run check` green
- Degraded test completes ~538ms (was timing out at 5s before fix)
- Contract review matrix: 17/17 rows passing/respected/not-applicable

## Risks / follow-ups

- None blocking. Detector-present integration coverage intentionally out of scope (OOS1).