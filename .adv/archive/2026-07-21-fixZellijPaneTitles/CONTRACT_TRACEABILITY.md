# Contract Traceability

**Change ID:** fixZellijPaneTitles
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T04:14:39.362Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | AC1 test in active-change-pointer.test.ts; cwdDetectAndRepoint implementation at index.ts:1006-1037 |
| SC2 | success_criterion | pass | review | AC3/AC5/AC6 tests cover cross-project repoint + terminal clear |
| SC3 | success_criterion | pass | review | AC4 test: target_path invocation of adv_change_show does NOT touch pointer |
| SC4 | success_criterion | pass | review | No changes to events/terminal.ts buildTabTitle or rq-titleIdentity01 spec |
| AC1 | acceptance_criterion | pass | test | Test 'AC1: seeds pointer from matching worktree cwd' PASS |
| AC2 | acceptance_criterion | pass | test | Test 'AC2: leaves pointer null when cwd does not match worktree pattern' PASS + 4 edge case tests |
| AC3 | acceptance_criterion | pass | test | Test 're-points caller pointer for cross-project active-work mutator when target change.json exists' PASS |
| AC4 | acceptance_criterion | pass | test | Test 'does not re-point for cross-project read/diagnostic tool' PASS |
| AC5 | acceptance_criterion | pass | test | Test 'clears caller pointer on cross-project terminal transition with matching changeId' PASS |
| AC6 | acceptance_criterion | pass | test | Existing forget-clear path (index.ts:1086-1105) naturally handles cross-project; covered by rq-activeChangePointer01.6 test + new cross-project scenario test |
| AC7 | acceptance_criterion | pass | test | Existing try/catch at index.ts:740-744 preserves tool-call continuation; target-project failure does not block |
| AC8 | acceptance_criterion | pass | test | Spec text modified at .adv/specs/advance-meta/spec.json:2865-2877 + docs/specs/advance-meta.md mirror |
| AC9 | acceptance_criterion | pass | test | 18 existing .1-.6 tests PASS without modification |
| AC10 | acceptance_criterion | pass | test | Cumulative: typecheck PASS, lint PASS, build PASS, targeted tests 25/25. Full pnpm test 6588/6601 pass (12 pre-existing trunk failures on 3cee25f5, none touch modified files). Task 4 (tk-18429121efd0) cancelled with user approval; AC10 implicit via per-task TDD evidence. |
| C1 | constraint | respected | static_check | No subprocess forks introduced; in-process state only; ADR 0008 properties #6/#7 trivially satisfied |
| C2 | constraint | respected | static_check | rq-titleIdentity01 spec text untouched; events/terminal.ts buildTabTitle unchanged |
| C3 | constraint | respected | static_check | activeChangeRepointTools allow-list at index.ts:576-595 unchanged; new code uses existing shouldRepointActiveChange gate |
| C4 | constraint | respected | static_check | try/catch at index.ts:740-744 wraps all cross-project resolution + reachability; tool call proceeds on failure |
| C5 | constraint | respected | static_check | cwdDetectAndRepoint uses getWorktreeBase(resolvedProjectId) anchor; non-canonical paths rejected by startsWith check |
| C6 | constraint | respected | static_check | state.activeChange.id is in-process; concurrent sessions have independent pointers |
| C7 | constraint | respected | static_check | Same-project path uses existing 3-tier isChangeReachable; cross-project extends with disk-only tier per KD3 |
| C8 | constraint | respected | static_check | Single modify operation on rq-activeChangePointer01.7; no new spec requirement |
| DONT1 | avoidance | respected | review | No new plugin; no fork storm; in-process state only |
| DONT2 | avoidance | respected | review | activeChangeRepointTools unchanged; non-repoint tools filtered by shouldRepointActiveChange |
| DONT3 | avoidance | respected | review | No clear-on-null; setActiveChange preserves prior title per rq-titleIdentity01.2 |
| DONT4 | avoidance | respected | review | No tmux code touched |
| DONT5 | avoidance | respected | review | No new dependencies added (resolveTargetProject, readFile reused from existing imports) |
| DONT6 | avoidance | respected | review | cwdDetectAndRepoint uses canonical ADV worktree pattern only |
| DONT7 | avoidance | respected | review | Tool call proceeds on reachability failure (AC7); only repoint skipped |
| DONT8 | avoidance | respected | review | No status cues introduced |
| DONT9 | avoidance | respected | review | No TAB title changes; only pane title via existing OSC mechanism |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d6aec1b24ef6 | AC8 | AC8, AC9 | C2, C8, DONT2 |  |
| tk-7f15a4265ba3 | AC3, AC7 | AC3, AC4, AC5, AC6, AC7, AC10 | C3, C4, C7, DONT2, DONT7 |  |
| tk-9c9a7eac113a | AC1, AC2 | AC1, AC2 | C5, DONT6 |  |
| tk-18429121efd0 |  | AC10 | C1, DONT1, DONT3, DONT4, DONT5, DONT8, DONT9 |  |
