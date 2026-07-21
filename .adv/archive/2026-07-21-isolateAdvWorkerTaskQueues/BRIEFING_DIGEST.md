# Archive Briefing Digest

**Change ID:** isolateAdvWorkerTaskQueues
**Title:** Isolate ADV worker task queues
**Status:** archived
**Generated:** 2026-07-21T13:25:03.160Z

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

Showing 79 of 79 durable facts.

- **[unresolved_action]** required_main_agent_actions: adv_task_checkpoint for tk-bcec2249b320 committed the dirty tree but recorded TASK_COMPLETION_BLOCKED: Stage-v2 non-test route 'static_check' requires a reviewer-owned review_evidence_ref. Orchestrator needs to supply reviewer evidence or route through the appropriate review gate before the task can be marked done.
- **[archive_only_evidence]** decisions: Static-check drift guard excludes .test.ts and .itest.ts files and only inspects files importing Worker from @temporalio/worker — The raw directory contains many integration-test Worker.create calls for test harnesses that are not production ADV workers; the scope of this task is the 4 verified production call sites. Filtering to actual Worker importers also removes a false positive from a runtime-manager.ts comment mentioning Worker.create.
- **[archive_only_evidence]** decisions: Static-check scans a 10-line window around each Worker.create call instead of strictly before it — The spread appears inside the Worker.create options object, physically on the lines after Worker.create(. A windowed check still detects the required spread while matching the actual code geometry.
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/worker-tuning.test.ts (1) — RED: static-check drift guard failed on 4 production Worker.create call sites
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/worker-tuning.test.ts (0) — GREEN: static-check drift guard passes after applying getAdvWorkerTuningOptions to 4 call sites
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/worker.test.ts (0) — VERIFY: worker unit tests pass including cap-value assertion
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — VERIFY: TypeScript typecheck passes
- **[unresolved_action]** required_main_agent_actions: Mark tk-bcec2249b320 done using this reviewer evidence; static_check route is satisfied.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Static guards over Worker.create must bind the required spread to each call's own options object and recursively enumerate production source; a nearby helper reference or root-only scan can silently mask future untuned call sites.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/worker-tuning.test.ts: Hardened production Worker.create drift guard: recursive source discovery now covers nested temporal production modules, and per-call inspection requires the literal tuning spread inside the current options object rather than accepting a nearby identifier occurrence.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir=plugin exec vitest run --project unit src/temporal/worker-tuning.test.ts, pnpm --dir=plugin exec vitest run --project unit src/temporal/worker.test.ts, pnpm --dir=plugin run typecheck, git diff --check results=pass — Review evidence (stage-v2 static_check): all four production Worker.create sites are covered—worker.ts:41, :206, :237 and in-process-worker.ts:151—and each spreads getAdvWorkerTuningOptions(). worker-tuning.ts defaults match KD-3 exactly (poller maxima 1/1, execution caps 4/4/4, activity rate 10). Drift guard and cap assertions passed (5/5 and 25/25); TypeScript typecheck and diff whitespace check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin exec vitest run --project unit src/temporal/worker-tuning.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin exec vitest run --project unit src/temporal/worker.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** decisions: Used --project unit filter to avoid integration-test timeout — Plain `pnpm test -- src/temporal/client.test.ts` triggered all Temporal integration tests (worker bundling, worktree creation) and timed out twice. Adding --project unit restricted execution to the unit-test project only, completing in ~1.3s.
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/client.test.ts (1) — RED: failed as expected (buildSessionTaskQueue is not a function)
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/client.test.ts (0) — GREEN: all 5 tests passed
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — VERIFY: typecheck passed
- **[unresolved_action]** required_main_agent_actions: Mark task tk-d96902977df3 as done. adv_task_update status:done is rejected by the tool (TASK_DONE_REQUIRES_CHECKPOINT) even after adv_task_checkpoint mode:complete was recorded; this status update is orchestration and must be performed by the parent orchestrator.
- **[archive_only_evidence]** decisions: Used bin/oc-test targeted instead of pnpm test -- src/temporal/worker-tuning.test.ts — The task-supplied pnpm test command ran the full Vitest suite and timed out; bin/oc-test targeted correctly filters to the requested file via pnpm exec vitest run.
- **[archive_only_evidence]** decisions: Defined AdvWorkerTuningOptions interface locally in worker-tuning.ts — There is no src/types/temporal.ts; the interface belongs with the module as specified in the task body.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-tuning.test.ts (1) — RED: failed with Cannot find module './worker-tuning' import error
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-tuning.test.ts (0) — GREEN: 4/4 tests passed
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — VERIFY: tsc --noEmit passed
- **[archive_only_evidence]** verification: pnpm run lint (0) — Additional lint: eslint src/ passed
- **[archive_only_evidence]** decisions: Made sessionId sticky (generated once per process) by storing it in a module-level variable and reusing it across multiple tryInitStore calls in the same process. — Task says generate once per plugin-init lifecycle; ADV's tryInitStore is once-per-process, and the TDD protocol notes that a double-init returning the same ID is the correct behavior.
- **[archive_only_evidence]** decisions: Added sessionId as a required field to registerPluginSession and updated the existing session-registry.test.ts callers. — Keeps the init seam explicit and ensures the registry always receives the generated ID; tests for the seam needed the new argument anyway.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Those files were not read or edited by this agent; they were already dirty in the worktree when the checkpoint was created.
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/plugin-init.session-registration.test.ts (1) — RED: expected failures — sessionId missing from registerPluginSession call and getCurrentSessionId not yet exported
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/plugin-init.session-registration.test.ts (0) — GREEN: all 3 tests pass (sessionId pattern, getCurrentSessionId returns ID, second init reuses ID)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — VERIFY: TypeScript typecheck passes
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/migration/session-registry.test.ts (0) — Additional: session-registry unit tests (10) still pass after API change
- **[archive_only_evidence]** decisions: Extended ServerPollerProbe with optional pollerCount and lastPollerAt — health-probe needs per-queue poller count and last-access timestamp; adding them to the existing probe keeps the data in one round-trip and avoids duplicating describeTaskQueue parsing logic.
- **[archive_only_evidence]** decisions: Overloaded getTemporalHealth to accept string projectId OR QueueProbeTarget[] — Preserves every existing caller (plugin-init.ts, status-health.ts, temporal-ops.ts) while letting new callers pass explicit session+project queue lists.
- **[archive_only_evidence]** decisions: Kept server_poller_probe in TemporalHealth alongside the new queues array — Backward compatibility for any code still reading the single project-queue probe; queues gives the new per-queue view.
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/health-probe.test.ts (0) — 12 health-probe tests pass (existing single-queue + new multi-queue/caching/backward-compat tests)
- **[archive_only_evidence]** verification: pnpm vitest run --project unit src/temporal/queue-serviceability.test.ts (0) — 7 queue-serviceability tests pass after ServerPollerProbe shape extension
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passes across plugin
- **[report_follow_up]** follow_ups: WORKING DIRECTORY: /home/jon/dev/advance
CHANGE: isolateAdvWorkerTaskQueues | Isolate ADV worker task queues
SCOPE KEY: researcher:discovery-temporal-multi-worker-isolation
ATTEMPT: 1
- **[report_follow_up]** follow_ups: TASK_SCOPE: Gather sourced evidence on Temporal SDK best practices for isolating concurrent workers running against a single dev/temporal server on the same project, so that gRPC saturation or worker degradation in one OpenCode session cannot wedge other sessions on the same project.
- **[report_follow_up]** follow_ups: IN_SCOPE: Temporal TypeScript SDK worker/task-queue model; same-server multi-worker routing; lifecycle; resource costs; transition; error handling. OUT_OF_SCOPE: Temporal Cloud tuning; cross-project isolation; Worker Versioning; SaaS hosting.
- **[report_follow_up]** follow_ups: DONE_WHEN: All seven deliverables cited or an authoritative-source gap recorded. STOP_WHEN: docs unavailable or contradictory evidence needs a decision. VERIFICATION: official Temporal docs for SDK claims, source URLs for cases.
- **[report_follow_up]** follow_ups: No authoritative source found for automatic task-queue deletion/TTL or Temporal-managed orphan-process reaping. Treat queues as on-demand names without explicit registration/deletion; ADV must own process cleanup and diagnostics.
- **[report_follow_up]** follow_ups: Migration decision: existing executions remain on their original task queue. Keep legacy worker polling until no running legacy workflows remain; new starts use session queues. Signals/queries address workflow identity through the client, but queries still require a live compatible Worker polling the execution's original queue.
- **[report_follow_up]** follow_ups: For a pinned session-specific queue, set Schedule-to-Start timeout on routed Activities and workflow-level retry/recovery; Temporal's worker-specific queue guidance explicitly warns a crashed specific worker otherwise leaves work waiting.
- **[report_follow_up]** follow_ups: Current local shape evidence: plugin/src/temporal/worker-multi.ts creates one child process with a Worker per queue and has readiness, registration error, bounded restart, SIGTERM, then hard-kill lifecycle handling. docs/temporal-recovery.md describes the same multi-queue decision.
- **[research_citation]** sources: Temporal Task Queues: Queues are lightweight, created on demand, unlimited, polled through synchronous RPC only when Workers have spare capacity; a queue can route work and load-balance multiple Workers. (https://docs.temporal.io/task-queue)
- **[research_citation]** sources: Temporal TypeScript worker guide: Each TypeScript Worker Entity associates with exactly one Task Queue; it documents shutdown states, graceful/forced shutdown, and create/run lifecycle. (https://docs.temporal.io/develop/typescript/workers/run-worker-process)
- **[research_citation]** sources: Temporal worker model: Worker identity defaults to pid@hostname and should link to execution context; a process may host multiple Worker Entities, each one queue. (https://docs.temporal.io/workers)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing ADV code runs a session-local Node child that creates a Worker per registered queue; its documented current shared project queue plus bounded readiness, restart, and SIGTERM/SIGKILL management is sound lifecycle scaffolding. Per-session routing is supported and matches Temporal's recommended per-tenant isolation topology. However, a session queue alone cannot guarantee that another session cannot saturate the shared dev server's gRPC resources: every live Worker Entity contributes polling RPCs, and TypeScript's published defaults are 10 workflow plus 10 activity pollers. Isolation must therefore combine deterministic session-scoped queue names with bounded per-entity pollers/task slots and fail-closed worker readiness; measure worker poller and long-request-failure metrics before asserting saturation is eliminated.
- **[report_follow_up]** follow_ups: No authoritative source found for GRPC_MAX_MSG_CONNS or MaxConcurrentTasks as Temporal dev-server settings; use documented frontend.namespaceCount/RPS and observed metrics.
- **[report_follow_up]** follow_ups: No authoritative source found for exact HTTP/2 channel count per NativeConnection or GOAWAY/RST_STREAM pause behavior; instrument rather than assert.
- **[report_follow_up]** follow_ups: All packet anchors were supplied; no BRIEFING PACKET was included.
- **[research_citation]** sources: Temporal TypeScript WorkerOptions source: Official SDK source: defaults are Workflow slots 40, Activity and Local Activity slots 100; fixed poller defaults are min(10, corresponding slot count); maxTaskQueueActivitiesPerSecond is server-side per queue and last polling Worker wins. (https://github.com/temporalio/sdk-typescript/blob/main/packages/worker/src/worker-options.ts)
- **[research_citation]** sources: Temporal worker tuning reference: Official docs classify poller counts and rate limits as I/O controls, list TypeScript defaults of 10 Workflow and 10 Activity pollers, and identify worker metrics. (https://docs.temporal.io/develop/worker-tuning-reference)
- **[research_citation]** sources: Temporal Worker performance guidance: Official docs recommend poller autoscaling, incremental tuning/metrics, and explain server-side task-queue versus worker-side activity rate limits. (https://docs.temporal.io/develop/worker-performance)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing ADV worker implementation creates one NativeConnection, then creates one Worker Entity per registered queue with no WorkerOptions tuning; defaults permit up to 10 Workflow and 10 Activity pollers per queue. The injected NativeConnection is shared across entities, but official SDK material does not promise a fixed one-HTTP/2-channel mapping, so exact TCP/HTTP2 channel count is unknown. Canonical architecture: bounded slots and pollers per Worker, task-queue dispatch limits/fairness for shared capacity, metrics-driven adjustment. Per-session queue routing alone cannot bound a session if queue count remains unbounded. Server saturation is governed by frontend dynamic config, not a documented GRPC_MAX_MSG_CONNS or MaxConcurrentTasks: default frontend.namespaceCount is 1200 concurrent long polls per namespace/frontend host and frontend.namespaceRPS is 2400. Core retries task polls with exponential backoff, but no official document establishes a GOAWAY/RST_STREAM-specific pause contract; transport backpressure is not admission control.
- **[report_follow_up]** follow_ups: WORKING DIRECTORY: /home/jon/dev/advance
- **[report_follow_up]** follow_ups: CHANGE: isolateAdvWorkerTaskQueues | Isolate ADV worker task queues
- **[report_follow_up]** follow_ups: SCOPE KEY: researcher:design-validation
- **[report_follow_up]** follow_ups: ATTEMPT: 1
- **[report_follow_up]** follow_ups: TASK_SCOPE: validate the proposed design against agreement, specs, and external evidence
- **[report_follow_up]** follow_ups: IN_SCOPE: design/agreement/briefing packet, advance-workflow spec law, Temporal SDK docs, current temporal and plugin-init code.
- **[report_follow_up]** follow_ups: OUT_OF_SCOPE: design rewrite, unapproved RPC/server/namespace changes, settled user-value tradeoffs.
- **[report_follow_up]** follow_ups: DONE_WHEN: sourced architecture judgement covers correctness, simplicity, spec-law compliance, and key alternatives.
- **[report_follow_up]** follow_ups: STOP_WHEN: contract compromise, security/release blocker, or conflict requiring orchestrator decision.
- **[report_follow_up]** follow_ups: VERIFICATION: official docs/source examples cited where possible; additional checks used; no direct ADV-state files read.
- **[report_follow_up]** follow_ups: Episode recall was advisory only and unrelated.
- **[research_citation]** sources: Approved design: KD-1..KD-8, migration, tuning, risks, and affected components. (adv_change_show:isolateAdvWorkerTaskQueues:design)
- **[research_citation]** sources: Approved agreement: SC1-5, AC1-8, C1-9, and DONT1-6. (adv_change_show:isolateAdvWorkerTaskQueues:agreement)
- **[research_citation]** sources: Current singleton implementation: Default worker-singleton policy lets only the lock owner spawn a worker. (file:///home/jon/dev/advance/plugin/src/plugin-init.ts#L102-L119)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Per-session routing plus explicit WorkerOptions caps is supported by Temporal and local multi-queue code, but current project-wide singleton admission gives session queues no guaranteed poller. Further, project-queue deregistration after legacy drain strands permanent epic workflows on that same queue.
- **[unresolved_action]** validation.blockers: Default project-wide singleton admission remains unchanged. Only lock owner spawns a worker, while a client session can start on a new session queue without any consumer path. This cannot provide cross-session isolation or bounded-latency service.
- **[unresolved_action]** validation.blockers: KD-4 skips project-queue registration after non-epic legacy drain, but AC5/KD-2 permanently route epics to that same project queue. The deregistration therefore leaves epic workflows unserved.
- **[unresolved_action]** validation.blockers: KD-4 Visibility predicate uses ADV_PROJECT_ID and Type, but current registered attributes have AdvAffectedProjects and no queue attribute. Official SDK query example uses WorkflowType and ExecutionStatus. I do not know whether TaskQueue is queryable on deployed dev server, so migration decision is unverified.

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
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
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
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |

## Unresolved Actions

- adv_task_checkpoint for tk-bcec2249b320 committed the dirty tree but recorded TASK_COMPLETION_BLOCKED: Stage-v2 non-test route 'static_check' requires a reviewer-owned review_evidence_ref. Orchestrator needs to supply reviewer evidence or route through the appropriate review gate before the task can be marked done.
- Mark tk-bcec2249b320 done using this reviewer evidence; static_check route is satisfied.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin exec vitest run --project unit src/temporal/worker-tuning.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin exec vitest run --project unit src/temporal/worker.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir=plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Mark task tk-d96902977df3 as done. adv_task_update status:done is rejected by the tool (TASK_DONE_REQUIRES_CHECKPOINT) even after adv_task_checkpoint mode:complete was recorded; this status update is orchestration and must be performed by the parent orchestrator.
- finish_owned_scope_then_report: Those files were not read or edited by this agent; they were already dirty in the worktree when the checkpoint was created.
- Default project-wide singleton admission remains unchanged. Only lock owner spawns a worker, while a client session can start on a new session queue without any consumer path. This cannot provide cross-session isolation or bounded-latency service.
- KD-4 skips project-queue registration after non-epic legacy drain, but AC5/KD-2 permanently route epics to that same project queue. The deregistration therefore leaves epic workflows unserved.
- KD-4 Visibility predicate uses ADV_PROJECT_ID and Type, but current registered attributes have AdvAffectedProjects and no queue attribute. Official SDK query example uses WorkflowType and ExecutionStatus. I do not know whether TaskQueue is queryable on deployed dev server, so migration decision is unverified.
