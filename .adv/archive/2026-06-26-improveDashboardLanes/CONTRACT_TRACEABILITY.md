# Contract Traceability

**Change ID:** improveDashboardLanes
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T04:16:37.282Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | UI/server implementation exposes actionability lane labels/counts: Attention, Active work, Unmatched source, Inventory. Tests: tr_mqueopwa_59827faf, tr_mques8p8_de1024ec. |
| SC2 | success_criterion | pass | review | Successful/skipped workflow/deployment history summarized into inventory via SummaryLaneItem; attention/active/unmatched tests passed in tr_mquefg54_d659b62d and tr_mques8p8_de1024ec. |
| SC3 | success_criterion | pass | review | PR source projection includes #/title, repo, branch, URL, updated_at in attention.test; green tr_mquekcgv_e3791afb. |
| SC4 | success_criterion | pass | review | Workflow run projection includes workflow name, display title, repo, branch, conclusion, URL, updated_at; green tr_mquekcgv_e3791afb. |
| SC5 | success_criterion | pass | review | Deployment projection includes environment/ref/status/SHA metadata; server integration verifies failed deployment metadata in tr_mques8p8_de1024ec. |
| SC6 | success_criterion | pass | review | UI test asserts `Unmatched source item` copy and no unmatched-auth language; green tr_mqueopwa_59827faf. |
| AC1 | acceptance_criterion | pass | test | Lane classifier test verifies deterministic split of active vs inventory ADV changes; tr_mquefg54_d659b62d and tr_mques8p8_de1024ec passed. |
| AC2 | acceptance_criterion | pass | test | Draft ADV change routes to inventory, not active lane, in `groups project-first activity into actionability lanes`; tr_mquefg54_d659b62d passed. |
| AC3 | acceptance_criterion | pass | test | PR metadata card summary test covers PR number/title, repo, branch, URL, updated_at; tr_mquekcgv_e3791afb passed. |
| AC4 | acceptance_criterion | pass | test | Workflow-run metadata test covers name/display title, repo, branch, conclusion, URL, updated_at; tr_mquekcgv_e3791afb passed. |
| AC5 | acceptance_criterion | pass | test | Successful workflow_run in classifier test becomes `summary` item in inventory; tr_mquefg54_d659b62d passed. |
| AC6 | acceptance_criterion | pass | test | Failed workflow/deployment statuses route to attention with metadata; tr_mquekcgv_e3791afb and tr_mques8p8_de1024ec passed. |
| AC7 | acceptance_criterion | pass | test | UI unmatched copy test asserts unmatched/correlation language and no auth implication; tr_mqueopwa_59827faf passed. |
| AC8 | acceptance_criterion | pass | test | Sanitization/read-only tests passed; full `bun test bin/` tr_mquetl9l_0c1224c2 passed 151 tests/429 assertions and reviewer reran same successfully. |
| AC9 | acceptance_criterion | pass | test | Server rejects mutation methods and UI has no mutation controls/forms; tr_mqueopwa_59827faf and tr_mques8p8_de1024c2/tr_mquetl9l_0c1224c2 passed. |
| AC10 | acceptance_criterion | pass | test | Full `bun test bin/` passed: tr_mquetl9l_0c1224c2, 151 tests, 429 assertions. Reviewer reran `bun test bin/` with same pass counts. |
| C1 | constraint | respected | static_check | No hosted-service behavior added; dashboard server still loopback/default host behavior covered by server tests in tr_mques8p8_de1024ec and full tr_mquetl9l_0c1224c2. |
| C2 | constraint | respected | static_check | UI test `does not render mutation controls` passed in tr_mqueopwa_59827faf and full tr_mquetl9l_0c1224c2. |
| C3 | constraint | respected | static_check | Sanitization tests and UI no-secret checks passed; no raw credentials added to metadata projection. Full tr_mquetl9l_0c1224c2 passed. |
| C4 | constraint | respected | static_check | Lane taxonomy change pinned by attention/UI/server tests; API lanes now covered by tr_mques8p8_de1024ec and full tr_mquetl9l_0c1224c2. |
| C5 | constraint | respected | static_check | Classifier and source projection implemented as deterministic TypeScript functions, not UI heuristics; tests tr_mquefg54_d659b62d/tr_mquekcgv_e3791afb passed. |
| C6 | constraint | respected | static_check | No cache/coalescing provider behavior changed; server cache/coalesce test passed in tr_mques8p8_de1024ec and full tr_mquetl9l_0c1224c2. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ec836cd3492c | SC1, SC2, SC3, AC1, AC2, AC5, AC6, AC7, C4 | AC1, AC2, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6 |  |
| tk-c1c8d7c792ca | SC4, AC3, AC4, AC8, C3, C4 | AC3, AC4, AC8 | C2, C3, C4, C6 |  |
| tk-fe7ccffac1f9 | SC1, SC4, SC5, AC3, AC4, AC7, AC8, AC9 | AC3, AC4, AC7, AC8, AC9 | C1, C2, C3, C5 |  |
| tk-65e8ca728dff | SC1, SC2, SC3, SC4, SC5, SC6, AC10 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6 |  |
