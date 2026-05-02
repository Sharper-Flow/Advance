# Research Pack: Temporal & Connected Tech Reliability for ADV Agent Use

- **Target:** Temporal stack reliability for ADV / agent execution (worker, client, workflows, recovery, agent-facing tools)
- **Mode:** Scoped (Temporal subsystem + agent-facing surfaces)
- **Created:** 2026-04-26
- **Updated:** 2026-04-26

> Companion to `temporal-data-sync-resiliency-prep.md` (2026-04-23). That pack covered the pre-Temporal-only-migration data layer. This pack covers post-migration **runtime reliability** for agent-driven workloads, including the `improveAdvPostCrashTemporal` (in-progress) recovery surfaces and the still-open agent-facing failure modes the in-flight change does not yet address.

## Purpose & Scope

ADV is now Temporal-only at runtime: every change/task/gate/wisdom mutation flows through `changeWorkflow` and `projectWorkflow`, with disk artifacts as durable substrate (`store-disk.ts`). Agents (Claude / GPT / GLM / Kimi variants of `adv`, plus `build`/`plan`) drive every ADV change through these workflows during long inline sessions. Reliability gaps therefore translate directly into agent stalls, doom loops, and unresolvable checkpoint timeouts.

**This pack covers:**
- Workflow / activity / worker patterns vs Temporal canonical guidance
- Client connection lifecycle, retry, and reconnection
- Observability gaps for agent-visible failure modes
- Recovery surface delta vs in-flight `improveAdvPostCrashTemporal`
- Agent-loop interactions (checkpoint, ledger, doom-loop coupling)

**Out of scope:**
- Storage layer decomposition (covered in 2026-04-23 pack)
- ADV agent orchestration semantics, gate state machine
- Spec validator, command workflow files
- Sync-global / overlay tooling

## Current State

### Reliability (5 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| R1 | HIGH | **Workers do not declare retry policies on activities.** ADV workflows (`workflows.ts`, 544 lines) do not call `wf.proxyActivities` with `retry: { initialInterval, backoffCoefficient, maximumAttempts }`. There is no `proxyActivities` in the codebase — workflows mutate in-process state directly via `change-state.ts` / `project-state.ts` helpers. Activities exported from `activities.ts` are placeholders (`recordTemporalFoundationEvent`, `recordProjectMigrationEvent`) with no production callers. → ADV gives up Temporal's per-activity retry/timeout guarantees and reimplements failure handling at the *client* layer via `withTemporalRetry` (`retry-wrapper.ts:209`). | `plugin/src/temporal/workflows.ts` (no `proxyActivities`); `plugin/src/temporal/activities.ts` (placeholder only); confirmed: `grep proxyActivities plugin/src/temporal/*.ts` → 0 hits |
| R2 | HIGH | **No workflow versioning.** Zero usages of `wf.patched()` / `wf.getVersion()` / `wf.deprecatePatch` in the workflow code. The only path through `NonDeterministicWorkflowError` is `adv_workflow_repair` (terminate + rebuild from disk snapshot). Any non-trivial change to `change-state.ts` / `project-state.ts` mutator helpers risks breaking every in-flight `changeWorkflow` for users on older code. Temporal canonical guidance (Worker Versioning GA, 2026-03-30) treats this as the primary reliability primitive for workflow code evolution. | `grep -n "patched\|getVersion" plugin/src/temporal/*.ts` → 0 hits; `docs/temporal-recovery.md:123-138` documents repair-as-only-option |
| R3 | MEDIUM | **Update / start callsites have no per-attempt timeout.** `runTemporal()` (`store-temporal.ts:147`) intentionally omits `timeoutMs` for `executeUpdate`, `workflow.start`, and `getHandle` while `runTemporalQuery()` applies 5s. A wedged worker on an update path (e.g., `closeChangeUpdate`, `addTaskUpdate`) hangs indefinitely. Per-attempt cap with retry budget would bound it; design.md § KD-2 explicitly calls this "by design" but the cost is that agent commands may hang silently. | `plugin/src/storage/store-temporal.ts:147-151` (no timeoutMs) vs `:163-170` (5_000ms); 17 `executeUpdate` callsites in `store-temporal.ts` |
| R4 | MEDIUM | **`adv_task_checkpoint` 10s timeout is itself a doom loop.** Six tasks in the in-flight `improveAdvPostCrashTemporal` change recorded `adv_task_checkpoint timed out after 10000ms` (one repeated twice) despite git commits succeeding. Tasks marked `done` only because the agent verified commits manually. The checkpoint ledger path is wedging on a clean tree. This is the **agent-visible** symptom of a Temporal-side reliability issue: the ledger record path is on the slow Temporal write path with a tight timeout. | `adv_change_show changeId: improveAdvPostCrashTemporal` → tasks `tk-a4c16bf2`, `tk-94143852`, `tk-aa3dcb3d`, `tk-b824cd96`, `tk-2cf054eb`, `tk-e57aef8d` all have ENVIRONMENTAL `adv_task_checkpoint timed out` |
| R5 | MEDIUM | **Out-of-process worker has bounded restart budget but no automatic alert when exhausted.** `createMultiWorker` retries 1s → 3s → 10s, max 3 attempts (`docs/temporal-recovery.md:41`). After exhaustion, `worker_process_alive: false` is exposed via `adv_status` but no proactive surface for the agent — the agent must call `adv_status` to discover it. There is no `[ADV:WORKER_DEAD]` marker emitted on next ADV tool call. | `plugin/src/temporal/out-of-process-worker.ts:18` (`OOP_SHUTDOWN_GRACE_MS`); `docs/temporal-recovery.md:41-43` (post-exhaustion behavior) |

### Observability (5 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| O1 | HIGH | **No structured metric for workflow-update failures.** `temporalRetryTelemetry` (`retry-wrapper.ts:47`) records only `lastOpAt` / `lastError` / `lastAttempts` — single-slot, last-write-wins. No counter per error class (transient/fallback/fatal) per op type. Operators cannot answer "is the worker flapping?" without scraping logs. `getStslStats()` adds `reconnectCount` / `reconnectFailureCount` but no per-op classification. | `plugin/src/temporal/retry-wrapper.ts:47-73`; `plugin/src/temporal/service.ts:101-116` |
| O2 | HIGH | **Workflow-side logs ignored.** ADV uses `wf.log()` zero times (verified). When a workflow update path corrupts state, history records nothing — only the activity (which doesn't exist for ADV) would carry an audit trail. Combined with R2 (no versioning), corruption is invisible until the user reports a `NonDeterministicWorkflowError`. | `grep -n "wf\.log\|wf\.logger" plugin/src/temporal/*.ts` → 0 hits |
| O3 | MEDIUM | **No OpenTelemetry instrumentation.** `@temporalio/interceptors-opentelemetry` not wired. Temporal's canonical agent observability path (Signoz, 2026-01-26) integrates OTel into worker creation; ADV cannot export traces/spans. For a per-session local plugin this is acceptable, but for users running multiple sessions concurrently against shared Temporal it makes cross-session correlation impossible. | `grep -rn "interceptors-opentelemetry" plugin/` → 0 hits; `package.json` no OTel deps |
| O4 | MEDIUM | **Stale-queue probe runs on every `adv_status`.** `probeStaleQueues()` opens a fresh `createTemporalClientBundle` per call and counts `Running` workflows older than 5 min (`health-probe.ts:98-127`). For a healthy session, this is one extra connection + visibility query per status call. Failure mode is silently swallowed — operator gets `[]` even when probe failed for unrelated reasons (auth, transport). | `plugin/src/temporal/health-probe.ts:118-122` (catch-all empty return) |
| O5 | LOW | **`registerAdvSearchAttributes` failure logged at warn only.** When operator search attribute creation fails (server lacks operator API or wrong permissions), `service.ts:81-83` logs `Failed to register ADV search attributes (Visibility queries may fail)` and continues. No state recorded; no agent-visible signal. The in-flight `improveAdvPostCrashTemporal` adds `adv_temporal_diagnose` but the warning path itself remains a silent degradation. | `plugin/src/temporal/service.ts:73-84` |

### Code Quality (5 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| C1 | HIGH | **`store-temporal.ts` is now 1291 lines** (vs 876 in the 2026-04-23 pack — grew 47%). It is the single largest file in the storage layer and the primary integration seam between agent tools and Temporal. Adding new domain-level operations (e.g., reflection, project-metadata) requires editing this file. Decomposition by domain (changes/tasks/gates/wisdom) is overdue. | `wc -l plugin/src/storage/store-temporal.ts` → 1291; trend up from 876 (3 days, +415 lines) |
| C2 | MEDIUM | **`runTemporalQuery` and `runTemporal` factor identically except for `timeoutMs`.** Two near-duplicate wrappers (`store-temporal.ts:147-170`) plus a separate `makeReconnectingHook` per call. A single `runTemporal({ timeoutMs?, op })` would collapse the duplication. | `plugin/src/storage/store-temporal.ts:147-170` |
| C3 | MEDIUM | **`activities.ts` exports placeholders that no production code calls.** `recordTemporalFoundationEvent`, `recordProjectMigrationEvent`, `recordProjectWisdomExport` are documented as placeholders for "migration ledger recording" but the real ledger path now goes through workflow updates. Dead code in the worker bundle. | `plugin/src/temporal/activities.ts:26-44` |
| C4 | MEDIUM | **`out-of-process-worker.ts` is a 60-line legacy shim.** It now just adapts `createMultiWorker` to the older interface (R2-noted in 2026-04-23 pack as `LOW`, status unchanged). Inline at callsite or delete the type. | `plugin/src/temporal/out-of-process-worker.ts:1-82` |
| C5 | LOW | **Deprecated `RetryOptions.backoffMs` field still in place** despite `@deprecated` annotation 2 cycles ago. Test still exercises it (`retry-wrapper.test.ts:201-218`). No callers in production. | `plugin/src/temporal/retry-wrapper.ts:151` |

### Testing (4 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| T1 | HIGH | **No reliability integration test for the recovery sequence.** The runbook (`docs/temporal-recovery.md`) prescribes diagnose → register-attrs → reconnect → repair → orphan-sweep, but no end-to-end test exercises that ladder under simulated failure (e.g., `TestWorkflowEnvironment` + injected gRPC errors). The in-flight change adds unit tests per tool but not a sequenced recovery test. | `improveAdvPostCrashTemporal` task list (8 tasks, all unit-scoped); no `recovery-flow.itest.ts` in `__tests__/worker-lifecycle/` |
| T2 | MEDIUM | **No determinism replay test for `change-state.ts` / `project-state.ts` mutators.** These functions ARE the workflow body. Adding a replay-comparison test (record history → replay against new code) would catch every non-deterministic change before users see `NonDeterministicWorkflowError`. Temporal SDK ships `Worker.runReplayHistory` for exactly this. | `grep -n "runReplayHistory\|WorkflowReplay" plugin/src/temporal/*.ts plugin/src/temporal/__tests__/**` → 0 hits |
| T3 | MEDIUM | **No load test for concurrent agent sessions.** Multiple `opencode` sessions on the same project share STSL/connection but each runs its own polling. No bench captures behavior at 5+ concurrent agent sessions doing tool calls. | `plugin/scripts/benchmark-temporal.ts` exists but exercises single-session paths only |
| T4 | POSITIVE | Replay validation via `restartDoesNotRedoCompletedActivities.itest.ts` exists and passes. | `plugin/src/temporal/__tests__/worker-lifecycle/worker-restart-no-redo.itest.ts` (per 2026-04-23 pack T2) |

### Security (2 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| S1 | LOW | **`ADV_TEMPORAL_ALLOW_REMOTE` permits non-loopback Temporal targets** without TLS verification or authn. String-based `isLoopbackAddress` is the only gate. (Carried forward from 2026-04-23 pack — unchanged.) | `plugin/src/temporal/client.ts` |
| S2 | LOW | **Worker child-process env passes through `OPEN_CHAD_CACHE_DIR`, `XDG_RUNTIME_DIR`, etc.** without enumeration validation. `buildSafeSpawnEnv` (`runtime-manager.ts:256-294`) is allowlist-based — good — but ADV-specific vars (`ADV_NODE_PATH`, `ADV_TEMPORAL_*`) are not validated against shape (e.g., a malformed `ADV_NODE_PATH` would still be passed to `spawn`). | `plugin/src/temporal/runtime-manager.ts:256-294` |

### Developer Experience (4 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| D1 | MEDIUM | **`temporal` CLI is the documented escape hatch but not bundled.** `docs/temporal-recovery.md:152-184` instructs operators to run `temporal workflow count` / `terminate` directly. New ADV users without the Temporal CLI installed cannot follow the orphan-sweep procedure. The in-flight `adv_orphan_sweep` tool partially fixes this (dry-run + approved execute) but the runbook still leans on the CLI. | `docs/temporal-recovery.md:139-191`; `improveAdvPostCrashTemporal` task `tk-e57aef8d` |
| D2 | MEDIUM | **`adv_temporal_diagnose` (in-flight) is the right entry point but not yet documented in primary runbook.** Tasks `tk-94143852` / `tk-6254289f` mention this but `docs/temporal-recovery.md` still leads with `adv_status`. After tk-6254289f lands, the recovery story changes. Until then, agents reading the runbook get the older sequence. | `docs/temporal-recovery.md:65-79` (current); `tk-6254289f` (in_progress) |
| D3 | LOW | **No agent-facing summary of the recovery ladder.** `ADV_INSTRUCTIONS.md` mentions `adv_temporal_worker_restart` and `adv_workflow_repair` but lacks the diagnose-first ordering. Agent variants (claude/gpt/glm/kimi) would benefit from a 1-line "if Temporal acts up, call diagnose first" hint in the overlay. | `ADV_INSTRUCTIONS.md` no diagnose mention; agent overlays no recovery hints |
| D4 | LOW | **`OOP_SHUTDOWN_GRACE_MS = 5000` is a compile-time constant.** `docs/temporal-recovery.md:117-121` flags this for future env tuning (`ADV_OOP_SHUTDOWN_GRACE_MS`). Slow-disk hosts and CI runners need higher values. | `plugin/src/temporal/out-of-process-worker.ts:18`; `docs/temporal-recovery.md:117-121` |

### Positive Findings (carry-forward + new)

- **STSL single-flight reconnect** (`service.ts:242-282`) is well-designed: in-flight guard, idempotent close, search-attribute re-registration, telemetry counters.
- **Error classification taxonomy** (transient / fallback / fatal) plus jittered exponential backoff is sound.
- **`probeTemporalWorkerRuntime` gracefully handles Bun**, routing to out-of-process Node child with documented rationale (upstream issue #1334).
- **In-flight change addresses the recovery surface gap directly** (diagnose, register-search-attrs, explicit reconnect, repair partial-result, orphan-sweep) — 6 of 8 tasks done as of this pack.

## LBP / Reference Comparison

| Area | Classification | Current | Canonical (Temporal docs) | Delta |
|------|---------------|---------|--------------------------|-------|
| Activity invocation | ANTI-PATTERN | Workflows mutate in-process state via direct helpers; no `proxyActivities` callsites; client wraps with `withTemporalRetry` | `wf.proxyActivities({ retry, scheduleToCloseTimeout, heartbeatTimeout })` is the durable retry primitive | ADV bypasses Temporal's retry/timeout/heartbeat machinery and reinvents at client layer |
| Workflow versioning | ANTI-PATTERN | Zero `patched`/`getVersion` callsites; recovery via `adv_workflow_repair` (terminate+rebuild) | `wf.patched("v2")` for safe code evolution; Worker Versioning GA (2026-03-30) recommends per-version Worker fleets | ADV has no migration path other than terminate-and-rebuild — fragile under workflow code change |
| Workflow logging | DRIFTED | Zero `wf.log()` calls; `appendDebugLog` from `utils/debug-log` only used outside workflows | `wf.log()` writes to history-bound, replay-safe sink | ADV history carries no in-workflow context for postmortem |
| Per-update timeout | DRIFTED | 5s applied to queries only; updates/starts unbounded (intentional per KD-2) | Temporal recommends bounded per-attempt timeouts even for executeUpdate; SDK supports it natively | Acceptable tradeoff for executeUpdate but should be opt-in per callsite, not all-or-nothing |
| Worker tuning | SOUND | SDK defaults; single connection; multi-queue Worker per project; cap respected | `maxConcurrentWorkflowTaskExecutions`, `maxCachedWorkflows` left at defaults — fine for per-session local plugin | Matches the per-session deployment shape |
| Search attributes | SOUND | Custom ADV attrs registered idempotently; in-flight tools surface health | `upsertSearchAttributes` for visibility; `temporal operator search-attribute create` for server-side registration | Matches; in-flight change closes the registration UX gap |
| Worker-model selection | SOUND | Hybrid Node-in-process / Bun-out-of-process driven by runtime probe | One worker process per host is the canonical pattern; multi-worker for scale | Matches with documented shipping behavior |
| Client connection | SOUND | STSL singleton, in-flight reconnect guard, search-attr re-register on reconnect | Reuse one `Connection` per process; `WorkflowServiceStubs.shutdown` for clean close | Matches |
| Error classification | SOUND | TRANSIENT / SEMANTIC / ENVIRONMENTAL / FATAL plus Temporal-specific (transient/fallback/fatal) | `ApplicationFailure.NonRetryable` for fatal classification; SDK exposes typed errors | Approximation, not 1:1; functionally adequate |
| Determinism testing | DRIFTED | Import guard test exists; no `Worker.runReplayHistory` regression test | `Worker.runReplayHistory(history, workflowFn)` is canonical replay validator | Missing — easy to add and would prevent NonDeterministicWorkflowError shipping |

### Greenfield Perspective

If rebuilding the Temporal integration today for the same per-session ADV deployment shape:

1. **Move state mutations into proxied activities.** Each `executeUpdate` becomes `wf.proxyActivities({...}).mutate(state)` with native retry + heartbeat + timeout. This collapses `withTemporalRetry` to a thin wrapper around `Connection.connect`-only failures and gives postmortem visibility via activity history.
2. **Establish a versioning contract.** Wrap every `change-state.ts` / `project-state.ts` mutator entry in `wf.patched("op-name-v1")` so future state-shape changes can ship without `NonDeterministicWorkflowError`. Ties into Temporal's Worker Versioning GA path if ADV ever runs concurrent worker fleets.
3. **Wire OpenTelemetry interceptors.** `@temporalio/interceptors-opentelemetry` on Worker.create + Client construction. Even local sessions benefit from OTel-formatted retry/latency spans for `adv_status`.
4. **Per-domain `Store` shards.** Replace 1291-line `store-temporal.ts` with `store-temporal-changes.ts`, `…-tasks.ts`, etc. Composition at the `Store` interface boundary.
5. **Replace `withTemporalRetry` with SDK-native retry** for activity callers; keep a tiny version for `Connection.connect` (which has no enclosing context).
6. **Replay regression suite.** Capture sample histories per workflow type (change/project) into `__tests__/replay-fixtures/` and run `Worker.runReplayHistory` in CI.

## Competitors & Alternatives

| Name | What they do differently | Source | Relevance to ADV |
|------|--------------------------|--------|------------------|
| **Restate** | Lightweight durable execution, virtual objects, journaled execution. SDK-native — no separate Temporal-style orchestrator/server pair. Single-binary self-host. | https://www.pkgpulse.com/blog/temporal-vs-restate-vs-windmill-durable-workflow-orchestration-2026 | High — for a per-session local plugin, Restate's lighter operational footprint matches ADV's deployment shape better than Temporal's server+worker split. Migration cost is significant but the architectural fit is closer. |
| **DBOS Transact (TS)** | Durable workflows embedded in Postgres via SDK. Lighter than Temporal; durability is a thin Postgres layer, not a separate service. Cross-language workflow interop (April 2026). | https://www.dbos.dev/blog/dbos-new-features-april-2026 | Medium — ADV's external state already has shape similar to "durable workflows on disk + index". DBOS would let ADV keep one persistence boundary instead of two (Temporal history + disk artifacts). |
| **Inngest** | Event-driven serverless durable execution, library-first, no dedicated server. Step functions inline. Production durability via managed service or self-host. | https://www.inngest.com/compare-to-temporal | Medium — Inngest's "library, not service" model would eliminate the worker model entirely (no Bun/Node hybrid, no out-of-process child). Tradeoff: less control over state inspection/replay than Temporal. |

## Emerging Patterns

| Name | Maturity | Source | Why Noteworthy |
|------|----------|--------|----------------|
| **Worker Versioning + Upgrade-on-ContinueAsNew** | GA (2026-03-30) | https://temporal.io/blog/ga-worker-versioning-public-preview-upgrade-on-continue-as-new | Resolves R2 directly. New workflow code can ship without breaking in-flight workflows. Even single-worker ADV deployments benefit because `improveAdvPostCrashTemporal` could pin the Worker to a specific build version, then upgrade after archive. |
| **Two-layer agent architecture (Temporal outside, LangGraph/agent inside)** | Production (2026) | https://medium.com/@dorangao/durable-by-design-temporal-outside-langgraph-inside-0931478bc033 | Confirms ADV's directional bet: Temporal handles durability, the agent loop handles intent. ADV is one of the cleaner real-world implementations of this pattern. Reinforces continued investment in the worker tier rather than replacing it. |

## Applicability to This Repo

- **Activity proxying (R1, ANTI-PATTERN)** — the most impactful single change. Each `executeUpdate` callsite (`store-temporal.ts:850-1216`, 17 sites) becomes an activity. Cost: medium refactor. Benefit: native retry + heartbeat + visibility.
- **Workflow versioning (R2, ANTI-PATTERN)** — wrap each mutator entry. Cost: low (one-line guard per mutator). Benefit: removes terminate-and-rebuild as the only recovery path.
- **`wf.log()` everywhere mutators run (O2)** — small, mechanical, immediate observability win.
- **Replay regression test (T2)** — bounded scope, high signal. Add `Worker.runReplayHistory` test fixture per workflow.
- **Decompose `store-temporal.ts` by domain (C1)** — pre-existing recommendation; growth from 876 → 1291 lines confirms the trajectory.
- **OTel interceptors (O3)** — defer until per-session metrics matter; not on agent reliability critical path.
- **Restate / DBOS / Inngest migration** — out of scope for incremental reliability work. Worth re-evaluating if Temporal Cloud ever becomes a hard requirement or if the worker model itself becomes a recurring failure source.
- **Inngest's "no server" model** — only relevant if ADV moves toward an embedded-only deployment with no local Temporal dev server. Currently Temporal dev server is the assumed base.

### Specifically NOT applicable

- **Temporal Cloud** — ADV is local-first and per-session. Cloud Temporal would add network latency on every gate transition. Not a fit.
- **Akka actor model** — JVM ecosystem mismatch (carry-forward from 2026-04-23 pack).
- **Multi-shard / external worker fleet** — `docs/temporal-recovery.md:50-59` correctly defers these until specific load triggers fire.

## Open Questions for Research

1. **Should ADV move state mutations into Temporal activities (R1)?** Cost is medium (17 callsites); benefit is alignment with Temporal's reliability primitives. Need to measure: would per-mutation activity overhead degrade interactive agent latency below current direct-mutation path?
2. **Is `wf.patched()` enough, or does ADV need full Worker Versioning?** Per-session deployment likely makes simple `patched` sufficient. Worker Versioning matters more if multi-worker fleets emerge.
3. **What is the actual failure rate of `adv_task_checkpoint` (R4)?** All six in-flight tasks hit the 10s timeout. Is the ledger write path consistently slow, or is this a clean-tree edge case? Instrument the ledger write before deciding the fix.
4. **Should `runTemporal` (no timeout) become `runTemporal({ timeoutMs?: number })` with a default of `null` (unbounded) but per-callsite overrides (R3)?** Avoids changing default behavior while letting hot-path updates opt in to bounds.
5. **Does the 5-min stale-queue threshold (O4) match observed user behavior?** A 5-min orphan window is short for a per-session plugin where users may pause sessions. Either widen the threshold or surface the threshold as a config var.
6. **Should `adv_temporal_diagnose` (in-flight) be the implicit first step on every Temporal failure?** I.e., should the agent harness call it automatically when an ADV tool returns `errorClass: ToolExecutionTimeout` and message includes `temporal`?
7. **Is there a benefit to wrapping `change-state.ts` / `project-state.ts` mutators behind a thin "advWorkflowOp" abstraction** that records `wf.log()` + `wf.patched()` + activity invocation centrally, so the cost of (R1) + (R2) + (O2) is paid once?
8. **Should the recovery runbook be split per-failure-mode** (server-down vs worker-dead vs determinism-error vs orphan-queue) so agents can find the right ladder by symptom rather than reading the whole file?

## Sources

### Local code
- `plugin/src/temporal/workflows.ts` (544 lines)
- `plugin/src/temporal/messages.ts`
- `plugin/src/temporal/contracts.ts`
- `plugin/src/temporal/change-state.ts`
- `plugin/src/temporal/project-state.ts`
- `plugin/src/temporal/activities.ts`
- `plugin/src/temporal/in-process-worker.ts` (178 lines)
- `plugin/src/temporal/out-of-process-worker.ts` (82 lines)
- `plugin/src/temporal/worker-multi.ts`
- `plugin/src/temporal/runtime-manager.ts` (426 lines)
- `plugin/src/temporal/service.ts` (282 lines)
- `plugin/src/temporal/retry-wrapper.ts` (254 lines)
- `plugin/src/temporal/health-probe.ts` (172 lines)
- `plugin/src/temporal/observability.ts`
- `plugin/src/temporal/orphan-sweep.ts` (339 lines)
- `plugin/src/temporal/fallback-telemetry.ts`
- `plugin/src/storage/store-temporal.ts` (1291 lines, +47% vs 876 in 2026-04-23 pack)
- `plugin/src/utils/safe-execute.ts:173-195` (Temporal error hint formatter)

### Local docs
- `../temporal-recovery.md` (worker model + recovery runbook)
- `temporal-data-sync-resiliency-prep.md` (2026-04-23 pre-migration pack — companion)
- `performance-prep.md`
- `../../ADV_INSTRUCTIONS.md`
- In-flight change `improveAdvPostCrashTemporal` (8 tasks, 6 done, 1 in_progress, 1 pending)

### External (Kagi searches 2026-04-26)
- https://docs.temporal.io/best-practices/worker
- https://docs.temporal.io/self-hosted-guide/production-checklist
- https://docs.temporal.io/encyclopedia/retry-policies
- https://docs.temporal.io/encyclopedia/detecting-activity-failures
- https://temporal.io/blog/activity-timeouts (2021-06-22)
- https://temporal.io/blog/ga-worker-versioning-public-preview-upgrade-on-continue-as-new (2026-03-30)
- https://temporal.io/blog/safe-deployments-with-temporal-worker-versioning-on-kubernetes (2026-04-22)
- https://www.linkedin.com/pulse/temporal-production-playbook-4-patterns-workflow-reliability-xgrid-kyvnf (2026-03-26)
- https://temporal.io/blog/building-ai-agents-that-overcome-the-complexity-cliff (2026-03-10)
- https://medium.com/@dorangao/durable-by-design-temporal-outside-langgraph-inside-0931478bc033 (2026-04-23)
- https://medium.com/@ajayshekar01/scaling-temporal-in-production-lessons-from-real-incidents-and-community-deep-dives-574cc9cc8d96
- https://signoz.io/docs/temporal-observability/ (2026-01-26)
- https://www.pkgpulse.com/blog/temporal-vs-restate-vs-windmill-durable-workflow-orchestration-2026 (2026-03-09)
- https://devstarsj.github.io/2026/04/03/durable-execution-temporal-restate-dbos-distributed-workflows-2026/ (2026-04-03)
- https://www.dbos.dev/blog/dbos-new-features-april-2026 (2026-04-13)
- https://www.inngest.com/compare-to-temporal
- https://github.com/temporalio/sdk-typescript/issues/1334 (Bun in-process worker bug, referenced in `temporal-recovery.md`)
- https://github.com/oven-sh/bun/issues/22218 (Bun gRPC GOAWAY regression, 2025-08-28)
