---
name: adv-slop-detection
description: "AI-generated code quality detection via AST, regex, and heuristic analysis"
keywords:
  [
    "slop",
    "quality",
    "ai-code",
    "code-smells",
    "detection",
    "technical-debt",
    "cleanup",
  ]
metadata:
  priority: medium
  source: slop-smells.yaml
---

# Slop Detection Skill

## Purpose

Reusable slop detection methodology for ADV slop-scan workflows. Provides the two-phase detection strategy, smell categories, severity scoring, and finding format.

**Canonical source:** `slop-smells.yaml` — this skill references that catalog; do not duplicate individual smell definitions here.

## Two-Phase Detection Strategy

### Phase 1: Automatable Detection (Deterministic)

AST-first structural detection + regex signal layer:

| Detection                  | Tool Priority                                               |
| -------------------------- | ----------------------------------------------------------- |
| Deep nesting (≥ threshold) | ESLint max-depth / radon / gocyclo → brace/indent fallback  |
| Cyclomatic complexity      | ESLint complexity / radon / gocyclo                         |
| Defensive overkill         | Regex for repeated null/undefined checks on same identifier |
| Debug artifacts            | `console.log`, `debugger`, `print(`, `fmt.Print`            |
| Type evasion               | `as any`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable`     |
| Incomplete work            | `TODO`, `FIXME`, `HACK`, `XXX`                              |
| Error suppression          | Empty catch blocks, `except: pass`                          |
| Hardcoded env              | `localhost`, `/Users/`, `127.0.0.1`                         |
| AI signatures              | `Certainly!`, `Sure!`, `I'll help`, `As an AI`              |
| Security                   | String-concat SQL, hardcoded passwords/keys                 |
| Dead code                  | vulture (Python), knip (TS/JS), deadcode (Go)               |

When AST tools are unavailable, fall back to brace/indent counting and mark findings with `detectionMethod: "degraded"`.

### Phase 1 Confidence Defaults

- AST-backed structural findings default to `confidence: high`
- Regex-only defensive-overkill findings default to `confidence: medium` unless corroborated by same-identifier redundant guard evidence
- Degraded fallback findings default to `confidence: low` unless corroborated by another detector

### Phase 2: Heuristic Detection (AI-Assisted)

Parallel sub-agent scanners by category:

| Scanner         | Category  | Focus                                                |
| --------------- | --------- | ---------------------------------------------------- |
| Hallucination   | HALLU-\*  | Phantom imports, invented methods, version confusion |
| Structure       | STRUCT-\* | Cargo cult, context amnesia, frankencode             |
| Quality         | QUAL-\*   | Happy path only, confident incorrectness             |
| Documentation   | DOC-\*    | Obvious comments, stale docs, copy-paste             |
| Dependency      | DEP-\*    | Bloat, version roulette, phantom deps                |
| Maintainability | MAINT-\*  | Dead code, context collapse, style whiplash          |
| AI-Specific     | AI-\*     | Sycophantic code, context blindness                  |
| Performance     | PERF-\*   | N+1 queries, excessive renders                       |
| Test            | TEST-\*   | Magic numbers, assertion roulette                    |

Cap each file at 3 scanners. Prioritize: Hallucination, Structure, Quality first.

## False-Positive Control

### Context Boundary

Scanner context packets are orientation only, not finding locations. Do not report findings against ADV change summaries, task evidence, examples, or fixture descriptions unless the same issue exists in a target source file.

### Source Evidence Requirement

Every finding must cite a target source file and line or scoped source evidence. If source evidence is unavailable, return the concern as low confidence or omit it.

### Low-Confidence Grouping

Low-confidence findings are non-blocking by default. Preserve them for JSON/audit output, but keep them separate from actionable high-confidence and medium-confidence findings in text reports.

## Finding Format

Each finding must include:

| Field             | Description                        |
| ----------------- | ---------------------------------- |
| `id`              | Smell ID from `slop-smells.yaml`   |
| `name`            | Smell name                         |
| `severity`        | CRITICAL / HIGH / MEDIUM / LOW     |
| `file`            | File path                          |
| `line`            | Line number                        |
| `description`     | What was found                     |
| `fix`             | Suggested fix                      |
| `confidence`      | high / medium / low                |
| `detectionMethod` | ast / regex / heuristic / degraded |
| `grouping`        | actionable / low-confidence        |
| `actionability`   | blocking / non-blocking            |
| `phase`           | 1 or 2                             |

## Severity Levels

| Level    | Criteria                                                |
| -------- | ------------------------------------------------------- |
| CRITICAL | Security/data loss risk (HALLU-006, QUAL-003)           |
| HIGH     | Silent failures, context amnesia (QUAL-001, STRUCT-002) |
| MEDIUM   | Technical debt accumulation (STRUCT-004, QUAL-006)      |
| LOW      | Style issues, minor inefficiencies (STRUCT-003)         |

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns scan orchestration
- **Canonical source** — defer to `slop-smells.yaml` for individual smell definitions
- **No workflow sequencing** — the command owns phase ordering and sub-agent dispatch
- **No nested delegation** — scanner workers must do analysis inline, not spawn further sub-agents
