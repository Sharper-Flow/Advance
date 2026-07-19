# Archive Briefing Digest

**Change ID:** fixTemporalQueryRecovery
**Title:** Fix Temporal query recovery
**Status:** archived
**Generated:** 2026-07-19T23:17:32.327Z

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

Showing 76 of 76 durable facts.

- **[archive_only_evidence]** decisions: Implemented diagnostics as a new module instead of wiring into tools in this task — The change plan splits work into four tasks; task 1 is to define the typed diagnostics, and tasks 2/3 will consume them. This keeps the diff focused and avoids premature changes to mocked tool tests.
- **[archive_only_evidence]** decisions: Reused the existing isReconnectableError predicate for shared-channel incident detection — Preserves the same transport-channel classification that the STSL reconnect path already uses, so the diagnostic and reconnect policy stay aligned.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/diagnostics.test.ts (RED before implementation) (1) — Failed as expected: Could not find module './diagnostics' (module had not been created yet)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/diagnostics.test.ts (GREEN after implementation) (0) — All 29 tests passed
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all passed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/diagnostics.test.ts (0) — All 29 tests passed via repo-local throttle wrapper
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/diagnostics.test.ts (RED before implementation)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/diagnostics.test.ts (GREEN after implementation)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/diagnostics.test.ts
- **[archive_only_evidence]** decisions: Introduced TemporalReadContext and runTemporalRead in a new module instead of scattering context handling in every callsite. — Keeps the deadline/abort surface localized, testable, and lets production use SDK-native cancellation while test fixtures fall back to the existing bounded Promise.race wrapper.
- **[archive_only_evidence]** decisions: Modified retry-wrapper withTemporalRetry to accept connection/abortSignal and use SDK Connection.withDeadline/withAbortSignal when present. — This is the structural replacement of Promise.race as the RPC timeout authority; the SDK actually cancels the in-flight gRPC call instead of resolving a local timer.
- **[archive_only_evidence]** decisions: Threaded the context through changes.get, gates.get, store.status (listResolvedChanges), and listSummary visibility list, but not task/wisdom/spec/epic reads. — SC3 specifically covers authoritative change, gate, and status reads; expanding further would be out of scope.
- **[archive_only_evidence]** decisions: Kept the Promise.race fallback active only when Connection is absent (mock tests/target-path snapshots). — Preserves compatibility for existing tests and target-path snapshots that do not supply a real Temporal Connection.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/read-context.test.ts (0) — 11 new TDD tests passed: one deadline + one AbortController per context, same deadline/signal across multiple RPCs, degraded on abort, degraded after aggregate deadline with no retry, no mutation authority from degraded reads, and change/gate/status stage integration.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/storage/store-temporal/bounded-status.test.ts src/storage/store-temporal/changes.test.ts src/tools/gate.test.ts src/tools/status.test.ts (0) — 195 related tests passed across retry-wrapper, store-temporal, gate, and status suites.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke tier passed: pnpm run check + src/tools/test.test.ts + src/tools/subagent-report.test.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/read-context.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/storage/store-temporal/bounded-status.test.ts src/storage/store-temporal/changes.test.ts src/tools/gate.test.ts src/tools/status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[archive_only_evidence]** decisions: Replaced setImmediate spin loops in bounded-read-deadline tests with promise latches resolved by the fixtures themselves (first query attempt, fourth disk get, first disk fallback). — The full-suite failures were non-deterministic: the async chain sometimes had not reached the expected stage before the 5000-iteration loop exited. Latching on the actual event makes the synchronization independent of event-loop load.
- **[archive_only_evidence]** decisions: Added a regression test that freezes the pre-expiry stages and then advances the fake clock past the budget to assert the fallback stage is skipped. — This pins the intended boundary: stages before expiry run, stages after expiry are omitted, and the result is typed as deadline exceeded.
- **[archive_only_evidence]** decisions: Did not change the implementation of read-context, retry-wrapper, or list/get resolution. — The observed failures were timing artifacts in the tests, not incorrect stage admission or fallback behavior in the production code. The current code preserves one absolute deadline, the abort signal, and no stages after expiry.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts (0) — All 13 bounded-read-deadline tests pass (12 original + 1 regression test).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/ (0) — All 12 store-temporal test files and 156 tests pass in the targeted suite.
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[archive_only_evidence]** decisions: Implemented a new temporal/mutation-safety.ts module rather than scattering guards across every signal/projection callsite — Tasks 1 and 2 established typed diagnostics and bounded read primitives in dedicated modules; task 3 follows the same pattern by defining mutation-safety primitives that later callers can import.
- **[archive_only_evidence]** decisions: Reused diagnostics.ts isWorkflowMutationIneligible for the SC4 guard — Avoids duplicating the mutation-ineligible class list and keeps the diagnostic taxonomy the single source of truth.
- **[archive_only_evidence]** decisions: Codified destructive recovery preconditions as a pure guard instead of changing tools/change.ts — The existing adv_change_workflow_terminate tool already enforces approval/run-pinned/shipped-proof ordering; leaving it unchanged preserves its behavior while giving callers a testable, reusable guard.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/mutation-safety.test.ts (RED before implementation) (1) — Module-not-found failure as expected
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/mutation-safety.test.ts (0) — 24 tests passed
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.workflow-terminate.test.ts (0) — 18 existing tool tests passed unchanged
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke tier passed: pnpm run check (schemas, typecheck, isolation, lockfile, lint, format) + 64 tests
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/mutation-safety.test.ts src/temporal/diagnostics.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/read-context.test.ts (0) — 82 related tests passed
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/mutation-safety.test.ts (RED before implementation)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/mutation-safety.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.workflow-terminate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/mutation-safety.test.ts src/temporal/diagnostics.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/read-context.test.ts
- **[report_follow_up]** follow_ups: Consider applying the same shared-env/worker pattern to other temporal workflow test files that still create a new TestWorkflowEnvironment per test; they are not failing now but contribute to the same contention class.
- **[archive_only_evidence]** decisions: Share one TestWorkflowEnvironment and two Workers across all tests in `workflows.signal-handlers.test.ts` instead of creating a new env + worker per test. — Eliminates the per-test setup overhead that exceeded the 5s default timeout under concurrent full-suite load; the first test now only starts a workflow and sends signals/queries.
- **[archive_only_evidence]** decisions: Keep separate no-activity and activity Workers to preserve existing test isolation semantics. — Tests that do not expect activities to run should not accidentally rely on them, and artifact tests still need `inspectArtifactActivity`/`writeArtifactActivity` registration.
- **[archive_only_evidence]** decisions: Start each test workflow on a fixed shared task queue with a unique `signal-${name}-${Date.now()}` workflow ID. — Provides isolation between tests without requiring separate task queues or workers per test.
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts -t "sets and clears epic_membership projection through signals" --run (0) — Targeted epic_membership set/clear test passes (1 passed, 25 skipped) in 5.06s.
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/temporal/ --run (0) — Full temporal suite passes: 58 test files, 717 tests passed, 1 expected fail.
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Repository full suite passes: 384 test files, 5973 tests passed, 1 expected fail.
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all green.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts -t "sets and clears epic_membership projection through signals" --run
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/ --run
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[report_follow_up]** follow_ups: Packet lacked labeled TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION sections; prose scope was used.
- **[report_follow_up]** follow_ups: Acceptance must prove independent server/workflow health, total failure taxonomy, one aggregate deadline with RPC cancellation, zero mutation for unknown failures, and run-pinned approved poisoned recovery.
- **[report_follow_up]** follow_ups: Risks: uncancelled Promise.race RPCs, broad shared reconnect, unbounded gate read, and undocumented describe-regex stability.
- **[research_citation]** sources: ADV lifecycle: Shared cached connection and single-flight replacement. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/service.ts)
- **[research_citation]** sources: ADV retry wrapper: gRPC classification, retry, reconnect triggers, and deadlines. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/retry-wrapper.ts)
- **[research_citation]** sources: ADV recovery classifier: Query timeout and recovery taxonomy. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/storage/store-temporal/shared.ts)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Found sound non-mutation guards and shared lifecycle, but server health and workflow query reachability need separate diagnostics. Some gate reads lack an aggregate deadline, Promise.race does not cancel RPCs, and broad connection replacement overlaps grpc-js automatic reconnection. I do not know whether describe() reliably exposes nondeterminism detail across every supported version.
- **[report_follow_up]** follow_ups: Packet omitted labeled TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors; user prose supplied scope and boundaries.
- **[report_follow_up]** follow_ups: I do not know whether WorkflowExecutionDescription exposes poisoned-history detail consistently across every supported version; do not let regex evidence alone authorize automatic destruction.
- **[report_follow_up]** follow_ups: Tests must prove axis independence, RPC cancellation, no post-expiry work, mutation-ineligible degraded reads, unknown post-signal outcomes, and unchanged run pinning.
- **[research_citation]** sources: Temporal query guidance: Documents no-poller, QueryNotRegisteredError, and query rejection behavior. (https://docs.temporal.io/develop/typescript/workflows/message-passing)
- **[research_citation]** sources: Temporal Connection API: Documents withDeadline and withAbortSignal request scopes. (https://typescript.temporal.io/api/classes/client.Connection)
- **[research_citation]** sources: Temporal SDK connection source: Deadline reaches grpc-js; AbortSignal invokes call.cancel(); nested signals are non-cumulative. (https://github.com/temporalio/sdk-typescript/blob/main/packages/client/src/connection.ts)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Sound plugin-local direction, but implementation gaps remain: Promise.race leaves RPCs active; workflow diagnosis is untyped; gate reads and post-signal readback are not bounded; reconnect evidence is partly regex-based. Use independent typed service/workflow axes, one SDK deadline/abort context, explicit degraded reads, fail-closed mutation outcomes, and unchanged approved run-pinned termination. QueryNotRegisteredError must be named conservatively because it can also represent query-handler failure.
- **[unresolved_action]** required_main_agent_actions: Route a remediation task to wire `mutation-safety.ts` into production recovery/signal paths and add integration coverage for SC4 and SC6.
- **[unresolved_action]** required_main_agent_actions: Fix `gates.ts:46` to reuse the original `TemporalReadContext`, then rerun focused read-context/gate tests and re-request acceptance review.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Pure safety helpers do not enforce a recovery contract until production signal/recovery call sites consume them; acceptance review should search for production imports, not only unit coverage.
- **[archive_only_evidence]** verification: tests_run=/usr/bin/git diff --unified=12 trunk...HEAD -- plugin/src/temporal/diagnostics.ts plugin/src/temporal/mutation-safety.ts plugin/src/storage/store-temporal/read-context.ts plugin/src/temporal/retry-wrapper.ts plugin/src/storage/store-temporal/index.ts plugin/src/storage/store-temporal/changes.ts plugin/src/storage/store-temporal/gates.ts, bin/oc-test targeted -- src/temporal/diagnostics.test.ts src/temporal/mutation-safety.test.ts src/temporal/retry-wrapper.test.ts src/storage/store-temporal/read-context.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/storage/store-temporal/gates.test.ts results=pass — Diff inspected. Targeted command passed: 5 files, 99 tests. Contract manifest: SC1 pass (`diagnostics.ts:309-316`, test `diagnostics.test.ts:214-244`); SC2 pass (`diagnostics.ts:153-240`); SC3 blocked by `gates.ts:30-46` context escape; SC4 blocked by unconsumed eligibility guard (`mutation-safety.ts:76-110`); SC5 pass (`retry-wrapper.ts:138-144,366-371`, `shared.ts:205-218`); SC6 blocked by unconsumed outcome guard (`mutation-safety.ts:32-58`); SC7 existing production safeguards remain in `tools/change.ts:3931-4167`, but new guard is likewise unconsumed; C1 pass (diff limited to plugin); C2 pass (existing operator tool unchanged); C3 pass for `runTemporalRead` native path (`retry-wrapper.ts:327-340`); C4 pass (`index.ts:841-859,1532-1540`); C5 pass (no Reset in diff).

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| SC6 | success_criterion | pass |
| SC7 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/diagnostics.test.ts (RED before implementation)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/diagnostics.test.ts (GREEN after implementation)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/diagnostics.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/read-context.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/storage/store-temporal/bounded-status.test.ts src/storage/store-temporal/changes.test.ts src/tools/gate.test.ts src/tools/status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/mutation-safety.test.ts (RED before implementation)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/mutation-safety.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.workflow-terminate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/mutation-safety.test.ts src/temporal/diagnostics.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/read-context.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts -t "sets and clears epic_membership projection through signals" --run
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/ --run
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- Route a remediation task to wire `mutation-safety.ts` into production recovery/signal paths and add integration coverage for SC4 and SC6.
- Fix `gates.ts:46` to reuse the original `TemporalReadContext`, then rerun focused read-context/gate tests and re-request acceptance review.
