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

**Minimum**: All 8 steps must be executed. Skipping a step requires explicit justification.

---

## 6-Category Scan

| Category | Focus Areas |
|----------|-------------|
| **Security** | Input validation, auth/authz, secrets management, dependency vulns, injection/XSS/CSRF |
| **Reliability** | Error handling/recovery, retry/circuit breakers, graceful degradation, fault isolation, timeouts |
| **Testing** | Organization/coverage, reliability/isolation, speed/parallelization, depth (unit→E2E→property) |
| **Observability** | Logging strategy, error tracking, metrics/monitoring, debugging, health checks |
| **Developer Experience** | Onboarding docs, local dev setup, contribution guidelines, test convenience, debug tooling |
| **Code Quality** | Consistent style, clear module boundaries, doc coverage, type safety, naming conventions |

Cap: **5 findings per category**. Prioritize by severity; drop lower-severity findings if cap reached.

---

## Evidence Rules

Every finding MUST include evidence. Findings without evidence are rejected before synthesis.

| Claim | Required Evidence |
|-------|------------------|
| "X exists" | File path + line number (if applicable) |
| "X missing" | Directories/patterns searched (e.g., `searched src/**/*.test.ts, found 0`) |
| "Pattern Y used" | 1–3 example file paths |
| "Config Z present" | Config file path + key |
| "Architecture A" | Context7 source URL or local file path |
| "Competitor B does X" | Source URL (from Kagi result) |

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| `CRITICAL` | Security vulns, data loss risk, instability |
| `HIGH` | Significant reliability/maintainability/velocity gaps |
| `MEDIUM` | Notable improvements with moderate impact |
| `LOW` | Minor enhancements |
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

| Situation | Handling |
|-----------|----------|
| Context7 unavailable | Use local codebase conventions. Annotate each deviation finding: `[Reference: local conventions — Context7 unavailable]`. Do not fabricate canonical sources. |
| Kagi unavailable | Emit `External landscape analysis unavailable: Kagi not reachable`. Skip Phase 3 entirely. Emit ⚠ Partial exit. |
| Kagi returns no relevant results | Emit `External landscape analysis: no relevant results for domain "{domain}"`. Do not fabricate competitors. |
| No source files found | Stop cleanly after Phase 0 with message: `No source files detected — improvement analysis requires at least one source directory`. |
| Ambiguous target | Fall back to broad repo scan. State the fallback choice. Ask via `question` only if two interpretations would lead to materially different analyses. |
| Finding overlaps active change | Annotate: `[Already in progress: {change-id}]`. Include in report; do not suppress. |
| Finding was addressed in archived change | Annotate: `[Previously addressed: {change-id}]`. Include as low-priority note. |
