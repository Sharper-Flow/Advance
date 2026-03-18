---
name: adv-refactor
description: Refresh a stale proposal to reflect current codebase state
agent: general
---

# ADV Refactor — Refresh Stale Proposals

Bidirectional reconciliation: update stale change proposals to match current codebase reality.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

`change-id` (required), `--execute` (apply changes; default: dry-run), `--interactive` (approve per category), `--force` (skip recent-modification warnings).

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool

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

After sub-agents return, orchestrator checks stale deps via Context7 (`resolve-library-id` → `query-docs` for breaking changes). Runs inline because `explore` lacks Context7.

---

## Phase 2: Synthesis & Intent Verification

> Anti-Loop: `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.

Combine drift, deps, conflicts, tasks, obsolescence findings.

**Intent verification:** If code contradicts requirement → `[ADV:MIC]` → ask via `question`: "New requirement" (update spec) or "Bug in code" (keep spec, flag code).

---

## Phase 3: Refactoring (Under Contract)

Skip if dry-run (no `--execute`).

Establish CONTRACT ACTIVE → apply updates:
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

```
/adv-refactor {change-id} COMPLETE
Result: {Dry run | N changes applied}
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
