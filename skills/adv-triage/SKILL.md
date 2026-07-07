---
name: adv-triage
description: "Backlog reconciliation, bug priority assignment, and ROADMAP.md regeneration methodology"
keywords: ["triage", "backlog", "roadmap", "github-projects", "prioritization"]
---

# Triage Skill — Backlog Reconciliation & Bug Priority

## Purpose

Methodology for `/adv-triage`: reconcile backlog sources into GH issues, apply `priority:*` labels to bugs autonomously, and regenerate `ROADMAP.md` and `.adv/roadmap-snapshot.json`.

Storage of truth = GH Projects v2 typed fields for issue/project membership; bug priority labels act as the source of truth for issue ordering. `ROADMAP.md` = generated mirror. User questions gather bug context only; the agent owns priority assignment.

**Canonical source:** `.opencode/command/adv-triage.md` owns orchestration and state mutation. This skill owns rubrics, prompt templates, schemas, and anti-patterns.

## Supporting Docs

| Doc | Use |
|---|---|
| `BOOTSTRAP.md` | Project setup, labels, field creation, `repository_filter` auto-detect |
| `SCHEMA.md` | Inventory records, GH Project fields, roadmap snapshot shape, typed config |
| `PROMPTS.md` | Tier B approval prompts, context-gathering prompts, roadmap commit prompts |
| `WSJF.md` | Match algorithm only |
| `ANTI-PATTERNS.md` | Coexistence rules, gotchas, hard prohibitions |

## Core Flow

1. **Bootstrap** — ensure labels + GH Projects v2 board + custom fields. Persist typed config; never overwrite existing `repository_filter`.
2. **Inventory** — gather GH issues, project items, active ADV changes, agenda, wisdom, notes, TODO/FIXME. Cap each source at 100; surface overflow.
3. **Match** — structural first: stable ref, exact body excerpt, then title-similarity candidate duplicate. Only exact ref/body matches auto-suppress creation.
4. **Source cleanup validation** — classify the whole source pool before issue creation or bug priority assignment. Build `cleanup_decisions[]`; batch destructive/suppressive approvals by source/reason.
5. **Confirm issue creation** — Tier B inline prompt for cleanup-surviving unrepresented items. Create only approved issues, label `bug|feature`, add to project, record source trailer.
6. **Bug priority loop** — agent assigns `priority:*` labels autonomously. Bounded context budget (max 2 questions per bug); default to `medium` + `context_insufficient` label if context is insufficient.
7. **Render roadmap** — fresh project read, write both `ROADMAP.md` and `.adv/roadmap-snapshot.json`, echo full generated markdown in chat.
8. **Commit/push** — explicit Tier B prompt; stage only `ROADMAP.md .adv/roadmap-snapshot.json`; default branch only.
9. **Report** — include sources, cleanup decisions, created/updated/deferred counts, roadmap counts, local-source deprecations.

## Structural Rules

- P33: heuristics may classify, rank, or flag duplicates; they never own correctness or persistence.
- Cleanup validation runs before new GH issue creation and before bug priority assignment.
- Bugs use `priority:*` labels only. No scoring fields for bugs.
- User questions during bug priority assignment gather context only; the agent never asks the user to confirm or choose a priority.
- `repository_filter` is first-run-only; manual edits are override path.
- `adv_roadmap source: 'file'` must see same repo scope as live reads.

## Required Outputs

- GH issues have source trailers for promoted local items.
- `ROADMAP.md` and `.adv/roadmap-snapshot.json` come from one fresh final read.
- Phase 5.5 echoes full generated `ROADMAP.md` in chat; no top-N shortcut.
- Rationale trailer `<issue#>: priority=<tier> :: <rationale>` emitted in chat only; never as an issue comment.

## Hard Stops

- Missing GH auth or insufficient GraphQL budget.
- User rejects Tier B creation/commit prompt.
- Current branch is not default branch for roadmap commit.
- Dirty tree contains files outside `ROADMAP.md` + `.adv/roadmap-snapshot.json` at commit step.