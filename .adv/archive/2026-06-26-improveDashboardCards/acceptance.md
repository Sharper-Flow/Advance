# Acceptance

Reviewed at: 2026-06-26T18:22:06.534Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given an ADV card has gate data, when rendered, then it shows gate progress/badge text instead of `Status: draft`. | pass | `bun test bin/lib/dashboard` tr_mqv9668v_e9fc46a2 passed 41 tests/192 assertions; reviewer scoped test tr_mqv9at47_0137ffb4 passed 22 tests/124 assertions. UI test asserts ADV status cards contain `Gate progress`/`item.progress` and not `<strong>Status</strong>`. |
| AC2 | acceptance_criterion | Given two ADV cards in the same column have different gate progress, when rendered, then the card with more completed gates appears first. | pass | `bin/lib/dashboard/attention.test.ts` test `sorts ADV cards inside a lane from most completed gate progress to least` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC3 | acceptance_criterion | Given two ADV cards have equal gate progress, when rendered, then ordering remains deterministic by recency/title/id. | pass | `bin/lib/dashboard/attention.test.ts` test `uses deterministic recency/title/id tie-breaks for equal gate progress` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC4 | acceptance_criterion | Given unmatched GitHub source exists, when rendered, then it remains in `unmatched_source` and is not converted to an ADV card without structural match. | pass | Existing `unlinked source stays secondary with projected metadata` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC5 | acceptance_criterion | Given dashboard tests run, when targeted dashboard tests complete, then card rendering and sorting behavior are covered. | pass | Dashboard scoped suite tr_mqv9668v_e9fc46a2 passed 41 tests/192 assertions; reviewer scoped suite tr_mqv9at47_0137ffb4 passed 22 tests/124 assertions. |
| C1 | constraint | No mutation controls. | respected | No form/mutation controls added; `does not render mutation controls` passed in UI tests. |
| C2 | constraint | No token/secret display. | respected | No token/secret rendering paths changed; safe URL/escape helpers retained; GitHub setup secret negative assertions still pass. |
| C3 | constraint | Local-only, read-only dashboard. | respected | Only local dashboard model/UI/tests changed. Service/network behavior unchanged. |
| C4 | constraint | Implementation-only presentation/model refinement; no dashboard capability law change expected. | respected | No spec-law delta added; adv validation passed with accepted NO_DELTAS warning. Local presentation/model refinement only. |

