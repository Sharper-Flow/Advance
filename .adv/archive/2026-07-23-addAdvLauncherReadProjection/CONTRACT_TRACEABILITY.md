# Contract Traceability

**Change ID:** addAdvLauncherReadProjection
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T19:08:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | itest tr_mrxujms3 (launcher-projection.itest.ts): temporal-stopped read returns N active summaries matching on-disk per-change projections, source disk_projection, no terminal entries. |
| SC2 | success_criterion | pass | review | aggregator tests tr_mrxtnd50 (12 unit tests): terminal/archived excluded even with stale draft projection; archive-bundle matched by canonical change.json.id. |
| SC3 | success_criterion | pass | review | itest tr_mrxujms3 + activity tr_mrxur8ex: aggregate regenerates on create/archive/close without a Temporal round-trip. |
| SC4 | success_criterion | pass | review | atomicWriteFile (temp+fsync+rename) reused in activities.ts; reviewer confirmed atomic writes; no torn-file path. |
| AC1 | acceptance_criterion | pass | test | aggregator tr_mrxtnd50 + activity tr_mrxur8ex + rebuild tr_mrxvvghg: durable active-launcher-state.json at canonical advance/{projectId}/ path, refreshed at gate transitions + terminal + rebuild trigger, truthful provenance (amended at acceptance to projection refresh points). |
| AC2 | acceptance_criterion | pass | test | aggregator tr_mrxtnd50: lists only draft/non-terminal; archived excluded per rq-terminalProjectionTruth01 by canonical id. |
| AC3 | acceptance_criterion | pass | test | replay-safety guard tr_mrxujkmw + reviewer report READY (...|tk-f53deb6fd1b6|adv-reviewer|1): host-side, no new workflow activity; Temporal not in aggregate-write path. |
| AC4 | acceptance_criterion | pass | test | aggregator tr_mrxtnd50: generated_at + freshness (max lastSignalAt) + advisory degraded flag (5min threshold) + epics_available:false. |
| C1 | constraint | respected | static_check | cli-source-boundary.test.ts green (tr_mrxvvghg context); adv_launcher_projection_rebuild is plugin-only, not reachable from bin/adv. |
| C2 | constraint | respected | static_check | aggregator tr_mrxtnd50: source always disk_projection, never temporal/live:true. |
| C3 | constraint | respected | static_check | atomicWriteFile (utils/fs.ts) reused for the aggregate write in activities.ts; versioned schema_version:1. |
| C4 | constraint | respected | static_check | additive: adv status / adv epic list CLI untouched; cli-source-boundary.test.ts green; reviewer confirmed. |
| C5 | constraint | respected | static_check | aggregator tr_mrxtnd50: archive-bundle exclusion matched by canonical change.json.id per rq-terminalProjectionTruth01. |
| DONT1 | avoidance | respected | review | No CLI disk-fallback patch; cli-source-boundary.test.ts green; rebuild trigger is an MCP tool. |
| DONT2 | avoidance | respected | review | Aggregate not a workflow responsibility; replay-safety guard tr_mrxujkmw confirms no new workflow activity; reviewer READY. |
| DONT3 | avoidance | respected | review | aggregator tr_mrxtnd50: epics_available always false; epic data never fabricated as live. |
| DONT4 | avoidance | respected | review | aggregator tr_mrxtnd50: provenance never claims live/temporal; source always disk_projection. |
| DONT5 | avoidance | respected | review | atomicWriteFile (temp+fsync+rename) guarantees old-or-new, never torn. |
| DONT6 | avoidance | respected | review | Workflow projection trigger NOT broadened (would break replay, KD-1); AC1 re-scoped to gate-transition refresh instead. Guard tr_mrxujkmw. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8bfaecc7504c | C2, C5 |  | DONT3, DONT4 |  |
| tk-2e50f105150f | AC1, AC2, AC4 | SC2 | C2, C5, DONT3, DONT4 |  |
| tk-89628d0aa03e | AC1 |  | C1, DONT1 |  |
| tk-83079c97fe5c | AC1, AC3 | SC3, SC4 | C1, DONT2, DONT5 |  |
| tk-940495b9ba78 |  | SC1, SC3 |  |  |
| tk-b4f1c8911c3c | AC1 |  |  |  |
| tk-f53deb6fd1b6 |  | AC3 | DONT2 |  |
