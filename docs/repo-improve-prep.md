# Research Pack: ADV Tool Performance / Latency

Target: broad repo scan focused on `adv_*` tool latency, responsiveness, and throughput
Mode: broad
Created: 2026-05-24
Updated: 2026-05-24

## Purpose & Scope

Purpose: identify evidence-backed ways to improve performance, latency, and perceived speed of ADV tools.

In scope:

- `plugin/src/tools/**` ADV MCP tool read paths, especially `adv_status`, `adv_change_list`, `adv_change_show`, `adv_task_list`, `adv_backlog_state`, and WIP/status helpers.
- Temporal-backed store read paths in `plugin/src/storage/store-temporal/**`.
- Existing latency instrumentation and benchmarks in `plugin/src/perf/**`, `plugin/scripts/bench-*.ts`, and `plugin/scripts/benchmark-*.ts`.
- Reference comparison for Temporal Visibility, `lru-cache`, and Zod parsing behavior.

Deliberate non-scope:

- No ADV state mutation, change/task creation, or gate updates.
- No benchmark run that writes outside `docs/*-prep.md`.
- No implementation changes.

Scan note: `lgrep_search_semantic` timed out twice; code evidence came from `lgrep_get_file_tree`, `lgrep_search_text`, and direct `read` of relevant files.

## Current State

### Security

- Positive signal: Temporal Visibility query builders escape user/project-controlled values before interpolation (`plugin/src/temporal/list-change-workflows.ts:79-84`, `plugin/src/temporal/visibility-claim-queries.ts:44-45`). No performance-specific security blocker found in scoped scan.

### Reliability

- Severity: HIGH
  Category: Reliability
  Evidence: `plugin/src/tools/status.ts:847-850`, `plugin/src/tools/status.ts:1026-1298`, `plugin/src/tools/status.ts:1415-1416`
  Impact: `adv_status view:"summary"` still builds the full status payload before projection. Summary calls pay for Temporal health, queue serviceability, search attributes, config load, recent-change enrichment, worktree cleanup discovery, worktree census, OpenCode session debt, health snapshot, snapshot-health scan, specs recount, peer sessions, plugin runtime provenance, and project metadata.
  Recommendation: Make `adv_status` view-lazy: compute only fields needed by requested view. Keep `summary` to status + minimal health bit + worktree count; defer health/hygiene archaeology to their views.
  Follow-up: `/adv-proposal Lazy adv_status views`

- Severity: HIGH
  Category: Reliability
  Evidence: `plugin/src/tools/status.ts:1212-1227`
  Impact: `adv_status` invokes `advWorktreeCleanup("status", ...)` on every status call. Even best-effort cleanup discovery adds I/O/DB work to a hot read tool and can amplify latency when worktree state is large or poisoned.
  Recommendation: Move cleanup retry/discovery out of default status, or run it only in `view:"hygiene"` / explicit `adv_worktree_cleanup` with TTL caching.
  Follow-up: `/adv-proposal Defer status cleanup work`

- Severity: MEDIUM
  Category: Reliability
  Evidence: `plugin/src/temporal/visibility-claim-queries.ts:11-15`, `plugin/src/temporal/list-change-workflows.ts:24-27`
  Impact: Backlog claim queries use `AdvAffectedProjects`, while change enumeration documents `AdvProjectId`. The local comment says `AdvProjectId` is a pre-existing inconsistency. If registration or search-attribute availability drifts, fast Visibility paths can fail and force slower disk fallback.
  Recommendation: Align project-scoped Visibility attributes structurally: either register/use `AdvProjectId` everywhere or migrate `listChangeWorkflowIds` to the registered `AdvAffectedProjects` model with tests.
  Follow-up: `/adv-proposal Align visibility project attributes`

### Testing

- Severity: MEDIUM
  Category: Testing
  Evidence: `plugin/package.json:31`, `plugin/scripts/bench-adv-latency.ts:63-98`, `plugin/scripts/benchmark-execute.ts:4-17`, `plugin/src/temporal/list-change-workflows.test.ts:161-184`
  Impact: Bench tooling exists, but current automated guard evidence is narrow: synthetic `listChangeWorkflowIds` p99 only. No checked-in tool-level p50/p95 budget protects `adv_status`, `adv_change_list`, or `adv_change_show` from regression.
  Recommendation: Add non-flaky perf budget tests around mocked stores and fixture sizes; keep real Temporal benchmark manual/nightly.
  Follow-up: `/adv-proposal Add ADV latency budgets`

### Observability

- Severity: MEDIUM
  Category: Observability
  Evidence: `plugin/src/utils/safe-execute.ts:380-449`, `plugin/src/utils/metrics.ts:1-18`, `plugin/src/utils/metrics.ts:84-87`, `plugin/src/index.ts:819-827`, `lgrep_search_text recordWallTimeMs` found only definition/tests.
  Impact: `ADV_PROFILE=1` records whole-tool durations, and metrics count tool calls, but in-process `wall_time_ms` is not wired into production hook output. Slow status substeps are not attributed in the health surface, so operators see “status is slow” rather than which probe/read caused it.
  Recommendation: Record per-tool wall time in `tool.execute.after`; add optional substep spans for `adv_status` phases and expose hot tools/p95 in health view.
  Follow-up: `/adv-proposal Add ADV latency telemetry`

### Developer Experience

- Severity: LOW
  Category: Developer Experience
  Evidence: `plugin/package.json:17-32`, `plugin/scripts/benchmark-execute.ts:4-17`
  Impact: Developers have benchmark scripts, but the command surface is split between `pnpm run bench:latency` and a manually invoked `benchmark-execute.ts`. That makes performance triage less discoverable and harder to compare across branches.
  Recommendation: Document one blessed latency workflow and write reports to an ignored benchmark directory only when explicitly requested.
  Follow-up: `/adv-task Document ADV latency workflow`

### Code Quality

- Severity: HIGH
  Category: Code Quality
  Evidence: `plugin/src/storage/store-temporal/index.ts:575-687`, `plugin/src/storage/store-temporal/index.ts:685-740`, `plugin/src/tools/status.ts:1190-1205`, `plugin/src/tools/status.ts:590-653`
  Impact: List/status read paths still hydrate full changes. `listResolvedChanges` unions memo IDs, Visibility IDs, disk IDs, and archive IDs, then loads every change in batches. `adv_status` then enriches every recent change with another `store.changes.get`, proposal read, context snapshot/ticker, dependency status, next gate, clarify checks, and recency recommendation.
  Recommendation: Introduce a true summary-index read model for `adv_change_list`/`adv_status` default views. Hydrate full change only for primary snapshot, `view:"changes"`, or explicit include flags.
  Follow-up: `/adv-proposal Add change summary index`

- Severity: MEDIUM
  Category: Code Quality
  Evidence: `plugin/src/tools/change.ts:1875-1915`, `plugin/src/tools/change.ts:1951-2023`
  Impact: `adv_change_show` always loads proposal fallback, checks `problem-statement.md`, and applies clarify readiness before optional include flags. Useful defaults, but phase-start flows that only need task/gate summaries still pay artifact I/O and checks.
  Recommendation: Add a lightweight mode or shift artifact/clarify enrichment behind include flags while preserving current default through compatibility tests.
  Follow-up: `/adv-proposal Add lightweight change show`

## LBP / Reference Comparison

| Area                                    | Current                                                                                                                                                                                                                                                                                                                              | Reference                                                                                                                                                                                                                                                           | Classification   | Correction                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temporal Visibility for list/annotation | Change enumeration uses `client.workflow.list({ query })` with `AdvProjectId` + status filters (`plugin/src/temporal/list-change-workflows.ts:18-27`, `plugin/src/temporal/list-change-workflows.ts:109-130`). Backlog annotation batches issue lookups with Visibility (`plugin/src/temporal/visibility-claim-queries.ts:139-198`). | Temporal TypeScript docs: Search Attributes support querying workflows by metadata via `client.workflow.list({ query })`; count/list are intended Visibility APIs. Source: Context7 `/temporalio/sdk-typescript`, “Search Attributes and Visibility in TypeScript”. | SOUND with DRIFT | Keep Visibility-first design. Fix local `AdvProjectId` vs `AdvAffectedProjects` inconsistency so fast path is structurally reliable. Greenfield: one registered project-scope attribute, one summary projection, no disk union in hot default path.                                                            |
| Workflow query/signal round trips       | Mutations use signal then refresh/query (`plugin/src/tools/_adapters.ts:177-204`, `plugin/src/storage/store-temporal/index.ts:185-192`). Reads query full workflow state on cache miss (`plugin/src/storage/store-temporal/index.ts:492-512`).                                                                                       | Temporal docs: signals are fire-and-forget, queries are read-only immediate state exposure. Source: Context7 `/temporalio/sdk-typescript`, “Interact with Workflow Signals, Queries, and Updates from Client”.                                                      | SOUND            | Preserve signal/query correctness. For speed, avoid unnecessary post-mutation full hydration when caller only needs ticker/summary; refresh lightweight memo first, full state later/on demand. Greenfield: command-specific return projections per mutation, with full consistency checks at gate boundaries. |
| Probe caching                           | Status probes use `createProbeCache` with `lru-cache` TTL, stale-on-abort/rejection, and 2s/60s TTLs (`plugin/src/tools/status.ts:130-201`, `plugin/src/tools/probe-cache.ts:59-138`).                                                                                                                                               | `lru-cache` docs: `cache.fetch()` returns fresh cached values, coalesces concurrent fetches, and can return stale on abort/rejection when configured. Source: Context7 `/isaacs/node-lru-cache`, `cache.fetch(key, options?)`.                                      | SOUND            | Good foundation. Apply same cache shape to expensive status-only substeps that remain in summary, and add visible per-probe duration/error counters. Greenfield: central probe registry with budgets.                                                                                                          |
| Tool arg validation                     | Tool args use Zod schemas in registry; Zod v4 is project standard (`plugin/package.json:39-41`, project context).                                                                                                                                                                                                                    | Zod docs: `parse` throws; `safeParse` returns success/error discriminated union. Source: Context7 `/colinhacks/zod`, parsing methods.                                                                                                                               | SOUND            | Validation cost is not current bottleneck. Do not optimize away Zod; focus on I/O and Temporal round trips. Greenfield: precompile/reuse schemas at registry construction only.                                                                                                                                |
| Status view projection                  | `applyStatusView` projects response after the full object is built; comment says full output is built unconditionally (`plugin/src/tools/status.ts:847-850`).                                                                                                                                                                        | Latency-sensitive systems should avoid work that requested response shape does not need; external orchestration sources emphasize explicit state, per-step latency tracking, and avoiding hidden overhead. Sources: Exa/Zylos, Exa/Prompt20.                        | ANTI-PATTERN     | Convert projection to execution planning: requested view determines which probes and enrichers run. Greenfield: separate handlers per view backed by shared formatter.                                                                                                                                         |

## Competitors & Alternatives

1. LangGraph
   - Summary: graph/state-machine orchestration emphasizing explicit state, checkpointers, and production observability.
   - Difference: explicit graph execution can reduce hidden orchestration overhead and makes step latency visible.
   - Maturity: cited as dominant/efficient in 2026 landscape articles.
   - Source: https://research.aimultiple.com/llm-orchestration/ and https://zylos.ai/research/2026-04-14-graph-based-agent-workflow-orchestration-production
   - Relevance: ADV already has deterministic gates; performance work should borrow explicit per-step measurements and lazy graph execution, not adopt LangGraph wholesale.

2. Microsoft Conductor
   - Summary: deterministic YAML orchestration for multi-agent workflows, with routing outside the LLM.
   - Difference: routing layer consumes zero tokens and is inspectable.
   - Maturity: Microsoft open-source blog announcement, MIT CLI.
   - Source: https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/
   - Relevance: reinforces ADV’s deterministic gate-machine direction; useful pattern for avoiding LLM/tool deliberation overhead in fixed workflows.

3. Google Agent Executor
   - Summary: open runtime standard for durable, resumable, distributed agent execution.
   - Difference: targets long-running agent workflows and high volumes of sub-second tool calls with lower-latency runtime substrate.
   - Maturity: Google Cloud preview announcement.
   - Source: https://cloud.google.com/blog/products/ai-machine-learning/agent-executor-googles-distributed-agent-runtime
   - Relevance: validates ADV’s durable Temporal-backed direction; suggests future runtime-level batching/snapshotting patterns for high-frequency tool calls.

## Emerging Patterns

1. Deterministic orchestration over LLM-routed orchestration
   - Source: https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/
   - Summary: fixed workflow topology, conditions, and explicit context flow reduce latency, cost, and unpredictability.
   - Applicability: high. ADV already uses deterministic gates; extend this to deterministic tool-read plans by view and phase.

2. Per-step observability and tool-call latency tracing
   - Source: https://zylos.ai/research/2026-04-14-graph-based-agent-workflow-orchestration-production and https://blog.prompt20.com/posts/ai-agent-protocols/
   - Summary: 2026 agent stacks track token usage, latency per step, state diffs, interrupt/resume events, and tool success rates; MCP guidance emphasizes reused connections, strict timeouts, and audit logs.
   - Applicability: high. ADV has counters and optional profiles, but needs first-class per-tool/per-substep latency surfaces.

## Applicability to This Repo

High applicability:

- Lazy `adv_status` view execution. Evidence shows all status work currently runs before projection (`plugin/src/tools/status.ts:847-850`, `plugin/src/tools/status.ts:1415-1416`). Expected user-visible gain: default orientation calls stop paying health/hygiene costs.
- Summary-index read model for list/status. Evidence shows list paths hydrate full changes after collecting IDs (`plugin/src/storage/store-temporal/index.ts:575-687`) and status re-hydrates/enriches recent changes (`plugin/src/tools/status.ts:1190-1205`). Expected gain: fewer Temporal queries and artifact reads per default tool call.
- Latency telemetry wiring. Evidence shows whole-tool profiling exists (`plugin/src/utils/safe-execute.ts:380-449`) and metrics exist (`plugin/src/utils/metrics.ts:1-18`), but `recordWallTimeMs` is not called in production code. Expected gain: faster diagnosis, safer performance budgets.

Medium applicability:

- `adv_change_show` lightweight mode. Evidence shows artifact/clarify defaults run before include flags (`plugin/src/tools/change.ts:1875-1915`). Expected gain: phase-start and checkpoint flows can request just the state they need.
- Visibility attribute alignment. Evidence shows a local comment naming `AdvProjectId` inconsistency (`plugin/src/temporal/visibility-claim-queries.ts:11-15`). Expected gain: fewer slow fallbacks and fewer “why is listing slow/offline?” cases.

Low applicability / reject for now:

- Replacing Temporal with another runtime. External landscape supports durable runtimes; current architecture already uses Temporal and has tests/specs around it. Not worth migration for latency alone.
- Removing Zod validation. Zod is not evidenced as bottleneck; correctness and boundary validation matter more.

Overlap / dedupe notes:

- Pending agenda `ag-aWL1Yd3T` “Reduce poisoned workflow WIP noise” overlaps WIP/status noise, but not the broader `adv_status` lazy-view and summary-index work.
- Active/draft changes listed by `adv_change_list` do not directly cover ADV tool latency as a primary objective.

## Open Questions for Research

1. What are current p50/p95/p99 latencies for `adv_status`, `adv_change_list`, `adv_change_show`, `adv_task_list`, `adv_wip_state`, and `adv_backlog_state` on real project state with 10, 50, 250 changes?
2. Which `adv_status` substep dominates on live project state: Temporal health, listResolvedChanges, recent-change enrichment, worktree cleanup, snapshot health, session debt, plugin runtime provenance, or project metadata?
3. Can `ChangeSummaryMemo` become a correctness-safe read model fed by workflow search attributes / signals, or does it need a dedicated query/projection contract?
4. Which current callers rely on default `adv_change_show` artifact/clarify enrichment, and which can opt into lightweight shape without compatibility break?
5. What latency budget is acceptable for “interactive” ADV tools: default status <250ms p50? change_show <200ms p50? list <500ms p95 at 50 changes?

## Sources

- Local: `project.md` via `adv_project_context`.
- Local: active changes via `adv_change_list`, pending agenda via `adv_agenda_list`, specs via `adv_spec action:"list"`.
- Local: `plugin/package.json:17-32`.
- Local: `plugin/scripts/bench-adv-latency.ts:63-98`.
- Local: `plugin/scripts/benchmark-execute.ts:4-17`.
- Local: `plugin/src/perf/latency.ts:56-111`.
- Local: `plugin/src/tools/status.ts:130-201`, `plugin/src/tools/status.ts:560-739`, `plugin/src/tools/status.ts:840-1421`.
- Local: `plugin/src/tools/change.ts:1840-2049`.
- Local: `plugin/src/tools/_adapters.ts:177-204`.
- Local: `plugin/src/storage/store-temporal/index.ts:61-205`, `plugin/src/storage/store-temporal/index.ts:492-819`.
- Local: `plugin/src/storage/store-temporal/changes.ts:196-284`.
- Local: `plugin/src/storage/store-temporal-memo.ts:1-115`.
- Local: `plugin/src/temporal/list-change-workflows.ts:1-131`.
- Local: `plugin/src/temporal/visibility-claim-queries.ts:1-198`.
- Local: `plugin/src/utils/safe-execute.ts:380-449`.
- Local: `plugin/src/utils/metrics.ts:1-87`.
- Local: `plugin/src/index.ts:819-827`.
- Context7: `/temporalio/sdk-typescript`, “Interact with Workflow Signals, Queries, and Updates from Client”; “Search Attributes and Visibility in TypeScript”.
- Context7: `/isaacs/node-lru-cache`, `cache.fetch(key, options?)` async stale-while-revalidate docs.
- Context7: `/colinhacks/zod`, parsing methods (`parse`, `safeParse`, async variants).
- External: https://research.aimultiple.com/llm-orchestration/
- External: https://aimultiple.com/agentic-orchestration
- External: https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/
- External: https://zylos.ai/research/2026-04-14-graph-based-agent-workflow-orchestration-production
- External: https://cloud.google.com/blog/products/ai-machine-learning/agent-executor-googles-distributed-agent-runtime
- External: https://blog.prompt20.com/posts/ai-agent-protocols/
- External: https://amux.io/blog/best-multi-agent-orchestrators-2026/
