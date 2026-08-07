---
name: adv-triage
description: "Issue reconciliation, bug priority, overlap coalescing, and portfolio-balance methodology"
keywords: ["triage", "backlog", "portfolio", "github-projects", "prioritization", "epics"]
---

# Triage Skill — Issue Reconciliation & Portfolio Balance

## Purpose

Methodology for `/adv-triage`: reconcile source items into GitHub issues, apply bug priorities autonomously, coalesce approved issue↔change overlaps, and report what to finish, clean up, or start across active changes, Epics, and open issues.

GitHub Projects v2 owns issue/project membership. Disk-backed ADV changes and Epics own work-in-progress state. Legacy roadmap files/readers are retired; this skill has no file-write or git-commit phase.

**Canonical source:** `.opencode/command/adv-triage.md` owns orchestration and mutation. This skill owns rubrics, prompt templates, schemas, and anti-patterns.

## Supporting Docs

| Doc | Use |
|---|---|
| `BOOTSTRAP.md` | Project setup, labels, fields, repository-filter, seven-source inventory |
| `SCHEMA.md` | Inventory, cleanup, coalesce evidence, portfolio-balance shapes |
| `PROMPTS.md` | Tier B creation, cleanup, and coalesce prompts; bug-context questions |
| `WSJF.md` | Existing structural matching support only; no new score writes |
| `ANTI-PATTERNS.md` | Authority boundaries and prohibited roadmap behavior |

## Core Flow

1. **Bootstrap** — ensure labels + GH Projects v2 board + custom fields. Persist typed config; never overwrite existing `repository_filter`.
2. **Inventory** — gather open issues, project items, active ADV changes, active Epics, wisdom, notes, TODO/FIXME. Cap each source at 100; surface overflow.
3. **Match** — structural first: stable ref, exact body excerpt, then heuristic title candidate. Heuristics never suppress.
4. **Source cleanup validation** — classify the whole source pool before issue creation or bug priority. Batch destructive/suppressive approvals by source/reason.
5. **Confirm issue creation** — Tier B approval for cleanup-surviving unrepresented items. Create only approved issues; tag later promotion with `origin_kind:'triage'`.
6. **Bug priority loop** — the agent assigns `priority:*` autonomously after bounded context gathering (max 2 questions per bug); default medium + `context_insufficient` when unresolved.
7. **Coalesce** — exclude existing links, classify remaining issue↔change pairs as structural or heuristic, show bounded evidence, and link only displayed user-approved pairs with `adv_change_update_issues`.
8. **Portfolio balance** — emit exactly Important to complete, Cleanup needed, and Open issues worth solving. Important to complete includes every nonterminal ADV change with no linked GitHub issue, selected by typed change state rather than title or agent inference. Keep structural membership separate from the advisory `defectHint`: `origin.kind` yields source `origin_kind` and is primary, a `fix` title prefix yields source `title_prefix` and is secondary and weak, and any rendered hint includes its evidence source and affects ordering only. Include Epic ID/title/order as advisory context.
9. **Report** — include source counts, cleanup outcomes, created/prioritized issues, pair link outcomes, active Epics inspected, and three balance counts.

## Structural Rules

- P33: heuristics may rank or flag candidates; they never own linkage, cleanup, persistence, or suppression.
- Coalesce scope is active changes↔open issues. Change↔change duplicate handling stays with `/adv-cleanup`.
- Existing-link exclusion checks origin issue number, linked issue URLs, and typed Epic evidence before proposing a pair.
- `approve all` covers displayed pairs only; hidden overflow requires another batch.
- Cleanup validation runs before new issue creation and bug priority assignment.
- Bugs use `priority:*` labels only; no scoring-field writes.
- User questions gather bug context only; the agent owns priority choice.
- Epic order is advisory and never blocks work by itself.
- Unlinked-change membership is structural: typed nonterminal state plus typed absence of issue linkage; title similarity, title prefix, and agent inference never decide visibility.
- `defectHint` is advisory ranking only. `origin.kind` yields source `origin_kind` and is the primary source; a `fix` title prefix yields source `title_prefix` and is secondary and weak. Render the hint's evidence source, and keep its ordering weight strictly between `priority:low` and `priority:medium`.
- A defect hint must not filter, suppress, close, deprioritize, or authorize a mutation. `priority:*` labels and any parallel priority field remain GitHub-issue-scoped and are never written to an ADV change.

## Required Outputs

- Created GH issues retain source trailers.
- Each coalesce candidate includes evidence tier, bounded evidence, stable refs, and optional Epic context.
- Portfolio balance has exactly three sections, capped at 10 rows each with explicit overflow count.
- Rationale trailer `<issue#>: priority=<tier> :: <rationale>` appears in chat output only; never post it as an issue comment.
- No ROADMAP.md, snapshot, echo, commit, or push output exists.

## Hard Stops

- Missing GH authentication or required project/repo access.
- User rejects Tier B issue-creation, cleanup, or coalesce-link approval.
- Typed ADV change/Epic reads are unavailable where needed for authoritative state.
- A coalesce mutation would affect a hidden, unapproved, or structurally ambiguous pair.
