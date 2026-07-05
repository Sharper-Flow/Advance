# Contract Traceability

**Change ID:** makeDegradedSlopScanFailFast
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T01:24:36.125Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `bun test bin/adv.test.ts --test-name-pattern "adv slop-scan dispatcher"` passed after RED failure; JSON CLI case now exits 1 for unavailable required detector coverage. Final targeted Bun suite passed 31 tests. |
| AC2 | acceptance_criterion | pass | test | `bin/adv.test.ts` JSON degraded case asserts parseable `slop_scan_report.v1`, `failure.code === "SLOP_SCAN_DEGRADED"`, and non-empty important `failure.failedDetectors`. |
| AC3 | acceptance_criterion | pass | test | `bun test bin/lib/slop-scan/render.test.ts` passed; failure report test asserts `SLOP SCAN FAILED`, failure message, detector names/states/reasons, coverage visibility, and no `[OK] No slop detected.`. |
| AC4 | acceptance_criterion | pass | test | Static stale fallback scan passed across `.adv/specs/slop-scan/spec.json`, `.opencode/command/adv-slop-scan.md`, and `docs/specs/slop-scan.md`; no `[DEGRADED: AST tool unavailable]`, `[DEGRADED: AST timeout]`, `brace/indent counter`, or `Degraded fallback findings default` remains. |
| AC5 | acceptance_criterion | pass | test | `.opencode/command/adv-slop-scan.md` now states required coverage failure stops before Phase 2 and skips metadata success writes when `SLOP_SCAN_DEGRADED`. |
| AC6 | acceptance_criterion | pass | test | `bun test bin/lib/slop-scan/schema.test.ts bin/lib/slop-scan/render.test.ts bin/lib/slop-scan/runner.test.ts bin/lib/slop-scan/registry.test.ts bin/adv.test.ts` passed 31 tests; existing schema/render/runner/registry behavior remains covered. |
| AC7 | acceptance_criterion | pass | test | `schema.test.ts` helper tests assert `important:false` unavailable advisory detector does not attach `SLOP_SCAN_DEGRADED`, while required detectors do. |
| AC8 | acceptance_criterion | pass | test | `../bin/oc-test targeted -- src/adv-slop-scan-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/slop-scan-false-positive-fixtures.test.ts` passed in reviewer run (72 tests); local asset/fixture rerun passed 18 tests before reviewer expanded stale skill coverage. |
| C1 | constraint | respected | static_check | No brace/indent fallback adapter or fallback finding implementation was added; stale fallback language removed. Implementation adds typed failure envelope and CLI failure behavior only. |
| C2 | constraint | respected | static_check | Failure envelope keeps full `coverage.detectors[]`; JSON and render tests assert failed detectors remain visible. |
| C3 | constraint | respected | static_check | Existing successful report shape and finding validation remain in `schema.ts`; targeted schema/render/runner/registry tests passed. |
| C4 | constraint | respected | static_check | Failure determination is structural over typed `DetectorCoverage` fields: `important` plus enumerated coverage states. No LLM/heuristic correctness path added. |
| C5 | constraint | respected | static_check | Touched files are limited to slop-scan CLI/runtime/schema/render/tests/spec/command/docs/skill surfaces and associated asset tests. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No broad slop-scan redesign performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No unrelated performance optimization performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No dead-code detector algorithm improvements performed. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No OCA-specific read-surface/API work performed. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Later Epic entries were not implemented. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-dddd462aa0c1 | AC1, AC2, AC6, AC7, C2, C3, C4 | AC1, AC2, AC6, AC7 | C1, C2, C3, C4, C5 |  |
| tk-de755c503dcf | AC1, AC2, AC4, AC6, AC7, C1, C2 | AC1, AC2, AC4, AC6, AC7 | C1, C2, C3, C4, C5 |  |
| tk-3b53c63bcda3 | AC3, AC6, C2, C3 | AC3, AC6 | C2, C3 |  |
| tk-37787cbbc391 | AC4, AC5, AC8, C1, C5 | AC4, AC5, AC8 | C1, C4, C5 |  |
| tk-0642bd921649 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5 |  |
