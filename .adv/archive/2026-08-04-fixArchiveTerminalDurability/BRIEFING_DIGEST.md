# Archive Briefing Digest

**Change ID:** fixArchiveTerminalDurability
**Title:** Fix archive terminal durability
**Status:** archived
**Generated:** 2026-08-04T22:26:46.022Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 100 of 174 durable facts (74 omitted).

- **[report_follow_up]** follow_ups: The required replay fixture for terminal-projection-v1 remains owned by tk-a7c9c8ef5765 as specified by the task.
- **[unresolved_action]** required_main_agent_actions: Ensure tk-a7c9c8ef5765 adds replay fixture coverage before archive/release validation; the workflow evolution guard will require it.
- **[unresolved_action]** required_main_agent_actions: The broad pnpm test -- src/temporal/ invocation also exercised unrelated unit projects and reported pre-existing repository failures; the Temporal project-only run passed.
- **[archive_only_evidence]** decisions: Added the terminal-projection-v1 patched guard around the awaited terminal projection. — The new Activity changes the workflow command sequence; the guard preserves replay behavior for in-flight histories and keeps the write before allHandlersFinished.
- **[archive_only_evidence]** decisions: Changed projectChangeState to return written, unavailable, or failed outcomes. — An unset projection directory is now logged as change-projection-unavailable and cannot be mistaken for a durable write, while existing callers preserve their explicit failure rollback behavior.
- **[archive_only_evidence]** decisions: Covered archiveChangeSignal and closeChangeSignal with an ordered Activity/workflow completion assertion. — These signals exercise the shared terminal block directly and prove the projection Activity completes before workflow completion for both terminal statuses.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflows.projection.itest.ts (1) — RED: both new archived and closed assertions failed because workflow completed without a terminal projection Activity.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflows.projection.itest.ts src/temporal/__tests__/workflow-termination.itest.ts (0) — GREEN/targeted: terminal projection ordering and existing archive/close completion tests pass.
- **[archive_only_evidence]** verification: pnpm exec vitest run --project temporal src/temporal/ (0) — All Temporal project tests pass.
- **[archive_only_evidence]** verification: pnpm run build:worker (0) — Temporal worker and workflow bundles build successfully.
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm exec eslint src/temporal/workflows.ts src/temporal/workflows.projection.itest.ts && pnpm exec prettier --check src/temporal/workflows.ts src/temporal/workflows.projection.itest.ts (0) — Typecheck, touched-file ESLint, and Prettier checks pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseum614_b8542c50
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msev84xu_404c0eaa
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msev5wis_e29fbe64
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msev7dzn_432f1270
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msev963i_0acf5e52
- **[archive_only_evidence]** decisions: Removed the Route A statusAlreadyArchived projection guard while preserving the existing release-evidence, release-gate, durable-proof, transition, and cleanup ordering. — The disk-projection status is not authoritative for whether the workflow received the terminal transition; save remains downstream of release finalization and proof.
- **[archive_only_evidence]** decisions: Changed Route B to await successful existing-bundle reconciliation, then call store.changes.save without invoking archiveChange or cleanup. — This requests the state-setter transition on stale archived projections while retaining per-side-effect idempotency for bundle writes and branch deletion.
- **[archive_only_evidence]** decisions: Updated archived-retry tests to expect repeated safe transition requests while continuing to assert no bundle rewrite, finalization rerun, worktree cleanup, or branch deletion. — Re-signalling the terminal state-setter is safe; suppressing it was the defect.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (1) — RED: the new stale-archived-projection regression assertion failed before the implementation; two downstream expectations also required isolation-safe mock setup.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts (0) — GREEN: 2 test files passed, 222 tests passed; Route B transition request and no-duplicate bundle/branch side effects verified.
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run lint && pnpm run format:check (0) — Typecheck and formatting passed; lint passed with 4 existing no-explicit-any warnings in untouched temporal files and 0 errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msew4433_0f5d4b69
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msewub2b_5e7d0b17
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msewtdeb_f2ca5d4a
- **[archive_only_evidence]** decisions: Added a bounded post-save describe proof shared by both archive save routes. — Signal/save acceptance does not prove the workflow applied archive intent; describe is the authoritative post-request check and remains after release finalization and archive status save.
- **[archive_only_evidence]** decisions: Classified exhausted proof failures with classifyMutationRecoveryDecision but never performed recovery writes. — Workflow-not-found and transient describe failures are ambiguous/unknown; archive must return typed failure rather than silently stamping status, gates, or reporting success.
- **[archive_only_evidence]** decisions: Accepted RUNNING, COMPLETED, and ARCHIVED describe states; rejected missing or unrelated terminal states. — RUNNING is explicitly an acceptable live post-request proof, while completed/archive states are consistent terminal outcomes and other states cannot prove archive intent.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (1) — RED evidence: new post-save proof tests failed before implementation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — GREEN: 65 archive Phase 9 tests pass, including not-found fail-closed, terminal-state success, and transient retry coverage.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — 160 change lifecycle tests pass, including existing-bundle retry proof coverage.
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run lint (0) — Typecheck passes; lint passes with four existing explicit-any warnings and no errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msey3pp8_6f77f3ee
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseydlq6_638bc3b4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseydnfi_467cb583
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseyhbzz_c9c55feb
- **[archive_only_evidence]** decisions: Added paired generator branches for terminal-archive and terminal-archive-legacy. — The current branch records both projection patch markers and awaits projection activities; the legacy variant disables only those two patch calls so the same gate/archive signal history replays through the old command sequence.
- **[archive_only_evidence]** decisions: Used a release gate with a not-applicable worker-bundle declaration and omitted the projection directory only for the legacy fixture. — This keeps the generated history focused on the terminal and gate projection patches while avoiding unrelated release provenance blockers and fire-and-forget activity races in the pre-patch path.
- **[archive_only_evidence]** decisions: Extended replay assertions to require both current markers and explicitly reject both markers in the legacy history. — Marker presence is durable evidence that each history took the intended patched or legacy branch.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts -t "replays committed history fixture" (1) — RED confirmed: removing the two new fixture pairs makes both replay cases fail with ENOENT.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts (0) — GREEN: all 17 replay-determinism tests pass, including pre-patch and patched terminal archive histories.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflow-evolution-guard.test.ts (0) — All 17 workflow-evolution-guard tests pass.
- **[archive_only_evidence]** verification: pnpm --dir plugin run build:worker (0) — Temporal worker and workflow bundles build successfully; worker manifest written.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passes cleanly.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2k3ol_1a7f65ca
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2lf35_51094f15
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2h204_1f8f6c0a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2hoy8_081246c5
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2icx3_61cd543b
- **[archive_only_evidence]** decisions: Enabled loadArchiveForActiveShadow for listSummary and corrected the list() comment. — list() and listSummary() already share readProjectionChangeList; aligning the one option preserves the existing bounded archive-directory scan and makes status resolution agree with archive-dominant get().
- **[archive_only_evidence]** decisions: Removed fromCache from HydrationStats and its producers/fixtures. — No cache hydration path increments this field, so exposing zero was an absent feature presented as a measurement; removal is more honest than retaining a permanently false counter.
- **[archive_only_evidence]** decisions: Omitted terminalFromWorkflow from terminal-history hydrationStats while retaining real workflow counts in the shared list reader. — renderTerminalHistory has archive and disk sources only, with no workflow hydration path; omitting the field avoids claiming a measured zero while changes.ts continues to count actual workflow fallback rows.
- **[archive_only_evidence]** decisions: Added the regression at the tool surface using a real temporal store fixture. — The test invokes adv_change_list and adv_change_show together against a stale disk projection plus archive bundle, asserting the active list never reports the stale draft and show reports archived.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts (1) — RED: regression test failed because adv_change_list exposed the stale draft while adv_change_show resolved archived.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts (0) — GREEN: 34 index tests pass, including the list/show stale-projection regression.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts (0) — 27 changes-store tests pass; hydration stats no longer expose fromCache.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/archive/terminal-history.test.ts (0) — 13 terminal-history tests pass; absent terminalFromWorkflow is omitted.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — 160 change-tool tests pass after hydration-stat contract cleanup.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/archive/terminal-history.ts src/archive/terminal-history.test.ts src/storage/store-temporal/changes.ts src/storage/store-temporal/changes.test.ts src/storage/store-temporal/index.test.ts src/types/responses.ts src/tools/change.test.ts (0) — Prettier check passes for all touched files.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck && pnpm --dir plugin run lint (0) — Typecheck passes; lint exits 0 with four pre-existing warnings in untouched temporal files.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexch3l_44d42bec
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexdjww_be4a9d58
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexkcvz_cc96c6e1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexk0st_b11aa4a0
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexjepy_501ca5db
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexkqpp_e314848a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msexm27z_4cf9820f
- **[archive_only_evidence]** decisions: Admitted archived projections only after describe() throws an exact WorkflowNotFoundError. — Preserves the archived purge boundary for reachable workflows and prevents Visibility or broad error text from authorizing repair.
- **[archive_only_evidence]** decisions: Reused convergeTerminalAuthority rather than adding a writer. — The existing path funnels status/lifecycle projection mutation through the recovery writer and coordinateChangeMutation, preserving a single mutation authority.
- **[archive_only_evidence]** decisions: Added default-branch release reachability and bundle SHA/proof receipt to the repair result. — The no-workflow population requires full shipped evidence, and operators need durable per-change evidence for each convergence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts (0) — 37 workflow-termination tests pass, including archived no-workflow convergence and default-branch proof refusal.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — 65 archive Phase 9 tests pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — 160 change-tool tests pass.
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run lint (0) — Typecheck passes; lint passes with four pre-existing warnings and zero errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseze5cs_2b9d386f
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msezaaet_e01c37a2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msezabg0_9350b856
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msezewyp_1439d69c
- **[archive_only_evidence]** decisions: Evaluate archive evidence before the stale non-terminal disk projection veto. — AC9 defines the merged archive bundle as higher-precedence evidence when the disk projection lags.
- **[archive_only_evidence]** decisions: Remove the global no-archive early return and enumerate RUNNING workflows even when the archive set is empty. — This preserves typed no_archive_evidence/still_active diagnostics for candidates instead of silently dropping their skip reasons.
- **[archive_only_evidence]** decisions: Publish the typed skipped entries in doctor output while retaining the existing plugin-init result surface. — Operators need each changeId and reason; plugin-init already retains the full TerminalReconcileResult, so its diagnostic getter now documents that contract.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/reconcile-terminal-workflows.test.ts src/tools/doctor.test.ts (0) — 52 targeted tests passed, covering archive-bundle precedence, stale-disk veto reasons, and doctor skip-reason output.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck && pnpm --dir plugin run lint (0) — Typecheck and lint passed; lint emitted four existing warnings in unrelated temporal support files and no errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf00z8o_4329f0cd
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf027g5_1d0f69b0
- **[archive_only_evidence]** decisions: Mapped the projection transaction outcome inside archive-gate.ts and returned the typed result from commitArchiveReleaseGateProjection. — The helper previously discarded the transaction outcome, so the caller could not distinguish committed_unverified from verified success.
- **[archive_only_evidence]** decisions: Fail closed only for recovered_unverified while preserving existing handling for verified success and genuine refusal/failure outcomes. — This satisfies DONT5 without changing the existing typed paths for other commit outcomes.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts (0) — 53 archive-gate tests pass, including committed-unverified fail-closed and verified-success coverage.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/tools/change/archive-gate.ts src/tools/change/archive-gate.test.ts && pnpm run typecheck && pnpm run lint (0) — Prettier check and TypeScript typecheck pass; ESLint exits 0 with 4 pre-existing warnings outside the touched files.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0u7ls_2590846a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0u7ls_2590846a
- **[report_follow_up]** follow_ups: Full plugin format:check has unrelated findings in the three listed tool files; no out-of-scope edits were made.
- **[archive_only_evidence]** decisions: Classified gateCompleted :1786 UNSAFE and repaired it with awaited projectChangeState under gate-completed-projection-v1. — void scheduleChangeProjection plus afterSuccess:false could let the sole gate projection outrun durability; legacy histories retain the old command sequence via the patch guard.
- **[archive_only_evidence]** decisions: Classified archiveRequested :1939 SAFE. — The handler awaits archive activity and projection; failed projection rolls back state and marks release stuck.
- **[archive_only_evidence]** decisions: Classified archiveConverged :2001 SAFE. — The handler awaits projection and atomically rolls back convergence mutations on failure.
- **[archive_only_evidence]** decisions: Classified changeCancelled :2042 SAFE. — The handler awaits projection and restores prior state on failure.
- **[archive_only_evidence]** decisions: Classified archiveChange :2168 SAFE. — The shared terminal path awaits terminal projection before allHandlersFinished and workflow completion.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Full plugin format:check reports three untouched out-of-scope tool files; touched files pass targeted Prettier.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.projection.itest.ts (1) — RED: gate projection assertion failed before the awaited fix.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.projection.itest.ts (0) — GREEN: 4 projection tests pass.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| AC13 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| C9 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| DONT9 | avoidance | respected |
| DONT10 | avoidance | respected |

## Unresolved Actions

- Ensure tk-a7c9c8ef5765 adds replay fixture coverage before archive/release validation; the workflow evolution guard will require it.
- The broad pnpm test -- src/temporal/ invocation also exercised unrelated unit projects and reported pre-existing repository failures; the Temporal project-only run passed.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseum614_b8542c50
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msev84xu_404c0eaa
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msev5wis_e29fbe64
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msev7dzn_432f1270
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msev963i_0acf5e52
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msew4433_0f5d4b69
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msewub2b_5e7d0b17
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msewtdeb_f2ca5d4a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msey3pp8_6f77f3ee
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseydlq6_638bc3b4
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseydnfi_467cb583
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseyhbzz_c9c55feb
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2k3ol_1a7f65ca
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2lf35_51094f15
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2h204_1f8f6c0a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2hoy8_081246c5
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2icx3_61cd543b
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexch3l_44d42bec
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexdjww_be4a9d58
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexkcvz_cc96c6e1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexk0st_b11aa4a0
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexjepy_501ca5db
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexkqpp_e314848a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msexm27z_4cf9820f
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseze5cs_2b9d386f
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msezaaet_e01c37a2
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msezabg0_9350b856
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msezewyp_1439d69c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf00z8o_4329f0cd
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf027g5_1d0f69b0
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0u7ls_2590846a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0u7ls_2590846a
- finish_owned_scope_then_report: Full plugin format:check reports three untouched out-of-scope tool files; touched files pass targeted Prettier.
