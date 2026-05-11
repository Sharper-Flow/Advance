---
name: adv-slop-detection
description: "AI-generated code quality detection via AST, regex, and heuristic analysis"
keywords: ["slop", "quality", "ai-code", "code-smells", "detection", "technical-debt", "cleanup"]
metadata:
  priority: medium
  source: slop-smells.yaml
---

# Slop Detection Skill

## Purpose

Reusable methodology for `/adv-slop-scan` and hardening flows. Detect AI-generated quality issues with deterministic checks first, heuristic scanners second. Command owns orchestration, state mutation, and gate flow; skill gives read-only method.

**Canonical source:** `slop-smells.yaml` owns smell IDs and definitions. Reference it; do not fork catalog here.

## Supporting Docs

| Doc | Use |
|---|---|
| `CATEGORIES.md` | Phase 1 thresholds, AST tools, regex/signal layer, confidence defaults, Phase 2 scanner buckets |
| `STRUCTURAL_CORRECTNESS.md` | `QUAL-012` boundary rules and false-positive controls |
| `DEAD_CODE.md` | `MAINT-003` detector tools and fallback behavior |

## Phase 1: Automatable Detection

Run AST-first structural checks plus regex signals. Prefer tool-backed evidence. Fallbacks are allowed only with lower confidence and explicit `detectionMethod: "degraded"`.

Default thresholds from `features.slop_scan`:

| Key | Default |
|---|---:|
| `nesting_depth` | 4 |
| `defensive_guard` | 3 |
| `complexity` | 10 |
| `ast_timeout_ms` | 10000 |

Core Phase 1 categories: debug artifacts, type evasion, incomplete work, error suppression, hardcoded environment, AI signatures, security smells, defensive overkill, dead code, structural-correctness bypass.

## Phase 2: Heuristic Detection

AI-assisted semantic detection uses first-level `explore` scanners only. Phase 1 owns syntax and simple pattern signals; Phase 2 looks for semantic problems, duplication, regressions, and contextual false positives.

Scanner buckets: Hallucination, Structure, Quality, Documentation, Dependency, Maintainability, AI-Specific, Performance, Test.

Cap each file at 3 scanners. Priority: Hallucination, Structure, Quality; add only strongest specialized bucket.

## Scanner Prompt Rules

Every scanner prompt includes workdir, active change context, affected files, task evidence summary, smell definitions, file list, novelty check, category focus, and JSON findings schema.

Mandatory bans for scanner workers:

- Do all work inline with own tools.
- Do NOT spawn additional sub-agents or delegates.
- Do NOT invoke `/adv-*` slash commands.
- If deeper analysis is needed, return gap to orchestrator.

Timeout → `TIMEOUT`; failure → `INCOMPLETE`; all fail → report deterministic findings only and suggest `--phase 1` or retry.

## Finding Format

Each finding includes: `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `grouping`, `actionability`, `phase`. Add `nestingDepth` and `complexity` when relevant.

## Severity + Actionability

| Level | Criteria |
|---|---|
| CRITICAL | Security/data-loss risk, e.g. `HALLU-006`, `QUAL-003` |
| HIGH | Silent failures, context amnesia, e.g. `QUAL-001`, `STRUCT-002` |
| MEDIUM | Maintainability debt, e.g. `STRUCT-004`, `QUAL-006` |
| LOW | Style/minor inefficiency, e.g. `STRUCT-003` |

High/medium confidence + source evidence → actionable/blocking. Low confidence or fixture/context uncertainty → low-confidence/non-blocking.

## Report Assembly

1. Combine Phase 1 and Phase 2 findings.
2. Deduplicate same `file:line` + smell ID; prefer richer Phase 2 description.
3. Assign actionability/grouping before severity sorting.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity and category; note scanner convergence.
6. Keep low-confidence findings separate.

Text report includes `SLOP SCAN REPORT`, scope, phase counts, severity summary, category summary, actionable findings, low-confidence section, next steps. No findings → `[OK] No slop detected.`

JSON report includes `scope`, `phases`, `summary.bySeverity`, `summary.byCategory`, and `findings[]` with diagnostic fields.

## False-Positive Control

Context Boundary: context packets are orientation only, not finding locations. Do not report findings against ADV change summaries, task evidence, examples, or fixture descriptions unless same issue exists in target source.

Source Evidence Requirement: Every finding must cite a target source file via `file:line` or scoped source evidence. If evidence is unavailable, omit or return low confidence.

Low-confidence findings are non-blocking by default. Preserve them for JSON/audit output, but separate them from actionable findings in text reports.

Confidence anchors: AST-backed structural findings default to `confidence: high`; Regex-only defensive-overkill findings default to `confidence: medium`; Degraded fallback findings default to `confidence: low`.

<!-- rq-ss009 -->

Report `QUAL-012 structural_correctness_bypass` when Heuristic/fuzzy/LLM decisions owning correctness boundaries decide security, persistence, workflow state, gate completion, or spec compliance.

## Constraints

- Read-only guidance only — no ADV state mutation.
- Command owns scan orchestration, metadata write, gate flow, and sub-agent dispatch.
- Canonical smell catalog is `slop-smells.yaml`.
- No nested delegation for scanner workers.
- Use structural evidence before heuristic judgment.
