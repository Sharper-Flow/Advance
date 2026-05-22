# Contract Traceability

**Change ID:** fixAdvChecklistReads
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Runtime command scan: no `.opencode/command` matches for `docs/checklists/`; reviewer contract assessment pass. |
| SC2 | success_criterion | pass | review | Embedded methodology blocks and existing `skill("adv-improve")`/`skill("adv-slop-detection")` retained; targeted asset tests passed 83 tests. |
| SC3 | success_criterion | pass | review | `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/adv-improve-assets.test.ts --reporter=dot` passed: 2 files, 83 tests; regression test failed red before cleanup. |
| SC4 | success_criterion | pass | review | Runtime command scans found no `docs/checklists/` or `~/.local/share/Advance` matches; reviewer assessment pass. |
| SC5 | success_criterion | pass | review | `rq-noSourceChecklistReads01` added to advance-meta spec/docs; ADV_INSTRUCTIONS boundary updated. |
| AC1 | acceptance_criterion | pass | test | Affected commands audited and updated: adv-proposal, adv-discover, adv-prep, adv-review, adv-harden, adv-improve. |
| AC2 | acceptance_criterion | pass | test | Command cleanup replaced checklist path directives with embedded runtime-source wording or existing skill/fallback wording. |
| AC3 | acceptance_criterion | pass | test | Forbidden-pattern scan added in `plugin/src/adv-skill-backed-commands-assets.test.ts`; targeted tests passed 83 tests. |
| AC4 | acceptance_criterion | pass | test | No new skill sibling files required; `adv-improve` skill already contains six-category methodology; existing skill loads preserved. |
| AC5 | acceptance_criterion | pass | test | advance-meta spec bumped to 1.11.0 with `rq-noSourceChecklistReads01`; docs/specs mirror updated. |
| C1 | constraint | respected | static_check | No skill files required state mutation; command/state ownership preserved; reviewer assessment pass. |
| C2 | constraint | respected | static_check | Only command guidance/tests/spec/docs changed; no gate/state ownership moved to skills. |
| C3 | constraint | respected | static_check | No symlinks/env overrides/wrappers/hardcoded install paths added; source pointers removed. |
| C4 | constraint | respected | static_check | Core workflows use embedded guidance or installed skills; no network dependency introduced. |
| C5 | constraint | respected | static_check | Structural regex-based command asset scan added and passing. |
| DONT1 | avoidance | respected | review | Runtime command scan for `~/.local/share/Advance` returned no matches. |
| DONT2 | avoidance | respected | review | Did not add new single-command methodology skills or duplicate large blocks; reused embedded/skill guidance. |
| DONT3 | avoidance | respected | review | Embedded methodology and existing skills retained; only source path pointers removed. |
| DONT4 | avoidance | respected | review | No changes to gate semantics, Temporal state, or worktree mechanics. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No gate semantics redesign attempted. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No ADV state storage, Temporal workflow, or worktree lifecycle changes made. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Maintainer-facing checklist docs retained. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Duplicate proposal prevention tracked separately as agenda `ag-wg8YdGFm`; not implemented here. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d1ba38d67ee1 | AC3 | SC3 | C5 |  |
| tk-1fd385152910 | AC1, AC2 | SC1, SC4 | DONT1, C2 |  |
| tk-d08872d469c7 | AC2, AC4 | SC2 | C1, C3, C4, DONT1, DONT2, DONT3 |  |
| tk-24d05324e9c5 | AC5 | SC5 | C1, C2, C5 |  |
| tk-4dea2492305f |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
