# Archive Briefing Digest

**Change ID:** fixTriageTimeouts
**Title:** Fix triage timeouts
**Status:** archived
**Generated:** 2026-07-17T04:49:21.800Z

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

Showing 67 of 67 durable facts.

- **[report_follow_up]** follow_ups: Wire the OpenCode ToolContext abort signal into adv_worktree_triage (tool-registry.ts/adv-worktree.ts) and register the justified 60-second outer cap so the 55-second internal budget is effective.
- **[report_follow_up]** follow_ups: Apply the same bounded snapshot primitive to adv_wip_state's worktree source in task tk-81702a220f7d.
- **[archive_only_evidence]** decisions: Implemented bounded behavior via optional InventoryBudget rather than touching the global safeExecute default or tool registry. — The task scope is limited to triage.ts and state.ts; the global default must remain 10 seconds, and tool-host signal integration is assigned to the next task.
- **[archive_only_evidence]** decisions: Added stable sorting to snapshot records/warnings/poisonedWorkflows after concurrent collection. — The design requires stable ordering; concurrent queries can finish out of order, so results are sorted by changeId and branch.
- **[archive_only_evidence]** decisions: Did not wire the OpenCode ToolContext abort signal into the public adv_worktree_triage tool. — adv-worktree.ts and tool-registry.ts are outside the current task scope, but the library functions are already signal-ready via callerSignal/options.budget.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts src/tools/worktree/triage.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/state-record-probe.test.ts (0) — All 43 focused tests pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/worktree/ (0) — All 188 worktree tests pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/adv-worktree.test.ts (0) — All 30 adv-worktree tool tests pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/utils/branch-integration.test.ts src/validator/file-overlap.test.ts src/validator/merge-order.test.ts src/tools/worktree/state-session-lifecycle.test.ts (0) — All 46 downstream snapshot-consumer tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation/lockfile checks, lint, and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts src/tools/worktree/triage.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/state-record-probe.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/worktree/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/adv-worktree.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/utils/branch-integration.test.ts src/validator/file-overlap.test.ts src/validator/merge-order.test.ts src/tools/worktree/state-session-lifecycle.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Used a custom registerTool wrapper for adv_wip_state instead of bindTool so the SDK ToolContext abort signal can be forwarded without changing the generic bindTool/safeExecute signatures. — Keeps the change ABI-safe and scoped to the one tool that needs the >10s timeout and cancellation semantics.
- **[archive_only_evidence]** decisions: Set WIP_CALLER_TIMEOUT_MS to 60s and reused the existing 55s INVENTORY_INTERNAL_BUDGET_MS from inventory-budget.ts. — Reserves 5s to render partial output before the caller-visible safety net fires, matching the design excerpt.
- **[archive_only_evidence]** decisions: Made WipPoisonedWorkflowEntry.source optional on provider inputs. — The default provider receives WorktreePoisonedWorkflowEntry (no source) from state.ts while test fixtures already supply source; the final response still always sets source via toWipPoisonedWorkflowEntry.
- **[archive_only_evidence]** decisions: Changed listWorktreesAcrossChanges to return the full WorktreeRegistrySnapshot and accept an optional budget/signal/timeoutMs. — Lets adv_wip_state propagate the inventory budget and read completeness metadata (complete/stopReason/inspectedCount/etc.) for typed degradation.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/backlog.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/triage.test.ts src/tool-registry.test.ts src/utils/safe-execute.test.ts src/tools/worktree/state-session-lifecycle.test.ts (0) — 6 test files passed; 130 tests (including 2 new WIP degradation/cancellation tests) green.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-registry.surface.test.ts (0) — 2 test files passed; 39 tests green.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/__tests__/backlog-coordination-regression.test.ts src/__tests__/backlog-concurrency.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — 3 test files passed; 18 tests green.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/backlog.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/triage.test.ts src/tool-registry.test.ts src/utils/safe-execute.test.ts src/tools/worktree/state-session-lifecycle.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-registry.surface.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/__tests__/backlog-coordination-regression.test.ts src/__tests__/backlog-concurrency.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Unrelated full-suite failure: src/temporal/workflows.signal-handlers.test.ts > changeWorkflow Epic membership signals > sets and clears epic_membership projection through signals (timed out after 5s).
- **[report_follow_up]** follow_ups: Unrelated full-suite failure: src/tools/status-health.worker-processes.test.ts > fetchStatusWorkerProcesses > returns workerCount + orphanCount + per-process list with freshness (timed out after 5s).
- **[archive_only_evidence]** decisions: Did not edit source/tests for the cited failures — The failures only appeared in a prior full run and are not reproducible in targeted runs or the latest full run; per STOP_WHEN, broad edits for unobserved global interference are not warranted.
- **[archive_only_evidence]** decisions: Created and removed temporary probe files only — Used to test the fake-timer-leak hypothesis; confirmed Vitest resets fake timers across files and the target tests' beforeEach/afterEach hooks are sufficient in isolation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts (0) — Target files pass in isolation: 2 test files, 23 tests passed, 1 expected fail.
- **[archive_only_evidence]** verification: bin/oc-test full (1) — Latest full suite: 381 test files passed, 2 failed. The in-scope target files passed; failures are unrelated (workflows.signal-handlers.test.ts and status-health.worker-processes.test.ts timeouts).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION labels. Research followed the user's supplied prose scope; identity anchors were not inferred.
- **[report_follow_up]** follow_ups: Measure stage-level latency and completion coverage against the current 36-worktree inventory before fixing exact inner budget or concurrency.
- **[report_follow_up]** follow_ups: Run deterministic Bun 1.3.12 compatibility tests for node:child_process execFile with pre-aborted, mid-flight aborted, timeout, ignored-SIGTERM, and direct-child exit cases.
- **[report_follow_up]** follow_ups: Coordinate shared bounded-read/cancellation plumbing with fixTemporalQueryRecovery; do not duplicate its generic read-recovery contract.
- **[research_citation]** sources: OpenCode plugin ToolContext API: Current ToolContext includes an AbortSignal named abort. (https://github.com/anomalyco/opencode/blob/453b61e27b2f6c2752a60dd7d8412bdcf4e0aa3d/packages/plugin/src/tool.ts)
- **[research_citation]** sources: OpenCode plugin-tool registry bridge: OpenCode spreads host tool context, including abort, into plugin tool execution. (https://github.com/anomalyco/opencode/blob/453b61e27b2f6c2752a60dd7d8412bdcf4e0aa3d/packages/opencode/src/tool/registry.ts#L120-L165)
- **[research_citation]** sources: Node.js v24 child_process: spawn/execFile accept AbortSignal; abort behaves like kill and reports AbortError. Signals do not guarantee process-tree termination. (https://nodejs.org/docs/latest-v24.x/api/child_process.html)
- **[research_citation]** sources.omitted: 13 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Current architecture has a major deviation from the repository's bounded-read reference pattern. OpenCode supplies ToolContext.abort, but bindTool discards SDK context. safeExecute races a timer without cancelling underlying work. triage performs serial Git checks; cross-change worktree snapshots issue serial direct WorkflowHandle.query calls without aggregate deadline or SDK cancellation. Option (a), global timeout increase, violates existing law and only delays the same all-or-nothing failure. Option (b), per-tool outer timeout alone, is permissible only as containment/headroom and still cannot preserve partial state or stop background work. Option (c), one internal request budget with explicit incomplete output and propagated cancellation, matches OpenCode, Node/Bun, Temporal, and existing Advance bounded-read laws. Use outer timeout only as a later defensive margin around a strictly shorter inner budget. Completed item findings remain authoritative; uninspected items must be named or counted as uninspected and never inferred clean or deletable. Actual stage latency distribution is unknown because this research did not run instrumentation or wall-clock benchmarks.
- **[report_follow_up]** follow_ups: BRIEFING PACKET unavailable under artifact-only rendering and truncated under normal rendering; validation used user-supplied inline agreement/design plus ADV tool-read specs and current source.
- **[report_follow_up]** follow_ups: Specify whether aborted Temporal query failures skip poisoned-history describe enrichment or perform only a separately admitted, same-deadline describe call.
- **[report_follow_up]** follow_ups: Require controlled cancellation tests under both Node/Vitest and deployed Bun runtime because official Bun docs retrieved did not conclusively establish node:child_process execFile AbortSignal parity.
- **[report_follow_up]** follow_ups: Make interactive-read audit exhaustive from registered tool inventory and fail CI when a registration lacks default-or-override classification.
- **[research_citation]** sources: Advance timeout override specification: Requires 10s global default, explicit per-tool override, inner-budget rationale, and modest outer headroom. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/advance-meta/spec.json#L1459-L1488)
- **[research_citation]** sources: Advance worktree lifecycle specification: Requires per-workflow failure isolation, healthy-record preservation, explicit visibility unavailability, exact triage branch/path/blockers, and advisory-only cleanup evidence. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/worktree-lifecycle/spec.json)
- **[research_citation]** sources: Advance backlog coordination specification: Requires WIP source-failure isolation and preservation of healthy active-change, worktree, and peer-session sections. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/backlog-coordination/spec.json)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design direction is correct and simpler than global timeout expansion: one request deadline, composed cancellation, bounded worker-pool admission, typed partial results, and source-local WIP degradation align with the cited specs and official cancellation APIs. Current source confirms the real gaps: serial cross-change queries, Promise.race outer containment that leaves work running, discarded ToolContext.abort, and WIP providers lacking request context. Before implementation, tighten three details: (1) all WIP providers—not only the worktree snapshot—must be bounded by the same return deadline so a healthy-but-slow independent source cannot consume the 5s reserve; (2) cancellation/error classification must not start handle.describe or any other follow-on inspection after admission closes; (3) concurrency four must be implemented as a true admission-checked worker pool with stable candidate-order projection, not eager Promise creation. Bun node:child_process AbortSignal parity remains unproven from retrieved official docs, so Bun-runtime tests are required.
- **[archive_only_evidence]** findings: [info] Bounded triage and inventory tests pass.
- **[archive_only_evidence]** findings: [info] Static validation pipeline passes.
- **[unresolved_action]** suggested_handoff: No remediation needed; proceed with task checkpoint. — in_scope: record verification evidence
- **[unresolved_action]** required_main_agent_actions: Record this acceptance evidence and run the strict 22-row contract review matrix; all 22 rows can pass on reviewed implementation and verification.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated full-suite timeout observations from prior verification; they are outside this scoped triage/WIP contract.
- **[unresolved_action]** required_main_agent_actions: Before production validation, deploy the approved plugin bundle and restart the plugin host per repository deployment guidance.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Bounded collector admission alone cannot guarantee a typed response: an already-admitted hanging Temporal query can consume the outer safeExecute timeout. Race collector waiting against its cancellation signal and report that item as omitted; do not classify it after the deadline.
- **[archive_only_evidence]** changes_made: plugin/src/tools/adv-worktree.ts: Made triage create/use the 55s inventory budget, forward caller cancellation, and project complete/stop/inspected/candidate/omitted metadata; incomplete inventory is not reported as successful.
- **[archive_only_evidence]** changes_made: plugin/src/tool-registry.ts: Registered adv_worktree_triage with the documented 60s outer safeExecute cap and forwarded ToolContext abort signal, retaining the global default for every other tool.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/state.ts: Stopped awaiting already-admitted slow Temporal workflow queries when the inventory budget aborts, returning explicit omitted scope before outer timeout while preventing follow-on failure classification.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/state-snapshot-budget.test.ts: Added controlled hung workflow-query coverage proving partial inventory returns at budget exhaustion.
- **[archive_only_evidence]** changes_made: plugin/src/tools/adv-worktree.test.ts: Added triage partial-result projection coverage and updated budget-forwarding expectations.
- **[archive_only_evidence]** changes_made: docs/specs/advance-meta.md: Documented triage alongside WIP as a 60s-capped reader with a 55s inner budget and typed honest partial behavior.
- **[archive_only_evidence]** verification: tests_run=cd plugin && ../bin/oc-test targeted -- src/tools/worktree/inventory-budget.test.ts src/tools/worktree/state-snapshot-budget.test.ts src/tools/worktree/triage.test.ts src/tools/adv-worktree.test.ts src/tools/backlog.test.ts src/tool-registry.test.ts, cd plugin && pnpm run check, git diff --check results=pass — Targeted suite: 6 files, 97 tests passed. pnpm run check passed schemas, typecheck, manifest check, isolation/lockfile checks, lint, and formatting. git diff --check passed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts src/tools/worktree/triage.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/state-record-probe.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/worktree/
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/adv-worktree.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/utils/branch-integration.test.ts src/validator/file-overlap.test.ts src/validator/merge-order.test.ts src/tools/worktree/state-session-lifecycle.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/backlog.test.ts src/tools/worktree/inventory-budget.test.ts src/tools/worktree/triage.test.ts src/tool-registry.test.ts src/utils/safe-execute.test.ts src/tools/worktree/state-session-lifecycle.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-registry.surface.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/__tests__/backlog-coordination-regression.test.ts src/__tests__/backlog-concurrency.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- No remediation needed; proceed with task checkpoint. — in_scope: record verification evidence
- Record this acceptance evidence and run the strict 22-row contract review matrix; all 22 rows can pass on reviewed implementation and verification.
- Do not revisit unrelated full-suite timeout observations from prior verification; they are outside this scoped triage/WIP contract.
- Before production validation, deploy the approved plugin bundle and restart the plugin host per repository deployment guidance.
