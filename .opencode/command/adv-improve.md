---
name: adv-improve
description: Suggest targeted improvements to existing specs or implementation
---
<!-- manifest: adv-improve · requiresChangeId: false -->

# ADV Improve — Analyze Improvement Opportunities

Evidence-backed improvement analysis across current-state gaps, LBP/reference architecture, and external landscape. Persists research pack under `docs/*-prep.md`. Does not mutate ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-improve")` → target resolution, scan categories, LBP comparison, external landscape, synthesis, research pack schema. If unavailable, use fallback below.

Fallback: run phases in this file; cap findings; cite evidence; write only `docs/*-prep.md`; never create ADV changes/tasks/gates/specs.

## Command Boundary

**Produces:** improvement report + `docs/{target-slug}-prep.md` research pack.

**× MUST NOT:** create changes, tasks, gates, spec deltas, agenda items, or mutate ADV state. × MUST NOT write outside `docs/*-prep.md`.

**Gate:** none. Read-only for ADV state.

> **CHECKLIST**: Follow `docs/checklists/improve-checklist.md`.

## Target Resolution

`$ARGUMENTS` optional:

| Invocation | Mode |
|---|---|
| No args | broad repo-wide scan |
| With target | scoped scan of file / directory / capability / symbol / concept |

Resolve in order: file path → read; directory → outline; symbol → `lgrep_search_symbols`; concept → `lgrep_search_semantic`. Ask via `question` only when interpretations materially differ.

## Exits

| Exit | Condition |
|---|---|
| ✅ Report | analysis emitted; research pack persisted |
| 🎤 Clarify | target too ambiguous |
| ⚠ Partial | external tool unavailable; report + pack annotate gaps |

---

## Phase 1: Context Loading

Load `adv_project_context`, `adv_change_list`, `adv_agenda_list`, `adv_spec action: "list"`. Detect worktree, stack files, and source roots (`src/`, `lib/`, `app/`, `packages/`, `*.ts/*.js/*.py/*.go`). Exit cleanly if no source files.

---

## Phase 2: Current-State Scan

Analyze 6 categories from skill/checklist; cap 5 findings each: Security, Reliability, Testing, Observability, Developer Experience, Code Quality.

Every finding MUST have evidence: file path, searched path, or source citation.

---

## Phase 3: LBP / Reference Comparison

Use `context7_resolve-library-id` then `context7_query-docs` for detected stack. Fallback to `webfetch` canonical docs. If unavailable, use local conventions and annotate `[Reference: local conventions — Context7/webfetch unavailable]`.

Build deviation table: `SOUND` / `DRIFTED` / `ANTI-PATTERN`, source citation, wrong path, correct pattern, minimum viable fix, greenfield note.

---

## Phase 4: External Landscape

Use `kagi_kagi_search_fetch` queries: `"{domain} alternatives comparison {current-year}"`, `"{domain} emerging tools trends {current-year}"`.

Extract top-3 competitors + 2 emerging patterns max. Each entry needs source URL, one-sentence summary, relevance. If unavailable/no relevant results, state reason; do not fabricate.

---

## Phase 5: Synthesis

Deduplicate against active changes and agenda. Sort CRITICAL → HIGH → MEDIUM → LOW → GREENFIELD.

Emit **IMPROVEMENT ANALYSIS** with Current State, Architecture, External Landscape, Summary, top 3 recommendations, health signal, and next commands: `/adv-proposal <summary>`, `/adv-task`, `/adv-audit`, `/adv-tron`.

No significant issues → emit **PRODUCTION READY** with positive findings by category.

---

## Phase 6: Persist Research Pack

Write/update repo-local pack:

- broad → `docs/repo-improve-prep.md`
- scoped → `docs/{target-slug}-prep.md`
- slug collision with different target → append `-2`, `-3`, …

Required sections, in order: Header, Purpose & Scope, Current State, LBP / Reference Comparison, Competitors & Alternatives, Emerging Patterns, Applicability to This Repo, Open Questions for Research, Sources.

If section cannot refresh, mark `⚠ not refreshed ({reason})` and preserve prior content below. Never fabricate sources. × Do NOT write outside `docs/*-prep.md`.

---

## Constraints

- No ADV state mutation.
- Only write: research pack under `docs/*-prep.md`.
- No change/agenda creation; suggestions only.
- Bounded: 5 findings/category, 3 competitors + 2 patterns.
- Evidence required; reject evidence-free findings.
- Fallback/unavailability notes MUST appear in report and pack.

## Key Tools

| Purpose | Tool |
|---|---|
| Context | `adv_project_context`, `adv_change_list`, `adv_agenda_list`, `adv_spec` |
| Code | `lgrep_search_semantic`, `lgrep_search_symbols`, `lgrep_get_file_tree`, `read` |
| Reference | `context7_resolve-library-id`, `context7_query-docs`, `webfetch` |
| External | `kagi_kagi_search_fetch` |
| Persist | `write` / `morph_edit` under `docs/*-prep.md` |
