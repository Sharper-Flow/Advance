---
name: adv-refactor
description: Refresh a stale proposal or batch-refresh the oldest 30% of active changes
---
# ADV Refactor — Refresh Stale Proposals

Bidirectional reconciliation: update stale change proposals to match current codebase reality.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-refactor")` → batch selection, staleness analysis, drift/obsolescence/conflict scanners, intent verification, dry-run/execute report.

Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

## Parse Flags

`change-id` optional; `--execute` apply (default dry-run); `--interactive`; `--force`; `--include-hot`; `--top <N>`.

## Target Resolution

Single target: use given `change-id`.

Batch mode: `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })` unless `--include-hot`. Select `N = max(1, ceil(activeCount * 0.30))`, or `--top <N>` capped at eligible count. Announce `[ADV:WORK]` with active/hot/selected/oldest/targets. Process stalest-first. Continue on per-change failure. `--execute` applies globally.

## Pre-flight

`adv_change_show include: { proposal: true, problemStatement: true, agreement: true, design: true }` + `adv_task_list`; use returned `_proposal` / `_problemStatement` / `_agreement` / `_design` or other returned context only (× don't read artifact files directly; × don't dereference `artifacts.*.path`). Record `{workdir}` via `pwd`; include `WORKING DIRECTORY: {workdir}` in prompts.

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
| Validate | `adv_change_show validate: true` |
| Dep check | Context7 resolve + query docs, `webfetch` |
