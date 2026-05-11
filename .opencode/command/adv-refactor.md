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

## Phase 0: Load Skill

`skill("adv-refactor")` → batch selection, staleness analysis, drift/obsolescence/conflict scanners, intent verification, dry-run/execute report. If unavailable, use fallback below.

Fallback: select target(s), run three scanners, check deps inline, synthesize, ask on intent conflicts, optionally update under contract, validate.

## Parse Flags

`change-id` optional; `--execute` apply (default dry-run); `--interactive`; `--force`; `--include-hot`; `--top <N>`.

## Target Resolution

Single target: use given `change-id`.

Batch mode: `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })` unless `--include-hot`. Select `N = max(1, ceil(activeCount * 0.30))`, or `--top <N>` capped at eligible count. Announce `[ADV:WORK]` with active/hot/selected/oldest/targets. Process stalest-first. Continue on per-change failure. `--execute` applies globally.

## Pre-flight

`adv_change_show` + `adv_task_list`; use returned proposal/problem context only (× don't read proposal.md directly). Record `{workdir}` via `pwd`; include `WORKING DIRECTORY: {workdir}` in prompts.

---

## Phase 1: Staleness Analysis

Spawn `explore` × 3:

1. Drift Scanner — EXACT, METADATA, FUZZY; task reference validation.
2. Obsolescence Detector — implemented-elsewhere requirements; tests as evidence.
3. Conflict Scanner — overlaps with recent archived changes.

Inline dependency check: Context7 (`context7_resolve-library-id` → `context7_query-docs`) against changelogs/release notes; `webfetch` fallback.

---

## Phase 2: Synthesis & Intent Verification

> Anti-Loop: `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.

Combine drift, deps, conflicts, tasks, obsolescence. If code contradicts requirement → `[ADV:ATTN]` → ask via `question`: `New requirement` (update spec) or `Bug in code` (keep spec, flag code).

---

## Phase 3: Refactoring (Under Contract)

Skip if dry-run. If `--execute`:

1. Path alignment — update moved-file refs in proposal, deltas, tasks.
2. Intent guard — add `> Refactored: aligned with implementation in {file}`.
3. Obsolescence — mark `[OBSOLETE]` with implementation location; don't delete.
4. Task derivation — `adv_task_add` validation tasks.

---

## Phase 4: Validation

`adv_change_validate strict: true` → fix formatting issues → retry once.

---

## Final Report

Emit REFACTOR REPORT: age, drift count, outdated deps, obsolete requirements. Dry-run lists proposed changes. Executed lists changes by confidence (HIGH applied; MEDIUM/LOW manual review), validation status, rollback `git restore .`. Batch mode groups `Updated`, `Dry-run preview`, `Failed` with per-change follow-ups.

## Key Tools

| Purpose | Tool |
|---|---|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Analysis | Task tool (explore × 3) |
| Add task | `adv_task_add` |
| Validate | `adv_change_validate` |
| Dep check | `context7_resolve-library-id`, `context7_query-docs`, `webfetch` |
