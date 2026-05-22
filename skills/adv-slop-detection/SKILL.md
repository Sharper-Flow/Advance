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
| `DEAD_CODE.md` | `MAINT-003` deletion_candidate subtypes, detector tools, safety, and fallback behavior |

## Phase 1: Automatable Detection

Core Phase 1 categories: debug artifacts, type evasion, incomplete work, error suppression, hardcoded environment, AI signatures, security smells, defensive overkill, dead code/deletion candidates, structural-correctness bypass.

<!-- rq-ss010 -->

Preferred tools:
- AST-first structural checks
- Regex signals

Fallbacks are allowed only with lower confidence and explicit `detectionMethod: "degraded"`.

Default thresholds from `features.slop_scan`:

| Key | Default |
|---|---:|
| `nesting_depth` | 4 |
| `defensive_guard` | 3 |
| `complexity` | 10 |
| `ast_timeout_ms` | 10000 |

Deletion candidates are `MAINT-003 deletion_candidate` findings. Subtypes: unused dependency, unused export, unused file, unreachable branch, uncallable private symbol, impossible feature-flag path.

<!-- rq-ss011 -->

Deletion safety: do not auto-delete. Heuristic-only/text-only unused-code guesses are not removal proof. Uncertain deletion candidates → `low-confidence / user-review` + non-blocking actionability unless structural source/tool evidence proves safe review.

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
| CRITICAL | Security/data-loss risk or authoritative-but-wrong logic, e.g. `HALLU-006`, `QUAL-001`, `QUAL-003` |
| HIGH | Silent failures, context amnesia, e.g. `QUAL-002`, `QUAL-012`, `STRUCT-002` |
| MEDIUM | Maintainability debt, e.g. `STRUCT-004`, `QUAL-006` |
| LOW | Style/minor inefficiency, e.g. `STRUCT-003` |

High/medium confidence + source evidence → actionable/blocking. Low confidence or fixture/context uncertainty → low-confidence/non-blocking.

Cross-scanner label mapping: slop scan keeps severity labels `CRITICAL|HIGH|MEDIUM|LOW`; architecture scan uses review-style labels `blocker|major|minor|nit`. Treat `CRITICAL≈blocker`, `HIGH≈major`, `MEDIUM≈minor`, and `LOW≈nit` when comparing scanner reports, but keep each scanner's native labels in its own output schema.

## Report Assembly

1. Combine Phase 1 and Phase 2 findings.
2. Deduplicate same `file:line` + smell ID; prefer richer Phase 2 description.
3. Assign actionability/grouping before severity sorting.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity and category; note scanner convergence.
6. Keep low-confidence findings separate.

Text report includes `SLOP SCAN REPORT`, scope, phase counts, severity summary, category summary, actionable findings, low-confidence section, next steps. No findings → `[OK] No slop detected.`

<!-- rq-ss012 -->

Text report includes a scanner coverage summary for skipped, timed-out, missing, and degraded detectors. JSON report includes `scope`, `phases`, `summary.bySeverity`, `summary.byCategory`, `findings[]` with diagnostic fields, and `coverage.skippedDetectors`, `coverage.degradedDetectors`, and `coverage.falsePositiveProtections`.

## False-Positive Control

<!-- rq-ss009 -->

Context Boundary: context packets are orientation only, not finding locations. Do not report against ADV change summaries, task evidence, examples, fixture descriptions, exa/context7 snippets, or archived notes unless the referenced source file itself contains the smell.

Source Evidence Requirement: Every finding must cite a target source file via `file:line` or scoped source evidence. No evidence → omit or mark `confidence: low`. Low-confidence findings are non-blocking by default.

Confidence anchors: AST-backed structural findings default to `confidence: high`; Regex-only defensive-overkill findings default to `confidence: medium`; Degraded fallback findings default to `confidence: low`; AI-signature findings default to `confidence: low` unless paired with concrete maintainability/security impact.

Report `QUAL-012 structural_correctness_bypass` when Heuristic/fuzzy/LLM decisions owning correctness boundaries decide security, persistence, workflow state, gate completion, spec compliance, or input recognition/classification. Evidence must cite boundary + missing structural guard.

Coverage output uses `coverage.skippedDetectors`, `coverage.degradedDetectors`, and `coverage.falsePositiveProtections`.

## Constraints

- Read-only guidance only — no ADV state mutation.
- Command owns scan orchestration, metadata write, gate flow, and sub-agent dispatch.
- Canonical smell catalog is `slop-smells.yaml`.
- No nested delegation for scanner workers.
- Use structural evidence before heuristic judgment.
