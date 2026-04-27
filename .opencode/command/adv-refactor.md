---
name: adv-refactor
description: Refresh a stale proposal or batch-refresh the oldest 30% of active changes
---
<!-- manifest: adv-refactor · requiresChangeId: false · prereqs: [adv-proposal] -->
# ADV Refactor — Refresh Stale Proposals
Bidirectional reconciliation: update stale change proposals to match current codebase reality.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Parse Flags
`change-id` (optional — omit to enter batch mode), `--execute` (apply changes; default: dry-run), `--interactive` (approve per category), `--force` (skip recent-modification warnings).
## Target Resolution
1. If change-id provided → single-target mode, use directly. Skip to **Pre-flight**.
2. If omitted → **batch mode**:
   1. Run `adv_status` first → display the project overview to the user (specs, active changes, recommendations).
   2. From `adv_change_list` (excluding archived/closed), sort active changes by last activity ascending (stalest first). Use `_contextSnapshot.lastActivity` from `adv_change_show` if list ordering is ambiguous.
   3. Compute `N = max(1, ceil(activeCount * 0.30))` — the oldest 30% by last activity.
   4. Announce the batch via `[ADV:WORK]`: list the `N` selected change-ids with their staleness band (⏰ stale / ⏳ warm) and ages.
   5. For each target in stalest-first order, run **Pre-flight → Phase 1 → Phase 2 → Phase 3 (if `--execute`) → Phase 4** as defined below.
   6. **Continue on failure**: if any phase throws or `adv_change_validate` fails for one change, log the error and proceed to the next target. Do not abort the batch.
   7. After all targets complete, emit a single aggregate **Final Report** covering every processed change, including any failures.
   8. The `--execute` flag is honored **globally** across the batch — dry-run for all, or apply for all.
## Pre-flight
`adv_change_show` + `adv_task_list` → use returned proposal/problem context for scope (× don't read `proposal.md` directly). Worktree context: `pwd` → record `{workdir}`, include in all sub-agent prompts.

---
## Phase 1: Staleness Analysis (3 Parallel Sub-Agents)
Spawn `explore` × 3. Each receives `WORKING DIRECTORY: {workdir}`.
### Sub-Agent 1: Drift Scanner (includes task validation)
3-pass detection: EXACT (SHA-256 hash, 100%), METADATA (filename+size+first 1KB, 70%), FUZZY (similarity distance, 80-90%). Also validate task file/function references → flag orphaned tasks and invalid paths.
### Sub-Agent 2: Obsolescence Detector
Detect requirements already implemented elsewhere. Exclude tests/mocks/legacy. Prioritize passing tests as evidence. Confidence: HIGH/MEDIUM/LOW.
### Sub-Agent 3: Conflict Scanner
Find overlaps with archived changes. Filter by matching capabilities, focus on recent archives (last 20%), compare requirement intent.
### Inline: Dependency Check
After sub-agents return, orchestrator checks stale deps via Context7 (`context7_resolve-library-id` → `context7_query-docs` for breaking changes). Runs inline because `explore` lacks Context7.

---
## Phase 2: Synthesis & Intent Verification
> Anti-Loop: `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.

Combine drift, deps, conflicts, tasks, obsolescence findings.

**Intent verification:** If code contradicts requirement → `[ADV:ATTN]` → ask via `question`: "New requirement" (update spec) or "Bug in code" (keep spec, flag code).

---
## Phase 3: Refactoring (Under Contract)
Skip if dry-run (no `--execute`).

Proceed with updates:
1. **Path alignment** — update all occurrences of moved files in proposal, deltas, tasks
2. **Intent guard** — add comment when requirement updated: `> Refactored: aligned with implementation in {file}`
3. **Obsolescence** — mark `[OBSOLETE]` with implementation location (don't delete)
4. **Task derivation** — `adv_task_add` for validation tasks

---
## Phase 4: Validation
`adv_change_validate strict: true` → fix formatting issues → retry once.

---
## Final Report
Emit REFACTOR REPORT: staleness summary (age, drift count, outdated deps, obsolete requirements).

If dry-run → list what would change. If executed → list changes by confidence (HIGH applied, MEDIUM/LOW need manual review), validation status. Include rollback: `git restore .`

**Batch mode**: aggregate per-change subsections under one report. Group by outcome — `Updated`, `Dry-run preview`, `Failed` (with error class) — and surface the staleness band for each entry. Recommend follow-up commands per change.
```
/adv-refactor {change-id | batch:N} COMPLETE
Result: {Dry run | N changes applied | M of N targets succeeded}
Next: /adv-review or /adv-apply
```

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Analysis | Task tool (explore × 3) |
| Add task | `adv_task_add` |
| Validate | `adv_change_validate` |
| Dep check | `context7_resolve-library-id`, `context7_query-docs` |
