---
name: adv-improve
description: "Improvement-discovery methodology for current-state, LBP, and external landscape analysis"
keywords:
  [
    "adv",
    "improve",
    "lbp",
    "architecture",
    "competitors",
    "research-pack",
    "technical-debt",
  ]
metadata:
  priority: medium
  source: adv-improve-command
---

# ADV Improve Skill

## Purpose

Methodology for `/adv-improve`: find evidence-backed improvement opportunities without mutating ADV state. Command owns target resolution, tool calls, and research-pack write; skill owns scan rubric, report structure, and artifact schema.

## Target Modes

| Input | Mode | Resolution |
|---|---|---|
| none | broad | scan repo structure and major capabilities |
| file path | scoped | read file directly |
| directory | scoped | outline/tree then sample important files |
| symbol | scoped | `lgrep_search_symbols` |
| concept/capability | scoped | `lgrep_search_semantic` + specs |

Ask only when ambiguity changes scope materially. Otherwise choose closest concrete target and state assumption.

## Context Pack

Gather:

- Project purpose, stack, constraints from project context
- Active/archived changes overlapping findings
- Agenda items already covering same improvement
- Relevant capability specs
- Worktree path and source roots
- Stack manifests: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`

Do not surface duplicates already covered by active changes or agenda unless new evidence changes priority.

## Current-State Scan

Cap 5 findings per category. Each finding needs evidence.

| Category | Look for |
|---|---|
| Security | unsafe input handling, secrets, auth gaps, injection risk |
| Reliability | missing error paths, retries, idempotence, state recovery |
| Testing | untested critical paths, brittle tests, absent regression coverage |
| Observability | missing structured logs, weak errors, no diagnostics |
| Developer Experience | confusing setup, slow feedback, unclear commands/docs |
| Code Quality | duplication, over-complexity, stale abstractions, local slop |

Finding shape:

```text
- Severity: CRITICAL | HIGH | MEDIUM | LOW | GREENFIELD
- Category: {category}
- Evidence: {file:line | searched path | source citation}
- Impact: {user/system effect}
- Recommendation: {minimum viable fix}
- Follow-up: {/adv-proposal | /adv-task | /adv-audit | /adv-tron}
```

Reject evidence-free findings.

## LBP / Reference Comparison

Use official/current docs first. Prefer Context7 for library/framework docs, canonical web docs only as fallback.

Deviation table:

| Area | Current | Reference | Classification | Correction |
|---|---|---|---|---|
| {area} | {local evidence} | {source citation} | `SOUND` / `DRIFTED` / `ANTI-PATTERN` | {minimum viable fix} |

For `DRIFTED`/`ANTI-PATTERN`, include:

- What is wrong, with local path
- What is correct, with source
- Minimum viable fix
- Greenfield note: what would change if rebuilt today

If external docs unavailable, annotate: `[Reference: local conventions — Context7/webfetch unavailable]`. Do not invent canonical sources.

## External Landscape

Detect domain from project context and code. Search for alternatives and emerging patterns.

Hard cap:

- Top 3 competitors/alternatives
- 2 emerging patterns

Entry shape:

| Field | Meaning |
|---|---|
| Name | competitor/tool/pattern |
| Summary | one sentence |
| Difference | what it does differently |
| Maturity | adoption, maintenance, or signal |
| Source | URL |
| Relevance | why it matters or does not matter here |

Unavailable/no relevant results → state reason. Empty section is valid when labeled.

## Applicability Scoring

Score each candidate:

| Score | Meaning |
|---|---|
| High | directly addresses current high-impact gap with low/medium adoption risk |
| Medium | useful but needs design or migration work |
| Low | interesting, not currently worth change |
| Reject | conflicts with specs, stack, or user goals |

Prefer recommendations that improve user value, reliability, security, or long-term maintainability. Do not propose novelty for novelty.

## Synthesis

Deduplicate against active changes and agenda. Sort CRITICAL → HIGH → MEDIUM → LOW → GREENFIELD.

Report sections:

1. **Current State** — findings by category, evidence, severity, impact
2. **Architecture** — deviation table, corrections, greenfield changes
3. **External Landscape** — competitors, emerging patterns, or unavailable note
4. **Summary** — counts by severity, top 3 recommendations, architecture health signal
5. **Next commands** — `/adv-proposal <summary>`, `/adv-task`, `/adv-audit`, `/adv-tron`

If no significant issues, emit **PRODUCTION READY** with positive findings per category.

## Research Pack Schema

Path:

- broad → `docs/repo-improve-prep.md`
- scoped → `docs/{target-slug}-prep.md`

Slug: kebab-case target; strip separators/extensions. Same target overwrites/update date. Different target with collision appends `-2`, `-3`, …

Required sections in order:

| Section | Content |
|---|---|
| Header | `# Research Pack: {title}`, `Target:`, `Mode:`, `Created:`, `Updated:` |
| Purpose & Scope | covered scope + deliberate non-scope |
| Current State | report findings by category |
| LBP / Reference Comparison | deviation table + corrections + greenfield notes |
| Competitors & Alternatives | top 3 or unavailable note |
| Emerging Patterns | up to 2 or unavailable note |
| Applicability to This Repo | what applies, what does not, local path refs |
| Open Questions for Research | questions future `/adv-discover` should answer |
| Sources | flat URL/Context7 reference list |

Artifact mirrors report plus applicability/open questions; it is not a replacement for screen report.

Hygiene:

- If section cannot refresh, mark `⚠ not refreshed ({reason})` and keep prior content below.
- Never fabricate sources, competitors, or patterns.
- Write only `docs/*-prep.md`.

## Constraints

- Read-only with respect to ADV state.
- No changes/tasks/gates/specs/agenda creation.
- Evidence required.
- Bounded findings and landscape counts.
- Fallback notes must appear in report and research pack.
