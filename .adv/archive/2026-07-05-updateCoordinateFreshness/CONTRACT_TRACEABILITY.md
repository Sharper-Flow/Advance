# Contract Traceability

**Change ID:** updateCoordinateFreshness
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T18:30:51.406Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | .opencode/command/adv-coordinate.md adds Phase 2 Repository Freshness Audit before alignment; asset test asserts repository freshness, current branch, HEAD SHA, default branch, ahead/behind, dirty work, recent commit/diff evidence. |
| AC2 | acceptance_criterion | pass | test | .opencode/command/adv-coordinate.md requires `freshness_limited` and avoiding evidence-backed conclusions when repo state is missing; asset test asserts this wording. |
| AC3 | acceptance_criterion | pass | test | .opencode/command/adv-coordinate.md adds Current Repository Overlap Audit comparing shell entries, linked changes, and terminal history to current repository evidence. |
| AC4 | acceptance_criterion | pass | test | Command and spec define stable labels `repo_backed_fact`, `adv_backed_fact`, `judgment_call`, and `freshness_limited`; asset tests assert labels. |
| AC5 | acceptance_criterion | pass | test | .adv/specs/advance-epics/spec.json and docs/specs/advance-epics.md add `rq-epicCoordinateRepoFreshness01` with repository-current evidence law. |
| AC6 | acceptance_criterion | pass | test | Asset test updated to fail on missing repository freshness/current-code evidence and freshness failure anchors. Verification passed: `bin/oc-test targeted -- src/advance-epics-assets.test.ts` (52 tests). |
| AC7 | acceptance_criterion | pass | test | Existing and strengthened asset tests preserve no direct state edits, no CLI mutation verbs, optional membership, advisory order, no mutating git operations, and no Jira-like primitives. |
| AC8 | acceptance_criterion | pass | test | Targeted verification passed twice after implementation/reviewer changes: `bin/oc-test targeted -- src/advance-epics-assets.test.ts` (52 tests). No schema artifacts changed. |
| C1 | constraint | respected | static_check | Command continues to require explicit approval before durable actions; no auto-cancel/reorder/repair/narrative mutation path added. |
| C2 | constraint | respected | static_check | Command continues typed ADV/Epic tools only and no ADV external state filesystem access; asset tests retain direct-state and CLI mutation guards. |
| C3 | constraint | respected | static_check | Missing or stale repo evidence is classified as `freshness_limited` and report limitation; command forbids inventing evidence-backed conclusions. |
| C4 | constraint | respected | static_check | Epic order remains advisory; command text still says never block gates, tasks, promotion, or progress solely because of Epic order. |
| C5 | constraint | respected | static_check | No new planning primitives or CLI mutation surface added; changes limited to command/spec/docs/asset tests. |
| OOS1 | out_of_scope | respected | not_applicable | No full cross-device ADV state synchronization implemented. |
| OOS2 | out_of_scope | respected | not_applicable | Command does not claim guaranteed semantic detection; heuristic overlap remains a `judgment_call`. |
| OOS3 | out_of_scope | respected | not_applicable | No new ADV MCP mutation tools added. |
| OOS4 | out_of_scope | respected | not_applicable | Epic model not reworked; existing Epic coordination requirement remains stable with adjacent freshness requirement. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-eac98f569cfb |  | AC6, AC7 | C1, C2, C5 |  |
| tk-41d2faa339c1 | AC5 | AC5 | C1, C2, C3, C4, C5 |  |
| tk-bdc791ae0ccd | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, C5 |  |
| tk-2e1d635a6e49 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5 |  |
