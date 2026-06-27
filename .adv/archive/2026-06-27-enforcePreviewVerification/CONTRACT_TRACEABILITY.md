# Contract Traceability

**Change ID:** enforcePreviewVerification
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T21:27:40.429Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Visual changes now require exact-route/state preview proof in strengthened rq-acceptancePreviewUrl01 and /adv-review rules; adv-reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Preview proof contract requires method, hydration/readiness, viewport, timestamp/context, and fallback/blocker rationale; reviewer READY. |
| SC3 | success_criterion | pass | review | Non-visual `Preview URL: not_applicable` remains asserted in plugin/src/adv-skill-backed-commands-assets.test.ts; targeted suite passed 179 tests. |
| SC4 | success_criterion | pass | review | Discovery/review/apply/designer/reviewer guidance aligns around structural visual-surface evidence; reviewer READY. |
| AC1 | acceptance_criterion | pass | test | `.adv/specs/advance-workflow/spec.json` strengthened; asset test asserts exact route/path and URL-source-only insufficiency; targeted suite passed. |
| AC2 | acceptance_criterion | pass | test | Spec/test assert sanitized URL, route/path, data source, method, hydration/readiness, timestamp/context, viewport, freshness/fallback evidence. |
| AC3 | acceptance_criterion | pass | test | Spec/test assert 375px width or documented project equivalent for runnable visual surfaces unless fallback rationale is recorded. |
| AC4 | acceptance_criterion | pass | test | Spec/review guidance and tests require fixture/mock evidence be labeled and not presented as live user-facing proof. |
| AC5 | acceptance_criterion | pass | test | Spec/review guidance and tests require stale/cached/error-page evidence to block until fresh/cache-busted or equivalent proof exists. |
| AC6 | acceptance_criterion | pass | test | `/adv-review` acceptance proof and executive-summary guidance updated; asset tests assert exact-route, post-hydration, viewport, and blocking language. |
| AC7 | acceptance_criterion | pass | test | `/adv-discover` now records `visual_surface` plus `preview_expectation` fields; acceptance reviewer added persisted-agreement guidance and matching test assertion. |
| AC8 | acceptance_criterion | pass | test | Apply/designer/reviewer packet guidance aligned; asset tests assert exact affected route/state, post-hydration/readiness, viewport context, and fixture/mock labeling. |
| AC9 | acceptance_criterion | pass | test | Targeted asset suites passed: `bin/oc-test targeted -- src/adv-skill-backed-commands-assets.test.ts src/adv-reviewer-asset.test.ts src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts` (179 tests). |
| AC10 | acceptance_criterion | pass | test | Existing non-visual `Preview URL: not_applicable` behavior remains asserted and passed in asset tests. |
| AC11 | acceptance_criterion | pass | test | `pnpm --dir plugin run check` passed: schemas, typecheck, isolation, lockfile, lint, format. |
| C1 | constraint | respected | static_check | No browser automation framework was added; changes are spec/command/agent/test guidance only. |
| C2 | constraint | respected | static_check | Non-visual changes keep `Preview URL: not_applicable`; no browser proof required for backend/non-visual work. |
| C3 | constraint | respected | static_check | Visual applicability guidance uses agreement/task/report evidence and blocks unknowns; no file/path heuristic is sole authority. |
| C4 | constraint | respected | static_check | No pixel-perfect or computed-style assertions added; tests assert text contract alignment only. |
| C5 | constraint | respected | static_check | No arbitrary HTTP probing or URL probing implementation added; proof remains human/agent review evidence. |
| C6 | constraint | respected | static_check | Generated acceptance artifacts remain projection-only; durable proof captured in contract review matrix/executive summary evidence. |
| OOS1 | out_of_scope | respected | not_applicable | No Playwright MCP tooling implemented. |
| OOS2 | out_of_scope | respected | not_applicable | No pixel-perfect screenshot comparison added. |
| OOS3 | out_of_scope | respected | not_applicable | Human acceptance semantics unchanged; acceptance still requires user confirmation. |
| OOS4 | out_of_scope | respected | not_applicable | No deployment infrastructure or preview environment creation added. |
| OOS5 | out_of_scope | respected | not_applicable | Designer report schema unchanged; no schema rewrite needed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-70659007ffb8 | AC1, AC2, AC3, AC4, AC5, AC10 | AC1, AC2, AC3, AC4, AC5, AC10 | SC1, SC2, SC3, C1, C2, C3, C4, C5, C6 |  |
| tk-f68c98db6942 | AC6, AC7, AC9, AC10 | AC6, AC7, AC9, AC10 | SC1, SC2, SC3, SC4, C2, C3, C4, C5, C6 |  |
| tk-683d515f5391 | AC8, AC9 | AC8, AC9 | SC1, SC2, SC3, C1, C3, C4 |  |
| tk-2346e406c737 |  | AC9, AC10, AC11, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, C6 |  |
