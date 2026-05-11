---
name: adv-refactor
description: "Stale proposal refresh methodology for single changes and stalest-batch ADV refactors"
keywords:
  [
    "adv",
    "refactor",
    "stale-proposal",
    "drift",
    "batch",
    "proposal-refresh",
    "dependency-check",
  ]
metadata:
  priority: medium
  source: adv-refactor-command
---

# ADV Refactor Skill

## Purpose

Methodology for `/adv-refactor`: reconcile stale proposals with current code and archived history. Command owns ADV mutations, sub-agent dispatch, and validation; skill owns selection and analysis rubric.

## Modes

| Mode | Trigger | Behavior |
|---|---|---|
| Single target | `change-id` provided | Refresh one change |
| Batch | no `change-id` | Select stalest active changes |

Flags:

- `--execute` — apply; default dry-run
- `--interactive` — approve per category
- `--force` — skip recent-modification warnings
- `--include-hot` — include hot recency band in batch
- `--top <N>` — override oldest 30% selection

## Batch Selection

Default excludes hot changes because another session may be actively editing them.

Selection algorithm:

1. List active changes sorted `stalest`.
2. Exclude hot unless `--include-hot`.
3. Compute `N = max(1, ceil(activeCount * 0.30))`.
4. If `--top <N>`, use that value capped at eligible count.
5. Process stalest-first.
6. Continue on per-change failure; aggregate at end.

Announce:

```text
/adv-refactor batch mode
Active: {total} · Hot excluded: {hotCount} · Selected: {N} (oldest {percent}% of {eligible} eligible)
Oldest: {oldestId} ({oldestAgeMinutes}min ago, {recencyBand})
Targets: {selectedIds}
```

## Pre-flight Packet

Use tool-loaded proposal/problem/task context; do not read ADV state files directly.

Every worker prompt includes:

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
MODE: {dry-run|execute}
EXPECTED OUTPUT: JSON findings
```

## Staleness Analysis

### Drift Scanner

Three passes:

| Pass | Evidence | Confidence |
|---|---|---|
| EXACT | SHA-256 hash match/mismatch | 100% |
| METADATA | filename + size + first 1KB | 70% |
| FUZZY | similarity distance | 80-90% |

Also validate task file/function references. Flag orphaned tasks and invalid paths.

### Obsolescence Detector

Detect requirements implemented elsewhere. Exclude tests, mocks, legacy scaffolding. Passing tests are strong evidence. Confidence: HIGH / MEDIUM / LOW.

### Conflict Scanner

Compare against archived changes, favor recent archives (last 20%). Match capabilities and requirement intent. Flag overlapping or superseded scope.

### Dependency Check

Run inline because some `explore` agents lack docs/web tools. Use Context7 first, `webfetch` fallback. Check changelogs/release notes for stale APIs or migration-relevant changes.

## Synthesis

Aggregate:

- path drift
- stale deps
- archived-change conflicts
- obsolete requirements
- orphaned/invalid task refs

Intent conflict rule: if code contradicts proposal requirement, ask user whether code is new requirement or bug. Do not silently rewrite intent.

## Execute Updates

Only under `--execute` and after intent conflicts resolved.

Allowed updates:

1. Path alignment across proposal, deltas, tasks.
2. Intent guard comment: `> Refactored: aligned with implementation in {file}`.
3. Obsolescence marker: `[OBSOLETE]` plus implementation location; do not delete.
4. Derived validation tasks when stale refs require follow-up.

## Validation

Run strict change validation. Fix formatting issues once, then retry. If still failing, report failure and continue batch.

## Report Schema

Single target report:

- staleness age
- drift count
- outdated deps
- obsolete requirements
- dry-run proposed changes or executed changes
- confidence grouping
- validation status
- rollback: `git restore .`

Batch report groups by outcome:

- `Updated`
- `Dry-run preview`
- `Failed` with error class

Include staleness band and follow-up commands per change.

## Constraints

- Command owns ADV state mutation.
- Dry-run default.
- Do not read ADV state files directly.
- Do not abort batch on single target failure.
- Do not silently resolve intent conflicts.
