# Improve Checklist

Referenced by `/adv-improve`. Enforces rigor to prevent shallow analysis passes that skip mandatory phases, fabricate evidence, or omit external landscape research.

> **Document-Only Enforcement**: All items are checked by the agent following `/adv-improve` command instructions. No machine-enforced validators exist for this checklist in the current version.

---

## Protocol Steps

Every `/adv-improve` invocation MUST execute each step and report results. Mark `[x]` when completed (even if no findings):

- [ ] **Context Loading (Phase 0)** — Load `adv_project_context`, `adv_change_list`, `adv_agenda_list`, `adv_spec`. Detect worktree and tech stack. Verify source files exist before proceeding.
- [ ] **Source Verification** — Confirm at least one source directory (`src/`, `lib/`, `app/`, `packages/`) or source file exists. Stop cleanly if none.
- [ ] **Current-State Scan (Phase 1)** — Analyze all 6 categories (security, reliability, testing, observability, DX, code quality). Cap at 5 findings per category. Every finding has evidence.
- [ ] **LBP / Reference Comparison (Phase 2)** — Context7 lookup for canonical architecture. Build deviation table. Document corrections for DRIFTED/ANTI-PATTERN. Include greenfield perspective.
- [ ] **External Landscape (Phase 3)** — Run 2 Kagi queries. Extract top-3 competitors and 2 emerging patterns. Source URL required per entry.
- [ ] **Evidence Validation** — Reject any finding that lacks a file path, searched path, or source citation before synthesis.
- [ ] **Conflict / Dedup Scan** — Cross-reference findings against active changes and agenda items from Phase 0. Annotate overlapping items; do not suppress them.
- [ ] **Synthesis (Phase 4)** — Sort by severity, emit report, suggest next commands.
- [ ] **Research Pack Persistence (Phase 5)** — Write or update a repo-local research pack at `docs/{target-slug}-prep.md` (or `docs/repo-improve-prep.md` for broad mode). Mirror Current State, LBP comparison, Competitors & Alternatives, Emerging Patterns, Applicability, Open Questions, and Sources so `/adv-discover` and related research phases can cite it.

**Minimum**: All 9 steps must be executed. Skipping a step requires explicit justification.

---

## 6-Category Scan

| Category                 | Focus Areas                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **Security**             | Input validation, auth/authz, secrets management, dependency vulns, injection/XSS/CSRF           |
| **Reliability**          | Error handling/recovery, retry/circuit breakers, graceful degradation, fault isolation, timeouts |
| **Testing**              | Organization/coverage, reliability/isolation, speed/parallelization, depth (unit→E2E→property)   |
| **Observability**        | Logging strategy, error tracking, metrics/monitoring, debugging, health checks                   |
| **Developer Experience** | Onboarding docs, local dev setup, contribution guidelines, test convenience, debug tooling       |
| **Code Quality**         | Consistent style, clear module boundaries, doc coverage, type safety, naming conventions         |

Cap: **5 findings per category**. Prioritize by severity; drop lower-severity findings if cap reached.

---

## Evidence Rules

Every finding MUST include evidence. Findings without evidence are rejected before synthesis.

| Claim                 | Required Evidence                                                          |
| --------------------- | -------------------------------------------------------------------------- |
| "X exists"            | File path + line number (if applicable)                                    |
| "X missing"           | Directories/patterns searched (e.g., `searched src/**/*.test.ts, found 0`) |
| "Pattern Y used"      | 1–3 example file paths                                                     |
| "Config Z present"    | Config file path + key                                                     |
| "Architecture A"      | Context7 source URL or local file path                                     |
| "Competitor B does X" | Source URL (from Kagi result)                                              |

---

## Severity Classification

| Level        | Criteria                                                     |
| ------------ | ------------------------------------------------------------ |
| `CRITICAL`   | Security vulns, data loss risk, instability                  |
| `HIGH`       | Significant reliability/maintainability/velocity gaps        |
| `MEDIUM`     | Notable improvements with moderate impact                    |
| `LOW`        | Minor enhancements                                           |
| `GREENFIELD` | Would differ in a clean rebuild; not necessarily a bug today |

---

## External Landscape Protocol

1. **Detect domain** — from README purpose, package name, or project description
2. **Run 2 Kagi queries:**
   - `"{domain} alternatives comparison {current-year}"`
   - `"{domain} emerging tools trends {current-year}"`
3. **Extract:**
   - Top-3 competitors: name, what they do differently, relevance to this project
   - 2 emerging patterns: name, why noteworthy, maturity signal (experimental / growing / mainstream)
4. **Evidence requirement:** every entry must include source URL from Kagi results
5. **Hard cap:** 3 competitors + 2 emerging. Do not exceed.

---

## Graceful Degradation

| Situation                                | Handling                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context7 unavailable                     | Use local codebase conventions. Annotate each deviation finding: `[Reference: local conventions — Context7 unavailable]`. Do not fabricate canonical sources. Research pack LBP section is still written with the same annotation.                         |
| Kagi unavailable                         | Emit `External landscape analysis unavailable: Kagi not reachable`. Skip Phase 3 on-screen but still write the research pack with `Competitors & Alternatives` and `Emerging Patterns` labelled `⚠ not refreshed (Kagi unavailable)`. Emit ⚠ Partial exit. |
| Kagi returns no relevant results         | Emit `External landscape analysis: no relevant results for domain "{domain}"`. Record the same string in the research pack's `Competitors & Alternatives` and `Emerging Patterns` sections. Do not fabricate competitors.                                  |
| No source files found                    | Stop cleanly after Phase 0 with message: `No source files detected — improvement analysis requires at least one source directory`. Do not create a research pack.                                                                                          |
| Ambiguous target                         | Fall back to broad repo scan. State the fallback choice. Ask via `question` only if two interpretations would lead to materially different analyses.                                                                                                       |
| Finding overlaps active change           | Annotate: `[Already in progress: {change-id}]`. Include in report; do not suppress.                                                                                                                                                                        |
| Finding was addressed in archived change | Annotate: `[Previously addressed: {change-id}]`. Include as low-priority note.                                                                                                                                                                             |
| Research pack path already exists        | Update in place: overwrite when the existing pack targets the same thing, bump `Updated:` date. Append `-2`, `-3`, … suffix only when a different target happens to share the slug.                                                                        |

---

## Research Pack Artifact Contract

The research pack written to `docs/*-prep.md` is a durable, repo-local artifact consumed by `/adv-discover`, `/adv-proposal` knowledge-gap analysis, and other research-phase commands. It MUST conform to this schema.

### Path rules

| Mode                        | Path                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad repo scan (no target) | `docs/repo-improve-prep.md`                                                                                                                   |
| Scoped scan                 | `docs/{target-slug}-prep.md` — kebab-case slug derived from the file stem, capability, symbol, or concept (no path separators, no extensions) |
| Slug collision              | Append `-2`, `-3`, … until unique                                                                                                             |

### Required sections (in order)

1. **Header** — `# Research Pack: {title}` with `Target:`, `Mode:` (broad/scoped), `Created:`, `Updated:` ISO-8601 dates.
2. **Purpose & Scope** — one paragraph: what this pack covers and what it deliberately does not.
3. **Current State** — mirror of the report's Current State findings with evidence.
4. **LBP / Reference Comparison** — deviation table + corrections + greenfield notes, or `⚠ not refreshed` annotation when Context7 was unavailable.
5. **Competitors & Alternatives** — up to 3 entries (name, what they do differently, relevance, source URL). Unavailability recorded explicitly, never fabricated.
6. **Emerging Patterns** — up to 2 entries (name, maturity signal, source URL, why noteworthy).
7. **Applicability to This Repo** — bullets mapping each competitor / alternative / emerging pattern to local code paths; call out which would materially apply and which would not.
8. **Open Questions for Research** — questions that `/adv-discover` or a future proposal should answer before adopting any external direction.
9. **Sources** — flat list of every URL or Context7 library reference cited above.

### Write boundary

- Only files matching `docs/*-prep.md` may be written.
- × No writes to `.adv/**`, `plugin/**`, `src/**`, or any other path.
- × No calls to `adv_change_create`, `adv_task_add`, `adv_gate_complete`, or any other ADV-state-mutating tool.

### Reuse expectation

- `/adv-discover` already scans `docs/*-prep.md` during its Prior Research Extension step — packs written here are picked up automatically.
- When re-running `/adv-improve` against the same target, refresh the existing pack in place (bump `Updated:`) rather than creating a sibling file.
