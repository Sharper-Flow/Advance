# Archive Briefing Digest

**Change ID:** fixHealthFieldScope
**Title:** Fix health field scope
**Status:** archived
**Generated:** 2026-08-03T07:13:33.601Z

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

Showing 49 of 49 durable facts.

- **[report_follow_up]** follow_ups: Migrate the consumer assignment in plugin/src/tools/status.ts reported by `pnpm run typecheck` at line 988 (TS2322: WorkerLiveness is not assignable to boolean), plus the remaining tri-state consumers, in tk-380238fab828.
- **[archive_only_evidence]** decisions: Added WorkerLiveness as available boolean or unavailable reason, with not_host_capable, probe_failed, and probe_timeout reasons. — Distinguishes a process that never resolved a worker role from a resolved role whose worker is currently not alive.
- **[archive_only_evidence]** decisions: Set workerRoleResolved = true at plugin/src/plugin-init.ts:280, immediately after currentWorkerRole = singletonPlan.workerRole and before shouldSpawnWorker branching. — Every bootstrapping plugin host resolves a role there, including singleton non-lock-owning hosts that defer spawning; the MCP server never runs plugin-init and remains unresolved. The role value itself cannot distinguish initial degraded from resolved degraded.
- **[archive_only_evidence]** decisions: Kept the existing worker_alive OR-chain unchanged inside the available arm. — This task changes observability state, not the existing liveness conclusion when the process can answer.
- **[archive_only_evidence]** decisions: Updated fallback behavior by resolution state. — Resolved timeout remains available true with probe_degraded; resolved non-timeout reports probe_failed; unresolved paths report not_host_capable.
- **[archive_only_evidence]** verification: npx vitest run src/temporal/health-probe.test.ts src/tools/status-health.test.ts (1) — RED: failed both newly added tri-state assertions before implementation, proving the tests detect the old boolean behavior.
- **[archive_only_evidence]** verification: npx vitest run src/temporal/health-probe.test.ts src/tools/status-health.test.ts (0) — GREEN: 2 targeted test files passed, 18 tests passed.
- **[archive_only_evidence]** decisions: Exported isWorkerAffirmativelyAlive and used it at status diagnostics and doctor boolean boundaries. — Only available/true is affirmative liveness; unavailable remains explicitly distinguishable from available/false, while DoctorVerification stays boolean as required.
- **[archive_only_evidence]** decisions: Replaced doctor.ts's duplicate TemporalHealthSnapshot and removed both unsafe casts. — The shared TemporalHealth type is the runtime contract; this exposed the true post-reconcile inventory and prevents future liveness drift.
- **[archive_only_evidence]** decisions: Adapted doctor worker-lock diagnostics to shared holder_pid/schema_version fields. — Removing the duplicate type exposed nine stale worker-lock property errors; shared TemporalHealth does not expose the former pid/kind/live/owned shape, and the peer-holder check preserves suspect-lock refusal behavior.
- **[archive_only_evidence]** decisions: Ran static verification after implementation. — pnpm run typecheck and pnpm run format:check passed; pnpm run lint completed with 0 errors and 4 pre-existing warnings in untouched temporal files.
- **[archive_only_evidence]** verification: npx vitest run src/utils/tool-formatters.test.ts src/tools/doctor.test.ts src/tools/status.test.ts src/temporal/health-probe.test.ts (1) — RED evidence: the new unavailable formatter case failed because the old truthiness check rendered Worker process: healthy; 1 failed, 139 passed.
- **[archive_only_evidence]** verification: npx vitest run src/utils/tool-formatters.test.ts src/tools/doctor.test.ts src/tools/status.test.ts src/temporal/health-probe.test.ts (0) — GREEN evidence: targeted suite passed; 4 files and 143 tests passed.
- **[archive_only_evidence]** verification: npx vitest run src/utils/tool-formatters.test.ts src/tools/doctor.test.ts src/tools/status.test.ts src/temporal/health-probe.test.ts src/tools/status-health-integration-blockers.test.ts src/tools/status-health.reset.test.ts src/tools/status-health.session-queue.test.ts src/tools/status-health-pressure.test.ts src/tools/health-probe-cache.test.ts src/__tests__/benchmark-temporal.test.ts (0) — Extended affected-consumer verification passed; 10 files and 224 tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscsgzo1_8b33ea1c
- **[unresolved_action]** required_main_agent_actions: Review the two documentation-only changes and checkpoint task tk-4b97fdb6ea34; no source, criteria, or spec changes are required.
- **[unresolved_action]** required_main_agent_actions: Leave `registered_queues`, `search_attributes`, adv_doctor health criteria, and spec-delta paths unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Operator-facing liveness diagnostics must distinguish an unavailable observation from an observed false value and state the querying-process scope; otherwise MCP-server status can be misdiagnosed as a failed worker.
- **[archive_only_evidence]** changes_made: docs/temporal-recovery.md: Replaced Boolean operator guidance throughout the affected recovery regions with WorkerLiveness objects. Before: `worker_alive=false` / `worker_process_alive=false`; after: `{ status: "available", value: false }`. Added the process-scope rule: only `{ status: "available", value: true }` is affirmatively alive, matching `isWorkerAffirmativelyAlive`. Rewrote the diagnostic matrix’s Boolean rows, added `{ status: "unavailable", reason: "not_host_capable" }` and probe-failure/timeout rows, and updated the OOP, restart, stale-heartbeat, migration, and OOM references.
- **[archive_only_evidence]** changes_made: SETUP.md: Replaced the prior Boolean field table (before: `worker_alive` meant registered object; `worker_process_alive` meant running) with a three-state, per-querying-process table. Updated the Node-runtime symptom and Temporal Worker Errors guidance from Boolean literals to `{ status: "available", value: false }`.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/health-probe.test.ts, rg -n 'worker_alive=(true|false)' docs/temporal-recovery.md SETUP.md || true, git diff --check results=pass — Health-probe suite: 1 file and 17 tests passed. The Boolean-literal grep produced no output. `git diff --check` passed. Code authority read at health-probe.ts: WorkerLiveness is available/value or unavailable/not_host_capable|probe_failed|probe_timeout; helper returns `w.status === "available" && w.value`. Exact new not_host_capable action: “You are querying a process that does not host workers (e.g. the Vision-managed MCP server) — re-check from the host plugin via `adv_doctor`.” Changed-region before → after evidence: temporal-recovery old `worker_process_alive: false`/`worker_alive=false` forms now use `{ status: "available", value: false }`; its old Boolean matrix now also includes unavailable not_host_capable and probe rows. SETUP old Boolean table now documents all three WorkerLiveness states and process scope.
- **[archive_only_evidence]** decisions: Added the regression at the Tier-4 MCP dispatcher boundary using the role-unresolved health construction path. — This exercises the JSON-shaped payload MCP emits rather than only testing the in-memory TemporalHealth value.
- **[archive_only_evidence]** decisions: Explicitly JSON-round-tripped the dispatcher result and asserted both worker fields are discriminated unavailable objects, not booleans. — The incident was caused by operator interpretation of serialized JSON; the test must fail if the union regresses to boolean.
- **[archive_only_evidence]** decisions: Added a direct tagHostProbeFields assertion for temporal_health metadata. — Proves degradation wraps only the top-level temporal_health object and preserves nested WorkerLiveness unions.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/mcp-server/health-field-scope.test.ts (0) — Final targeted verification passed: 1 test file, 3 tests.
- **[archive_only_evidence]** decisions: Renamed the existing resolved-role regression to explicitly cover a client-role host and documented the never-resolved contrast. — A resolved client role is host-capable even when shouldSpawnWorker is false and no local worker is registered; it must not be classified as not_host_capable.
- **[archive_only_evidence]** decisions: Added a source-order assertion that workerRoleResolved is assigned before the shouldSpawnWorker spawn gate. — The plugin-init mock isolates health-probe behavior, so this guard makes the test fail if the assignment is moved into the spawn block, the exact regression under review.
- **[archive_only_evidence]** decisions: Recorded this as verification/characterization rather than a production fix. — Production behavior was already correct at plugin-init.ts:280-281; no production code required changes.
- **[archive_only_evidence]** verification: npx vitest run src/temporal/health-probe.test.ts src/tools/status-health.test.ts (0) — Passed: 2 test files, 21 tests. Characterization coverage confirms resolved client-role hosts report available false for both worker fields.
- **[unresolved_action]** required_main_agent_actions: Add the client-role integration regression described in ac3-1, then rerun the affected test.
- **[unresolved_action]** required_main_agent_actions: Investigate and resolve the three full-suite timeout failures, then rerun `bin/oc-test full` successfully before acceptance. Do not call them pre-existing or flaky without base-branch reproduction or deterministic evidence.
- **[unresolved_action]** required_main_agent_actions: Do not revisit worker spawning, singleton policy, queue routing, orphan-queue adopter construction, doctor healthy/unhealthy criteria, read-timeout work, or public schemas; review found those scope boundaries unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Dev-only dynamic-import scripts can sit outside the main typecheck yet still consume runtime shapes; share exported domain types and add a typed regression fixture when an API union changes.
- **[archive_only_evidence]** changes_made: plugin/scripts/benchmark-temporal.ts: Replaced the benchmark harness's stale boolean temporal-health shape with the shared `TemporalHealth` type, preventing its dynamic health collector from misrepresenting unavailable liveness as booleans.
- **[archive_only_evidence]** changes_made: plugin/src/__tests__/benchmark-temporal.test.ts: Added a typed benchmark-record regression case containing both unavailable worker liveness fields.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/tools/doctor.test.ts src/mcp-server/health-field-scope.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts, bin/oc-test targeted -- src/__tests__/benchmark-temporal.test.ts, pnpm run check, bin/oc-test full, bin/oc-test targeted -- src/plugin-init.session-registration.test.ts src/storage/store-temporal/active-conflict-authority.test.ts src/temporal/__tests__/with-test-env.test.ts results=fail — Targeted union/consumer suite passed (6 files, 150 tests). Benchmark regression passed (1 file, 36 tests). `pnpm run check` passed with four existing ESLint warnings and no errors. Full suite failed with 3 five-second unit-test timeouts: plugin-init.session-registration, active-conflict-authority, and with-test-env (539 files: 535 passed, 3 failed, 1 skipped; 8275 tests: 8258 passed, 3 failed). Re-running exactly those three files passed (33 passed, 1 expected fail), so the timeout root cause remains unproven.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/tools/doctor.test.ts src/mcp-server/health-field-scope.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/__tests__/benchmark-temporal.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/plugin-init.session-registration.test.ts src/storage/store-temporal/active-conflict-authority.test.ts src/temporal/__tests__/with-test-env.test.ts
- **[unresolved_action]** required_main_agent_actions: Restore or use a healthy Temporal read path, then retrieve design.md and executive-summary.md through adv_change_show and confirm registered_queues and search_attributes are explicitly listed as intentional untouched gaps.
- **[unresolved_action]** required_main_agent_actions: Do not deploy from this worktree; release/deploy only after merge to trunk.
- **[unresolved_action]** required_main_agent_actions: After the artifact check passes, release approval may rely on the verified build, static worker-bundle non-reachability, consumer-coercion scan, documentation vocabulary review, and clean commit-hygiene scan.
- **[archive_only_evidence]** verification: tests_run=pnpm run build, bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/mcp-server/health-field-scope.test.ts, rg production import and emitted worker-bundle checks, git diff --check origin/trunk...HEAD results=pass — Build passed: plugin and worker bundles plus build identity generated without warnings. Targeted tests passed: 3 files, 24 tests. An initial targeted command incorrectly included a plugin/ path prefix and found no files; the corrected repository-root command passed. Static scan found health-probe imported only by non-workflow host consumers; no health-probe/getTemporalHealth/TemporalHealth/WorkerLiveness symbols appeared in dist/temporal/workflows.js. Diff whitespace check passed; working tree remained clean.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/mcp-server/health-field-scope.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg production import and emitted worker-bundle checks
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD

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
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscsgzo1_8b33ea1c
- Review the two documentation-only changes and checkpoint task tk-4b97fdb6ea34; no source, criteria, or spec changes are required.
- Leave `registered_queues`, `search_attributes`, adv_doctor health criteria, and spec-delta paths unchanged.
- Add the client-role integration regression described in ac3-1, then rerun the affected test.
- Investigate and resolve the three full-suite timeout failures, then rerun `bin/oc-test full` successfully before acceptance. Do not call them pre-existing or flaky without base-branch reproduction or deterministic evidence.
- Do not revisit worker spawning, singleton policy, queue routing, orphan-queue adopter construction, doctor healthy/unhealthy criteria, read-timeout work, or public schemas; review found those scope boundaries unchanged.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/tools/doctor.test.ts src/mcp-server/health-field-scope.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/__tests__/benchmark-temporal.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/plugin-init.session-registration.test.ts src/storage/store-temporal/active-conflict-authority.test.ts src/temporal/__tests__/with-test-env.test.ts
- Restore or use a healthy Temporal read path, then retrieve design.md and executive-summary.md through adv_change_show and confirm registered_queues and search_attributes are explicitly listed as intentional untouched gaps.
- Do not deploy from this worktree; release/deploy only after merge to trunk.
- After the artifact check passes, release approval may rely on the verified build, static worker-bundle non-reachability, consumer-coercion scan, documentation vocabulary review, and clean commit-hygiene scan.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/health-probe.test.ts src/tools/status-health.test.ts src/mcp-server/health-field-scope.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg production import and emitted worker-bundle checks
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
