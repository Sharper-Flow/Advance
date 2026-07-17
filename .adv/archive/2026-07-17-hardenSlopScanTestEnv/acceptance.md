# Acceptance

Reviewed at: 2026-07-17T00:55:57.830Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Missing-detector behavior no longer depends on ambient host `PATH`. | pass | Missing-detector behavior forced via child-only absolute empty temp dir PATH; env-independent on detector-present host (this machine has /usr/bin/sg) — reviewer READY. |
| SC2 | success_criterion | Degraded CLI result distinguishes unavailable detectors from command failures. | pass | Degraded report marks eslint/knip/ast-grep/jscpd unavailable (distinct from failed); DONT3 honored by not faking pnpm. |
| SC3 | success_criterion | Test completes within the existing per-test timeout. | pass | Degraded test completes in ~538ms, well under the 5,000ms per-test timeout (engineer verification). |
| AC1 | acceptance_criterion | The CLI test launches ADV via `process.execPath`, not a bare runtime command. | pass | CLI test launches via process.execPath; reviewer additionally fixed a remaining bare `bun` launch in bin/adv.test.ts — bun test bin/adv.test.ts 16 pass then 58 pass combined with slop-scan suite. |
| AC2 | acceptance_criterion | The missing-detector test passes a child-only `PATH` containing an absolute empty temporary directory and does not mutate parent `process.env`. | pass | Child-only PATH with absolute empty temp dir passed to Bun.spawn; parent process.env unmutated (case-insensitive PATH normalization; tests pass). |
| AC3 | acceptance_criterion | In that environment, `slop-scan src --json --no-color` exits exactly 1 and output parses as `slop_scan_report.v1`. | pass | slop-scan src --json --no-color exits exactly 1 and parses as slop_scan_report.v1 via validateSlopScanReport (bun test bin/adv.test.ts pass). |
| AC4 | acceptance_criterion | The parsed report has failure code `SLOP_SCAN_DEGRADED` and marks eslint, knip, ast-grep, and jscpd unavailable. | pass | Parsed report failure code SLOP_SCAN_DEGRADED with eslint, knip, ast-grep, jscpd each asserted unavailable (bun test pass). |
| AC5 | acceptance_criterion | The degraded dispatcher test completes within 5,000 ms without each detector reaching its 10,000 ms execution timeout. | pass | Degraded dispatcher test completes ~538ms < 5,000ms; no detector reaches its 10,000ms execution timeout. |
| AC6 | acceptance_criterion | Existing success, runner, scan, dispatch, and CLI coverage remains green. | pass | Existing coverage green: bun test bin/adv.test.ts + bin/lib/slop-scan/ = 58 pass, 0 fail; pnpm run check pass (reviewer verification). |
| C1 | constraint | Environment isolation is scoped to the spawned child process. | respected | Environment isolation scoped to spawned child via runAdv options; pnpm run check green. |
| C2 | constraint | Use an absolute empty directory rather than empty `PATH` semantics. | respected | Absolute empty temporary directory used as PATH value, not empty-string PATH semantics. |
| C3 | constraint | Preserve portability and parallel-test safety. | respected | Fixture-local unique temp dir + cleanup in finally; portable case-insensitive Path/PATH handling; parallel-test safe. |
| DONT1 | avoidance | Do not mutate global `process.env`. | respected | Global process.env never mutated; env passed only to child spawn (reviewer READY, 0 findings). |
| DONT2 | avoidance | Do not rename dependencies or rely on absent host tools. | respected | No dependency renames; no reliance on absent host tools — detector absence is fixture-forced. |
| DONT3 | avoidance | Do not fake a `pnpm` executable, which classifies as failed rather than unavailable. | respected | No fake pnpm executable introduced; unavailable-vs-failed classification preserved. |
| OOS1 | out_of_scope | Adding detector-present integration coverage. | not_applicable | Detector-present integration coverage not added; out of scope. |
| OOS2 | out_of_scope | Changing detector runtime timeout defaults. | not_applicable | Detector runtime timeout defaults unchanged; out of scope. |

