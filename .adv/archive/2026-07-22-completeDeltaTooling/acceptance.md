# Acceptance

Reviewed at: 2026-07-22T21:35:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | AC1 (amend): Given a modify-delta staged under a capability, when `adv_delta_amend(changeId, capability, deltaId, delta)` is called with a complete corrected delta, then the staged entry is atomically replaced, the delta id is preserved, and `adv_change_show` exposes the amended postimage before success is returned; a second amend of the same delta succeeds (no first-modify-only limit). | pass | spec-delta.test.ts: amend full-replace preserves id, second amend succeeds; live dogfood rq-stagedDeltaCrud01 round-tripped readback-confirmed |
| AC2 | acceptance_criterion | AC2 (amend validation): Given an amend whose new payload is invalid (unknown modify target, bad scenario-id parenting, malformed), when called, then the operation is atomically rejected and the previously-staged delta is unchanged. | pass | spec-delta.test.ts: invalid amend payload (unknown target/bad scenario parenting/malformed) atomically rejected, staged delta unchanged |
| AC3 | acceptance_criterion | AC3 (retract): Given a staged delta, when `adv_delta_retract(changeId, capability, deltaId)` is called, then the delta is removed from the change record and `adv_change_show` no longer lists it; readback confirms absence before success. | pass | spec-delta.test.ts + spec-deltas.test.ts: retract removes staged delta, readback asserts absence before success |
| AC4 | acceptance_criterion | AC4 (remove op): Given a valid remove delta (target_id + reason), when `adv_delta_remove` is called, then operation:remove is staged, readback-confirmed, and archive simulation applies it via the existing applyRemoveDelta path. | pass | spec-delta.test.ts: adv_delta_remove stages operation:remove, readback-confirmed; downstream applyRemoveDelta unchanged (DONT2) |
| AC5 | acceptance_criterion | AC5 (rename op): Given a valid rename delta, when `adv_delta_rename` is called, then operation:rename is staged and readback-confirmed. | pass | spec-delta.test.ts: adv_delta_rename stages operation:rename, readback-confirmed |
| AC6 | acceptance_criterion | AC6 (unknown id): Given a deltaId that is not staged, when amend or retract is called, then a typed not-found error is returned with no mutation. | pass | spec-delta.test.ts: amend/retract of unknown deltaId returns typed not-found with no mutation |
| AC7 | acceptance_criterion | AC7 (persistence proof): Every new tool returns explicit failure (not false success) when the signal is acknowledged but the post-signal readback cannot confirm the intended change (mutation-safety SC4+SC6). | pass | spec-deltas.test.ts: every method throws explicit failure on outcome_unknown_readback_unavailable; validated live (dl-stagedDeltaCrud01 persisted, disk-lag resolved) |
| AC8 | acceptance_criterion | AC8 (no regression): adv_delta_add and adv_delta_modify behavior is unchanged; full targeted delta suite passes. | pass | 90 delta tests pass; adv_delta_add/modify behavior unchanged; 221-test wiring suite green |
| AC9 | acceptance_criterion | AC9 (replay determinism): New signal handlers are additive; replay-determinism tests pass; no wf.patched() marker required and none added. | pass | replay-determinism.test.ts 13/13 pass incl poisoned production histories; handlers additive; no wf.patched (DONT5) |
| C1 | constraint | Archive remains the sole global-spec writer; these tools only mutate the change-owned staged delta record. | respected | Tools mutate only change.deltas[] staged record; archive/delta.ts apply path untouched |
| C2 | constraint | No migration — the Delta discriminated union already includes remove/rename; change.deltas[] shape is unchanged. | respected | Delta union already included remove/rename (specs.ts:223); no shape change, no migration |
| C3 | constraint | Amend is full-replace (deterministic, P33) — caller supplies the complete corrected delta; no heuristic merge. | respected | amend is full-replace; caller supplies complete corrected delta; no merge logic added |
| C4 | constraint | New signals are additive and replay-safe; must not alter existing signal-handler ordering. | respected | New setHandler blocks appended after existing; replay-determinism confirms no ordering change |
| C5 | constraint | Preserve add-only-friendly guarantees: atomic reject on unknown id / invalid payload / conflicting target. | respected | Atomic reject on unknown id / invalid payload / conflicting target (self-excluded on amend) |
| DONT1 | avoidance | Do not add a partial/patch merge mode for amend. | respected | No partial/patch merge mode; full-replace only |
| DONT2 | avoidance | Do not change how deltas apply at archive. | respected | archive/delta.ts + projection.ts unchanged |
| DONT3 | avoidance | Do not touch cross-project delta semantics. | respected | No cross-project delta semantics touched |
| DONT4 | avoidance | Do not interrupt or restart the replaceRecoveryToolSprawl agent; coordinate at merge only. | respected | replaceRecoveryToolSprawl agent not interrupted; worktree isolation; merge-time coordination only |
| DONT5 | avoidance | Do not add wf.patched() markers or reorder existing signal handlers. | respected | No wf.patched() markers; existing handler order preserved (replay-determinism green) |

