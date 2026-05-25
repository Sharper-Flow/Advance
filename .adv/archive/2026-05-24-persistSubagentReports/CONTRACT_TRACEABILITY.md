# Contract Traceability

**Change ID:** persistSubagentReports
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Typed Zod schemas and adv_subagent_report_submit validation implemented; subagent-report tests and full pnpm test passed. |
| AC2 | acceptance_criterion | pass | test | adv_change_show include.subagentReports implemented; legacy prose parsing short-circuits when persisted reports exist; change/checkpoint/task tests passed. |
| AC3 | acceptance_criterion | pass | test | follow_ups, blockers, and verification consumers covered in subagent-report tests; full pnpm test passed. |
| AC4 | acceptance_criterion | pass | test | Agent asset tests parse markdown payload examples through Zod; ATTEMPT anchors pinned; relevant asset suites passed. |
| AC5 | acceptance_criterion | pass | test | .adv/specs/delegation-defaults/spec.json strengthened; .adv/specs/subagent-reports/spec.json added; spec asset tests passed. |
| AC6 | acceptance_criterion | pass | test | adv_subagent_report_submit accepts strict supported payloads and rejects malformed/unsupported payloads in subagent-report tests. |
| AC7 | acceptance_criterion | pass | test | subagentReportSubmittedSignal persistence path uses fireSignalAndRefresh; target_path handled through withTargetPathStore; tests passed. |
| AC8 | acceptance_criterion | pass | test | seenReportIds and subagentReportKey dedupe repeated submissions; ATTEMPT packet added; tests passed. |
| AC9 | acceptance_criterion | pass | test | adv_change_show include.subagentReports returns persisted reports; reports stored on task.subagent_reports; change tests passed. |
| AC10 | acceptance_criterion | pass | test | follow_ups to agenda, blockers to task error_recovery, verification warnings covered by subagent-report tests. |
| AC11 | acceptance_criterion | pass | test | adv-engineer and adv-reviewer asset tests parse examples through Zod and pin ATTEMPT anchors. |
| AC12 | acceptance_criterion | pass | test | workflow signal-handlers tests cover persisted report after message-loss scenario; focused and full tests passed. |
| AC13 | acceptance_criterion | pass | test | AC8 remediation commit 443000fe adds durable task error_recovery on invalid payload and submit-signal failure; tests for both paths pass; adv-reviewer PASS/READY. |
| AC14 | acceptance_criterion | pass | test | Fenced sentinel instructions removed from adv-engineer.md and adv-reviewer.md; checkpoint/task legacy extraction short-circuits when subagent_reports exist. |
| AC15 | acceptance_criterion | pass | test | adv-apply, adv-review, adv-harden, adv-engineer, and adv-reviewer contracts include ATTEMPT: N; asset tests passed. |
| AC16 | acceptance_criterion | pass | test | subagent-reports spec added with conformance_required:false; delegation-defaults rq-delDefaults05 strengthened; spec tests passed. |
| AC17 | acceptance_criterion | pass | test | SubagentAgentSchema includes reserved adv-researcher and adv-tron literals while submit tool rejects unsupported variants for v1. |
| AC18 | acceptance_criterion | pass | test | pnpm test, pnpm run check, pnpm run build, workflow-bundle tests passed after remediation. |
| AC19 | acceptance_criterion | pass | test | Existing TaskStructuredOutputSchema / extractStructuredOutput tests remain green in full suite and related targeted suites. |
| AC20 | acceptance_criterion | pass | test | Implementation and docs use tool-call report transport only for ADV sub-agent reports. |
| AC21 | acceptance_criterion | pass | test | ATTEMPT supplied by context packet and persisted in report identity key. |
| AC22 | acceptance_criterion | pass | test | AC8 remediation records total failure visibly through task error_recovery after tool retries fail; tests cover malformed and Temporal failure paths. |
| AC23 | acceptance_criterion | pass | test | Layer-3 consumers implemented and tested in subagent-report suite. |
| AC24 | acceptance_criterion | pass | test | No archive rendering added; reports exposed through change/task state only. |
| C1 | constraint | respected | static_check | No defineUpdate introduced; workflow mutation uses signals. |
| C2 | constraint | respected | static_check | Tool uses fireSignalAndRefresh for report and task update signals. |
| C3 | constraint | respected | static_check | target_path execution routes through withTargetPathStore and target store. |
| C4 | constraint | respected | static_check | plugin/src/temporal/workflow-bundle-boundary.test.ts passed. |
| C5 | constraint | respected | static_check | Strict Zod boundary for new report tool; legacy structured output tests remain green. |
| C6 | constraint | respected | static_check | Submit tool supports adv-engineer/adv-reviewer payloads and rejects reserved unsupported agents for v1. |
| C7 | constraint | respected | static_check | Reducer dedupe and signal-handler tests passed; no nondeterministic external imports in workflow bundle. |
| OOS1 | out_of_scope | respected | not_applicable | No A2A or external protocol implementation added. |
| OOS2 | out_of_scope | respected | not_applicable | No streaming partial report implementation added. |
| OOS3 | out_of_scope | respected | not_applicable | No OpenCode host changes required or added. |
| OOS4 | out_of_scope | respected | not_applicable | adv-researcher and adv-tron remain reserved literals without full schemas. |
| OOS5 | out_of_scope | respected | not_applicable | Archive rendering was not added. |
| OOS6 | out_of_scope | respected | not_applicable | Legacy structured-output infrastructure remains, with only short-circuit when persisted reports exist. |
| OOS7 | out_of_scope | respected | not_applicable | No hybrid sentinel+tool emission retained for ADV sub-agent report contracts. |
| OOS8 | out_of_scope | respected | not_applicable | No unrelated agent/command transport expansion added beyond scoped ADV report contracts. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7de058e0261f | AC1, AC4, AC22 | AC1, AC22 | C4, C5, OOS4, OOS7 |  |
| tk-36a9b807f4a1 | AC2, AC3, AC4, AC7, AC10 | AC2, AC3, AC7, AC10 | C1, C4, C7, OOS2, OOS3 |  |
| tk-8ff0d2a67d4e | AC1, AC2, AC5, AC6, AC8, AC11 | AC1, AC2, AC5, AC6, AC8, AC11 | C2, C3, C5, OOS3 |  |
| tk-e9a1422f34a7 | AC4, AC14, AC15 | AC4, AC14, AC15, AC24 | OOS5, C5 |  |
| tk-567e0f4e7c57 | AC9, AC11, AC12, AC13, AC16, AC17, AC18, AC19, AC20 | AC9, AC11, AC12, AC13, AC16, AC17, AC18, AC19, AC20 | OOS1, OOS3, OOS4, OOS8 |  |
| tk-d2ca6a15d680 | AC21 | AC21 | C1, C2, C5, OOS7 |  |
| tk-a01907a5086a |  | AC23, AC24, AC1, AC2, AC3, AC4, AC5, AC9, AC10, AC11, AC14, AC15, AC21, AC22 | C1, C2, C4, C5, OOS5 |  |
