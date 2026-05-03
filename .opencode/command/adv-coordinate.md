---
name: adv-coordinate
description: Detect and resolve conflicts across multiple active changes
---
<!-- manifest: adv-coordinate · requiresChangeId: false -->
# ADV Coordinate — Multi-Change Conflict Detection
Analyze active changes for file overlaps, semantic conflicts, and dependency cycles. Runs **inline** — no sub-agents.
## Pre-flight
`adv_change_list` → if no changes or only one → emit dashboard noting no coordination needed → stop.

Worktree context: `pwd` → record `{workdir}` for file reads.

---
## Phase 1: State Collection
For each active change: `adv_change_show` → extract affected files, requirements from deltas, task dependencies.

Build: changes → affected files map, file → owning change-ids map, change → requirements map.

---
## Phase 2: Analysis
1. **Overlap detection** — files modified by 2+ changes (hot files)
2. **Semantic conflicts** — same identifier targeted by different changes, incompatible actions (rename vs update, delete vs modify)
3. **Dependency cycles** — circular blocking between changes

---
## Phase 3: Report
Emit COORDINATION DASHBOARD: active change count with task progress and file counts, hot files (overlaps), semantic conflicts, dependency cycles, suggested sequence.
| Finding | Priority | Recommendation |
|---------|----------|----------------|
| Cycles | CRITICAL | Break dependency |
| Hot files (3+) | HIGH | Serialize — implement one first |
| Semantic conflicts | HIGH | Review both changes |
| Hot files (2) | MEDIUM | Coordinate modifications |

## Merge-Order Queue (Multi-Worktree)

When multiple changes are archived but not yet merged to the default branch,
`/adv-coordinate` can consult an **advisory merge-order queue** to suggest a
safe merge sequence.

**What it computes:** The queue reads `change_summaries` from the project
workflow (Temporal), filters to `status === "archived"`, and builds a
dependency graph based on `touched_files` overlaps. Changes archived earlier
that touch overlapping files are treated as prerequisites for later-archived
changes. The output is a topologically sorted list with `dependsOn` edges.

**How to use it:** The queue is advisory only — it does not auto-merge.
Users should invoke `/adv-archive` Phase 9 in the suggested order (earliest
in the queue first). Cycles are rare (only when archive timestamps are
identical AND files cross-overlap) and are reported explicitly.

**Cross-session reliability:** Because Temporal serializes
`change_summaries` writes, the queue reflects a consistent snapshot even when
multiple sessions archive changes concurrently.

**TODO:** Runtime wiring of `computeMergeOrder` into `/adv-coordinate` Phase 3
report is a follow-up task.

## Key Tools
| Purpose | Tool |
|---------|------|
| List changes | `adv_change_list` |
| Show change | `adv_change_show` |
