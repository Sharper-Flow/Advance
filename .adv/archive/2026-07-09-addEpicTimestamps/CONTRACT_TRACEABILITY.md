# Contract Traceability

**Change ID:** addEpicTimestamps
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-09T00:28:14.804Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Live CLI evidence `tr_mrcrgp00_df64ddd3`: `bin/adv epic list --json` emitted `startTime` for running Epic `optimizeAdvPerformanceStructure`; reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Implementation uses Temporal Visibility `listEpicWorkflows()` and CLI boundary only; no getHandle/readFile in epic-list path. Source-boundary/spec tests passed `tr_mrcrhjnd_0aece7ba`; reviewer READY. |
| SC3 | success_criterion | pass | review | Existing active filter and project-prefix tests passed in `list-epic-workflows.test.ts` (`tr_mrcren5f_f08ba786`, `tr_mrcrhjnd_0aece7ba`); reviewer READY. |
| AC1 | acceptance_criterion | pass | test | `bin/lib/epic-list.test.ts` validates Date startTime maps to ISO UTC; passed in `tr_mrcraqmw_2571e23e` and `tr_mrcrevv9_b76cac3c`. Live CLI emitted ISO UTC `startTime` in `tr_mrcrgp00_df64ddd3`. |
| AC2 | acceptance_criterion | pass | test | `bin/lib/epic-list.test.ts` and `plugin/src/temporal/list-epic-workflows.test.ts` cover null fallback for missing/invalid startTime; passed in `tr_mrcraqmw_2571e23e`, `tr_mrcren5f_f08ba786`, and `tr_mrcrhjnd_0aece7ba`. |
| AC3 | acceptance_criterion | pass | test | Active query and project-prefix tests passed: `tr_mrcren5f_f08ba786` and `tr_mrcrhjnd_0aece7ba`; query remains `WorkflowType = "epicWorkflow" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`. |
| AC4 | acceptance_criterion | pass | test | CLI source-boundary test passed `tr_mrcrhjnd_0aece7ba`; reviewer confirmed no per-Epic workflow query/hydration or ADV state-file read added. `git diff --check` clean `tr_mrcrhp6m_96accb23`. |
| AC5 | acceptance_criterion | pass | test | `rq-epicCliList01` spec/docs updated; spec citation/source-boundary targeted tests passed `tr_mrcrhjnd_0aece7ba`; schema check passed `tr_mrcrfa5a_cc0545ec`. |
| C1 | constraint | respected | static_check | Root CLI continues through `plugin/src/cli/temporal-boundary.ts`; cli-bridge/source-boundary test passed `tr_mrcrhjnd_0aece7ba`. |
| C2 | constraint | respected | static_check | Fail-closed metadata test remains green in `bin/lib/epic-list.test.ts` and `bin/adv.test.ts`; Bun tests passed `tr_mrcrevv9_b76cac3c`. |
| C3 | constraint | respected | static_check | No CLI mutation verb added; cli-bridge contract test passed `tr_mrcrhjnd_0aece7ba`. |
| C4 | constraint | respected | static_check | `bin/lib/epic-list.ts` reads only rich Visibility helper results; reviewer READY and cli-bridge checks passed `tr_mrcrhjnd_0aece7ba`. |
| C5 | constraint | respected | static_check | `normalizeVisibilityStartTime()` uses `instanceof Date` and `getTime()` validity check; no arbitrary timestamp parsing. Typecheck passed `tr_mrcrgie3_f7ded6cc`. |
| DONT1 | avoidance | respected | review | Field is named `startTime` and spec says it represents Temporal workflow start timestamp, not child activity; reviewer READY. |
| DONT2 | avoidance | respected | review | Implementation uses Visibility row `startTime` only; `executionTime` not used. Typecheck/source review passed. |
| DONT3 | avoidance | respected | review | Null fallback tests keep Epic rows with `startTime:null`; passed `tr_mrcraqmw_2571e23e` and `tr_mrcren5f_f08ba786`. |
| DONT4 | avoidance | respected | review | No new last-activity index/search attribute added; changes limited to CLI/spec/tests plus citation comment; reviewer READY. |
| OOS1 | out_of_scope | not_applicable | not_applicable | True last changed child/Epic activity timestamp intentionally out of scope; no lastActivityAt field added. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Per-Epic workflow query/hydration intentionally out of scope; no getHandle/query/describe added in CLI list path. |
| OOS3 | out_of_scope | not_applicable | not_applicable | ADV MCP `adv_epic_list` output not changed. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Dashboard/zellij launcher not changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-69ad44262fa2 | AC5 | AC1, AC2, AC3, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3, OOS4 |  |
| tk-13c3905cafde | AC1, AC2, AC3 | AC1, AC2, AC3 | C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2 |  |
| tk-615fc52d9a57 | SC1, AC1, AC2 | SC1, AC1, AC2 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3, OOS4 |  |
| tk-72771587042b |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3, OOS4 |  |
