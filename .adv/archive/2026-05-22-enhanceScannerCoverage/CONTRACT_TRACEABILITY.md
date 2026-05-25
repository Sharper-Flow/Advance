# Contract Traceability

**Change ID:** enhanceScannerCoverage
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T08:43:50Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | rq-ss010 taxonomy is present in slop spec, command, skill, CATEGORIES/DEAD_CODE, and slop-smells; adv-slop-scan-assets test verifies all six deletion subtypes and targeted suite passed (73 tests). |
| AC2 | acceptance_criterion | pass | test | rq-ss011 deletion safety text routes uncertain deletion candidates to low-confidence/user-review; adv-slop-scan-assets test verifies command/skill/dead-code anchors and targeted suite passed. |
| AC3 | acceptance_criterion | pass | test | Command, skill, DEAD_CODE, and rq-ss011 state heuristic-only/text-only unused-code guesses are not actionable removal proof; asset test assertion updated and passing. |
| AC4 | acceptance_criterion | pass | test | rq-archstack01 and adv-arch-scan command/skill require stack packs before research/generic heuristic fallback; adv-arch-scan-assets tests passed. |
| AC5 | acceptance_criterion | pass | test | rq-archstack02 ADV stack pack covers TypeScript/Bun/OpenCode plugin/Temporal/spec-command-skill assets; missing packs are reported via coverage.missingPacks; asset tests passed. |
| AC6 | acceptance_criterion | pass | test | rq-ss012 and rq-archcov01 define normal text coverage summaries plus JSON coverage fields; asset tests verify skipped/degraded/missing coverage fields and passed. |
| AC7 | acceptance_criterion | pass | test | .adv specs, docs mirrors, command/skill assets, and asset tests were updated; targeted suite passed (73 tests) and pnpm run check passed. |
| AC8 | acceptance_criterion | pass | test | Existing rq-ss001/rq-ss004/rq-ss006/rq-ss007/rq-ss008/rq-ss009 contracts remain covered by asset tests; review found no weakening after remediation. |
| C1 | constraint | respected | static_check | Changes update .adv/specs/slop-scan, .adv/specs/arch-scan, and docs mirrors; docs/specs/slop-scan.md version now matches spec.json 1.2.0. |
| C2 | constraint | respected | static_check | Command/skill contracts require file/source/tool evidence for findings and structural owners for ADV stack-pack findings; review evidence cited file:line locations. |
| C3 | constraint | respected | static_check | Deletion-safety sections list protected false-positive surfaces; context-boundary and low-confidence grouping asset tests passed. |
| C4 | constraint | respected | static_check | Coverage gaps are required in normal text summaries; detailed fields live under JSON coverage for both scanner commands. |
| C5 | constraint | respected | static_check | Arch scan stack-pack flow adds known packs and reports missing detected packs in coverage.missingPacks; Phase 3 standalone semantics and failure handling documented/tested. |
| DONT1 | avoidance | respected | review | Slop command, skill, DEAD_CODE, and spec state deletion candidates are review inputs only and never auto-deletion actions; review found no contrary guidance. |
| DONT2 | avoidance | respected | review | Heuristic-only/text-only unused-code guesses are explicitly non-actionable; low-confidence/user-review path verified by tests. |
| DONT3 | avoidance | respected | review | Slop deletion safety rejects a single external tool as sole authority; arch ADV stack pack cites tests/validators and treats tool output as evidence, not sole authority. |
| DONT4 | avoidance | respected | review | P33 structural-correctness requirements remain in both specs; asset tests for structural correctness, context boundary, and low-confidence grouping passed. |
| DONT5 | avoidance | respected | review | Scanner command/skill changes do not replace review, harden, audit, or tron workflows; commands remain scanner-specific contracts. |
| DONT6 | avoidance | respected | review | Implementation uses spec/command/skill/docs/asset-test contracts and optional detector reporting; no paid or production-only coverage is required. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-21925c3f3128 | AC1, AC2, AC3, AC6, AC7, AC8 | AC1, AC2, AC3, AC6, AC7, AC8 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-6e80a1ead5e8 | AC4, AC5, AC6, AC7, AC8 | AC4, AC5, AC6, AC7, AC8 | C1, C2, C4, C5, DONT3, DONT4, DONT5, DONT6 |  |
| tk-514aab6991a9 |  |  | C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | Discoverability-only text supports approved objectives but has no direct AC item beyond preserving constraints/avoidances; verification is covered by the final validation task. |
| tk-72d7d39acd8d |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
