# Executive Summary — Gate durable-mutation success on disk-projection durability

## Outcome

Durable ADV mutations (spec deltas, gate completions, wisdom, task changes) now report `success` only when the change is durable in the layer that survives a workflow going dark — the on-disk projection — not merely in Temporal. Previously a mutation could return `success:true` while its disk write was fire-and-forget and its failure silently swallowed, so the change could vanish from every disk-first reader with no error. That false-success class is closed.

## Why it matters

The disk projection is the sole source of truth once a change's workflow orphans (a recurring failure this Epic targets). Writing that layer with the weakest guarantee — while claiming success — meant work could be acknowledged and then silently lost, and a peer session could even accept a duplicate of a "successful" mutation. Honest success semantics remove that trap: a green result now means the work is on disk.

## What changed

- A small, pure durability gate (`disk-persist.ts`): a typed disk-write outcome plus `DiskProjectionPersistError` that carries explicit "may be durable in Temporal — do not blind-retry" semantics.
- The projection writer is now awaited and classified. Durability-critical mutations gate success on a confirmed disk write; if it fails they surface the typed error instead of swallowing it.
- Non-critical cache-refresh paths keep their fast best-effort behavior — explicitly, at the call site — so hot paths aren't taxed.

## What was verified

- New tests: durability-gate unit test, spec-delta failure-propagation test, and a task-mutation durability test (all green).
- No regressions: full project check (types, lint, format, schemas, manifests, isolation) green; a 1344-test sweep across storage + Temporal passed.
- Guardrails held: the orphaned-workflow safety guard (SC4) and the disk-first read path are untouched — verified live this session, where disk reads returned in 40ms while the workflow was fully wedged.

## Risks & follow-ups

- **Scoped-out by design (Epic entry 6):** concurrent-session projection serialization — two known races (a peer reseeding from stale disk mid-mutation; a stale whole-file overwrite) where the disk projection can still regress under simultaneous sessions. A robust fix needs a monotonic generation/lease the change state doesn't yet carry; adding it touches the replay-sensitive reducer that has repeatedly poisoned this Epic, so it was deliberately deferred (captured in wisdom `ws-V_e5tl`). This change delivers single-writer honesty, not concurrent-writer durability.
- No power-loss/`fsync` durability (out of scope; the failure mode addressed is process/session exit, which the OS page cache survives).

## Provenance

Defect-origin change in Epic `hardenTemporalReliability` (entry 14). Direction and the SC4-constraint reading were user-approved; an independent design validator raised the concurrency-scope CONFLICT, resolved by explicit user decision to defer it to entry 6.