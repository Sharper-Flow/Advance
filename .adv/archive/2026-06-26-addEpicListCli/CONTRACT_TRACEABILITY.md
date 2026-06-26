# Contract Traceability

**Change ID:** addEpicListCli
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T04:12:05Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer report addEpicListCli|change:review:acceptance|adv-reviewer|1 verdict READY; inspected CLI source/tests. Live run tr_mquf0bhz_bf3c3595 shows `bin/adv epic list --json` emits Temporal JSON for current project without ADV state scraping. |
| SC2 | success_criterion | pass | review | Helper/dispatcher tests tr_mquemu5t_f093c1c8 passed 20 tests; failure-path coverage in bin/lib/epic-list.test.ts and bin/adv.test.ts verifies live success vs fail-closed Temporal failure fields. |
| SC3 | success_criterion | pass | review | Review report READY; implementation uses createTemporalClientBundle + listEpicWorkflowIds Visibility helper, not workflow task-queue polling. Static guard test tr_mquen25j_343810b0 passed. |
| AC1 | acceptance_criterion | pass | test | Live command verification tr_mquf0bhz_bf3c3595: exit 0 and JSON includes source:"temporal", live:true, stale:false, generated_at, project_id, epics. Bun tests tr_mquemu5t_f093c1c8 also passed. |
| AC2 | acceptance_criterion | pass | test | Bun helper tests tr_mquemu5t_f093c1c8 passed; tests cover {id:string} object shape and filtering to adv/epic/{projectId}/ workflow IDs. |
| AC3 | acceptance_criterion | pass | test | Bun helper/dispatcher tests tr_mquemu5t_f093c1c8 passed; failure tests assert non-zero fail-closed JSON with source:"temporal", live:false, stale:false, epics:[], error, and remediation. |
| AC4 | acceptance_criterion | pass | test | Dispatcher tests tr_mquemu5t_f093c1c8 passed 20 tests; coverage includes help listing `epic list` and existing status/roadmap/slop-scan/dashboard behavior. |
| AC5 | acceptance_criterion | pass | test | Static cli-bridge guard test tr_mquen25j_343810b0 passed 18 tests; EPIC_READ_ONLY_SUBCOMMANDS allowlist only contains list and forbids mutation verbs. |
| AC6 | acceptance_criterion | pass | test | Static guard test tr_mquen25j_343810b0 passed; verifies use of listEpicWorkflowIds and rejects per-Epic getHandle queries/file reads. Reviewer inspected bin/lib/epic-list.ts. |
| C1 | constraint | respected | static_check | EPIC_READ_ONLY_SUBCOMMANDS allowlist and static test tr_mquen25j_343810b0 prove only read-only list dispatch exists in epic namespace. |
| C2 | constraint | respected | static_check | Failure payload tests in tr_mquemu5t_f093c1c8 verify Temporal/list failures return fail-closed JSON instead of disk fallback. |
| C3 | constraint | respected | static_check | Static guard test tr_mquen25j_343810b0 and reviewer inspection confirm listEpicWorkflowIds is used without per-Epic workflow state hydration. |
| C4 | constraint | respected | static_check | Changed files are current Advance repo CLI/spec/docs/tests only; no toolbox consumer files touched. Reviewer report READY. |
| DONT1 | avoidance | respected | review | Reviewer inspected implementation; static guard tr_mquen25j_343810b0 verifies no ADV state file reads in Epic list path. |
| DONT2 | avoidance | respected | review | Static guard tr_mquen25j_343810b0 verifies EPIC_READ_ONLY_SUBCOMMANDS contains only list and excludes create/update/delete mutation verbs. |
| DONT3 | avoidance | respected | review | Implementation uses Temporal client Visibility helper listEpicWorkflowIds, not project worker task-queue polling; reviewer report READY. |
| DONT4 | avoidance | respected | review | Failure behavior tests tr_mquemu5t_f093c1c8 and reviewer inspection confirm Temporal failure reports live:false/stale:false with error/remediation and no silent stale disk data. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1c072b49d98e | AC4 |  | AC5, AC6, C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-ae8c8f184a6e | SC2, SC3, AC1, AC2, AC3, AC6 | AC1, AC2, AC3, AC6 | C2, C3, DONT1, DONT3, DONT4 |  |
| tk-968dd9ca2147 | SC1, AC1, AC3, AC4 | AC1, AC3, AC4 | C1, C2, DONT2, DONT4 |  |
| tk-05ec7429bb8a | AC5 | AC5, AC6 | C1, C3, DONT2, DONT3 |  |
| tk-894a2a77bed0 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
