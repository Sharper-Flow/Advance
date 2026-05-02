# Storage Direction Report

> Historical investigation artifact. Captures the evidence and recommendation from an earlier direction study. References to `ADV_DISABLE_TEMPORAL` describe the session state at the time of that investigation, not the current runtime contract.

## Executive Summary

This investigation does **not** support retiring the local legacy storage path.

Current evidence says:

1. The user-felt live slowness in this session was **not** caused by Temporal, because `ADV_DISABLE_TEMPORAL=1` was set (verified via `env | grep ADV_DISABLE_TEMPORAL`) and `adv_status` reported `worker_alive: false` with `registered_queues: []`, confirming no ADV worker was online.
2. The largest measured live storage/tool hotspot was `adv_status`, and its hot-path cost is now reduced to sub-millisecond steady-state after the focused fixes in this change.
3. Temporal remains materially slower for interactive hot-path state access: earlier isolated benchmark work measured roughly **9–15ms p50 per round-trip** for healthy local Temporal query/update operations.
4. JSONL primitives are fast, but they do **not** clearly outperform the optimized current local path enough to justify making JSONL the new primary source of truth.

**Recommended direction:** keep a **local-first** store as the primary interactive source of truth. The leading candidate is still **SQLite-backed local state** (with the existing JSON/change-file compatibility layer), not Temporal-primary and not JSONL-primary.

## What We Measured

### Current live ADV path

See `../live-adv-latency.md`.

Current measured values in this worktree/session:

| Operation | p50 | p95 |
| --- | ---: | ---: |
| `store.init` | 8.8ms | 8.8ms |
| `adv_status` | 0.7ms | 0.8ms |
| `adv_change_show` | 0.1ms | 0.2ms |
| `adv_task_list` | 0.2ms | 0.2ms |

Interpretation:
- The local hot path is now extremely fast.
- The current storage layer is **not** the best explanation for any remaining seconds-long waits.
- Any remaining user-perceived delay is more likely in plugin startup, retry/outlier behavior, or model/orchestration time.

### JSONL primitives

See `local-storage-comparison.md`.

Measured JSONL primitives in this repo:

| Candidate | Operation | p50 | p95 |
| --- | --- | ---: | ---: |
| JSONL | `agenda.add` | 0.4ms | 0.6ms |
| JSONL | `agenda.load` | 0.5ms | 2.5ms |
| JSONL | `wisdom.add` | 0.3ms | 0.7ms |
| JSONL | `wisdom.load` | 0.5ms | 3.0ms |

Interpretation:
- JSONL append/load is fast at current scale.
- But the current optimized local path is also already in the same low-ms / sub-ms class for representative ADV operations.
- Raw speed alone is not enough reason to promote JSONL to primary state.

### Temporal steady-state

From earlier investigation and isolated local benchmark work in this change:

| Operation | p50 | p95 |
| --- | ---: | ---: |
| Temporal query | ~9.1ms | ~10.3ms |
| Temporal update | ~11.2–14.7ms | ~15.4–17.0ms |

Interpretation:
- Temporal is viable, but materially slower for interactive hot-path state access.
- It may still be appropriate as an orchestration/durability layer for the right workload.
- It is a weak fit as the primary source of truth for low-latency local ADV interactions.

## What This Means

## 1. Current problem statement changed

The original suspicion was: “ADV is slow because Temporal slowed us down.”

The investigation now says:

> The current live slowdown was not Temporal in this shell.

Temporal may still be the wrong long-term hot-path architecture, but it was a red herring for the immediate live complaint.

## 2. The current optimized local path is already very good

After the focused fixes in this change:
- wrapper-level timing exists
- plugin-init phase timing exists
- `adv_status` skips Temporal health/migration work when disabled
- repeated status doctor work is cached briefly
- redundant gate refetches are gone in change/status/gate tools

The result is that the current local path now performs well enough that a large storage rewrite needs much stronger justification than “JSONL looks fast” or “Temporal is slower than JSON.”

## 3. JSONL is a good **secondary** pattern, not yet the default primary answer

JSONL’s strengths here:
- append-only audit trail
- simple durable log
- fast append/load at the scales measured

JSONL’s costs if promoted to primary ADV state:
- replay/snapshot model becomes mandatory
- compaction policy becomes mandatory
- projection/index layer likely needed for rich queries
- cross-session correctness depends on good locking + rebuild semantics

Given the current measured performance of the optimized local path, JSONL is better justified as:
- a secondary audit/export format
- or a targeted append-only subsystem

not automatically as the primary source of truth for changes/tasks/gates.

## 4. SQLite-first remains the strongest local-first candidate

Why:
- strong same-host durability through WAL
- rich queries and indexing
- better fit for shared external-state semantics
- lower projection complexity than JSONL-primary
- current repo already depends on and understands its failure modes

The remaining risks are known and bounded:
- lock contention under multi-instance use
- checkpoint tuning
- keeping doctor/integrity work off hot paths

These are easier to manage than rebuilding primary ADV state around replay + projection.

## Recommended Next Direction

### Recommendation

1. **Keep local-first storage as the primary interactive source of truth.**
2. **Do not retire the legacy path.**
3. **Do not promote JSONL to primary state based on current evidence.**
4. **Demote or remove Temporal-primary for interactive hot-path state unless a new concrete requirement justifies it.**

### Why

- It matches measured performance.
- It matches the repo’s actual same-host worktree/shared-state needs.
- It avoids a large rewrite whose performance upside is now weak.
- It keeps the system reversible and understandable.

## Recommendation for `retireLegacyStorageBackend`

**Recommendation: supersede it.**

Reason:
- The premise behind that draft — that legacy/local storage should be retired — no longer matches the evidence.
- The investigation points in the opposite direction: local-first should remain primary, and the questionable roadmap item is Temporal-primary, not legacy-primary.

Suggested replacement change direction:
- `demoteTemporalPrimaryHotPath`
- or `reconsiderTemporalPrimaryStorage`
- or `removeUnusedTemporalPrimaryPath`

The exact follow-up can be chosen later, but `retireLegacyStorageBackend` should not remain the default roadmap assumption.

## Open Questions Still Worth Investigating

1. What fraction of remaining perceived delay is model/orchestration time vs plugin-init time?
2. How often do real users actually benefit from Temporal’s additional durability/orchestration semantics?
3. Should the Temporal path remain available behind a feature flag, or be removed entirely if unused?
4. Is there still value in a JSONL audit/export stream for postmortem or compliance-style investigation, even if it is not primary?

## Bottom Line

The evidence does **not** support a storage rewrite away from the current local-first path.

It supports this instead:

> keep local-first primary, keep JSONL as a useful supporting pattern, and re-evaluate whether Temporal should stay in the interactive hot path at all.
