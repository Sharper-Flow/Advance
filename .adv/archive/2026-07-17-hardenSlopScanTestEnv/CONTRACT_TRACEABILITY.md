# Contract Traceability

**Change ID:** hardenSlopScanTestEnv
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-17T00:55:57.830Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Missing-detector behavior forced via child-only absolute empty temp dir PATH; env-independent on detector-present host (this machine has /usr/bin/sg) — reviewer READY. |
| SC2 | success_criterion | pass | review | Degraded report marks eslint/knip/ast-grep/jscpd unavailable (distinct from failed); DONT3 honored by not faking pnpm. |
| SC3 | success_criterion | pass | review | Degraded test completes in ~538ms, well under the 5,000ms per-test timeout (engineer verification). |
| AC1 | acceptance_criterion | pass | test | CLI test launches via process.execPath; reviewer additionally fixed a remaining bare `bun` launch in bin/adv.test.ts — bun test bin/adv.test.ts 16 pass then 58 pass combined with slop-scan suite. |
| AC2 | acceptance_criterion | pass | test | Child-only PATH with absolute empty temp dir passed to Bun.spawn; parent process.env unmutated (case-insensitive PATH normalization; tests pass). |
| AC3 | acceptance_criterion | pass | test | slop-scan src --json --no-color exits exactly 1 and parses as slop_scan_report.v1 via validateSlopScanReport (bun test bin/adv.test.ts pass). |
| AC4 | acceptance_criterion | pass | test | Parsed report failure code SLOP_SCAN_DEGRADED with eslint, knip, ast-grep, jscpd each asserted unavailable (bun test pass). |
| AC5 | acceptance_criterion | pass | test | Degraded dispatcher test completes ~538ms < 5,000ms; no detector reaches its 10,000ms execution timeout. |
| AC6 | acceptance_criterion | pass | test | Existing coverage green: bun test bin/adv.test.ts + bin/lib/slop-scan/ = 58 pass, 0 fail; pnpm run check pass (reviewer verification). |
| C1 | constraint | respected | static_check | Environment isolation scoped to spawned child via runAdv options; pnpm run check green. |
| C2 | constraint | respected | static_check | Absolute empty temporary directory used as PATH value, not empty-string PATH semantics. |
| C3 | constraint | respected | static_check | Fixture-local unique temp dir + cleanup in finally; portable case-insensitive Path/PATH handling; parallel-test safe. |
| DONT1 | avoidance | respected | review | Global process.env never mutated; env passed only to child spawn (reviewer READY, 0 findings). |
| DONT2 | avoidance | respected | review | No dependency renames; no reliance on absent host tools — detector absence is fixture-forced. |
| DONT3 | avoidance | respected | review | No fake pnpm executable introduced; unavailable-vs-failed classification preserved. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Detector-present integration coverage not added; out of scope. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Detector runtime timeout defaults unchanged; out of scope. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-872d28225869 | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
