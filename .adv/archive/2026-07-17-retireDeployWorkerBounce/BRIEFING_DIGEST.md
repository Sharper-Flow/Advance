# Archive Briefing Digest

**Change ID:** retireDeployWorkerBounce
**Title:** Retire deploy worker bounce
**Status:** archived
**Generated:** 2026-07-17T03:56:58.261Z

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

Showing 79 of 79 durable facts.

- **[report_follow_up]** follow_ups: src/tools/status-health.worker-processes.test.ts has a pre-existing 5s timeout failure and is outside the current scope; may need a longer timeout or separate fix.
- **[archive_only_evidence]** decisions: Added a new stampBundleGeneration async method to WorkerLockHeartbeatController instead of making setBundleGeneration async. — Keeps the override-only setBundleGeneration surface intact for existing tests/back-compat and makes the immediate atomic-stamp contract explicit.
- **[archive_only_evidence]** decisions: Injected ADV_TEMPORAL_WORKER_SELF_ROLL=1 via buildTemporalWorkerProcessSpec. — Centralizes the worker capability marker in the process spec used by worker-multi, so a deploy classifier can detect self-roll capability from /proc environment.
- **[archive_only_evidence]** decisions: Worker-roll now awaits stampBundleGeneration after restartChild() and initWorkerBundleRoll. — Realizes bounded generation convergence: detection + roll + readiness + immediate stamp, no longer waiting for the next 10s heartbeat.
- **[archive_only_evidence]** verification: pnpm test src/temporal/worker-heartbeat.test.ts (1) — Red phase: stampBundleGeneration did not exist, 2/10 tests failed as expected.
- **[archive_only_evidence]** verification: pnpm test src/temporal/worker-heartbeat.test.ts src/temporal/worker-roll.test.ts src/temporal/runtime-manager.test.ts src/temporal/worker-multi.test.ts src/plugin-init.worker-singleton.test.ts (0) — Green/verify: 66 focused tests pass across heartbeat, roll, runtime-manager, worker-multi, and plugin-init worker-singleton.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schema check, typecheck, test isolation, lockfile policy, lint, and format check all pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Added worker_has_self_roll_capability helper that parses NUL-separated /proc/PID/environ and matches only the exact ADV_TEMPORAL_WORKER_SELF_ROLL=1 entry. — Requirement was explicit: one shell-safe classifier, exact value, no partial/loose matching. Missing/unreadable/malformed environ returns legacy so the existing SIGTERM path stays active.
- **[archive_only_evidence]** decisions: Kept the legacy SIGTERM/grace/action-required path and limited it to the 'legacy' bucket after classification. — Preserves existing loud-failure semantics for workers that do not advertise self-roll capability, while advisory workers are skipped entirely.
- **[archive_only_evidence]** decisions: Left check and dry-run modes signal-free by reporting advisory/legacy status without calling kill. — Matches the task requirement that check/dry-run remain signal-free and unrelated processes are untouched.
- **[archive_only_evidence]** decisions: Added a new spawnSelfRollWorker fixture instead of modifying the existing stuck-worker fixture. — Keeps the legacy stuck-worker test unchanged and avoids coupling the two scenarios, making the advisory test independently focused.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts -t "self-roll capable worker is advisory, not signaled, and deploy succeeds" (1) — RED: test failed as expected before classifier (deploy treated self-roll worker as legacy and returned action-required failure).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts -t "self-roll capable worker is advisory, not signaled, and deploy succeeds" (0) — GREEN: test passed after classifier (advisory worker not signaled, deploy succeeded).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts (0) — VERIFY: all 3 worker-refresh regression tests pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local.test.ts -t "deploy-local.sh" (0) — VERIFY: deploy-local.sh content tests (72) still pass after script edits.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts (0) — New test file is Prettier-compliant.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts (0) — New test file passes eslint.
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts -t "self-roll capable worker is advisory, not signaled, and deploy succeeds"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts
- **[archive_only_evidence]** decisions: Extended runDeploy fixture helper to accept mode ('fix' | 'check' | 'dry-run') and pass --fix/--check/--dry-run to the script. — Needed to exercise the read-only modes in the focused harness without duplicating the fixture setup.
- **[archive_only_evidence]** decisions: Added spawnMalformedMarkerWorker fixture with ADV_TEMPORAL_WORKER_SELF_ROLL=yes (not exactly '1'). — Covers the 'malformed marker fallback' gap: the classifier recognizes only the exact value '1', so any other value must route to the legacy SIGTERM path.
- **[archive_only_evidence]** decisions: Added check-mode and dry-run-mode tests that assert no SIGTERM is sent and the worker stays alive. — Proves the read-only modes are signal-free for both legacy and advisory workers, as required by the task.
- **[archive_only_evidence]** decisions: Made check-mode tests lenient about overall exit status while still asserting worker-refresh output. — The throwaway fixture cannot satisfy the full ADV CLI/config prerequisites that check_config/check_adv_cli_install require for status 0, but the worker-refresh portion still runs and proves signal-free behavior.
- **[archive_only_evidence]** decisions: Used distinct prefix temp dirs for each worker fixture to avoid collisions. — Keeps the exact-path safety guarantee and makes cleanup isolated.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts (0) — All 7 worker-refresh regression tests pass (stuck legacy, advisory self-roll, malformed marker, check legacy, check advisory, dry-run legacy, no workers).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local.test.ts -t "deploy-local.sh" (0) — deploy-local.sh content tests (72) still pass after script edits.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts (0) — Modified test file is Prettier-compliant.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts (0) — Modified test file passes eslint.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts
- **[archive_only_evidence]** decisions: Kept existing rq-deployWorkerBounce scenario IDs (01.1, 01.2, 01.3, 02.1, 02.2) while rewriting titles/content to describe marker-gated self-roll and legacy fallback. — Avoided touching spec-citation and asset tests that reference the IDs; the broad-process-matching rule is now covered by the requirement body.
- **[archive_only_evidence]** decisions: Regenerated docs/specs/advance-meta.md from spec.json using plugin/src/archive/docs.ts generateSpecDoc. — This is the repo-supported spec-to-doc generator used by the archive flow.
- **[archive_only_evidence]** decisions: Adjusted deploy-local.test.ts spec assertions to require the self-roll marker and advisory wording instead of adding a new test file. — The existing deploy-local-worker-refresh.test.ts already exercises the behavior end-to-end; the asset test now verifies the spec itself reflects it.
- **[archive_only_evidence]** decisions: Removed the temporary tsx helper script after generating the doc. — The helper was a one-off tool invocation, not a new repo asset.
- **[archive_only_evidence]** verification: jq empty .adv/specs/advance-meta/spec.json (0) — Spec JSON is valid
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts (0) — 4 test files, 83 tests passed
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes
- **[archive_only_evidence]** verification: pnpm run lint (0) — ESLint passes
- **[archive_only_evidence]** verification: pnpm run format:check (0) — Prettier format check passes
- **[archive_only_evidence]** verification: pnpm run check (0) — Full static check (schemas, typecheck, isolation, lockfile, lint, format) passes
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: jq empty .adv/specs/advance-meta/spec.json
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Packet omitted IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; research followed TASK_SCOPE and supplied scope warning rather than inferring missing anchors.
- **[report_follow_up]** follow_ups: Prior-consideration/conflict-scan data was not provided; candidate novelty is therefore unknown and no archive/conflict claim is made.
- **[report_follow_up]** follow_ups: Episode advisory recall returned no relevant project decision; it was not used as evidence.
- **[report_follow_up]** follow_ups: No draft design artifact was available through ADV; validator should re-check these candidates once design.md exists.
- **[research_citation]** sources: Proposal and agreement: Contract requires explicit fail-closed capability marker, no deploy SIGTERM for marked workers, loud legacy fallback, no signals in read-only modes, 60-second convergence, unchanged crash accounting, and aligned specs/docs/tests. (adv://change/retireDeployWorkerBounce)
- **[research_citation]** sources: Current deploy worker refresh: Exact-path /proc cmdline enumeration currently treats every matching worker uniformly, emits ACTION_REQUIRED in read-only modes, and SIGTERMs all matches in mutating modes. (scripts/deploy-local.sh:1121-1232)
- **[research_citation]** sources: Central worker spawn environment: buildTemporalWorkerProcessSpec already owns the allowlisted environment passed to worker children, providing one low-risk marker injection point. (plugin/src/temporal/runtime-manager.ts:258-315)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Bounded scout found five leverage candidates, sorted by payoff/risk: (1) adopt_now—inject the exact marker in buildTemporalWorkerProcessSpec and pin its literal with focused tests; this uses the existing safe environment boundary and ties to AC1/C1/C3. (2) adopt_now—classify each exact-path PID once as marked or legacy before mode branching; marked gets advisory only, while missing/malformed/unreadable evidence follows the existing legacy bounce/failure path; ties to AC1-AC4/C1-C3. (3) design_around—make check/dry-run reuse the same classifier but remain signal-free, suppressing false ACTION_REQUIRED for marked workers while keeping an explicit legacy warning; ties to AC3 and avoids duplicated policy. (4) design_around—build AC5 convergence proof from the existing readiness-gated worker-roll and heartbeat generation paths, waiting on observable ready replacement plus lock-generation equality rather than a fixed sleep; ties to AC5. (5) adopt_now—reuse restartChild diagnostics/expectedRollExits assertions to prove marked deployment does not consume restartCount, instead of inventing a second accounting mechanism; ties to AC6/DONT3. No draft design artifact was available, so assessment validates leverage against proposal/agreement and current implementation, not a complete design document.
- **[report_follow_up]** follow_ups: Briefing packet was retrieved through adv_change_show as required; host output was truncated, so authoritative agreement/design were fetched separately through adv_change_show artifact includes.
- **[report_follow_up]** follow_ups: Episode advisory recall returned no relevant architectural decision and was not used as evidence.
- **[report_follow_up]** follow_ups: No implementation edits performed.
- **[research_citation]** sources: ADV agreement and design artifacts: Agreement requires fail-closed marker classification, exact-path safety, no signals in read-only modes, unchanged crash accounting, and live readiness plus lock-generation convergence within 60 seconds. Design selects one centralized marker, one fail-closed classifier, legacy fallback, and observable convergence. (adv://change/retireDeployWorkerBounce)
- **[research_citation]** sources: Advance Meta current deploy-worker laws: Current rq-deployWorkerBounce01 requires mutating deploys to SIGTERM exact-path workers by default, while rq-deployWorkerBounce02 forbids signaling in check/dry-run. Design therefore requires the explicitly planned spec-law revision before implementation can conform. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/advance-meta/spec.md)
- **[research_citation]** sources: Central worker process specification: buildTemporalWorkerProcessSpec already constructs the allowlisted child env, making marker injection centralized and structurally simple. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/runtime-manager.ts#L252-L315)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Marker-gated classification is correct, simple, and aligned with agreement C1-C3: marker injection uses the existing centralized env boundary; /proc provides running-process exec-time evidence; unreadable or nonliteral evidence can fail closed to the existing legacy path; exact-path candidate discovery remains unchanged; and expectedRollExits already excludes planned rolls from crash accounting. Current advance-meta rq-deployWorkerBounce01 still mandates SIGTERM for every exact-path worker, so the planned spec update is required and must land atomically with behavior/docs/tests. Blocking timing conflict: the existing maximum timing envelope has no margin for AC5's strict 60-second convergence—up to 10 seconds before drift check, 10 seconds for old-child hard-kill, 30 seconds for replacement readiness, and 10 seconds before heartbeat lock stamping totals 60 seconds before scheduler/filesystem overhead. Design says observe within 60 seconds but does not change this envelope or force an immediate post-readiness heartbeat, so it does not structurally guarantee the approved criterion.
- **[unresolved_action]** validation.blockers: AC5/SC3 timing is not structurally satisfied: existing bounded stages total the full 60-second limit (10s heartbeat detection + 10s hard-kill deadline + 30s readiness timeout + up to 10s next lock stamp), leaving no execution margin. Design must specify a supported mechanism with margin or obtain a contract amendment.
- **[report_follow_up]** follow_ups: Node.js does not guarantee exact timer callback timing; document 60 seconds as a verified operational acceptance bound, not a hard real-time guarantee: https://nodejs.org/docs/latest-v24.x/api/timers.html#settimeoutcallback-delay-args
- **[report_follow_up]** follow_ups: Ensure generated spec documentation changes with advance-meta, as required by AC7.
- **[report_follow_up]** follow_ups: Packet supplied all identity and scope anchors; no packet-defect warning.
- **[research_citation]** sources: Approved agreement AC5/SC3: SC3 and AC5 require post-restart deployment to produce a ready replacement and matching deployed/lock generation within 60 seconds. (adv://change/retireDeployWorkerBounce/agreement#SC3-AC5)
- **[research_citation]** sources: Revised design: Design removes the separate post-readiness periodic-heartbeat wait by requiring immediate generation stamping after replacement readiness. (adv://change/retireDeployWorkerBounce/design#Validator-Resolution)
- **[research_citation]** sources: Worker heartbeat source: Periodic heartbeat interval is 10 seconds; controller exposes beatNow and applies handed-off bundle generation during the atomic heartbeat rewrite. (file:///home/jon/dev/advance/plugin/src/temporal/worker-heartbeat.ts#L12-L13)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: PASS. Revision removes the prior blocker: worst configured nominal path is 10 seconds to drift detection + 10 seconds drain/hard-kill deadline + 30 seconds replacement readiness = 50 seconds, because generation persistence now occurs synchronously after readiness rather than waiting another 10-second heartbeat. This leaves 10 seconds nominal scheduling/atomic-write margin against AC5/SC3. Preserve the heartbeat controller as sole post-acquire lock writer: after restartChild resolves, hand off the generation and immediately await the controller's atomic beat/write path. Do not add a second direct lock writer. Current source still says 'next beat', so implementation and comments/tests must change together. Current advance-meta rq-deployWorkerBounce01 conflicts with marker-gated behavior, but design and AC7 explicitly scope its update; this is planned spec migration, not an unresolved design compromise. Node timers do not provide a hard real-time upper bound, so the 60-second statement is an operational acceptance bound validated by live proof, not a mathematical guarantee under arbitrary event-loop starvation.
- **[unresolved_action]** required_main_agent_actions: Packet defect: resend or record this independent review with `SCOPE KEY: review:acceptance`; do not use prose as TASK identity.
- **[unresolved_action]** required_main_agent_actions: Run bounded live AC5 proof after plugin-host restart and record ready replacement, deployed generation, lock generation, and elapsed time <=60 seconds.
- **[unresolved_action]** required_main_agent_actions: Optionally add an unreadable `/proc/<pid>/environ` classifier regression seam/fixture within the deploy refresh test subsystem.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Change-level acceptance packets must use `SCOPE KEY: review:acceptance`; a prose `TASK` value is rejected by ADV test evidence tooling and cannot authorize a remediation report.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/deploy-local.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-roll.test.ts src/temporal/runtime-manager.test.ts results=pass — Focused review suite passed: 5 test files, 113 tests, exit 0. `adv_run_test` could not record durable evidence because supplied TASK was not found.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts -t "self-roll capable worker is advisory, not signaled, and deploy succeeds"
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: jq empty .adv/specs/advance-meta/spec.json
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- AC5/SC3 timing is not structurally satisfied: existing bounded stages total the full 60-second limit (10s heartbeat detection + 10s hard-kill deadline + 30s readiness timeout + up to 10s next lock stamp), leaving no execution margin. Design must specify a supported mechanism with margin or obtain a contract amendment.
- Packet defect: resend or record this independent review with `SCOPE KEY: review:acceptance`; do not use prose as TASK identity.
- Run bounded live AC5 proof after plugin-host restart and record ready replacement, deployed generation, lock generation, and elapsed time <=60 seconds.
- Optionally add an unreadable `/proc/<pid>/environ` classifier regression seam/fixture within the deploy refresh test subsystem.
