# Archive Briefing Digest

**Change ID:** fixArtifactReadFallback
**Title:** Fix artifact read fallback
**Status:** archived
**Generated:** 2026-08-04T04:40:29.356Z

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

Showing 47 of 47 durable facts.

- **[archive_only_evidence]** decisions: Represent per-queue probe results as graded rows in verification.queue_serviceability while retaining verification.queue_serviceable. — Preserves the existing boolean compatibility field and exposes queue type, status, serviceability, poller count, last poller time, and owning session together.
- **[archive_only_evidence]** decisions: Treat a non-fresh session queue as a finding only when getCurrentSessionId() identifies the current owning session. — Current-session ownership is the expected-alive signal; absent session identity represents legacy or ended-session context and must not create a false-red diagnosis.
- **[archive_only_evidence]** decisions: Keep session probing bounded to one project queue plus one current-session queue per diagnose/recheck phase. — Matches the required topology and avoids unbounded DescribeTaskQueue fan-out.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/doctor.test.ts (1) — RED: intentionally failing AC6 assertion confirmed the new session/project queue-row test detects missing graded output.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/doctor.test.ts (0) — GREEN: 26 doctor tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/doctor.test.ts (0) — Verification: 26 doctor tests passed after formatting.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec eslint src/tools/doctor.ts (0) — ESLint passed for doctor.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1n887_ed7c57ee
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1nqi1_d82db131
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1ov2r_6a6515ee
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1pgzt_024b5bca
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1puo1_30c237f0
- **[archive_only_evidence]** decisions: Moved doctor queue probes through the existing 30-second poller cache. — Avoids duplicate DescribeTaskQueue calls across health and doctor surfaces under the newer Temporal Visibility RPS constraint.
- **[report_follow_up]** follow_ups: If markdown-before-projection is retained, add a regression test: active change with a stale legacy proposal.md AND a fresher projection document -> assert projection content wins.
- **[report_follow_up]** follow_ups: Verify the 8s aggregate read budget referenced in the prompt is documented/enforced where the Query is attempted, so the no-retry decision's budget claim is structural rather than prose-only (P38).
- **[report_follow_up]** follow_ups: Consider surfacing the read source field through adv_change_show include flags so consumers can observe when reads are degrading to projection (observability for the no-silent-success theme).
- **[research_citation]** sources: Temporal TS SDK — message-passing (Query problems / no poller): 'A Worker must be online and polling the Task Queue to process a Query.' Under 'Problems when sending a Query': 'There is no Workflow Worker polling the Task Queue: You'll receive a client.ServiceError on which the cause.code attribute is gRPC status code 9 FAILED_PRECONDITION.' Contrast Updates: no-poller Update is 'retried by the SDK Client indefinitely' — Queries are NOT. (https://docs.temporal.io/develop/typescript/workflows/message-passing)
- **[research_citation]** sources: Temporal — Task Queues (Query tasks not persisted, caller retries): 'Nexus and Query Tasks are not persisted. Instead, they are sync matched when, and only when, polled by a Worker... The caller is responsible to retry failed operations.' Confirms a Query with no poller is never served; retrying re-burns budget against an unchanging condition. (https://docs.temporal.io/task-queue)
- **[research_citation]** sources: Temporal server PR #5252 — 'no poller seen recently' fast-fail: Server rejects a Query with 'no poller seen for task queue recently, worker may be down' as DEADLINE_EXCEEDED, waiting 1s less than the timeout. Reviewer notes poller-presence is necessary but not sufficient. (https://github.com/temporalio/temporal/pull/5252)
- **[research_citation]** sources.omitted: 14 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Both fixes are sound and reuse tested infrastructure. Fix 1 adds a tier to an existing fallback chain; the projection (change.json state.documents) is written per-signal by the writeChangeProjection activity (workflows.ts:999-1025), so it is a durable mirror of committed workflow state — strictly more correct than the legacy markdown tier, which is archive-only (CHANGELOG.md:35; no active write path found via lgrep). Fix 2 ports the session-queue probe already proven in status-health.ts:431-466 into doctor, which today passes a bare projectId (doctor.ts:268) and probes only the project queue. Temporal semantics fully support both decisions: a no-poller Query fails fast with FAILED_PRECONDITION/DEADLINE_EXCEEDED (not SDK-auto-retried; Query tasks are sync-matched and never persisted), so not retrying is correct; reading from an external committed projection when the Query is unavailable is the idiomatic cache-aside pattern (workflow history stays authoritative). Two caution-level refinements: (R1) prefer projection BEFORE markdown in the fallback order to avoid a narrow staleness window for pre-migration leftover markdown; (R2) propagate an explicit source/degradation marker so callers cannot infer workflow liveness from a successful projection read. Neither blocks the defect fix. The doctor session-probe must classify per-queue state (fresh/stale/none/unavailable) plus owning-session rather than collapsing to binary healthy.
- **[unresolved_action]** required_main_agent_actions: Remediate the ended-peer-session queue reporting gap while retaining bounded probe cost (C6), then add a regression test that an ended owner's queue is surfaced informationally and not treated as a health failure.
- **[unresolved_action]** required_main_agent_actions: Rerun the targeted doctor and artifact test files plus pnpm run check; rerun acceptance review before completing the acceptance gate.
- **[unresolved_action]** required_main_agent_actions: Leave artifact projection fallback/provenance behavior alone: reviewed tier ordering, no-deadline local fallback, batched parity, and change-show source tags meet AC1–AC5 and AC11 evidence.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A current-session queue probe cannot diagnose a workflow stranded on an ended peer session queue. Distinguish reporting known ended-owner queues informationally from probing every tracked queue, so bounded probe-cost constraints do not erase the outage signal.
- **[archive_only_evidence]** verification: tests_run=pnpm run check, ../bin/oc-test targeted -- src/tools/change.read-artifact.test.ts src/tools/change.test.ts src/tools/doctor.test.ts, git diff --check trunk...HEAD results=pass — pnpm run check passed (0 errors; 4 existing ESLint warnings). Targeted test run passed: 3 files, 199 tests. git diff --check produced no whitespace errors. Artifact tests cover projection fallback, expired deadline local fallback, workflow precedence, batched provenance, and the change-show orphan/deadline path. Doctor tests genuinely execute and cover current-session/project rows, graded `none`, and absent current-session legacy shape, but do not cover an ended peer owner.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/tools/change.read-artifact.test.ts src/tools/change.test.ts src/tools/doctor.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check trunk...HEAD
- **[unresolved_action]** required_main_agent_actions: Create the required git checkpoint for the two reviewer edits in plugin/src/tools/doctor.ts and plugin/src/tools/doctor.test.ts before advancing acceptance.
- **[unresolved_action]** required_main_agent_actions: Do not revisit quiet ended-session queues with no non-terminal change workflow; their suppression is the approved AC8 noise-control policy.
- **[archive_only_evidence]** changes_made: plugin/src/tools/doctor.ts: Published the diagnostic-pass project and current-session queue rows at top-level queue_serviceability, so AC6 does not depend solely on post-fix verification; corrected capped-probe prose to avoid claiming reruns advance to a new slice.
- **[archive_only_evidence]** changes_made: plugin/src/tools/doctor.test.ts: Asserted normal doctor output exposes the diagnostic queue rows and that the no-session legacy shape still omits them.
- **[archive_only_evidence]** verification: tests_run=../bin/oc-test targeted -- src/tools/doctor.test.ts src/temporal/list-orphan-session-queues.test.ts src/tools/change.read-artifact.test.ts src/temporal/workflow-bundle-boundary.test.ts, pnpm run check results=pass — Targeted suite: 4 files, 57 tests passed. Check passed: schema/type/manifest/frontmatter/isolation/lockfile checks, ESLint, and Prettier. ESLint emitted four unchanged no-explicit-any warnings in mock-owner.ts:241 and operations.ts:1106,1188,1193; git diff 115bb0b6^..115bb0b6 proved those files were untouched, and blame attributes all four lines to 50713b5d5, so commit 115bb0b6 did not introduce them. Source and tests confirm Query -> active projection -> disk -> archive precedence, single-query batched fallback/provenance, no retry after Query failure, 8-queue/4-concurrency orphan probing, shared cache use, AC9/AC10 preservation, staged delta scenarios 01.4/01.5, and passing workflow static-import boundary test.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/tools/doctor.test.ts src/temporal/list-orphan-session-queues.test.ts src/tools/change.read-artifact.test.ts src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** required_main_agent_actions: Release Readiness Summary: Safe to ship. Artifact reads now fall back through durable projection, disk, and archive tiers with provenance; doctor diagnostics expose current/session queue serviceability while safely bounding orphan checks. Validation and targeted tests are green. After merge, build and deploy from trunk with pnpm run build and ./scripts/deploy-local.sh --fix, then restart the OpenCode host. Residual risk is operational diagnosis: queue serviceability does not prove workflow-query latency is healthy.
- **[unresolved_action]** required_main_agent_actions: Create a follow-up for A: recompute a stuck gate's readiness on retry after its blocking evidence changes; do not require compatibility recovery for a cleared blocker.
- **[unresolved_action]** required_main_agent_actions: Create a follow-up for B: distinguish Temporal workflow-query deadline/history-latency failures from queue-poller absence in degraded-read messaging and sub-agent diagnosis.
- **[unresolved_action]** required_main_agent_actions: Do not revisit settled acceptance decisions or expand orphan probing beyond the bounded diagnostic scope.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Queue serviceability and workflow-query responsiveness are independent. A fresh DescribeTaskQueue result cannot rule out an aggregate workflow-query deadline caused by large workflow history.
- **[archive_only_evidence]** verification: tests_run=cd plugin && pnpm run check, cd plugin && ../bin/oc-test targeted -- src/tools/doctor.test.ts src/tools/change.read-artifact.test.ts src/tools/change.test.ts, cd plugin && ../bin/oc-test targeted -- src/temporal/__tests__/workflow-bundle-imports.test.ts src/temporal/list-orphan-session-queues.test.ts, git diff --check results=pass — pnpm run check passed: schemas:check, typecheck, generated-manifest check, frontmatter/isolation/lockfile checks, lint (4 existing warnings; 0 errors), and Prettier. Required targeted suite passed: 3 files, 203 tests. Additional worker-boundary/orphan-list suite passed: 2 files, 7 tests; workflow bundle compiled with no forbidden Node/filesystem imports. git diff --check and status were clean at e83a3411.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && ../bin/oc-test targeted -- src/tools/doctor.test.ts src/tools/change.read-artifact.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && ../bin/oc-test targeted -- src/temporal/__tests__/workflow-bundle-imports.test.ts src/temporal/list-orphan-session-queues.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1n887_ed7c57ee
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1nqi1_d82db131
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1ov2r_6a6515ee
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1pgzt_024b5bca
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse1puo1_30c237f0
- Remediate the ended-peer-session queue reporting gap while retaining bounded probe cost (C6), then add a regression test that an ended owner's queue is surfaced informationally and not treated as a health failure.
- Rerun the targeted doctor and artifact test files plus pnpm run check; rerun acceptance review before completing the acceptance gate.
- Leave artifact projection fallback/provenance behavior alone: reviewed tier ordering, no-deadline local fallback, batched parity, and change-show source tags meet AC1–AC5 and AC11 evidence.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/tools/change.read-artifact.test.ts src/tools/change.test.ts src/tools/doctor.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check trunk...HEAD
- Create the required git checkpoint for the two reviewer edits in plugin/src/tools/doctor.ts and plugin/src/tools/doctor.test.ts before advancing acceptance.
- Do not revisit quiet ended-session queues with no non-terminal change workflow; their suppression is the approved AC8 noise-control policy.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/tools/doctor.test.ts src/temporal/list-orphan-session-queues.test.ts src/tools/change.read-artifact.test.ts src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- Release Readiness Summary: Safe to ship. Artifact reads now fall back through durable projection, disk, and archive tiers with provenance; doctor diagnostics expose current/session queue serviceability while safely bounding orphan checks. Validation and targeted tests are green. After merge, build and deploy from trunk with pnpm run build and ./scripts/deploy-local.sh --fix, then restart the OpenCode host. Residual risk is operational diagnosis: queue serviceability does not prove workflow-query latency is healthy.
- Create a follow-up for A: recompute a stuck gate's readiness on retry after its blocking evidence changes; do not require compatibility recovery for a cleared blocker.
- Create a follow-up for B: distinguish Temporal workflow-query deadline/history-latency failures from queue-poller absence in degraded-read messaging and sub-agent diagnosis.
- Do not revisit settled acceptance decisions or expand orphan probing beyond the bounded diagnostic scope.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && ../bin/oc-test targeted -- src/tools/doctor.test.ts src/tools/change.read-artifact.test.ts src/tools/change.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && ../bin/oc-test targeted -- src/temporal/__tests__/workflow-bundle-imports.test.ts src/temporal/list-orphan-session-queues.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
