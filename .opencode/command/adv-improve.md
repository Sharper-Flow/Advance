---
name: adv-improve
description: Suggest targeted improvements to existing specs or implementation
agent: general
---

# ADV Improve — Architectural Improvement Analysis

Perform **inline** architectural improvement analysis (no sub-agents). Uses Context7 for reference architecture lookups and direct file reads for codebase analysis.

Dual perspective:
1. **Current State** — gaps in the codebase today
2. **Greenfield** — what would be different rebuilding from scratch for pre-production launch

---

## Phase 0: Project Understanding

1. Read `README.md` / `AGENTS.md` (truncate to ~2000 chars if long)
2. Extract purpose, stage (startup/growth/mature/legacy), constraints
3. Emit PROJECT CONTEXT summary: purpose, source, stage, constraints

---

## Pre-flight

1. Verify source files exist (`src/`, `lib/`, `app/`, `packages/`, or `*.ts/*.js/*.py/*.go`) → stop if none
2. Detect tech stack from project files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.)

---

## Part 1: Current State Analysis

Analyze across **6 categories**:

| Category | Focus Areas |
|----------|-------------|
| Security | Input validation, auth/authz, secrets management, dependency vulns, injection/XSS/CSRF |
| Reliability | Error handling/recovery, retry/circuit breakers, graceful degradation, fault isolation, timeouts |
| Testing | Organization/coverage, reliability/isolation, speed/parallelization, depth (unit→E2E→property) |
| Observability | Logging strategy, error tracking, metrics/monitoring, debugging, health checks |
| Developer Experience | Onboarding docs, local dev setup, contribution guidelines, test convenience, debug tooling |
| Code Quality | Consistent style, clear module boundaries, doc coverage, type safety, naming conventions |

---

## Part 2: Architecture Health Assessment

### 2.1 Reference Architecture Lookup (CRITICAL)

Use Context7 (`context7_resolve-library-id` → `context7_query-docs`) to find canonical architecture for detected stack. Document: layer boundaries, dependency direction, separation of concerns, error handling, observability, config management, module organization. Cite sources.

### 2.2 Deviation Analysis

| Area | Existing | Reference | Classification | Source |
|------|----------|-----------|----------------|--------|
| Layer boundaries | {pattern} | {correct} | SOUND/DRIFTED/ANTI-PATTERN | {cite} |
| Dependency direction | ... | ... | ... | ... |
| Separation of concerns | ... | ... | ... | ... |
| Error handling | ... | ... | ... | ... |
| Observability | ... | ... | ... | ... |
| Module organization | ... | ... | ... | ... |

Classifications: `SOUND` (safe to extend), `DRIFTED` (accumulated inconsistencies), `ANTI-PATTERN` (fundamentally wrong).

### 2.3 Corrections

For each DRIFTED/ANTI-PATTERN: what's wrong (with file paths), what's correct (with source), why it matters, scope (TARGETED/INCREMENTAL/REWRITE), minimum viable correction.

Architecture corrections are NOT optional. ANTI-PATTERN = CRITICAL, DRIFTED = HIGH.

### 2.4 Greenfield Perspective

Evaluate: data model, API design, state management, module boundaries, dependency choices. What would change rebuilding from scratch?

### 2.5 Technical Debt

Identify: evolutionary cruft, framework lock-in, legacy support, premature abstractions, missing abstractions.

### 2.6 Launch Readiness

Check: error handling recovery paths, performance bottlenecks, security (rate limiting, auth, validation), operations (deploy/rollback confidence), monitoring (break detection).

---

## Evidence Requirements

Every finding MUST include evidence. Findings without evidence are rejected.

| Claim | Evidence |
|-------|----------|
| "X exists" | File path |
| "X missing" | Directories/patterns searched |
| "Pattern Y used" | 1-3 example file paths |
| "Config Z present" | Config file + key |

---

## Severity

| Level | Criteria |
|-------|----------|
| CRITICAL | Security vulns, data loss, instability |
| HIGH | Significant reliability/maintainability/velocity gaps |
| MEDIUM | Notable improvements |
| LOW | Minor enhancements |
| GREENFIELD | Would differ in rewrite (not necessarily a bug) |

---

## Output Format

Emit IMPROVEMENT ANALYSIS report:

**Part 1:** Current state findings sorted by severity, each with: category, observation, evidence, impact, suggested research.

**Part 2:** Reference architecture (stack, source, key patterns) → deviation table → corrections (CRITICAL/HIGH, with existing/reference/evidence/impact/scope/minimum fix) → greenfield changes (current vs alternative, migration effort) → technical debt (type, location, origin, removal strategy, effort) → launch gaps (risk, current state, required, priority).

**Summary:** Architecture health counts, issue counts by severity, correction count, greenfield changes, debt items, launch blockers, top 3 recommendations (architecture corrections first).

If no significant issues → emit PRODUCTION READY assessment with positive findings per category.

If truncated due to time → output partial findings with truncation notice.

---

## Creating Changes

Significant findings → `adv_change_create summary: "<finding>"` → return new `changeId` → `/adv-research {change-id}` first, then `/adv-prep {change-id}` for task synthesis. × Do not call `adv_task_add` here.

```
/adv-improve COMPLETE
Result: {N findings | Production ready}
Changes suggested: {Y}
Next: /adv-research {change-id}
```
