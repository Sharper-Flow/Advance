# Contract Traceability

**Change ID:** addReflectionReader
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T20:45:08.408Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Implemented read-only `adv_reflection_list` and target_path wisdom readers; agents can list reflection/wisdom learnings through tools rather than direct ADV state-file reads. |
| SC2 | success_criterion | pass | review | `adv_reflection_list target_path`, `adv_project_wisdom_list target_path`, and `adv_wisdom_list target_path` tests return `_projectContext` and target entries using snapshot routing. |
| SC3 | success_criterion | pass | review | Reflection list tests assert bounded entries, `total`/`count`/`omitted`, `byFrictionCategory`, exact `bySuggestion`, and source-backed compact entry summaries. |
| SC4 | success_criterion | pass | review | Existing `adv_reflect`, current-project wisdom list behavior, and public registration tests pass; output changes for wisdom are additive only when target_path is supplied. |
| AC1 | acceptance_criterion | pass | test | `adv_reflection_list` returns newest-first bounded summaries with `entries`, `count`, `total`, `omitted`, `byFrictionCategory`, and `bySuggestion`; covered by `reflection.test.ts`. |
| AC2 | acceptance_criterion | pass | test | Tool args include `changeId`, `category`, `scope`, `maxEntries`, and `target_path` with safe defaults and named max/default bounds. |
| AC3 | acceptance_criterion | pass | test | `reflection-target.test.ts` proves `adv_reflection_list target_path` uses `withOptionalTargetPathStore`, reads target store paths, and returns untrusted read-only `_projectContext` without confirmation. |
| AC4 | acceptance_criterion | pass | test | `wisdom-target.test.ts` proves `adv_project_wisdom_list target_path` reads target project wisdom via activeStore paths and returns `_projectContext` while preserving `entries`, `count`, `byType`. |
| AC5 | acceptance_criterion | pass | test | `wisdom-target.test.ts` proves `adv_wisdom_list target_path` aggregate and change-specific paths use target store reads and return `_projectContext`; reviewer fixed changeId path to avoid live Temporal lookup under target snapshots. |
| AC6 | acceptance_criterion | pass | test | Reflection list missing-file test returns explicit empty state: `entries: []`, `count: 0`, `total: 0`, `omitted: 0`, empty summaries. |
| AC7 | acceptance_criterion | pass | test | Storage reflection tests still cover malformed-line degradation; reader uses `listReflections`, so malformed entries are skipped by storage and valid entries remain source-backed. |
| AC8 | acceptance_criterion | pass | test | Targeted tests cover current and target reads for reflection/wisdom surfaces, including untrusted `_projectContext` behavior without target confirmation. |
| AC9 | acceptance_criterion | pass | test | Existing `adv_reflect`, current-project `adv_project_wisdom_list`, and current-project `adv_wisdom_list` tests pass; tool registry/CLI/title contract tests pass. |
| AC10 | acceptance_criterion | pass | test | Verification passed: targeted reflection/wisdom/storage/target-project/registry/CLI/title tests; reviewer scoped tests; `pnpm run check`. |
| C1 | constraint | respected | static_check | No agent direct state-file read path added; implementation uses storage APIs (`listReflections`, `listProjectWisdom`, `store.wisdom`). |
| C2 | constraint | respected | static_check | Reader calls only list/search APIs and target snapshot routing; no write/signal/mutation occurs in `adv_reflection_list` or wisdom list readers. |
| C3 | constraint | respected | static_check | Summaries are deterministic counts/excerpts from persisted entries; no LLM synthesis or semantic clustering used. |
| C4 | constraint | respected | static_check | Wisdom product filtering now runs against activeStore; reflection list passes product/repo filters to `listReflections`, preserving legacy visible-missing-tags behavior. |
| C5 | constraint | respected | static_check | Output uses named bounds and omitted counts for entries/details/suggestions; no mid-entry truncation authority. |
| OOS1 | out_of_scope | not_applicable | not_applicable | `adv_reflect` generation semantics unchanged except shared imports/helpers; no report-generation redesign. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No reflection edit/delete behavior added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No auto-promotion from reflection/wisdom to roadmap changes implemented. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No dashboard/cross-product analytics service implemented. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Reflection storage format unchanged; reader reuses existing storage parser/list API. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a1641f71fd6a | AC1, AC2, AC6, AC7 | AC1, AC2, AC6, AC7 | SC1, SC3, C1, C2, C3 |  |
| tk-74c805806488 | AC3 | AC3, AC8 | SC1, SC2, C1, C2, C4 |  |
| tk-a149671e0349 | AC4, AC5 | AC4, AC5, AC8, AC9 | SC1, SC2, C1, C2, C4 |  |
| tk-88c071fadee9 | AC1 | AC8, AC9 | SC1, C1 |  |
| tk-3e2d14c9a6ca |  | AC8, AC9, AC10, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5 |  |
