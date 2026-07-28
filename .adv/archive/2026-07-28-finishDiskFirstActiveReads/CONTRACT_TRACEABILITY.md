# Contract Traceability

**Change ID:** finishDiskFirstActiveReads
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-27T23:49:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | store-types.read-store-boundary.test.ts: ReadSnapshot<T> schema validated (found/not-found/revision/source/degraded); read-command-boundary.test.ts: read types expose no mutation authority. Run tr_ms3v1ckz_fccbbf6b. |
| AC2 | acceptance_criterion | pass | test | read-command-boundary.test.ts: AST analysis confirms routine readers compile against ReadStore, mutations use CommandStore/Temporal adapters; store-types.read-store-boundary.test.ts. Run tr_ms3v1ckz_fccbbf6b. |
| AC3 | acceptance_criterion | pass | test | change-state.operation-ledger.test.ts (7 tests): stable operation_id + payload_hash + monotonic state_revision; shared.command-primitive.test.ts; command-payload-hash.test.ts; tool-operation-context.test.ts. Run tr_ms3v1ckz_fccbbf6b. |
| AC4 | acceptance_criterion | pass | test | change-projection-transaction.test.ts (22 tests): commitChangeProjection fences by revision/operation, readback-verifies projection.revision >= acknowledgedRevision, injected failure produces typed non-blind-retry outcome. Run tr_ms3v1ckz_fccbbf6b. |
| AC5 | acceptance_criterion | pass | test | change-state.close-reducer.test.ts (214 lines): reducer validates lifecycle, stale preflight rejected; change-state.batch-close.test.ts + batch-close-coordinator.test.ts (512 lines): prepare/commit/abort fail-all. Run tr_ms3v1ckz_fccbbf6b. |
| AC6 | acceptance_criterion | pass | test | routine-readstore-routing.red.test.ts: poisoned Temporal client, all routine reads (changes.get/list/listSummary, gates, tasks, wisdom) return from projection with queryCalls()==0. Run tr_ms3v1ckz_fccbbf6b. |
| AC7 | acceptance_criterion | pass | test | routine-readstore-routing.red.test.ts: missing projection→typed not_found, corrupt→degraded; degradation.read-model.test.ts: poisoned/orphaned workflow→normal/degraded snapshot. Run tr_ms3v1ckz_fccbbf6b. |
| AC8 | acceptance_criterion | pass | test | change-summary-shard.test.ts (710 lines): per-change immutable shards + current pointer; routine-readstore-routing.red.test.ts: listSummary reads shards with fromHydration:0; launcher-projection.test.ts. Run tr_ms3v1ckz_fccbbf6b. |
| AC9 | acceptance_criterion | pass | test | read-command-boundary.test.ts: AST structural analysis — routine reader import graphs cannot reach Temporal; query calls confined to named allow-list (confirmation/recovery/diagnostics). Run tr_ms3v1ckz_fccbbf6b. |
| AC10 | acceptance_criterion | pass | test | tool-catalog-purity.test.ts: catalog/describe pure in-memory; temporal-free-filesystem-readers.test.ts: specs/context direct file reads; read-command-boundary.test.ts: pure metadata roots isolated. Run tr_ms3v1ckz_fccbbf6b. |
| AC11 | acceptance_criterion | pass | test | read-model-tier4-classification.test.ts: needs-read-model vs needs-temporal-diagnostics; degradation.read-model.test.ts: degrades by provenance not failure. Run tr_ms3v1ckz_fccbbf6b. |
| AC12 | acceptance_criterion | pass | test | change-state.operation-ledger.test.ts: idempotent replay preserves prior outcome/revision; change-projection-transaction.test.ts: outcome_unknown_readback_unavailable + no blind retry; terminal projection dominance intact. Run tr_ms3v1ckz_fccbbf6b. |
| AC13 | acceptance_criterion | pass | test | build:worker tr_ms3vbmac_14feafc4 (gen ddc0cd03b29e, pass); replay-determinism tr_ms3v0fmk_5659228c (15/15 pass); workflow-bundle-boundary.test.ts. Provenance recorded. |
| C1 | constraint | respected | static_check | No defineUpdate introduced; signals remain command surface. workflow-bundle-boundary.test.ts + command-boundary-replay-drift.itest.ts confirm signal-only protocol. |
| C2 | constraint | respected | static_check | Filesystem projection remains backend; no database added. commitChangeProjection is filesystem-backed atomic conditional writer. |
| C3 | constraint | respected | static_check | Freshness authority is monotonic state_revision/projection_revision, never wall-clock. change-state.operation-ledger.test.ts confirms revision-based fencing. |
| C4 | constraint | respected | static_check | read-command-boundary.test.ts: query allow-list permits command confirmation queries; routine reads structurally prohibited from querying (AC6/AC9 zero-query). |
| C5 | constraint | respected | static_check | commitChangeProjection remains sole canonical atomic conditional writer; no parallel persistence primitive introduced. |
| C6 | constraint | respected | static_check | read-command-boundary.test.ts: reader modules cannot reach writer modules (saveChange allow-list enforced); ReadSnapshot exposes no command handle. |
| C7 | constraint | respected | static_check | No worker slot/poller cap changes in this change's diff. |
| C8 | constraint | respected | static_check | Existing _source/_recovery fields map to read-model provenance; degradation.read-model.test.ts confirms compatible migration path. |
| DONT1 | avoidance | respected | review | Replaced mixed Query/disk approach with projection-backed ReadStore/CommandStore split — not a global disk-presence flip. Design re-entry after validator CONFLICT confirmed. |
| DONT2 | avoidance | respected | review | Command success requires commitChangeProjection proof (AC4); fire-and-forget scheduleChangeProjection remains cache-warming only, never satisfies success. |
| DONT3 | avoidance | respected | review | ReadStore/CommandStore are structurally separated interfaces; no permanent readOnly flag on command-oriented getter. |
| DONT4 | avoidance | respected | review | tool-catalog-purity.test.ts: catalog/describe remain pure in-memory; specs/context remain direct file reads, not moved into projection. |
| DONT5 | avoidance | respected | review | Reducer validates lifecycle authorization (AC5); change-state.close-reducer.test.ts confirms stale projection cannot authorize close. |
| DONT6 | avoidance | respected | review | No worker capacity/slot changes in this change; routine read amplification eliminated via read model. |
| DONT7 | avoidance | respected | review | Workflow retirement, Continue-As-New thresholds, hibernation, and Worker Versioning remain independent concerns (design.md § Independent Concerns). |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out of scope per agreement — Continue-As-New thresholds, hibernation, retirement, Worker Versioning not bundled. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out of scope per agreement — Signal-based protocol retained, no Temporal Updates. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ac62e527f5f1 | AC3, AC12, AC13 |  | C1, C3, C4, DONT1, DONT2, DONT5 |  |
| tk-df3426eab063 | AC1, AC2, AC10, AC11 |  | C2, C6, C8, DONT3, DONT4 |  |
| tk-5fa3d9082674 | AC4, AC12 |  | C3, C5, DONT2 |  |
| tk-ac77fd41d2d4 | AC5, AC12, AC13 |  | C1, C6, DONT5 |  |
| tk-3f8e2a9cc010 | AC4, AC8 |  | C2, C3, C5, C6, DONT2 |  |
| tk-ccfe650451fa | AC5, AC12, AC13 |  | C1, C6, DONT5, DONT7 |  |
| tk-aef59407a67c | AC3, AC4, AC12, AC13 |  | C1, C3, C4, C5, DONT1, DONT2, DONT5 |  |
| tk-2cb19db55877 | AC1, AC2, AC6, AC7, AC9 |  | C4, C6, C8, DONT1, DONT3, DONT5 |  |
| tk-22edbf3e76ac | AC6, AC7, AC8, AC9, AC11 |  | C4, C6, C8, DONT1, DONT3, DONT6 |  |
| tk-5696f5a787a0 | AC9, AC10, AC11 |  | C1, C4, C5, C6, DONT3, DONT4 |  |
| tk-2d1f64ec120b |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-045e704da4d2 |  |  | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-bd8a510e63e2 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
