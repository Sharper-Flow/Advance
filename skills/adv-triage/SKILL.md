---
name: adv-triage
description: "Backlog reconciliation, WSJF scoring, and ROADMAP.md regeneration methodology"
keywords: ["triage", "backlog", "wsjf", "roadmap", "github-projects", "prioritization", "scoring"]
---

# Triage Skill — Backlog Reconciliation & WSJF Scoring

## Purpose

Methodology for `/adv-triage`: reconcile backlog sources into GH issues, score features via WSJF on a GH Projects v2 board, regenerate `ROADMAP.md` and `.adv/roadmap-snapshot.json`.

Storage of truth = GH Projects v2 typed fields. `ROADMAP.md` = generated mirror. Hybrid HITL: agent may fill RROE/TimeCriticality/Effort; user owns bug Priority + feature Value unless user chooses feature autofill.

**Canonical source:** `.opencode/command/adv-triage.md` owns orchestration and state mutation. This skill owns rubrics, formulas, prompt templates, schemas, and anti-patterns.

## Supporting Docs

| Doc | Use |
|---|---|
| `BOOTSTRAP.md` | Project setup, labels, field creation, `repository_filter` auto-detect |
| `SCHEMA.md` | Inventory records, GH Project fields, roadmap snapshot shape, typed config |
| `PROMPTS.md` | Tier B approval prompts, `question` tool prompts, roadmap commit prompts |
| `WSJF.md` | Match algorithm, user field assignment, agent scoring, WSJF formula |
| `ANTI-PATTERNS.md` | Coexistence rules, gotchas, hard prohibitions |

## Core Flow

1. **Bootstrap** — ensure labels + GH Projects v2 board + custom fields. Persist typed config; never overwrite existing `repository_filter`.
2. **Inventory** — gather GH issues, project items, active ADV changes, agenda, wisdom, notes, TODO/FIXME. Cap each source at 100; surface overflow.
3. **Match** — structural first: stable ref, exact body excerpt, then title-similarity candidate duplicate. Only exact ref/body matches auto-suppress creation.
4. **Confirm issue creation** — Tier B inline prompt for unrepresented items. Create only approved issues, label `bug|feature`, add to project, record source trailer.
5. **User fields** — use `question` tool for bug priority + feature Value. Stage batch-control first, then per-item prompts.
6. **Agent scoring** — assign TimeCriticality/RROE/Effort only when Value exists; compute `WSJF = (Value + TimeCriticality + RROE) / Effort` rounded 1 decimal.
7. **Render roadmap** — fresh project read, write both `ROADMAP.md` and `.adv/roadmap-snapshot.json`, echo full generated markdown in chat.
8. **Commit/push** — explicit Tier B prompt; stage only `ROADMAP.md .adv/roadmap-snapshot.json`; default branch only.
9. **Report** — include sources, created/updated/deferred counts, roadmap counts, local-source deprecations, API budget.

## Structural Rules

- P33: heuristics may classify, rank, or flag duplicates; they never own correctness or persistence.
- Bugs use `priority:*` labels only. No WSJF for bugs.
- Feature Value is user-owned unless user explicitly selects autofill.
- GraphQL writes parse `errors` even on HTTP 200 and respect `x-ratelimit-remaining`.
- `repository_filter` is first-run-only; manual edits are override path.
- `adv_roadmap source: 'file'` must see same repo scope as live reads.

## Quick Formulas

```text
Modified Fibonacci: 1, 2, 3, 5, 8, 13
WSJF = (Value + TimeCriticality + RROE) / Effort
Sort features: WSJF desc, Value desc, issue number asc
Sort bugs: critical → high → medium → low → unprioritized
```

## Required Outputs

- GH issues have source trailers for promoted local items.
- Agent-scored fields include `<!-- adv-triage:scoring v1 ... -->` evidence.
- `ROADMAP.md` and `.adv/roadmap-snapshot.json` come from one fresh final read.
- Phase 5.5 echoes full generated `ROADMAP.md` in chat; no top-N shortcut.

## Hard Stops

- Missing GH auth or insufficient GraphQL budget.
- User rejects Tier B creation/commit prompt.
- Current branch is not default branch for roadmap commit.
- Dirty tree contains files outside `ROADMAP.md` + `.adv/roadmap-snapshot.json` at commit step.
