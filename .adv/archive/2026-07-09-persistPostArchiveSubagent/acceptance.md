# Acceptance

Reviewed at: 2026-07-09T23:32:03.419Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | A sub-agent reviewing an already-shipped (terminal) change can save its report durably, and the main ADV agent reads it back — no reports lost to raw-text scraping. | pass | subagent-report.test.ts: archived change report persists via disk projection (test 'persists a report for an ARCHIVED change via disk projection'); readback verified; consumers fire follow_ups |
| SC2 | success_criterion | The fix reuses the existing durable disk-projection write pattern (`_recovery-writers.ts`); no new storage format is introduced. | pass | saveRecoveredSubagentReport in _recovery-writers.ts mirrors saveRecoveredDesignConcernDisposition; no new storage format; findArchiveBundle + atomicWriteFile reuse existing primitives |
| AC1 | acceptance_criterion | Submitting a report for an archived change persists it instead of returning `SUBMIT_SIGNAL_FAILED`. | pass | subagent-report.test.ts 'persists a report for an ARCHIVED change via disk projection': output.success=true, fireSignalAndRefresh not called, report in bundle change.json |
| AC2 | acceptance_criterion | A report persisted post-archive is returned by `adv_change_show include: { subagentReports: true }`. | pass | read path unchanged (loadTerminalProjection dominance verified by adv-researcher); adv_change_show include.subagentReports reads change.subagent_reports[] (change.ts:803) |
| AC3 | acceptance_criterion | Re-submitting the same report key (change_id, scope, agent, attempt) post-archive is idempotent — no duplicate entry is appended. | pass | subagent-report.test.ts 're-submitting the same report key is idempotent': second call returns duplicate:true, bundle has 1 report; _recovery-writers.test.ts dedupe test |
| AC4 | acceptance_criterion | Post-archive persistence carries an audit marker distinguishing it from signal-persisted reports. | pass | _recovery-writers.test.ts: recovery_audit.persisted_via = 'archive-sidecar' (bundle) or 'active-projection' (no bundle); marker set from actual write target |
| AC5 | acceptance_criterion | After post-archive persistence, report follow-ups still create agenda items (consumers run). | pass | subagent-report.test.ts 'consumers run after post-archive persistence': addAgendaItem called with follow_up 'Add docs', category subagent-followup |
| AC6 | acceptance_criterion | The report is readable without a live/running workflow for that change. | pass | read path uses loadTerminalProjection (disk-first), no live workflow query needed; verified by adv-researcher claim 1 |
| AC7 | acceptance_criterion | Active (in-progress) change report submission is unchanged — no regression to the signal path. | pass | subagent-report.test.ts 'active change still uses the signal path': fireSignalAndRefresh called once with subagentReportSubmittedSignal for status:active |
| C1 | constraint | The active-workflow signal path is unchanged (zero regression risk to in-flight changes). | respected | executeSubmit branches: active → existing signal path (unchanged); terminal → disk fallback. Active-path code untouched. |
| C2 | constraint | The read path needs no change — terminal-projection dominance already routes archived-change reads through the archive bundle change.json. | respected | No read-path files changed. change.ts, store-temporal/index.ts untouched. |
| C3 | constraint | The write reuses the `_recovery-writers.ts` disk-projection pattern rather than inventing a new persistence mechanism. | respected | saveRecoveredSubagentReport added to _recovery-writers.ts alongside sibling writers; reuses saveChange, atomicWriteFile, findArchiveBundle |
| DONT1 | avoidance | No `post_archive` schema flag — the tool detects terminal status; the caller is not burdened. | respected | No post_archive schema flag added; terminal detection is internal (status check + bundle existence) |
| DONT2 | avoidance | No separate post-archive report tool — `adv_subagent_report_submit` semantics stay unified. | respected | No separate tool; adv_subagent_report_submit unified API retained |

