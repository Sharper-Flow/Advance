# Archive Briefing Digest

**Change ID:** fixTaskCycleAnchoring
**Title:** Fix task cycle anchoring
**Status:** archived
**Generated:** 2026-07-15T17:53:10.695Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 73 of 73 durable facts.

- **[report_follow_up]** follow_ups: Consider a separately approved change if engineer apply_context must receive the same persistence-boundary validation; accepted scope is designer-specific.
- **[archive_only_evidence]** decisions: Block frontend completion when no active implementation cycle exists. — Cycle-before-evidence contract requires a hard block, never inferred or backfilled state.
- **[archive_only_evidence]** decisions: Validate designer apply_context against the active task cycle before persistence and duplicate handling. — Pre-anchor evidence must never persist or later satisfy a newly assigned cycle.
- **[archive_only_evidence]** decisions: Limit the report anchor boundary to designer reports with apply_context. — The accepted invariant is designer-specific; legacy reports that make no cycle claim remain compatible.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.test.ts -t "implementation cycle" / -t "designer report" (1) — RED confirmed: 3 new guard tests failed pre-fix (no-cycle completion, no-cycle designer report, mismatched-cycle designer report).
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.test.ts (0) — GREEN: 56/56 tests pass after implementing both fixes and updating two pre-anchor persistence tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/change-state.crash-recovery.test.ts src/temporal/change-state.ops-follow-up.test.ts src/temporal/change-state.signal-rejection.test.ts src/temporal/change-state.size-guard.test.ts src/temporal/change-state.spec-delta.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/gate-readiness.test.ts src/tools/subagent-report.test.ts src/tools/task.test.ts src/tools/followup.test.ts src/utils/loop-ledger.test.ts (0) — Related scan: 13 files, 289/289 tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, ESLint, and Prettier pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts -t "implementation cycle" / -t "designer report"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/change-state.crash-recovery.test.ts src/temporal/change-state.ops-follow-up.test.ts src/temporal/change-state.signal-rejection.test.ts src/temporal/change-state.size-guard.test.ts src/temporal/change-state.spec-delta.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/gate-readiness.test.ts src/tools/subagent-report.test.ts src/tools/task.test.ts src/tools/followup.test.ts src/utils/loop-ledger.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Derive task-scoped report ownership from taskIdFromReport(report) and reject a conflicting payload task ID before persistence. — Eliminates attacker-controlled or malformed mixed task identity at the cycle boundary.
- **[archive_only_evidence]** decisions: Use SUBAGENT_REPORT_OWNER_MISMATCH separate from cycle-anchor rejection. — Makes ownership conflicts structural, greppable, and independently diagnosable.
- **[archive_only_evidence]** decisions: Apply owner-identity validation to all task-scoped reports. — A conflicting payload task ID is invalid regardless of agent; designer cycle validation then runs on the authoritative owner.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.test.ts -t "owner" (1) — RED confirmed: owner-conflict cases failed pre-fix; omitted-taskId compatibility case passed.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.test.ts (0) — GREEN: all 59 tests pass (56 prior plus designer conflict, engineer conflict, and owner-derived persistence cases).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/tools/subagent-report.test.ts (0) — 58 passed; workflow signal-handler and report-submit tool layer remain compatible.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit -p tsconfig.json (0) — Typecheck clean.
- **[archive_only_evidence]** verification: pnpm exec eslint + prettier --check on touched files (0) — Lint and format clean.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts -t "owner"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/tools/subagent-report.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit -p tsconfig.json
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint + prettier --check on touched files
- **[archive_only_evidence]** decisions: Modeled stale cycle via applyTaskAssignedToState re-assignment overwriting task.apply_cycle — Matches runtime semantics: guard reads current apply_cycle; evidence keyed to prior cycle id must no longer match
- **[archive_only_evidence]** decisions: Asserted dedupe counters (seenReportIdsTotal=1, single sidecar + task report storage) in duplicate tests — Proves AC3 duplicate handling is idempotent in both directions — stale duplicate cannot launder evidence, matching duplicate cannot strip it
- **[archive_only_evidence]** decisions: No runtime changes — Guard at change-state.ts:897-914 + hasMatchingDesignerApplyEvidence:1043-1056 already implements contract; tests confirmed behavior, no defect revealed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts (0) — 3 files, 119/119 tests pass; runId tr_mrm9w53o_ed84fd83
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check + typecheck + isolation + lockfile + lint + format:check all green
- **[archive_only_evidence]** verification: pnpm run build (0) — plugin dist/index.js + Temporal worker bundles built successfully
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[report_follow_up]** follow_ups: Briefing packet supplied no contract review matrix, task list, affected files, durable facts, or capability spec content. Validate the proposed requirements against the owning ADV capability spec during design using ADV spec tooling.
- **[report_follow_up]** follow_ups: Investigate how the deployed cycle-aware artifact was produced while checked-out source and local source dist lack the feature; do not deploy from current source until parity is restored.
- **[archive_only_evidence]** sources: Deployed workflow completion guard: Deployed workflow blocks frontend completion unless task.apply_cycle carries an implementation_cycle_id and a successful designer report matches that cycle.
- **[archive_only_evidence]** sources: Deployed report persistence reducer: Accepted reports are appended to change/task report arrays, but task.apply_cycle is never initialized or updated.
- **[archive_only_evidence]** sources: Deployed apply-context schemas and evidence matcher: Deployed bundle defines strict ApplyContextSchema with implementation_cycle_id and provenance.
- **[archive_only_evidence]** sources: Deployed designer evidence predicate: Matching evidence requires designer status complete, no blockers, null scope drift, all verification exit codes zero, and equal implementation cycle ID.
- **[archive_only_evidence]** sources: Checked-out source report schemas: Source engineer schema is strict and lacks apply_context; designer schema also lacks it at lines 236-260.
- **[archive_only_evidence]** sources: Checked-out source task schema: Source TaskSchema has no apply_cycle field, though passthrough permits untyped legacy/forward fields.
- **[archive_only_evidence]** sources: Checked-out source report reducer: Source reducer persists reports and blockers but no cycle anchor.
- **[archive_only_evidence]** sources: Checkpoint signal path: Checkpoint fires taskCompletedSignal and surfaces the latest taskCompleted signal rejection when task does not become done.
- **[archive_only_evidence]** sources: Build and deployment contract: Live tools load deployed dist; source changes require build, deploy, and host restart.
- **[archive_only_evidence]** sources: Build outputs: pnpm run build builds both plugin and Temporal worker bundles.
- **[archive_only_evidence]** sources: Timestamp-based dist freshness check: Deploy freshness compares source/input mtimes against outputs; it does not establish semantic source-to-dist equivalence.
- **[archive_only_evidence]** sources: Existing reducer and workflow tests: Existing tests cover report persistence and dedupe but not task-cycle anchoring.
- **[archive_only_evidence]** sources: Existing Temporal integration tests: Existing workflow tests cover report storage, signal rejection resilience, and report dedupe but not frontend cycle-bound completion.
- **[archive_only_evidence]** sources: Temporal TypeScript workflow activation source: Official SDK source shows activation jobs invoke handlers and then reevaluate blocked conditions, supporting durable workflow-state mutation in signal handlers.
- **[archive_only_evidence]** architecture_assessment: Current deployed bundle contains cycle-aware schemas, report identity, and a strict frontend checkpoint guard, but its report reducer never persists task.apply_cycle. Checked-out source is further behind: it lacks ApplyContext fields, Task.apply_cycle, cycle-aware identity, and the guard. This is a major source/deploy split and an incomplete state-machine transition. Preferred structural repair: persist an orchestrator-issued task cycle before delegation through a typed workflow mutation, then treat engineer/designer reports only as evidence bound to that existing anchor. Minimal viable alternative: atomically initialize task.apply_cycle from the first accepted task-scoped implementation report, before duplicate early returns, reject conflicting cycle IDs, and provide an explicit typed new-cycle transition for retries. Never let arbitrary late or stale reports overwrite the active cycle. Keep the checkpoint guard strict.
- **[unresolved_action]** validation.blockers: Deployed frontend task completion can remain permanently blocked because the guard requires task.apply_cycle.implementation_cycle_id while deployed report persistence only appends reports and never sets task.apply_cycle.
- **[unresolved_action]** validation.blockers: Checked-out source cannot reproduce deployed behavior: strict source report schemas reject apply_context, TaskSchema lacks apply_cycle, source report identity is not cycle-aware, and source workflow lacks the deployed frontend guard.
- **[report_follow_up]** follow_ups: Coordinate with active updateSubagentDispatch because both changes touch strict engineer/designer report contracts, report identity, apply packets, and delegation sequence.
- **[report_follow_up]** follow_ups: Define whether cycle creation is refused in poisoned_history mode or receives a separately approved Temporal recovery path; do not extend the current disk-projection assignment fallback silently.
- **[report_follow_up]** follow_ups: Operational acceptance should compare source dist and stable runtime outputs after normal deploy and confirm restarted worker behavior; current source and on-disk bundles do not contain implementation_cycle_id/apply_cycle/TASK_COMPLETION_BLOCKED tokens.
- **[archive_only_evidence]** sources: Current task lifecycle types and assignment reducer: Task state and taskAssigned payload currently carry assignment identity/time but no implementation-cycle anchor; completion reducer is workflow-state authority.
- **[archive_only_evidence]** sources: Current assignment tool and resume contract: adv_task_update fires taskAssignedSignal before routing and returns queried task state; apply resume behavior continues an active task, so cycle minting must distinguish resume/idempotent replay from a deliberately new cycle.
- **[archive_only_evidence]** sources: Strict report schemas and stable identity: Engineer/designer reports are strict, currently lack cycle context, and use one shared byte-stable report-key helper.
- **[archive_only_evidence]** sources: Report dedupe and downstream key parser: Workflow dedupe depends on report identity; one downstream consumer parses the pipe-delimited key's second segment, constraining compatible key evolution.
- **[archive_only_evidence]** sources: Checkpoint completion path: Checkpoint currently treats any persisted report only as a structured-output suppression signal, emits taskCompletedSignal, and verifies resulting state; no source cycle/evidence guard exists.
- **[archive_only_evidence]** sources: Poisoned-history assignment fallback: The task tool can disk-project in_progress assignment during poisoned-history recovery, which must not silently become a second authority for a Temporal-only cycle anchor.
- **[archive_only_evidence]** sources: Build and deployment pipeline: Normal build produces plugin and worker bundles; deployment rebuilds stale dist, rsyncs source plugin to stable runtime, and refreshes deployed Temporal workers.
- **[archive_only_evidence]** sources: Temporal TypeScript deterministic change guidance: Temporal documents patched versioning for workflow changes that alter command behavior; data-only schema evolution still needs old-history-compatible payload handling.
- **[archive_only_evidence]** sources: Temporal TypeScript patched API source: Official SDK source defines patched() behavior for replay-safe old/new workflow branches.
- **[archive_only_evidence]** architecture_assessment: Design direction is structurally sound: mint cycle identity outside workflow nondeterminism, persist it through taskAssignedSignal before delegation, require typed report context, and enforce completion against workflow state. Proceed only after tightening four hazards: (1) define repeat-assignment semantics so resume does not remint and explicit retry does; (2) preserve legacy report keys while appending cycle identity only for cycle-aware reports and update every key consumer; (3) make old signal histories replay-compatible through optional/cutover data rather than retroactively rejecting legacy completions; (4) prohibit or explicitly design poisoned-history disk fallback for cycle creation because agreement requires Temporal-only authority. Current source contains no cycle guard, and current built/runtime bundles inspected on disk expose no cycle tokens, so deployed parity must be proven after implementation rather than assumed.
- **[unresolved_action]** required_main_agent_actions: Apply both cycle-anchor fixes in plugin/src/temporal/change-state.ts.
- **[unresolved_action]** required_main_agent_actions: Add regressions for missing-cycle completion and designer evidence submitted before cycle activation.
- **[unresolved_action]** required_main_agent_actions: Rerun focused Temporal and task-tool tests, then resubmit acceptance review.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts src/tools/task.test.ts src/temporal/workflows.signal-handlers.test.ts, git diff --check trunk...HEAD results=pass — 3 test files passed; 119 tests passed. Diff whitespace check passed. Existing tests cover matching, mismatch, stale, and duplicate reports, but not missing-cycle completion or evidence-before-cycle rejection.
- **[unresolved_action]** required_main_agent_actions: Apply review-1 with owner-task validation and regression test for conflicting signal taskId/report task scope, then rerun targeted suite.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts results=fail — Initial path-qualified filter failed (no test files). Corrected command passed: 1 file, 56 tests. Existing tests confirm missing-cycle rejection, mismatch rejection, matching-cycle completion, legacy compatibility, and duplicate paths, but do not cover mismatched signal taskId versus report owner.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/workflows.signal-handlers.test.ts results=pass — 2 test files, 85 tests passed. Reviewed commit b16ff25bee06f55a6eb8ce0e2b981cb2778be182. Completion requires active frontend cycle plus complete matching designer evidence; anchored reports reject missing, mismatched, stale, and conflicting-owner submissions before persistence; duplicate behavior remains safe; legacy reports without apply_context remain accepted; no free-text cycle inference or backfill found.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts -t "implementation cycle" / -t "designer report"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/change-state.crash-recovery.test.ts src/temporal/change-state.ops-follow-up.test.ts src/temporal/change-state.signal-rejection.test.ts src/temporal/change-state.size-guard.test.ts src/temporal/change-state.spec-delta.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/gate-readiness.test.ts src/tools/subagent-report.test.ts src/tools/task.test.ts src/tools/followup.test.ts src/utils/loop-ledger.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts -t "owner"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/tools/subagent-report.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit -p tsconfig.json
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint + prettier --check on touched files
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- Deployed frontend task completion can remain permanently blocked because the guard requires task.apply_cycle.implementation_cycle_id while deployed report persistence only appends reports and never sets task.apply_cycle.
- Checked-out source cannot reproduce deployed behavior: strict source report schemas reject apply_context, TaskSchema lacks apply_cycle, source report identity is not cycle-aware, and source workflow lacks the deployed frontend guard.
- Apply both cycle-anchor fixes in plugin/src/temporal/change-state.ts.
- Add regressions for missing-cycle completion and designer evidence submitted before cycle activation.
- Rerun focused Temporal and task-tool tests, then resubmit acceptance review.
- Apply review-1 with owner-task validation and regression test for conflicting signal taskId/report task scope, then rerun targeted suite.
