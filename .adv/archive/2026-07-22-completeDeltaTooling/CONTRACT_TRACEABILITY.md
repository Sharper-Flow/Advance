# Contract Traceability

**Change ID:** completeDeltaTooling
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-22T21:35:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | spec-delta.test.ts: amend full-replace preserves id, second amend succeeds; live dogfood rq-stagedDeltaCrud01 round-tripped readback-confirmed |
| AC2 | acceptance_criterion | pass | test | spec-delta.test.ts: invalid amend payload (unknown target/bad scenario parenting/malformed) atomically rejected, staged delta unchanged |
| AC3 | acceptance_criterion | pass | test | spec-delta.test.ts + spec-deltas.test.ts: retract removes staged delta, readback asserts absence before success |
| AC4 | acceptance_criterion | pass | test | spec-delta.test.ts: adv_delta_remove stages operation:remove, readback-confirmed; downstream applyRemoveDelta unchanged (DONT2) |
| AC5 | acceptance_criterion | pass | test | spec-delta.test.ts: adv_delta_rename stages operation:rename, readback-confirmed |
| AC6 | acceptance_criterion | pass | test | spec-delta.test.ts: amend/retract of unknown deltaId returns typed not-found with no mutation |
| AC7 | acceptance_criterion | pass | test | spec-deltas.test.ts: every method throws explicit failure on outcome_unknown_readback_unavailable; validated live (dl-stagedDeltaCrud01 persisted, disk-lag resolved) |
| AC8 | acceptance_criterion | pass | test | 90 delta tests pass; adv_delta_add/modify behavior unchanged; 221-test wiring suite green |
| AC9 | acceptance_criterion | pass | test | replay-determinism.test.ts 13/13 pass incl poisoned production histories; handlers additive; no wf.patched (DONT5) |
| C1 | constraint | respected | static_check | Tools mutate only change.deltas[] staged record; archive/delta.ts apply path untouched |
| C2 | constraint | respected | static_check | Delta union already included remove/rename (specs.ts:223); no shape change, no migration |
| C3 | constraint | respected | static_check | amend is full-replace; caller supplies complete corrected delta; no merge logic added |
| C4 | constraint | respected | static_check | New setHandler blocks appended after existing; replay-determinism confirms no ordering change |
| C5 | constraint | respected | static_check | Atomic reject on unknown id / invalid payload / conflicting target (self-excluded on amend) |
| DONT1 | avoidance | respected | review | No partial/patch merge mode; full-replace only |
| DONT2 | avoidance | respected | review | archive/delta.ts + projection.ts unchanged |
| DONT3 | avoidance | respected | review | No cross-project delta semantics touched |
| DONT4 | avoidance | respected | review | replaceRecoveryToolSprawl agent not interrupted; worktree isolation; merge-time coordination only |
| DONT5 | avoidance | respected | review | No wf.patched() markers; existing handler order preserved (replay-determinism green) |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d684bd5b2879 | AC9 |  | C4, C2, DONT5 |  |
| tk-719d98df29d7 | AC7 |  | C1, C5, C2 |  |
| tk-26edfd42a70d | AC1, AC2, AC3, AC6 |  | C3, DONT1 |  |
| tk-f44202d64b78 | AC4, AC5 |  | DONT2 |  |
| tk-fe00e2b6c5d5 | AC8 |  | C1 |  |
| tk-e5b50267a945 |  | AC7, AC8, AC9 |  |  |
