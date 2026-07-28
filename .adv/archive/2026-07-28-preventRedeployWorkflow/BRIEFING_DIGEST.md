# Archive Briefing Digest

**Change ID:** preventRedeployWorkflow
**Title:** Prevent redeploy workflow poisoning
**Status:** archived
**Generated:** 2026-07-28T01:44:37.161Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage

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

Showing 14 of 14 durable facts.

- **[report_follow_up]** follow_ups: Packet SCOPE KEY was discovery/temporal-drain-semantics, which is not accepted by the persisted-report schema; report persisted under required schema key researcher:temporal-drain-semantics.
- **[research_citation]** sources: Temporal TypeScript Worker processes — shutdown: Official docs: shutdown signal/request stops polling, lets tasks drain to shutdownGraceTime, then remaining activities stop; shutdownForceTime guarantees eventual shutdown; lists worker states. (https://docs.temporal.io/develop/typescript/workers/run-worker-process)
- **[research_citation]** sources: Installed @temporalio/worker 1.17.2 WorkerOptions: Authoritative installed API declaration: grace drains pending tasks; remaining in-flight activities are cancelled; shutdownForceTime throws GracefulShutdownPeriodExpiredError and does not clean work up. (/home/jon/dev/advance/plugin/node_modules/@temporalio/worker/lib/worker-options.d.ts (v1.17.2, lines 117-136))
- **[research_citation]** sources: Installed @temporalio/worker 1.17.2 Runtime and Worker: Default signal set includes SIGTERM; runtime installs process handlers and Worker registers callback to invoke shutdown. Worker exposes shutdown state and force-time behavior. (/home/jon/dev/advance/plugin/node_modules/@temporalio/worker/lib/runtime-options.d.ts (lines 39-46); runtime.js (lines 316-340); worker.js (lines 590-636, 1513-1564))
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The installed 1.17.2 SDK automatically converts SIGTERM into Worker.shutdown() (unless Runtime shutdownSignals is overridden). Its documented drain primitive is a configured shutdownGraceTime plus awaiting worker.run() to STOPPED. A 2-second SIGKILL after SIGTERM would truncate the documented grace window if grace exceeds 2 seconds. However, killing a WorkflowTask does not itself create nondeterminism: recovery replays recorded history; non-determinism occurs only when replay-generated commands do not match that history. Therefore replay compatibility is the primary workflow-code deployment safeguard; drain prevents avoidable task interruption and activity disruption.
- **[report_follow_up]** follow_ups: Orchestrator should run adv_spec show advance-workflow or change validation before gate completion.
- **[report_follow_up]** follow_ups: No direct test run was performed.
- **[research_citation]** sources: Temporal TypeScript replay guidance: Temporal documents replay as a compatibility check against event history and recommends replaying relevant task-queue histories before deployment. (https://docs.temporal.io/develop/typescript/best-practices/testing-suite)
- **[research_citation]** sources: Temporal safe deployments: Temporal recommends a verification phase using replay testing before actual worker deployment. (https://docs.temporal.io/develop/safe-deployments)
- **[research_citation]** sources: Temporal TypeScript Worker source: Official SDK implementation is the source linked by Context7 for replay-worker behavior. (https://github.com/temporalio/sdk-typescript/blob/main/packages/worker/src/worker.ts)
- **[research_citation]** sources.omitted: 1 additional source omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Reuse of committed-fixture replay verification matches Temporal's recommended pre-deployment verification phase. The self-roll location is structurally correct. KD5's bare pnpm command is not cwd-safe, and KD4's assertion that deployed plugin lacks src/ is false under current whole-plugin rsync.
- **[unresolved_action]** validation.blockers: KD5's bare `pnpm run verify:worker-bundle` cannot reliably execute the proposed plugin-only script, so the bounce gate cannot satisfy AC2 as designed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- KD5's bare `pnpm run verify:worker-bundle` cannot reliably execute the proposed plugin-only script, so the bounce gate cannot satisfy AC2 as designed.
