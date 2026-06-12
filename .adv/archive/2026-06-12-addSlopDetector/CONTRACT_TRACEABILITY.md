# Contract Traceability

**Change ID:** addSlopDetector
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-12T05:06:14.339Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Typed slop_scan_report.v1 schema, bin/adv slop-scan --json, and runner/adapters implemented. Reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Adapters present/tested for ESLint+Knip, Radon+Vulture, gocyclo+deadcode, ast-grep+jscpd. Tests: bun test bin/lib/slop-scan bin/adv.test.ts passed 41 tests. |
| SC3 | success_criterion | pass | review | external-ci adapter marks Semgrep PR gate externally_covered. polyglot.test validates no local duplicate finding for Semgrep coverage. |
| SC4 | success_criterion | pass | review | Coverage schema and renderer include run/skipped/degraded/failed/timed_out/unavailable/externally_covered; important warnings shown prominently. render tests passed. |
| SC5 | success_criterion | pass | review | Deletion candidates from Knip/Vulture/Go deadcode use MAINT-003, grouping user-review, actionability review_required, fix requires verification. Adapter tests passed. |
| AC1 | acceptance_criterion | pass | test | bin/adv.test.ts validates slop-scan --json emits slop_scan_report.v1 with findings, severity/category summary, languages, and detector coverage. bun test bin/lib/slop-scan bin/adv.test.ts passed 41 tests. |
| AC2 | acceptance_criterion | pass | test | Adapter tests cover TS/JS, Python, Go, ast-grep, jscpd; renderer tests cover prominent warnings for unavailable/failed important detectors. bun test bin/lib/slop-scan passed. |
| AC3 | acceptance_criterion | pass | test | external-ci polyglot test validates Semgrep workflow text produces coverage state externally_covered with p/javascript p/typescript evidence. |
| AC4 | acceptance_criterion | pass | test | slop-scan-false-positive-fixtures.test now rejects sentinel markers and uses executable source-structure checks. Targeted plugin tests passed 17 tests. |
| AC5 | acceptance_criterion | pass | test | Knip, Vulture, and Go deadcode tests assert review_required/user-review deletion candidates; _findings deletionCandidate fix text requires verification before removal. |
| AC6 | acceptance_criterion | pass | test | Config parser tests validate canonical threshold keys, legacy warnings, invalid values; asset tests validate command/skill docs use canonical keys. Smoke passed schemas:check/typecheck/lint/format. |
| AC7 | acceptance_criterion | pass | test | render.test covers PROMINENT COVERAGE WARNINGS; reviewer added category/grouping/evidence text tests. bun test bin/lib/slop-scan passed. |
| C1 | constraint | respected | static_check | No branch-protection or CI workflow replacement. Semgrep represented via external-ci coverage adapter only. |
| C2 | constraint | respected | static_check | Slop spec/docs updated; deletion safety and false-positive controls preserved in schema, docs, and adapter behavior. |
| C3 | constraint | respected | static_check | Tool runner maps failed/timed_out/unavailable states into coverage; renderer warns on important warning states; smoke passed. |
| C4 | constraint | respected | static_check | CLI JSON and text renderer both consume SlopScanReport from bin/lib/slop-scan/schema and runSlopScan. |
| C5 | constraint | respected | static_check | Design chose bin/adv CLI runner plus typed modules; implementation followed that shape without adding unrelated boundaries. |
| DONT1 | avoidance | respected | review | Deletion candidates remain review_required; no heuristic-only safe-removal path or auto-delete path introduced. |
| DONT2 | avoidance | respected | review | Semgrep local findings not emitted; security gate is external-ci-semgrep coverage state externally_covered. |
| DONT3 | avoidance | respected | review | Deterministic facts use CLI runner, typed schema, adapter parsers, and tests; prompt/agent text updated to cite runner as source-of-truth. |
| DONT4 | avoidance | respected | review | Coverage.detectors[] includes non-run states and renderer prints prominent warnings; no clean-result-only suppression. |
| DONT5 | avoidance | respected | review | No deletion automation added; deletion fixes say verify before removal. |
| DONT6 | avoidance | respected | review | Existing security-gates workflow left unchanged; no branch protection changes. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5f1d7c32b693 | SC1, SC4, AC1, AC6, C4, C5 | AC1, AC6 | DONT3, DONT4 |  |
| tk-773079931682 | SC1, SC4, AC1, AC2, AC7, C3, C4 | AC1, AC2, AC7 | DONT3, DONT4 |  |
| tk-83bb0aa15c0a | SC2, SC5, AC2, AC5, C2 | AC2, AC5 | DONT1, DONT5 |  |
| tk-219ab4a4a387 | SC2, SC5, AC2, AC5, AC7, C2, C3 | AC2, AC5, AC7 | DONT1, DONT5 |  |
| tk-e0360ff20dc6 | SC2, SC3, AC2, AC3, C1 | AC2, AC3 | DONT2, DONT6 |  |
| tk-668e1a9e1d75 | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC7, C4 | AC1, AC2, AC3, AC7 | DONT2, DONT3, DONT4 |  |
| tk-401dc54e4ec1 | AC6, C2, C4, C5 | AC6 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-294938f910cc |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
