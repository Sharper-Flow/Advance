# Executive Summary — Add ADV Launcher Read Projection

## Outcome

ADV now produces a durable, launcher-consumable aggregate read-projection (`active-launcher-state.json`) so that active changes remain visible to the launcher (and any file-reading consumer) even when Temporal — ADV's system of record — is unavailable. This is the **producer side** of a producer/consumer split with the toolbox change `decoupleAdvDisplayTemporal`, which made `zellij-project-launcher` read this file instead of shelling out to a Temporal-hard CLI.

## Why It Matters

Previously, the launcher silently vanished on any Temporal outage: the standalone `adv status` / `adv epic list` CLI is Temporal-hard with no disk fallback, while agents kept working via the MCP layer. Users lost visibility into active work precisely when infrastructure was degraded. This change makes the launcher display Temporal-independent for active changes — it reads a single, stable, versioned file rather than probing a live service.

## What Was Built

- A **pure aggregator** (`plugin/src/storage/launcher-projection.ts`) that combines the existing per-change `{changeId}.json` projections into one bounded, truthful-provenance summary (draft/non-terminal only, terminal-truth-compliant, capped at 50, freshness + advisory `degraded` flag, `epics_available:false`).
- The **existing `writeChangeProjection` activity body** was extended (host-side) to atomically write the aggregate alongside the per-change projection — with **no new workflow activity call**, so in-flight workflow histories replay identically (no versioning/migration needed).
- A producer-owned **MCP rebuild tool** (`adv_launcher_projection_rebuild`) for drift recovery — plugin-only, never reachable from the Bun-safe `bin/adv` CLI.
- A new spec law (`rq-launcherProjectionTruth01`) and **ADR 0009** codifying the host-side, replay-safe design.

## Verification

- 12 aggregator unit tests, 7 activity tests, 1 Temporal integration test (signal-driven regeneration with Temporal stopped), and 1 replay-safety guard test — all green; typecheck/lint clean; CLI source boundary green.
- Independent design validation (adv-researcher) and an independent acceptance review (adv-reviewer) both run; the one design blocker (workflow replay determinism) and the one acceptance blocker (refresh granularity) were resolved in-design/in-criteria.
- Contract review matrix: 19/19 items passing.

## Key Decision

The aggregate is written **host-side by extending an existing activity's body**, not by adding a new activity to the workflow. A workflow-level change would have broken replay determinism for every in-flight change; extending an already-invoked activity is replay-safe. This keeps the change low-risk and migration-free.

## Risks / Follow-ups

- **Projection refresh granularity:** the projection refreshes at gate transitions and terminal mutations (create/archive/close) — the existing projection system's trigger points — plus on-demand via the rebuild tool. It does not refresh on every within-gate task/artifact mutation. Acceptance criteria were re-scoped (user-approved) to match this rather than risk a workflow-replay-breaking change. A future host-side per-mutation trigger could tighten freshness.
- **Cross-project consumer path (IMPORTANT):** the shipped toolbox consumer reads the projection from `…/advance/external/{projectId}/`, but this producer writes the canonical `…/advance/{projectId}/` (no `external/`). The producer path is correct (consistent with all other advance external state); the consumer has a path bug (it was tested only against fixtures). A toolbox follow-up to drop the `external/` segment was approved; its creation is blocked until the toolbox ADV worker is serviceable. **End-to-end producer→consumer will not connect until that consumer fix lands.** Recorded durably.
- Active-epic offline projection remains out of scope (epics stay Temporal-only; `epics_available:false` is truthful).

## Release Readiness

Producer change is complete, tested, and spec-law-backed. The one open dependency is the cross-project consumer path fix (separate repo, separate shipped change), which does not block archiving this producer change but does block end-to-end launcher functionality until resolved.