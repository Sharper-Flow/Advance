# Contract Traceability

**Change ID:** addAdvanceEpics
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T23:52:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | pass | static_check | ChangeSchema keeps epic_membership optional single object; non-Epic change behavior preserved. Covered by src/types/epics.test.ts and final targeted/full suites. |
| C2 | constraint | pass | static_check | Epic order remains display/recommendation-only; tests and docs assert advisory behavior. No gate/task blocking path added for earlier incomplete entries. |
| C3 | constraint | pass | static_check | Shell entry schema/tools require title and success_hint only; promotion creates full change later. Covered by types/tools Epic tests and spec assets. |
| C4 | constraint | pass | static_check | Epics implemented as typed Zod schemas, signal payload schemas, pure state reducers, per-Epic Temporal workflow, store APIs, and tests. `pnpm run check` and full suite passed. |
| C5 | constraint | pass | static_check | Default Epic/change surfaces expose compact membership/member_status and bounded history/next-work rows; full context remains explicit. Reviewer READY with no bounded-output findings. |
| C6 | constraint | pass | static_check | AdvEpicId implemented as single Keyword search attribute; workflow-safe import and Temporal boundary tests passed; targeted visibility/store/workflow tests and `pnpm run check` passed. |
| C7 | constraint | pass | static_check | Cross-project Epic membership routes child projection mutation through target-path store/trust checks; reviewer praised target_path mutation trust gate and Temporal queue serviceability. Targeted Epic tools tests and check passed. |
| C8 | constraint | pass | static_check | Retroactive link/move/unlink uses separate epic_membership projection and audit payloads; fast_follow_of is not used or rewritten. Asset/spec tests lock this requirement. |
| DONT1 | avoidance | respected | review | Review found optional membership preserved; non-Epic changes remain valid and unchanged in rendering when no epic_membership exists. |
| DONT2 | avoidance | respected | review | Spec/assets reject Jira-like fields; reviewer found no assignments, estimates, boards, sprints, or ownership workflow clone. |
| DONT3 | avoidance | respected | review | Implementation adds ADV-native Epics and compact next-work/status context only; no GitHub Projects clone semantics added. |
| DONT4 | avoidance | respected | review | Order remains advisory in docs/spec/tests and no hard gate/task blockers were introduced for later entries. |
| DONT5 | avoidance | respected | review | Shell entries remain lightweight title + success_hint rows and can be promoted later; no proposal/discovery prerequisite for shell existence. |
| DONT6 | avoidance | respected | review | All membership changes go through typed MCP/store/workflow signal paths: link, unlink, move, repair. No manual ADV state edit path introduced. |
| DONT7 | avoidance | respected | review | Retrofit membership uses epic_membership and project-aware Epic entries; fast_follow_of remains creation lineage only. |
| DONT8 | avoidance | respected | review | Product Epic scope can include entries from multiple repo/project IDs in one owner Epic; no duplicate repo-local Epic required for one product initiative. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-bf68709381f7 | C1, C2, C6 | C1, C2 | DONT1, DONT2, DONT6 |  |
| tk-0267904f70de | C1, C2, C4 | C1, C2, C4 | DONT4, DONT6, DONT7 |  |
| tk-e3348d587e70 | C6 | C6 | DONT7 |  |
| tk-7e840db50eb4 | C1, C2, C3 | C2, C3 | DONT4, DONT5, DONT6 |  |
| tk-04e7a2173097 | C6 | C6 | DONT4 |  |
| tk-47f9160672b6 | C6 | C6 | DONT1, DONT3, DONT4 |  |
| tk-1982a3aeaa30 | C4, C5, C6 | C4, C5, C6 | DONT6, DONT7 |  |
| tk-66a08b2f5c97 |  | C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-7d03eafdd849 | C1, C3, C4, C6, C8 | C1, C4, C8 | DONT7, DONT8 |  |
| tk-4af9c75a5196 | C4, C5, C6 | C4, C5, C6 | DONT6, DONT7 |  |
| tk-e7549ee678a1 | C4, C5, C6 | C4, C5, C6 | DONT6, DONT7 |  |
| tk-cfaab7c29934 | C7, C8 | C7, C8 | DONT8 |  |
| tk-8dfa0ebf9767 | C5, C6, C7 | C5, C6, C7 | DONT6, DONT8 |  |
| tk-6edec80ed965 | C4, C5, C8 | C4, C5, C8 | DONT6, DONT7, DONT8 |  |
| tk-00c0cbcc9c4d |  | C1, C4, C5, C6, C7, C8 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8 |  |
