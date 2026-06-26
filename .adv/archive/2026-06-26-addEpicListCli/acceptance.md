# Acceptance

Reviewed at: 2026-06-26T04:12:05Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** Toolbox can consume `adv epic list --json` without ADV state scraping. | pass | adv-reviewer report addEpicListCli|change:review:acceptance|adv-reviewer|1 verdict READY; inspected CLI source/tests. Live run tr_mquf0bhz_bf3c3595 shows `bin/adv epic list --json` emits Temporal JSON for current project without ADV state scraping. |
| SC2 | success_criterion | **SC2:** CLI output distinguishes live success from fail-closed Temporal failure. | pass | Helper/dispatcher tests tr_mquemu5t_f093c1c8 passed 20 tests; failure-path coverage in bin/lib/epic-list.test.ts and bin/adv.test.ts verifies live success vs fail-closed Temporal failure fields. |
| SC3 | success_criterion | **SC3:** Command does not require an ADV worker polling the project task queue. | pass | Review report READY; implementation uses createTemporalClientBundle + listEpicWorkflowIds Visibility helper, not workflow task-queue polling. Static guard test tr_mquen25j_343810b0 passed. |
| AC1 | acceptance_criterion | **AC1:** `bin/adv epic list --json` exits `0` in a git repo when Temporal Visibility list succeeds and outputs JSON with `source:"temporal"`, `live:true`, `stale:false`, `generated_at`, `project_id`, and `epics`. | pass | Live command verification tr_mquf0bhz_bf3c3595: exit 0 and JSON includes source:"temporal", live:true, stale:false, generated_at, project_id, epics. Bun tests tr_mquemu5t_f093c1c8 also passed. |
| AC2 | acceptance_criterion | **AC2:** Success payload `epics` contains objects shaped `{ "id": string }` and excludes workflow IDs outside `adv/epic/{projectId}/`. | pass | Bun helper tests tr_mquemu5t_f093c1c8 passed; tests cover {id:string} object shape and filtering to adv/epic/{projectId}/ workflow IDs. |
| AC3 | acceptance_criterion | **AC3:** Temporal/list failure exits non-zero and outputs JSON with `source:"temporal"`, `live:false`, `stale:false`, `epics:[]`, `error`, and `remediation`. | pass | Bun helper/dispatcher tests tr_mquemu5t_f093c1c8 passed; failure tests assert non-zero fail-closed JSON with source:"temporal", live:false, stale:false, epics:[], error, and remediation. |
| AC4 | acceptance_criterion | **AC4:** CLI help lists `epic list`; existing `status`, `roadmap`, `slop-scan`, and `dashboard` behavior remains covered. | pass | Dispatcher tests tr_mquemu5t_f093c1c8 passed 20 tests; coverage includes help listing `epic list` and existing status/roadmap/slop-scan/dashboard behavior. |
| AC5 | acceptance_criterion | **AC5:** Tests prove no mutation subcommands are introduced through the new `epic` dispatch path. | pass | Static cli-bridge guard test tr_mquen25j_343810b0 passed 18 tests; EPIC_READ_ONLY_SUBCOMMANDS allowlist only contains list and forbids mutation verbs. |
| AC6 | acceptance_criterion | **AC6:** Implementation uses Temporal Visibility enumeration, not ADV state file reads or per-Epic workflow state queries. | pass | Static guard test tr_mquen25j_343810b0 passed; verifies use of listEpicWorkflowIds and rejects per-Epic getHandle queries/file reads. Reviewer inspected bin/lib/epic-list.ts. |
| C1 | constraint | **C1:** CLI remains read-only. | respected | EPIC_READ_ONLY_SUBCOMMANDS allowlist and static test tr_mquen25j_343810b0 prove only read-only list dispatch exists in epic namespace. |
| C2 | constraint | **C2:** No disk fallback for active/live Epic rows. | respected | Failure payload tests in tr_mquemu5t_f093c1c8 verify Temporal/list failures return fail-closed JSON instead of disk fallback. |
| C3 | constraint | **C3:** No full Epic hydration. | respected | Static guard test tr_mquen25j_343810b0 and reviewer inspection confirm listEpicWorkflowIds is used without per-Epic workflow state hydration. |
| C4 | constraint | **C4:** Scope is current repo implementation only; toolbox consumer remains out of scope. | respected | Changed files are current Advance repo CLI/spec/docs/tests only; no toolbox consumer files touched. Reviewer report READY. |
| DONT1 | avoidance | **DONT1:** Do not scrape ADV external state. | respected | Reviewer inspected implementation; static guard tr_mquen25j_343810b0 verifies no ADV state file reads in Epic list path. |
| DONT2 | avoidance | **DONT2:** Do not add `adv epic create`, `adv epic update`, or `adv epic delete`. | respected | Static guard tr_mquen25j_343810b0 verifies EPIC_READ_ONLY_SUBCOMMANDS contains only list and excludes create/update/delete mutation verbs. |
| DONT3 | avoidance | **DONT3:** Do not require a running project worker. | respected | Implementation uses Temporal client Visibility helper listEpicWorkflowIds, not project worker task-queue polling; reviewer report READY. |
| DONT4 | avoidance | **DONT4:** Do not silently return stale disk data. | respected | Failure behavior tests tr_mquemu5t_f093c1c8 and reviewer inspection confirm Temporal failure reports live:false/stale:false with error/remediation and no silent stale disk data. |

