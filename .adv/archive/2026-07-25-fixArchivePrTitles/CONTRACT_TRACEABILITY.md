# Contract Traceability

**Change ID:** fixArchivePrTitles
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T18:52:23.255Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | git-finalize.ts:1521-1531,1680-1706 (conventional title construction + release_types enforcement); tests git-finalize.test.ts:4298-4311,5224-5269 |
| AC2 | acceptance_criterion | pass | test | git-finalize.ts:1625-1706,1839-1855 (guard blocks before arm; both call sites map !armed.ok→blocked); tests :4276-4296,4336-4420,5277-5313 (re-drive path regression) |
| AC3 | acceptance_criterion | pass | test | project.ts:213 (plain default); git-finalize.ts:1518-1534 (plain→Archive {id} unchanged); tests :4235-4262,5393-5433 |
| AC4 | acceptance_criterion | pass | test | PokeEdge #1020 repro tests git-finalize.test.ts:5217-5270,5354-5387 (generic Archive rejected → fix: title accepted + arms) |
| AC5 | acceptance_criterion | pass | test | change.ts:3494-3511 (bounded prTitleType enum); tests change.archive-phase9.test.ts:430-455, git-finalize.test.ts:5437-5487 (metadata + explicit param; no heuristic inference) |
| C1 | constraint | respected | static_check | Bounded explicit type + typed policy; no title-text inference: change.ts:3494-3511, git-finalize.ts:1531 |
| C2 | constraint | respected | static_check | Plain/absent policy compatibility unchanged: git-finalize.ts:1518-1534,1624-1707; tests :4235-4262 |
| C3 | constraint | respected | static_check | Normal gh pr merge --auto; policy/lookup failures block instead of force-merge: git-finalize.ts:1711-1719,1839-1855 |
| DONT1 | avoidance | respected | review | Typed project config + bounded input supply the policy; no target repo-file inspection: project.ts:210-228, change.ts:3494-3511 |
| DONT2 | avoidance | respected | review | Separate release_types membership check (non-releasing type blocks): git-finalize.ts:1693-1706; tests :4276-4311 |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-dcd05f724abb |  |  |  | Spec-law task only stages a modify-delta; AC1-AC5 and C1-C3 are covered by downstream code tasks. |
| tk-d02c7abde910 |  |  | C1 |  |
| tk-58a8f99b367e | AC1, AC3, AC5 |  | DONT2 |  |
| tk-1c560667391b | AC5 |  | C1 |  |
| tk-3bd6a3f67e02 | AC2 |  | C1 |  |
| tk-031e83d184ef |  | AC1, AC2, AC3, AC4, AC5 |  |  |
