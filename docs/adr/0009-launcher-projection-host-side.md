# ADR 0009: Launcher aggregate projection is host/activity-side, written by extending the existing projection activity body

- **Status:** Proposed (pending archive of `addAdvLauncherReadProjection`)
- **Date:** 2026-07-23
- **Associated change:** `addAdvLauncherReadProjection` (Epic: `systemizeAdvOrchestration`, entry order 14)
- **Supersedes:** none
- **Related:** ADR 0004 (per-epic workflow), `rq-terminalProjectionTruth01` (advance-workflow), `rq-workflowVersioning01` (advance-workflow), cross-project consumer `decoupleAdvDisplayTemporal` (toolbox)

## Context

zlauncher (toolbox) displays ADV's active changes. Today it shells out to the standalone `adv status` / `adv epic list` CLI, which is Temporal-hard with no disk-fallback. When Temporal is unavailable, the launcher silently vanishes — even though agents keep working via the MCP `adv_change_list` layer, which has a disk-fallback. The validated fix is a producer-owned durable aggregate read-projection (`active-launcher-state.json`) that the launcher reads as a file.

The change must produce this projection in the advance plugin/store layer. Two natural-looking implementation options exist:

- **(a) Temporal workflow query** — a workflow query that aggregates all active changes and the launcher calls.
- **(b) New activity invoked from the workflow** — add a `writeLauncherProjection()` activity call to the workflow's signal handler.
- **(c) Extend the existing `writeChangeProjection` activity body (host-side)** — the already-invoked activity that writes the per-change `{changeId}.json` projection also writes the aggregate.

## Decision

**Option (c): extend the existing `writeChangeProjection` activity body.**

The aggregate is written inside the body of the already-called `writeChangeProjection` activity (in `plugin/src/temporal/activities.ts`), which runs host-side on the Temporal worker. After writing the per-change `{changeId}.json`, it derives `externalRoot` and `archiveDir` from its existing `projectionChangesDir` argument, calls the pure `buildLauncherProjection` aggregator, and atomically writes `active-launcher-state.json`.

## Rationale

1. **A workflow query is impossible.** Aggregation is a cross-workflow read: it must enumerate every active change's `{changeId}.json` in the per-project `changes/` dir. A Temporal workflow is sandboxed and owns only its own change state; it cannot enumerate sibling workflows' files. The aggregate therefore belongs on the host/activity side.

2. **Adding a new activity call to the workflow breaks replay determinism.** The workflow's `projectChangeState` handler runs in the deterministic workflow sandbox. Adding a new `await writeLauncherProjection(...)` would change the recorded activity-invocation sequence; in-flight workflow histories would replay and hit an activity invocation absent from their history → `NonDeterminismError`, requiring `wf.patch`/Worker versioning plus replay tests. (Flagged by independent design validation.)

3. **Extending an already-invoked activity's body is replay-safe.** Temporal records the activity *invocation* (name + args) in workflow history, not the activity body. Activity bodies execute host-side on the worker and are not part of the replayed workflow history. Because the workflow still calls `writeChangeProjection` with unchanged arguments, existing histories replay identically — no versioning, no replay-test burden. A guard test (`workflow-call-sequence.guard.test.ts`) asserts the invariant: the workflow proxies only the pre-existing activities.

## Consequences

- **Aggregate regeneration is host filesystem I/O** with no Temporal availability dependency — the whole point: the launcher display survives Temporal outages by reading a file.
- **Zero workflow-code change** → zero migration/versioning burden; in-flight workflows are unaffected.
- **Host `Date.now()` is legal** in the activity body (freshness/degraded computation) — activities are not determinism-patched (unlike workflow code, where `Date.now()` is patched by the SDK sandbox).
- **Multi-session convergence** via `atomicWriteFile` (temp + fsync + rename): concurrent writers produce deterministic, sorted content; last-writer-wins with no torn file.
- **Best-effort aggregate**: a failure to write the aggregate must not fail the per-change projection write or the signal — the per-change projection remains authoritative, the aggregate is a downstream cache.
- The CLI boundary stays intact: `bin/adv` remains a Bun-safe, storage-free, Temporal-live probe (`bin/lib/cli-source-boundary.test.ts`); the aggregate is consumed by file, not via the CLI. A separate producer-owned MCP tool (`adv_launcher_projection_rebuild`) provides drift recovery.

## Alternatives considered

- **(a) Workflow query** — rejected: impossible (cross-workflow read; sandboxed workflow).
- **(b) New workflow activity call** — rejected: breaks replay determinism for in-flight histories; needs versioning + replay tests.
- **CQRS-lite separate projection worker process** — rejected: over-engineering; the activity piggyback reuses the existing signal path with no new process.
