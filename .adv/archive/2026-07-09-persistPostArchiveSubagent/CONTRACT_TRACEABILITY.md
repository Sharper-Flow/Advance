# Contract Traceability

**Change ID:** persistPostArchiveSubagent
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-09T23:32:03.419Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | subagent-report.test.ts: archived change report persists via disk projection (test 'persists a report for an ARCHIVED change via disk projection'); readback verified; consumers fire follow_ups |
| SC2 | success_criterion | pass | review | saveRecoveredSubagentReport in _recovery-writers.ts mirrors saveRecoveredDesignConcernDisposition; no new storage format; findArchiveBundle + atomicWriteFile reuse existing primitives |
| AC1 | acceptance_criterion | pass | test | subagent-report.test.ts 'persists a report for an ARCHIVED change via disk projection': output.success=true, fireSignalAndRefresh not called, report in bundle change.json |
| AC2 | acceptance_criterion | pass | test | read path unchanged (loadTerminalProjection dominance verified by adv-researcher); adv_change_show include.subagentReports reads change.subagent_reports[] (change.ts:803) |
| AC3 | acceptance_criterion | pass | test | subagent-report.test.ts 're-submitting the same report key is idempotent': second call returns duplicate:true, bundle has 1 report; _recovery-writers.test.ts dedupe test |
| AC4 | acceptance_criterion | pass | test | _recovery-writers.test.ts: recovery_audit.persisted_via = 'archive-sidecar' (bundle) or 'active-projection' (no bundle); marker set from actual write target |
| AC5 | acceptance_criterion | pass | test | subagent-report.test.ts 'consumers run after post-archive persistence': addAgendaItem called with follow_up 'Add docs', category subagent-followup |
| AC6 | acceptance_criterion | pass | test | read path uses loadTerminalProjection (disk-first), no live workflow query needed; verified by adv-researcher claim 1 |
| AC7 | acceptance_criterion | pass | test | subagent-report.test.ts 'active change still uses the signal path': fireSignalAndRefresh called once with subagentReportSubmittedSignal for status:active |
| C1 | constraint | respected | static_check | executeSubmit branches: active → existing signal path (unchanged); terminal → disk fallback. Active-path code untouched. |
| C2 | constraint | respected | static_check | No read-path files changed. change.ts, store-temporal/index.ts untouched. |
| C3 | constraint | respected | static_check | saveRecoveredSubagentReport added to _recovery-writers.ts alongside sibling writers; reuses saveChange, atomicWriteFile, findArchiveBundle |
| DONT1 | avoidance | respected | review | No post_archive schema flag added; terminal detection is internal (status check + bundle existence) |
| DONT2 | avoidance | respected | review | No separate tool; adv_subagent_report_submit unified API retained |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-358d68469e0c | AC3, AC4 |  | C3 |  |
| tk-aba897546373 | AC1, AC5, AC7 | AC1, AC2, AC3, AC5, AC6, AC7 | C1, C2 |  |
| tk-7a5502885c9b | SC1, SC2 | SC1 |  |  |
