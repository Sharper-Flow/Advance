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
`change-id` (optional — omit to enter batch mode), `--execute` (apply changes; default: dry-run), `--interactive` (approve per category), `--force` (skip recent-modification warnings), `--include-hot` (batch mode only: include hot changes in candidate set; default: exclude), `--top <N>` (batch mode only: select exactly N stalest changes, overriding the 30% rule).
## Target Resolution
1. If change-id provided → single-target mode, use directly. Skip to **Pre-flight**.
2. If omitted → **batch mode**:
   1. Run `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })` — single tool call returns all active changes ordered oldest-first with `lastActivity`, `lastActivityAgeMinutes`, and `recencyBand` on every entry. If `--include-hot` is set, omit `excludeRecencyBands`.
   2. Compute `N = max(1, ceil(activeCount * 0.30))` — the oldest 30% by last activity. If `--top <N>` is set, use that value instead (capped at available count).
   3. Announce the batch via `[ADV:WORK]`:
      ```
      /adv-refactor batch mode
      Active: {total} · Hot excluded: {hotCount} · Selected: {N} (oldest {percent}% of {eligible} eligible)
      Oldest: {oldestId} ({oldestAgeMinutes}min ago, {recencyBand})
      Targets: {selectedIds}
      ```
   4. For each target in stalest-first order, run **Pre-flight → Phase 1 → Phase 2 → Phase 3 (if `--execute`) → Phase 4** as defined below.
   5. **Continue on failure**: if any phase throws or `adv_change_validate` fails for one change, log the error and proceed to the next target. Do not abort the batch.
   6. After all targets complete, emit a single aggregate **Final Report** covering every processed change, including any failures.
   7. The `--execute` flag is honored **globally** across the batch — dry-run for all, or apply for all.

   > **Why skip hot by default?** Hot changes (active within the last 60 minutes) are likely in-flight by another agent session. Refactoring them mid-flight creates a race condition where two agents edit the same proposal concurrently. The `--include-hot` flag is an explicit opt-in for this risk.
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
After sub-agents return, orchestrator checks stale deps via Context7 (`context7_resolve-library-id` then `context7_query-docs`) against library changelogs/release notes, falling back to `webfetch` when Context7 is absent. Runs inline because `explore` lacks documentation/web tools in some setups.

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


---
## Key Tools
| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Analysis | Task tool (explore × 3) |
| Add task | `adv_task_add` |
| Validate | `adv_change_validate` |
| Dep check | `context7_resolve-library-id` + `context7_query-docs` (`webfetch` fallback if absent) |
