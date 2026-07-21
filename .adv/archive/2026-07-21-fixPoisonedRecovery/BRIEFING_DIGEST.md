# Archive Briefing Digest

**Change ID:** fixPoisonedRecovery
**Title:** Fix poisoned recovery reachability
**Status:** archived
**Generated:** 2026-07-21T16:10:40.408Z

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

Epic: hardenTemporalReliability · Fix poisoned recovery reachability (order 2)

## Durable Facts

Showing 100 of 112 durable facts (12 omitted).

- **[archive_only_evidence]** decisions: Logger import path: import { createLogger } from "../utils/debug-log"; const logger = createLogger("recovery-probe") — plugin/src/utils/logger.ts does not exist. plugin-init.ts uses createLogger from ./utils/debug-log. utils/debug-log exports createLogger (verified line 85). Followed existing project convention rather than guessing a path.
- **[archive_only_evidence]** decisions: Inserted new exports between workflowPoisonedDescriptionEvidence and the private helpers (stringifyDescription/summarizeEvidence) — Spec said 'append after existing exports, before private helpers'. Keeps exported surface grouped; preserves private-helper ordering.
- **[archive_only_evidence]** decisions: Used edit (not morph_edit) for all three changes — Edits were small, precise, exact-string. morph_edit reserved for large/scattered/whitespace-sensitive edits per always-on morph-tools policy.
- **[archive_only_evidence]** decisions: oc-test command run from worktree root with filter path relative to plugin/ (e.g. 'src/tools/recovery-probe.test.ts') — oc-test internally cd's into plugin/ before invoking vitest. Filter paths must be plugin-relative, not worktree-relative. First attempt with 'plugin/src/...' produced 'No test files found'.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/recovery-probe.test.ts (1) — RED: 10 new tests fail (TypeError — helpers not yet defined), 8 existing pass. Confirms tests bind to not-yet-existing exports.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/recovery-probe.test.ts (0) — GREEN: 18/18 pass (8 pre-existing + 7 shouldTakeRecoveryBranch + 3 logRecoveryProbeDiagnostics).
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean across plugin/
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/recovery-probe.test.ts src/tools/recovery-probe.ts (0) — Regression: 18/18 pass; no existing recovery-probe tests broken.
- **[report_follow_up]** follow_ups: contract.ts still imports workflowHasPoisonedRecoveryEvidence from ./recovery-probe for the describe-path defense-in-depth code (post-catch). If a future task removes the describe-path code, this import should be removed too.
- **[report_follow_up]** follow_ups: The describe-path code in contract.ts (post-try-catch blocks checking workflowHasPoisonedRecoveryEvidence(handle)) is unreachable in production. A future cleanup task could remove it once the team confirms probe-first is the long-term authority model. Coordinate with matching describe-path code in design-concern.ts, verification-evidence.ts, and other recovery tools.
- **[archive_only_evidence]** decisions: Used diskDirect: true for probe-first saveRecoveredContract/saveRecoveredReviewMatrix calls — Matches the design-concern reference pattern (sibling task, uncommitted in worktree) and the _recovery-writers.ts docstring rationale: completed-workflow recovery must not call store.changes.save because that can route back through the workflow being recovered. Probe-first is operator-confirmed authoritative evidence.
- **[archive_only_evidence]** decisions: Migrated 7 existing tests instead of leaving them broken — Probe-first changes recovery semantics: precise recoveryEvidence triggers probe-first BEFORE the signal fires, making the catch-branch and describe-probe path end-to-end unreachable when evidence is precise. The 7 failing tests asserted catch-path/describe-path behavior with precise evidence. Deleted them with explanatory comment blocks. Migration matches the design-concern.test.ts precedent.
- **[archive_only_evidence]** decisions: Kept the catch-branch and describe-probe code in contract.ts as defense-in-depth (NOT removed) — Task constraint: Do NOT modify existing catch-branches. Code is unreachable when evidence is precise but remains as defense-in-depth. Matches design-concern pattern.
- **[archive_only_evidence]** decisions: Placed probe-first check AFTER healthySignalHandle() and BEFORE try{fireSignalAndRefresh} — logRecoveryProbeDiagnostics(handle) needs the handle for advisory describe() logging. Check runs before the signal try-block so signal is skipped entirely. Matches design-concern probe-first placement.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Required migration of 7 existing contract.test.ts tests that asserted catch-path/describe-path recovery with precise evidence. Under probe-first semantics, precise evidence triggers probe-first BEFORE the signal fires, so catch-branch and describe-probe are end-to-end unreachable when evidence is precise.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/contract.test.ts src/tools/contract.ts (0) — 20/20 tests pass (3 new AC5 probe-first tests + 17 preserved existing tests; 7 migrated tests removed as unreachable under probe-first semantics)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean
- **[archive_only_evidence]** verification: pnpm run lint (0) — eslint src/ clean (no unused imports)
- **[archive_only_evidence]** decisions: Added recoveryMode schema field to adv_gate_complete — The gate tool did not expose recoveryMode, so shouldTakeRecoveryBranch could never fire. The task explicitly calls for recoveryMode: 'poisoned_history' input, so the schema and execute args had to be extended.
- **[archive_only_evidence]** decisions: Applied probe-first branches before both the querySignal and fireSignalAndRefresh call sites — Both are catch-gated acceptance/release recovery branches in gate.ts. The query-site branch catches pre-signal failures; the signal-site branch catches the fire-and-forget silent-resolve case. Adding both covers every catch-gated recovery site in adv_gate_complete.
- **[archive_only_evidence]** decisions: Used diskDirect: true in probe-first completeGateViaRecovery calls — The design and task require recovery_audit (reason + evidence + recovered_at) on the disk-direct write. Only the diskDirect path routes through saveRecoveredGateCompletion, which emits recovery_audit.
- **[archive_only_evidence]** decisions: Mocked archive-helpers/git-finalize in gate.test.ts — Release-gate recovery invokes getReleaseFinalizationBlocker, which runs git commands. Unit tests run outside a git repo, so the needed functions were mocked to return a reachable release state.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (1) — RED phase: new probe-first regression tests fail before gate.ts edits (expected; success undefined because probe-first branch does not exist)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — GREEN phase: all 61 gate tests pass after probe-first edits
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — Re-verification after prettier formatting: all 61 gate tests still pass
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes from plugin/ directory
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck
- **[report_follow_up]** follow_ups: plugin/src/tools/verification-evidence.ts has the same shape as design-concern.ts but does NOT yet have the probe-first pattern applied. The task prompt referenced it as 'the same pattern as verification-evidence.ts' but verification-evidence.ts only has the catch-branch. If probe-first coverage is intended to be uniform across all disposition tools, verification-evidence.ts needs the same AC5 treatment in a separate task.
- **[archive_only_evidence]** decisions: Used `disposition = parsed.data` in writer call, not raw `parsed` as the task snippet suggested — Matches the existing catch-branch call signature at line ~189 and the typed signature of saveRecoveredDesignConcernDisposition in _recovery-writers.ts (which expects DesignConcernDisposition, not SafeParseReturnType). The task snippet's `parsed` was a placeholder.
- **[archive_only_evidence]** decisions: Mirrored the catch-branch output shape (_recoveryMutation, recovered, recoveryMode, reconciliationWarning) AND added the task's `note` field — Contract stability: any consumer checking recovery state sees identical observable output regardless of which recovery path fired (probe-first vs catch-branch). The `note` field adds operator diagnostic per task spec without breaking the contract.
- **[archive_only_evidence]** decisions: Repurposed `does not recover generic signal failures` test to `does not recover generic signal failures in normal mode` — Under probe-first semantics, precise recoveryEvidence always wins (per recovery-probe.ts authority model), so the original test's premise (precise evidence + generic signal error -> catch-branch rejects) is no longer reachable end-to-end. Switched to recoveryMode='normal' which preserves the test's intent: generic signal errors propagate and no recovery writer fires.
- **[archive_only_evidence]** decisions: Removed dead `mockRejectedValueOnce` setup from `recovers through disk projection when completed workflow evidence is explicit` test — That test also uses precise recoveryEvidence, so under probe-first its signal is never called and the queued rejection leaked into the next test (causing spurious failures). The rich assertions (writer call shape, recovery output fields) still hold under probe-first — only the trigger changed. Test now verifies the same observable contract via probe-first.
- **[archive_only_evidence]** decisions: Did NOT modify the catch-branch code (lines ~199-237 post-edit) — Task constraint: catch-branch remains as defense-in-depth. Probe-first makes it unreachable via public API when precise evidence is supplied, but it documents intent and protects against future regressions if probe-first is ever removed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/design-concern.test.ts -t "AC5: takes probe-first recovery path" (1) — RED phase: AC5 test failed as expected — fireSignalAndRefresh was called 1 time instead of being short-circuited by probe-first gate.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/design-concern.test.ts (0) — GREEN phase: all 10 tests pass after applying probe-first check + re-purposing two obsolete catch-branch-only tests.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean; no type errors introduced.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/design-concern.test.ts src/tools/design-concern.ts (0) — Final targeted sweep per task VERIFICATION: 10/10 tests pass on production + test files.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrtf2zhv_7cda60d1
- **[archive_only_evidence]** decisions: Mirrored catch-branch output shape on the probe-first return (_recoveryMutation, recovered, reconciliationWarning) and added a `note` field for diagnostic clarity — Probe-first and catch-branch both end in the same disk-direct write via saveRecoveredVerificationEvidenceDisposition; downstream consumers must treat them identically. Reusing all recovery flags preserves audit/idempotency semantics. note field distinguishes the path for operator visibility without changing consumer behavior.
- **[archive_only_evidence]** decisions: Used catch-branch authorization shape `args.recoveryReason?.trim() ?? ""` instead of prompt-suggested `?? "poisoned_history"` / `?? "<missing>"` defaults — recoveryEvidenceError already validated reason+evidence non-blank upstream, so the defaults never fire. Matching the catch-branch style keeps both call sites structurally identical (P23 campsite-rule, P04 locality) and avoids drift.
- **[archive_only_evidence]** decisions: Updated existing test 'does not recover generic signal failures' to 'does not recover generic signal failures when recovery is not requested' — removed recoveryMode/recoveryEvidence/recoveryReason args — Under probe-first, operator-supplied precise evidence authorizes recovery regardless of signal failure type — that is the entire point of this fix. The old test encoded the now-false catch-gated invariant. Removing the recovery args preserves the test's intent (generic signal errors propagate) while testing the catch-branch defense-in-depth fallback path.
- **[archive_only_evidence]** decisions: Switched beforeEach from mockClear to mockReset (plus re-established default implementations) — mockClear does NOT clear one-time queue entries set via mockRejectedValueOnce/mockResolvedValueOnce. After probe-first bypasses signal calls, the unused once-queue entries leak across tests. Test 6's mockRejectedValueOnce(completedError) was being consumed by test 8, causing false failures. mockReset clears the queue and is the safer pattern. Latent bug exposed by probe-first bypass.
- **[archive_only_evidence]** verification: pnpm exec vitest run --project unit --no-file-parallelism src/tools/verification-evidence.test.ts -t AC5 (1) — RED phase: AC5 test failed because output.recoveryMode was undefined — signal resolved silently, catch-branch unreachable, saveRecoveredVerificationEvidenceDisposition never called. Confirms bug.
- **[archive_only_evidence]** verification: pnpm exec vitest run --project unit --no-file-parallelism src/tools/verification-evidence.test.ts (0) — GREEN phase: 10/10 tests pass after applying probe-first insertion. AC5 passes; existing recovery + validation tests still green.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/verification-evidence.test.ts src/tools/verification-evidence.ts src/tools/recovery-probe.ts src/tools/recovery-probe.test.ts src/tools/_recovery-writers.test.ts (0) — Regression sweep: 56/56 tests pass across 3 files (verification-evidence, recovery-probe, _recovery-writers). No regressions in adjacent recovery code paths.
- **[report_follow_up]** follow_ups: Smoke test (`bin/oc-test smoke`) surfaces a pre-existing lint error in `plugin/src/tools/change.archive-phase9.test.ts`: `getSpy` is assigned but never used. This file is out of scope for the current task and was not modified.
- **[unresolved_action]** required_main_agent_actions: Task status transition to `in_progress` at start and `adv_task_checkpoint` at end were not performed because the `adv_task_checkpoint` / task-status MCP tool is not exposed to this agent. A manual git checkpoint commit (`chore(adv): checkpoint tk-2d328296ed5d`) was created instead. The orchestrator may want to update the ADV task state if needed.
- **[unresolved_action]** required_main_agent_actions: Address the pre-existing lint error in `plugin/src/tools/change.archive-phase9.test.ts` before CI if the smoke/full gate is required for this change.
- **[archive_only_evidence]** decisions: Extracted shared recovered-task mutation helpers (mutateRecoveredTask, mutateCancelledTask) so the probe-first and catch-branch recovery writers receive identical payloads. — Satisfies the constraint that the diskDirectRecovery payload must match the catch-branch payload exactly, eliminating drift risk.
- **[archive_only_evidence]** decisions: Wrapped the existing fire-and-forget try/catch blocks in `if (!recoveredViaPoisoned)` / `if/else` so the signal is skipped when the probe-first recovery branch is taken. — Without skipping, the signal would still fire even after recovery, failing the new regression tests and reintroducing the fire-and-forget poison problem.
- **[archive_only_evidence]** decisions: Reset `mocks.fireSignalAndRefresh` in the test `beforeEach` to clear any queued one-time rejections/resolve values. — The existing poisoned-recovery test previously consumed its `mockRejectedValueOnce` through the signal path; after probe-first, it no longer consumes it, so the queued rejection leaked into the next test and caused a false failure.
- **[archive_only_evidence]** decisions: Kept the existing catch-gated fallback unchanged except for reusing the extracted mutation helper. — Task scope requires defense-in-depth: the catch branch remains as a fallback if the probe-first gate is bypassed or removed.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/task.test.ts (0) — All 53 task tests pass, including 3 new probe-first regression tests for task_update, task_add, and task_cancel.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes.
- **[unresolved_action]** required_main_agent_actions: Mark task tk-288ea2eded66 done (adv-engineer tool surface does not expose adv_task_checkpoint; task status update must be performed by the parent orchestrator).
- **[archive_only_evidence]** decisions: In completeGateViaRecovery, the readiness/blocker evaluation now reads the durable disk projection when available, even when diskDirect is false (catch-gated recovery path). — Under recovery the disk projection is authoritative for disposition records. The write path is left unchanged per the instruction to only fix the readiness read.
- **[archive_only_evidence]** decisions: Kept recoveryChange/recoveryGates for prior-gate, task, and release-finalization checks. — User guidance: 'only the readiness/blocker evaluation reads' — do not blindly replace every Temporal read.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — 62 gate tests pass, including new AC3 regression test
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts src/tools/verification-evidence.test.ts src/temporal/gate-readiness.test.ts (0) — 154 related tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate-status-fail-closed.test.ts src/tools/gate.release-enforcement.test.ts src/tools/verification-evidence.test.ts src/tools/design-concern.test.ts src/tools/task.test.ts src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts src/temporal/workflows.signal-handlers.itest.ts src/tools/contract.test.ts src/tools/change.test.ts src/tools/change.archive-repair.test.ts (0) — 509 gate/readiness/related tests pass
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, test isolation, lockfile, lint, and format checks all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-gate-targeted-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-gate-readiness-suite-002
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-broad-gate-suite-003
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-typecheck-004
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-005
- **[report_follow_up]** follow_ups: Uncommitted sibling changes in plugin/src/tools/gate.ts and plugin/src/tools/gate.test.ts contain a new AC3-readiness test ('AC3: recovery readiness evaluates from disk projection, not stale Temporal state') that currently fails. It is outside the scope of this task (first clause of AC3 only) and appears to belong to a sibling task covering the second clause.
- **[report_follow_up]** follow_ups: Pre-existing unrelated failure in plugin/src/tools/cross-project-coordination.test.ts ('product-linked create defaults scope_repos to current repo', L245) observed during target_path/cross-project test sweep; it fails consistently and is unrelated to recovery routing.
- **[report_follow_up]** follow_ups: adv_task_checkpoint is not exposed in this agent's tool surface, so task completion is signaled via this report instead of a checkpoint call.
- **[archive_only_evidence]** decisions: No source-code fix was applied; target_path routing for probe-first recovery is already structurally correct. — Every audited call site receives the store from a target-resolved callback (withTargetPathStore/withContractStore/runArchive/runRepair/runUpdate) and passes that same activeStore to the disk-direct recovery writer.
- **[archive_only_evidence]** decisions: Added regression test in verification-evidence.test.ts to lock the invariant. — There was no existing test combining target_path + recoveryMode, so a regression test ensures the routing invariant is explicit and guarded against future drift.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/verification-evidence.test.ts (0) — 11 tests passed, including new AC3 target_path routing regression test
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passed
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check passed (schemas, typecheck, manifests, test isolation, lockfile policy, lint, format)
- **[report_follow_up]** follow_ups: cross-project-coordination.test.ts 'product-linked create defaults scope_repos to current repo' fails in full suite (unrelated to archive path; pre-existing/flaky).
- **[report_follow_up]** follow_ups: Related-scan: adv_archive_purge (line 3866), adv_change_workflow_terminate (line 4039), and adv_change_status_repair (line 4893) have pre-mutation store.changes.get reads that would also fail on absent/poisoned workflows under recoveryMode=poisoned_history.
- **[archive_only_evidence]** decisions: Used loadChange from ../storage/json as the disk-projection reader because the tool-layer Store does not expose a legacy property. — The temporal Store spreads the disk store internally but does not surface it; loadChange(store.paths.changes, changeId) is the equivalent direct disk read already used elsewhere in the tool layer.
- **[archive_only_evidence]** decisions: Placed the regression tests in change.archive-phase9.test.ts rather than change.test.ts. — change.archive-phase9.test.ts already mocks archive dependencies and exercises phase9:run, making it the correct archive-test convention.
- **[archive_only_evidence]** decisions: Updated existing change.test.ts archive recovery tests to write the change.json to the temp changes directory. — The new probe-first branch reads disk projection before the archive bundle; without the on-disk change, those tests would incorrectly fail because the disk projection is missing.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — 37/37 tests pass including poisoned_history archive probe-first regression tests
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — 141/141 tests pass; existing archive recovery tests updated with disk-projection fixtures
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passes
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passes (schemas, typecheck, manifests, isolation, lockfile, lint, format, 84 tests)
- **[unresolved_action]** required_main_agent_actions: adv_task_checkpoint taskId:tk-0527666d76fa mode:complete
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift.
- **[archive_only_evidence]** verification: tests_run=sha256sum ~/.local/share/Advance/plugin/dist/index.js, adv_status target_path:/home/jon/dev/pokeedge-web view:summary, adv_change_show target_path:/home/jon/dev/pokeedge-web changeId:fixWorktreeViteCache, bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/gate.test.ts src/tools/worktree/state-session-lifecycle.test.ts src/tools/recovery-probe.test.ts src/tools/contract.test.ts src/tools/verification-evidence.test.ts src/tools/design-concern.test.ts src/tools/task.test.ts src/tools/change.archive-repair.test.ts src/tools/change.workflow-terminate.test.ts results=pass — AC6 READY: deployed bundle SHA 574009ed85e7aca68039085b429b6ad8b0aff918cfbb10b15e839826b454088e matches manifest; built from trunk HEAD 0882abb4 (PR #275 C2 fix); pokeedge-web temporal_health_ok:true; fixWorktreeViteCache archived (mergeCommitSha=03b0c249); AC5 sweep 414/414 pass (tr_mruqwco7_8968572d). User-approved structural+deploy interpretation.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: sha256sum ~/.local/share/Advance/plugin/dist/index.js
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_status target_path:/home/jon/dev/pokeedge-web view:summary
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_show target_path:/home/jon/dev/pokeedge-web changeId:fixWorktreeViteCache
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/gate.test.ts src/tools/worktree/state-session-lifecycle.test.ts src/tools/recovery-probe.test.ts src/tools/contract.test.ts src/tools/verification-evidence.test.ts src/tools/design-concern.test.ts src/tools/task.test.ts src/tools/change.archive-repair.test.ts src/tools/change.workflow-terminate.test.ts
- **[report_follow_up]** follow_ups: Requested scope_key fixPoisonedRecovery was rejected by report schema; transport requires researcher:<topic-slug>, so report used researcher:fix-poisoned-recovery while retaining change_id fixPoisonedRecovery.
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION blocks; research used detailed CONTEXT scope.
- **[report_follow_up]** follow_ups: Remove describe-JSON TMPRL1100 regex as sole poison classifier.
- **[report_follow_up]** follow_ups: Define bounded history pagination and accepted exact markers before implementing history-backed classification.
- **[report_follow_up]** follow_ups: Keep Worker Versioning prevention separate but prioritized.
- **[research_citation]** sources: Temporal TypeScript message passing: Signals return on server acceptance without waiting for Workflow delivery/processing; Queries require an online Worker and wait for its response. (https://docs.temporal.io/develop/typescript/workflows/message-passing)
- **[research_citation]** sources: Temporal TypeScript SDK signal source: _signalWorkflowHandler awaits only SignalWorkflowExecution RPC; no Workflow Task or handler-result wait. (https://github.com/temporalio/sdk-typescript/blob/55e4ad36a99e27c14bedb9326ddf7f7246240353/packages/client/src/workflow-client.ts#L1211-L1236)
- **[research_citation]** sources: Temporal TypeScript SDK query source: Query calls QueryWorkflow, waits for queryResult, and propagates Worker/service failures. (https://github.com/temporalio/sdk-typescript/blob/55e4ad36a99e27c14bedb9326ddf7f7246240353/packages/client/src/workflow-client.ts#L952-L988)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- finish_owned_scope_then_report: Required migration of 7 existing contract.test.ts tests that asserted catch-path/describe-path recovery with precise evidence. Under probe-first semantics, precise evidence triggers probe-first BEFORE the signal fires, so catch-branch and describe-probe are end-to-end unreachable when evidence is precise.
- verification_missing: No durable adv_run_test evidence found for run_id: typecheck
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrtf2zhv_7cda60d1
- Task status transition to `in_progress` at start and `adv_task_checkpoint` at end were not performed because the `adv_task_checkpoint` / task-status MCP tool is not exposed to this agent. A manual git checkpoint commit (`chore(adv): checkpoint tk-2d328296ed5d`) was created instead. The orchestrator may want to update the ADV task state if needed.
- Address the pre-existing lint error in `plugin/src/tools/change.archive-phase9.test.ts` before CI if the smoke/full gate is required for this change.
- Mark task tk-288ea2eded66 done (adv-engineer tool surface does not expose adv_task_checkpoint; task status update must be performed by the parent orchestrator).
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-gate-targeted-001
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-gate-readiness-suite-002
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-broad-gate-suite-003
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-typecheck-004
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-005
- adv_task_checkpoint taskId:tk-0527666d76fa mode:complete
- finish_owned_scope_then_report: No scope drift.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: sha256sum ~/.local/share/Advance/plugin/dist/index.js
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_status target_path:/home/jon/dev/pokeedge-web view:summary
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_show target_path:/home/jon/dev/pokeedge-web changeId:fixWorktreeViteCache
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/gate.test.ts src/tools/worktree/state-session-lifecycle.test.ts src/tools/recovery-probe.test.ts src/tools/contract.test.ts src/tools/verification-evidence.test.ts src/tools/design-concern.test.ts src/tools/task.test.ts src/tools/change.archive-repair.test.ts src/tools/change.workflow-terminate.test.ts
