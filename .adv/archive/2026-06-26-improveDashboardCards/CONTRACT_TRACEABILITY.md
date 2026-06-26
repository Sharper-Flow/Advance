# Contract Traceability

**Change ID:** improveDashboardCards
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T18:22:06.534Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `bun test bin/lib/dashboard` tr_mqv9668v_e9fc46a2 passed 41 tests/192 assertions; reviewer scoped test tr_mqv9at47_0137ffb4 passed 22 tests/124 assertions. UI test asserts ADV status cards contain `Gate progress`/`item.progress` and not `<strong>Status</strong>`. |
| AC2 | acceptance_criterion | pass | test | `bin/lib/dashboard/attention.test.ts` test `sorts ADV cards inside a lane from most completed gate progress to least` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC3 | acceptance_criterion | pass | test | `bin/lib/dashboard/attention.test.ts` test `uses deterministic recency/title/id tie-breaks for equal gate progress` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC4 | acceptance_criterion | pass | test | Existing `unlinked source stays secondary with projected metadata` passed in tr_mqv9668v_e9fc46a2 and tr_mqv9at47_0137ffb4. |
| AC5 | acceptance_criterion | pass | test | Dashboard scoped suite tr_mqv9668v_e9fc46a2 passed 41 tests/192 assertions; reviewer scoped suite tr_mqv9at47_0137ffb4 passed 22 tests/124 assertions. |
| C1 | constraint | respected | static_check | No form/mutation controls added; `does not render mutation controls` passed in UI tests. |
| C2 | constraint | respected | static_check | No token/secret rendering paths changed; safe URL/escape helpers retained; GitHub setup secret negative assertions still pass. |
| C3 | constraint | respected | static_check | Only local dashboard model/UI/tests changed. Service/network behavior unchanged. |
| C4 | constraint | respected | static_check | No spec-law delta added; adv validation passed with accepted NO_DELTAS warning. Local presentation/model refinement only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4bbe0e79dd99 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
