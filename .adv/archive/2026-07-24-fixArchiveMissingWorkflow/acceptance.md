# Acceptance

Reviewed at: 2026-07-24T04:34:22.450Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** A shipped, gate-done change with a genuinely-missing workflow retires through the normal archive flow (bundle written, Phase 9 starts) instead of throwing `Failed to query Workflow`. | pass | Flipped archive test asserts missing-workflow change archives via disk projection + writes bundle (tr_mryec6u4). |
| AC1 | acceptance_criterion | **AC1** On archive preflight, when `describe()` throws `WorkflowNotFoundError`/completed, the monotonic-recovery classifier returns `recover_via_disk` (`missing_workflow`); archive reads the durable disk projection and writes the bundle. RED: pinned test `plugin/src/tools/change.archive-phase9.test.ts:1900` currently asserts it throws → GREEN: asserts it recovers via disk + writes bundle. | pass | monotonic-recovery.test.ts typed WorkflowNotFoundError -> recover_via_disk; archive-phase9 flipped test asserts loadChange + archiveChange (tr_mryef197). |
| AC2 | acceptance_criterion | **AC2** A reachable-but-poisoned workflow still recovers via the existing `poisoned_history` path — no regression. | pass | Poisoned probe-first path preserved; 19+48 tests green. |
| AC3 | acceptance_criterion | **AC3** A reachable, healthy workflow still proceeds via the normal signal/store path — no false disk recovery. | pass | describe() healthy -> proceed_with_signal (unchanged). |
| AC4 | acceptance_criterion | **AC4** A `query_failed` / authority-disagreement case still returns `operator_required` — no unsafe broadening to indeterminate failures. | pass | it.each guards: not-found/NOT_FOUND and completed message-substrings -> proceed_with_signal; signal-error query_failed -> operator_required unchanged. |
| AC5 | acceptance_criterion | **AC5** Missing workflow AND incomplete disk projection (no archive bundle / missing gates) → refuse with a typed error; no partial/best-effort archive. | pass | archive-phase9 test: missing workflow + incomplete disk -> 'Cannot archive: incomplete gates' + archiveChange NOT called. |
| C1 | constraint | **C1** Fix localized to `plugin/src/tools/monotonic-recovery.ts` probe-first path + tests; no new persistence layer, tombstone, compatibility record, or daemon (`rq-directMonotonicRecovery01.4`). | respected | Diff +168/-23; no new persistence/daemon. |
| C2 | constraint | **C2** Reuse existing `isWorkflowCompletedError` / `recoveryReasonFromError` from `plugin/src/temporal/recovery-classification.ts`; invent no new classification path. | respected | isWorkflowAbsentByExactName reuses existing COMPLETED_WORKFLOW_NAMES; DRY refactor. No parallel classification. |
| C3 | constraint | **C3** No release-gate-done fabrication; the disk projection carries the real gate state (`rq-releaseProjectionDurability01`). | respected | Disk branch only swaps read source; AC5 proves no fabrication. |
| DONT1 | avoidance | **DONT1** Do not auto-recover on indeterminate `query_failed` describe failures — only precise `missing_workflow`/completed authorizes disk recovery. | respected | Probe-first catch recovers ONLY on isWorkflowAbsentByExactName; guards pin this. |
| DONT2 | avoidance | **DONT2** Do not reintroduce operator `recoveryMode`/`recoveryEvidence` ceremony — `rq-directMonotonicRecovery01` mandates internal convergence. | respected | No recoveryMode/recoveryEvidence reintroduced. |
| OOS1 | out_of_scope | **OOS1** `adv_archive_purge`'s separate missing-workflow read path — fast-follow (different lifecycle stage: purge, not archive). | missing |  |

