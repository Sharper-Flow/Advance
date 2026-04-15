---
name: adv-improve
description: Suggest improvements and persist a competitor research pack for /adv-discover reuse
---

# ADV Improve — Analyze Improvement Opportunities

Produce evidence-backed improvement analysis across three dimensions: current-state gaps, LBP/reference architecture comparison, and external landscape (competitors, alternatives, emerging patterns). Persists a reusable research pack under `docs/*-prep.md` so `/adv-discover` and related research phases can cite and extend the findings without re-running web searches. Does not mutate ADV state.

## Command Boundary

**Produces:** Improvement analysis report with findings, evidence, severity, and suggested next commands, plus a persisted research pack at `docs/{target-slug}-prep.md` (overwrites or extends an existing file of the same name).

**× MUST NOT:** Create changes, create tasks, complete any gates, write spec deltas, or mutate any other ADV state. × MUST NOT write files outside `docs/*-prep.md`.

**Gate:** None. Read-only with respect to ADV state; the only permitted write is the research pack artifact.

> **CHECKLIST**: Follow [docs/checklists/improve-checklist.md](../../docs/checklists/improve-checklist.md).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

`$ARGUMENTS` is optional. Two modes:

| Invocation  | Mode                                                            |
| ----------- | --------------------------------------------------------------- |
| No args     | Broad repo-wide improvement scan                                |
| With target | Scoped scan of file / directory / capability / symbol / concept |

Target resolution: file path → read directly, directory → outline, symbol name → `lgrep_search_symbols`, concept → `lgrep_search_semantic`. If ambiguous → fall back to closest concrete target or broad mode. Ask via `question` only if multiple interpretations would materially differ.

## Exits

| Exit       | Condition                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Report  | Analysis completed; improvement report emitted and research pack persisted at `docs/{target-slug}-prep.md`                                                  |
| 🎤 Clarify | Target too ambiguous to produce meaningful scan                                                                                                             |
| ⚠ Partial  | External tool (Context7 or Kagi) unavailable; partial report emitted with annotation. Research pack still persisted with the unavailable section(s) marked. |

---

## Phase 0: Context Loading

1. `adv_project_context` → extract purpose, stage, constraints
2. `adv_change_list` → detect active/archived changes that overlap findings
3. `adv_agenda_list` → detect already-planned improvements (do not re-surface)
4. `adv_spec action: "list"` → identify relevant capability specs
5. Detect worktree via `pwd`
6. Detect tech stack from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`
7. Verify source files exist (`src/`, `lib/`, `app/`, `packages/`, or `*.ts/*.js/*.py/*.go`) → exit cleanly if none

---

## Phase 1: Current-State Scan

Analyze across 6 categories. Cap: **5 findings per category**. Every finding MUST have evidence (file path, searched path, or source citation). See [improve-checklist.md](../../docs/checklists/improve-checklist.md) for category focus areas and evidence rules.

| Category             | Cap |
| -------------------- | --- |
| Security             | 5   |
| Reliability          | 5   |
| Testing              | 5   |
| Observability        | 5   |
| Developer Experience | 5   |
| Code Quality         | 5   |

---

## Phase 2: LBP / Reference Comparison

1. Use `context7_resolve-library-id` → `context7_query-docs` for canonical architecture of detected stack
2. Build deviation table: for each area, classify as `SOUND` / `DRIFTED` / `ANTI-PATTERN` with source citation
3. Document corrections for DRIFTED/ANTI-PATTERN findings: what's wrong (file paths), what's correct (source), minimum viable fix
4. Include greenfield perspective: what would change rebuilding from scratch?

**Fallback:** If Context7 is unavailable → use local codebase conventions and annotate each finding with `[Reference: local conventions — Context7 unavailable]`. Do not fabricate canonical sources.

---

## Phase 3: External Landscape

Detect project domain from Phase 0 context. Run two targeted searches:

1. `kagi_search_fetch queries: ["{domain} alternatives comparison {year}", "{domain} emerging tools trends {year}"]`
2. Extract: **top-3 competitors** (name, what they do differently, relevance to this project) and **2 emerging patterns** (name, why noteworthy, maturity signal)
3. Every entry MUST include: source URL, one-sentence summary, relevance

Hard cap: 3 competitors + 2 emerging. Do not exceed.

**Fallback:** If Kagi is unavailable or returns no relevant results → emit `External landscape analysis unavailable: {reason}` and skip. Do not fabricate entries.

---

## Phase 4: Synthesis

1. Deduplicate against active changes and agenda items (from Phase 0)
2. Sort all findings by severity: CRITICAL → HIGH → MEDIUM → LOW → GREENFIELD
3. Emit **IMPROVEMENT ANALYSIS** report:
   - **Current State:** findings by category with evidence, severity, impact
   - **Architecture:** deviation table, corrections (CRITICAL/HIGH), greenfield changes
   - **External Landscape:** competitors table, emerging patterns, or unavailability note
   - **Summary:** counts by severity, top 3 recommendations, architecture health signal
4. Suggest next commands: `/adv-proposal <summary>`, `/adv-task`, `/adv-audit`, `/adv-tron`

If no significant issues → emit **PRODUCTION READY** assessment with positive findings per category.

---

## Phase 5: Persist Research Pack

Write (or update) a repo-local research pack so downstream research phases (`/adv-discover`, `/adv-proposal` knowledge-gap analysis, `/adv-research`-style work) can cite it as prior research instead of re-running web searches.

### File path

- Broad scan → `docs/repo-improve-prep.md`
- Scoped scan → `docs/{target-slug}-prep.md` where `{target-slug}` is the kebab-cased target (file stem, capability, or concept). Strip path separators and extensions.
- Collisions with an existing prep file → **update in place**:
  - If the existing file documents the same target, overwrite it with the refreshed pack and bump the `Updated` date in the header.
  - If the existing file documents a different target that happens to share the slug, append `-2` (then `-3`, …) to the new slug.

### Required artifact schema

Every research pack MUST contain these sections in this order:

| Section                     | Content                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                      | `# Research Pack: {title}` plus `Target:`, `Mode:` (broad/scoped), `Created:`, `Updated:` ISO dates                                                       |
| Purpose & Scope             | One paragraph: what this pack covers and what it deliberately does not cover                                                                              |
| Current State               | Mirror of the report's Current State section (findings by category with evidence)                                                                         |
| LBP / Reference Comparison  | Deviation table + corrections + greenfield notes, or `Context7 unavailable` annotation                                                                    |
| Competitors & Alternatives  | Top-3 competitors (name, what they do differently, source URL, relevance). Include "No relevant results" or "Kagi unavailable" explicitly when applicable |
| Emerging Patterns           | Up to 2 patterns (name, maturity signal, source URL, why noteworthy), or unavailability note                                                              |
| Applicability to This Repo  | Which competitor/alternative approaches would materially apply here and which do not — short bullets with references to local code paths                  |
| Open Questions for Research | Questions that `/adv-discover` or a future proposal should answer before committing to a direction                                                        |
| Sources                     | Flat list of every URL or Context7 library reference cited above                                                                                          |

The artifact is a **mirror** of the report findings plus the Applicability and Open Questions sections — never a replacement for the on-screen report.

### Hygiene

- Do not silently delete or truncate existing pack sections — if a section cannot be refreshed (e.g. Kagi unavailable on re-run), mark it `⚠ not refreshed ({reason})` and leave the prior content below.
- Do not fabricate sources or competitors to fill the table. Empty/unavailable sections are acceptable if labelled.
- × Do NOT write outside `docs/*-prep.md`. × Do NOT touch `.adv/**`, `plugin/**`, or change/spec state.

---

## Constraints

- No ADV state mutation — × never creates changes/tasks/gates/specs
- Only allowed write is the research pack under `docs/*-prep.md`
- × No change creation — user decides follow-up
- × No agenda creation — suggestions in human-readable form only
- Bounded: 5 findings per category (Phase 1), 3+2 cap (Phase 3)
- Evidence required for every finding; evidence-free findings are rejected
- Fallback required for each external tool; never silently omit a phase — the research pack MUST reflect the same unavailability notes the on-screen report does

---

## Key Tools

| Purpose   | Tool                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| Context   | `adv_project_context`, `adv_change_list`, `adv_agenda_list`, `adv_spec`        |
| Code      | `lgrep_search_semantic`, `lgrep_search_symbols`, `lgrep_get_file_tree`, `read` |
| Reference | `context7_resolve-library-id`, `context7_query-docs`                           |
| External  | `kagi_search_fetch`                                                            |
| Persist   | `write` / `morph_edit` — only under `docs/*-prep.md`                           |

---

## Output

```
/adv-improve [target] COMPLETE
Result: {N findings | Production ready}
ADV State Mutation: none
Research Pack: docs/{target-slug}-prep.md ({created|updated})
Next: {suggested commands}
```
