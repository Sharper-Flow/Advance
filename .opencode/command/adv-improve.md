---
name: adv-improve
description: Suggest targeted improvements to existing specs or implementation
---
# ADV Improve — Analyze Improvement Opportunities
Produce evidence-backed improvement analysis across three dimensions: current-state gaps, LBP/reference architecture comparison, and external landscape (competitors, alternatives, emerging patterns). Read-only utility command — never mutates ADV state.

## Command Boundary
**Produces:** Improvement analysis report with findings, evidence, severity, and suggested next commands.

**× MUST NOT:** Create changes, create tasks, complete any gates, or mutate any other ADV state.

**Gate:** None. Read-only utility command.

> **CHECKLIST**: Follow [docs/checklists/improve-checklist.md](../../docs/checklists/improve-checklist.md).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution
`$ARGUMENTS` is optional. Two modes:
| Invocation | Mode |
|------------|------|
| No args | Broad repo-wide improvement scan |
| With target | Scoped scan of file / directory / capability / symbol / concept |

Target resolution: file path → read directly, directory → outline, symbol name → `lgrep_search_symbols`, concept → `lgrep_search_semantic`. If ambiguous → fall back to closest concrete target or broad mode. Ask via `question` only if multiple interpretations would materially differ.

## Exits
| Exit | Condition |
|------|-----------|
| ✅ Report | Analysis completed; improvement report emitted |
| 🎤 Clarify | Target too ambiguous to produce meaningful scan |
| ⚠ Partial | External tool (Context7 or Kagi) unavailable; partial report emitted with annotation |

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

| Category | Cap |
|----------|-----|
| Security | 5 |
| Reliability | 5 |
| Testing | 5 |
| Observability | 5 |
| Developer Experience | 5 |
| Code Quality | 5 |

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

## Constraints
- Read-only — × never writes files or mutates ADV state
- × No change creation — user decides follow-up
- × No agenda creation — suggestions in human-readable form only
- Bounded: 5 findings per category (Phase 1), 3+2 cap (Phase 3)
- Evidence required for every finding; evidence-free findings are rejected
- Fallback required for each external tool; never silently omit a phase

---

## Key Tools
| Purpose | Tool |
|---------|------|
| Context | `adv_project_context`, `adv_change_list`, `adv_agenda_list`, `adv_spec` |
| Code | `lgrep_search_semantic`, `lgrep_search_symbols`, `lgrep_get_file_tree`, `read` |
| Reference | `context7_resolve-library-id`, `context7_query-docs` |
| External | `kagi_search_fetch` |

---

## Output
```
/adv-improve [target] COMPLETE
Result: {N findings | Production ready}
State Mutation: none
Next: {suggested commands}
```
