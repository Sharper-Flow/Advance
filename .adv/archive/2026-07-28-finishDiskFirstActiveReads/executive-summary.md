# Executive Summary: Finish disk-first active reads

## Outcome

ADV now has a **projection-first CQRS-lite architecture**: routine reads resolve from schema-versioned durable disk projections and per-change summary shards with **zero Temporal workflow Query calls**, while state-changing commands carry stable operation identity, increment monotonic state revisions, and return success only after the projection is atomically committed and readback-verified. This eliminates the class of bugs where reads race with or depend on Temporal workflow health.

## Why it matters

Before this change, ADV's read path was half-flipped: some reads went through Temporal Queries, others through disk. A missing, poisoned, or orphaned workflow could block or corrupt routine reads. Command success could diverge from disk durability (the `fixDeltaAddPersistence` root cause). Lifecycle authorization depended on stale host preflight reads. This change closes those gaps structurally — not via heuristics or flags, but via typed `ReadStore`/`CommandStore` separation, projection-proof command success protocol, and reducer-owned authorization.

## What was built

- **ReadStore/CommandStore separation** (AC1, AC2): routine read tools compile against `ReadStore`; mutation tools use `CommandStore`/Temporal adapters. Structural AST tests enforce the boundary.
- **Stable operation ledger + monotonic state revision** (AC3, AC12): every behavior-changing command carries a stable `operation_id` + `payload_hash`; the workflow reducer records a bounded operation ledger and increments `state_revision` exactly once per accepted transition. Same ID/payload is idempotent; different payload is a typed conflict.
- **Projection-proof command success** (AC4): `commitChangeProjection` fences by revision/operation, atomically writes full snapshot + summary shard + pointer, readback-verifies, and returns the acknowledged revision. Injected projection failure produces typed non-blind-retry outcomes — never false success.
- **Reducer-owned lifecycle authorization** (AC5): close/closeBatch eligibility validated by the workflow reducer, not host preflight. Batch close uses a durable prepare/commit/abort coordinator with fail-all semantics.
- **Zero-Query routine reads** (AC6–AC9): `adv_change_show`, gate/task/wisdom/delta/Epic reads, default `adv_status`, and `adv_wip_state` return from the read model with zero Query calls when projection exists. Missing workflow + present projection → normal snapshot; poisoned/orphaned → degraded; missing + missing → typed not-found. Structural AST allow-list prohibits Queries outside command confirmation/reconciliation/diagnostics/repair.
- **Durable summary index** (AC8): per-change immutable summary shards under per-change locks; concurrent changes cannot overwrite each other. Default `adv_change_list` and warm `adv_status` enumerate shards, not full changes.
- **Pure metadata boundary** (AC10, AC11): tool catalog/describe remain pure in-memory; specs/context remain direct file reads. Tier-4 classification distinguishes `needs-read-model` from `needs-temporal-diagnostics`; read-model tools degrade by provenance, not failure.
- **Worker-bundle evidence** (AC13): build:worker (gen `ddc0cd03b29e`) and replay-determinism (15/15) pass; revision/reducer changes survive replay.

## Verification

- **22 new architecture test files** (194 tests) — structural AST boundary tests, behavioral zero-Query tests, projection transaction fencing, batch-close coordinator, reducer authorization, Tier-4 classification, catalog purity. All pass.
- **16 modified existing test files** — all pass, including a regression caught and fixed during verification (changes.test.ts mock wiring after reader/writer module split).
- **Worker-bundle**: build:worker `tr_ms3vbmac_14feafc4` + replay-determinism `tr_ms3v0fmk_5659228c` (15/15). Provenance recorded.
- **Spec validation**: 0 errors, 14 advisory OVERLAPPING_CAPABILITY warnings (expected — other active changes touch the same central capabilities).
- **Contract review matrix**: 30/30 items pass/respected, 0 failing.
- **Spec deltas**: 2 requirements staged (rq-projectionCommandProof01 advance-workflow, rq-projectionReadModel02 advance-meta) with 9 scenarios encoding the architecture as spec-law.

## Risks and follow-ups

- **Overlapping capabilities**: 12 other active changes also modify advance-workflow/advance-meta. Archive-time conflict resolution will be needed; the deltas are additive (new requirements, no modifications to existing).
- **External blocker resolved**: `fixDeltaAddPersistence` root cause (spec-delta signals not requesting projection) is fixed by this change's projection-proof command success. The `fixDeltaAddPersistence` change can be closed as superseded.
- **Migration**: Existing Store remains a temporary façade delegating to ReadStore/CommandStore. Legacy state/projections default to revision 0. No data migration required — projections rebuild from workflows on next signal.
- **Command latency**: Success now waits for projection proof. Accepted tradeoff per design — correctness over latency.
- **Workflow retirement** remains an independent concern (not bundled here).