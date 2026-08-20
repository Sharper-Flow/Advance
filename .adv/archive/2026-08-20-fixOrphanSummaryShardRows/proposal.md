## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


## Summary

Make `adv status --json` refuse to emit a change row that has no valid canonical record behind it. Today it lists from summary shards alone, so a shard that outlives its canonical record becomes a permanent phantom entry.

## Root Cause Analysis

### Causal path

1. `bin/lib/live-status.ts:170-194` builds the active-change list by enumerating `summaries/<id>/` shards and reading each shard's `current.json`.
2. The shard is a *projection*. It is written by `publishSummaryForChange` (`change-summary-shard.ts:233-262`) at mutation time and is never re-validated against its canonical source afterwards.
3. The canonical record — `changes/<id>/change.json` — can subsequently become unreadable-as-canonical through at least four independent routes: never migrated from the legacy flat `changes/<id>.json` shape, moved to `.adv/quarantine/` by the projection quarantine path, failing `ChangeSchema.parse` because a field exceeds a lane bound, or absent entirely.
4. None of those routes retract or invalidate the summary shard.
5. The shard therefore keeps answering "this change is active" after the canonical record has stopped being able to say anything at all.

The invariant that is missing: **a summary shard must not be treated as evidence of an active change unless its canonical record loads and validates.** The shard is downstream state being read as upstream authority.

### Why the plugin store disagrees

The plugin store reads canonical records directly and applies `ChangeSchema`. That is why it returns 7 and the CLI returns 10 — the two readers use different sources for the same question, and only one of them validates. The disagreement is the observable symptom of the missing invariant.

### Why `adv reconcile` does not cover this

Verified read-only on 2026-08-19, `plan_hash` `bfc7f56faab31d9aa811571123a39551429dfe662ac70bed5173500213de0294`, 218 records:

- 112 records carry `normalize_and_restore`, but their `source_path` values sit under `changes/` while the executor requires paths under `.adv/quarantine/` (`reconcile-action-quarantine.ts:87-92`). Every one fails at the path guard before touching disk, and because `writeBeforeState` is only reached past that guard, they produce no recovery artifact either.
- 90 `rebuild_summary_shard` actions fail with `canonical_projection_missing` or `canonical_projection_unparseable` — they need the canonical record that is exactly what is broken here.
- Expected terminal state is exit 5, partial_failure, with approximately zero useful mutations against the four IDs.

So the residue path plans work it cannot execute, and the emit path never asks whether the record is real. Repairing store contents by hand would clear today's four ghosts and prevent none of the next ones.

### Rejected: fix it in the consumer

`zellij-project-launcher` could drop rows whose `changes/<id>/change.json` is missing or unparseable. Rejected: it encodes an ADV store-layout invariant in a bash consumer, leaves every other consumer of `adv status --json` still wrong, and drifts silently the next time the store layout moves.

## Direction

Validate before emit. `adv status --json` and the launcher-state projection should load the canonical record for each candidate shard and drop the row when it is missing, legacy-shaped, quarantined, or schema-invalid — surfacing those as residue rather than as work.

Two questions to settle in discovery and design:

- Silent drop versus explicit residue reporting. A silently dropped row is invisible corruption; a reported one is actionable. Reporting is likely correct, but it must not push residue noise into the launcher's work list.
- Whether the same validation belongs at shard *write* time, so the divergence cannot open in the first place, or only at read time. Read-time validation fixes the symptom for every existing store; write-time closes the source. They are not exclusive.

## Evidence

- Reproduction: `adv status --json` from `/home/jon/toolbox` → 10 rows; plugin store → 7; launcher `--adv-changes` → identical 10.
- Shard reader: `bin/lib/live-status.ts:170-194`.
- Shard writer: `change-summary-shard.ts:233-262`.
- Quarantine guard blocking reconcile: `reconcile-action-quarantine.ts:87-92`.
- Quarantine audit record for `noteConcordStageInventory`: `.adv/change-projection-quarantine-audit.jsonl`, `schema_error`, 2026-08-02T00:54:19Z.
