---
name: adv-improve
description: Analyze improvements across existing specs, implementation, and external landscape
---

# ADV Improve — Analyze Improvement Opportunities

Evidence-backed improvement analysis across current-state gaps, LBP/reference architecture, and external landscape. Persists research pack under `docs/*-prep.md`. Clarifies direction before `/adv-proposal` or `/adv-discover`; does not mutate ADV state or replace the tracked workflow for consequential deliverables.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-improve")` → target resolution, scan categories, LBP comparison, external landscape, synthesis, research pack schema. Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

## Command Boundary

**Produces:** improvement report + `docs/{target-slug}-prep.md` research pack.

**Handoff:** if the scoped work is a consequential non-code deliverable (market research, design improvement, competitive research, writing, analysis/planning, etc.), produce the pack, then route to `/adv-proposal` for a tracked ADV change. Do not deliver consequential work solely as a utility report.

**× MUST NOT:** create changes, tasks, gates, spec deltas, agenda items, or mutate ADV state. × MUST NOT write outside `docs/*-prep.md`.

**Persistence:** Deep research warrants disk persistence under `docs/{target-slug}-prep.md` for consequential deliverables.

**Gate:** none. Read-only for ADV state.

## Exits

| Exit | Condition |
|---|---|
| ✅ Report | analysis emitted; research pack persisted |
| 🎤 Clarify | target too ambiguous |
| ⚠ Partial | external tool unavailable; report + pack annotate gaps |
| 🔄 iterate | Useful progress on the analysis, but key evidence questions remain |

---

## Phase 1: Context Loading

Load `adv_project_context`, `adv_change_list`, `adv_spec action: "list"`. Detect worktree, stack files, and source roots (`src/`, `lib/`, `app/`, `packages/`, `*.ts/*.js/*.py/*.go`). Exit cleanly if no source files.

---

## Key Tools

| Purpose | Tool |
|---|---|
| Context | `adv_project_context`, `adv_change_list`, `adv_spec` |
| Code | lgrep semantic search, lgrep symbol search, lgrep file tree, `read` |
| Reference | Context7 resolve + query docs, `webfetch` |
| External | Exa web search |
| Persist | `write` / `morph_edit` under `docs/*-prep.md` |
