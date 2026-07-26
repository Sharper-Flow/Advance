# Acceptance

Reviewed at: 2026-07-25T21:18:01.368Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** — Given a done stage-v2 code task with `evidence_policy: review` and a persisted same-task `adv-reviewer` report, when acceptance or release readiness runs, then no `VERIFICATION_EVIDENCE_MISSING` blocker is emitted solely from the reviewer's aggregate `tests_run` list. *(Regression test: red → green.)* | pass | subagent-report + gate-readiness tests. tr_ms0ujmvp, tr_ms0v2cg0. |
| AC2 | acceptance_criterion | **AC2** — Given a done task with `evidence_policy: test` or `evidence_policy: static_check` whose only evidence is a reviewer aggregate command list (no durable `adv_run_test` run), when readiness runs, then the block remains (`VERIFICATION_EVIDENCE_MISSING` still fires). Reviewer prose does not satisfy these policies. | pass | gate-readiness AC2 regression. tr_ms0v2cg0. |
| AC3 | acceptance_criterion | **AC3** — Given a done task with `evidence_policy: source_audit` or `evidence_policy: rubric_review`, when reviewer warnings exist, then no verification-evidence blocker is emitted. *(Already the case today; regression-protect.)* | pass | gate-readiness AC3 warn-first. tr_ms0v2cg0. |
| AC4 | acceptance_criterion | **AC4** — Given a change-scoped `adv-reviewer` report, when task completion validation runs, then it cannot satisfy the task's `review_evidence_ref`. Same-task ownership is preserved. | pass | gate-readiness AC4 change-scoped rejected. tr_ms0v2cg0. |
| AC5 | acceptance_criterion | **AC5** — The `verification_missing` emitter in `plugin/src/tools/subagent-report.ts` is policy-gated: it fires `verification_missing` for `test`/`static_check` evidence policies but suppresses it for `review` policy when the report originates from `agent: "adv-reviewer"`. | pass | subagent-report TDD red->green. tr_ms0ujmvp. |
| C1 | constraint | **C1** — Same-task reviewer ownership and `adv-reviewer` identity for `review_evidence_ref` must be preserved (`task-classifier.ts:382-394`). | respected | task-classifier.ts:382-394 unchanged. |
| C2 | constraint | **C2** — No change-scoped report may satisfy task-level reviewer evidence linkage (`subagent-reports.ts:50-67, 471-477`). | respected | subagent-reports.ts:50-67,471-477 unchanged. |
| C3 | constraint | **C3** — `test` / `static_check` policies remain backed by independently durable execution evidence (`test.ts:484-558`); reviewer aggregate command prose cannot satisfy them. | respected | subagent-report.ts:493-587 unchanged. |
| C4 | constraint | **C4** — No fake `adv_run_test` records may be synthesized from report-submitted command claims. Auto-recording reviewer commands as `adv_run_test` runs is explicitly rejected (direction 2). | respected | Direction (2) rejected; no auto-record. |
| C5 | constraint | **C5** — Existing acceptance-summary `review:acceptance` boundary remains separate and unchanged (`subagent-reports.ts:471-477`). | respected | subagent-reports.ts:471-477 unchanged. |
| DONT1 | avoidance | **DONT1** — Do not extend the reviewer-authority exception to `test` or `static_check` policies. Those still require durable execution evidence from `adv_run_test` or equivalent capture. | respected | AC2 confirms block for test/static_check. |
| DONT2 | avoidance | **DONT2** — Do not auto-record `adv_run_test` runs from reviewer report claims. Reviewer reports carry aggregate `tests_run: string[]` without per-command exit codes, typed run IDs, duration, or execution classification. Writing `adv_run_test` records from these claims would falsely represent execution and bypass `adv_run_test`'s capture path. | respected | Direction (2) rejected. |
| DONT3 | avoidance | **DONT3** — Do not add a new duplicate authority field or signal. `review_evidence_ref` already provides typed reviewer ownership, same-task binding, and stage-v2 completion proof. A second "accepts-verification" path duplicates authority without adding a missing identity boundary. | respected | Direction (3) rejected. |
| OOS1 | out_of_scope | **OOS1** — Schema gap in `ChangeScopedReviewerSubagentReportSchema` not enforcing reviewer-key pairing (`subagent-reports.ts:57-62, 471-477, 783-791`). Different defect; track separately. | missing |  |
| OOS2 | out_of_scope | **OOS2** — Reviewer agent behavior changes (reviewer still runs commands and reports them as aggregate verification). | missing |  |
| OOS3 | out_of_scope | **OOS3** — Evidence policy taxonomy redesign. | missing |  |

