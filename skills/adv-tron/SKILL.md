---
name: adv-tron
description: "Codebase reconnaissance skill for mapping structure, hotspots, and risks"
keywords: ["reconnaissance", "investigation", "hotspot", "codebase-analysis", "architecture", "risk-assessment"]
metadata:
  priority: medium
  replaces: none
---

# Tron — Codebase Reconnaissance Skill

## Purpose

Tron is a read-only investigation skill for codebase reconnaissance. It maps structure, identifies hotspots, surfaces risks, and suggests follow-up work — without modifying any files or ADV state.

Tron complements existing ADV agents:

| Agent | Role | Tron's boundary |
|-------|------|-----------------|
| `explore` | Navigate code, find usages | Tron synthesizes across findings, not just locates |
| `adv-researcher` | Independent design validator (validates architecture against best practices) | Tron maps what exists, not what should exist |
| `librarian` | Look up docs and examples | Tron reads the local codebase, not external docs |

## Investigation Modes

## Analysis Startup Sequence

Before deep reads, establish baseline context in this order:

1. **WORKING DIRECTORY / repo root** — preserve the active workdir and resolved target path.
2. **Project context** — load `adv_project_context`.
3. **active ADV state** — inspect active changes plus relevant agenda/wisdom/spec context with ADV read tools.
4. **repo tree/outline** — inspect repo tree/outline before target-local reads.
5. **coverage gaps** — record unavailable tools, skipped dimensions, and unexamined areas.

### Broad (no target)

Scan the entire repository for structural understanding:

1. **Broad Scan structure map** — use `lgrep_get_repo_outline` or `lgrep_get_file_tree` for top-level structure
2. **hotspot/risk scan** — identify files with high complexity, deep nesting, unclear ownership, missing tests, or many dependencies
3. **related pattern/convention scan** — note recurring patterns, conventions, and deviations
4. **active-change/spec overlap** — check active ADV state, specs, agenda, and wisdom for nearby work
5. **coverage gaps** — list unavailable tools, skipped dimensions, and open questions

### Scoped (target provided)

Investigate a specific target — file path, module, symbol, feature area, or problem description:

1. **Target normalization** — resolve the target to concrete files/symbols:
   - If it looks like a path → read it directly
   - If it looks like a symbol → use `lgrep_search_symbols`
   - If it looks like a concept/theme → use `lgrep_search_semantic`
   - If ambiguous → try all three, report what was found
2. **Deep read** — read the target files, understand structure and behavior
3. **Scoped Scan dependency/usage trace** — trace what the target depends on and what depends on it
4. **Related code** — find similar patterns, sibling modules, or coupled components
5. **Risk assessment** — run hotspot/risk scan signals for test coverage, complexity, and change risk
6. **active-change/spec overlap** — check active ADV state, specs, agenda, and wisdom for nearby work
7. **coverage gaps** — list unavailable tools, unexamined related code, and open questions

## Degraded Execution

If `lgrep` or outline tools fail, fallback to allowed read/search tools, report degraded coverage, and only emit findings backed by inspected source. Unsupported signals become coverage gaps/open questions, not findings.

## Search Protocol

Use tools in this priority order:

| Step | Tool | When |
|------|------|------|
| 1 | `lgrep_search_semantic` | Concept/intent discovery |
| 2 | `lgrep_search_symbols` | Named function/class/method lookup |
| 3 | `lgrep_get_file_outline` | Understand a specific file's structure |
| 4 | `lgrep_get_repo_outline` | Broad structural mapping |
| 5 | `lgrep_get_file_tree` | Directory layout |
| 6 | `lgrep_search_text` | Exact string/token matching |
| 7 | `read` | Direct file inspection |
| 8 | `grep` | Regex patterns across files |

## Evidence Requirements

Every finding MUST include:

- **File reference** — `path/to/file.ts:42` format with line numbers where relevant
- **Confidence** — `high` (read the code), `medium` (inferred from patterns), `low` (speculative)
- **Category** — one of: `structure`, `hotspot`, `risk`, `pattern`, `dependency`, `question`

## Follow-up Routing Matrix

Use these trigger criteria for suggested next commands. Tron recommends only; it must not invoke `/adv-*`, must not create agenda/change/task state, and must not edit files.

| Trigger criteria | Recommend |
| --- | --- |
| Simplification, bloat, duplicated flow, verbose code, or long-term maintainability proposal needed | `/adv-optimizer <target>` |
| Slop smell, dead-code/deletion-safety, detector coverage, defensive overkill, AI-code quality issue | `/adv-slop-scan <target>` |
| Architecture boundary, stack-pack, structural-correctness, heuristic-owned state/spec/security/persistence concern | `/adv-arch-scan <target>` |
| Explicit spec-vs-implementation drift | `/adv-audit <capability>` |
| Follow-up already bounded and implementation-ready | `/adv-task` |
| Durable change needs proposal/agreement/design | `/adv-proposal <summary>` |
| More local reconnaissance needed before choosing owner | `/adv-tron <deeper-target>` |

Combination routing examples:

- `/adv-slop-scan <target> then /adv-optimizer <target>` — first classify slop/deletion-safety evidence, then synthesize simplification proposal.
- `/adv-arch-scan <target> then /adv-slop-scan <target>` — first validate architecture/structural boundary, then scan quality smells if source evidence also suggests code-level slop.

## Report Schema

Structure the final report as:

```
============================================================
                TRON RECONNAISSANCE REPORT
============================================================

TARGET: {target description or "Full repository"}
SCOPE: {number of files examined} files across {number of directories} directories

FINDINGS:
  1. [{category}] {finding title}
     {1-2 sentence description}
     Evidence: {file:line references}
     Confidence: {high|medium|low}

  2. [{category}] ...

HOTSPOTS:
  - {file or module} — {why it's a hotspot}

RISKS:
  - {risk description} — {file references}

OPEN QUESTIONS:
  - {question that needs human input}

POSSIBLE AGENDA ITEMS:
  These are suggestions only — not created automatically.

  - {suggested agenda title}
    Why: {1 sentence rationale}
    Priority: {critical|high|medium|low|backlog}

  - {suggested agenda title}
    Why: {1 sentence rationale}
    Priority: {critical|high|medium|low|backlog}

SUGGESTED NEXT COMMANDS:
  - /adv-optimizer {target} — Trigger: simplification or maintainability proposal; Rationale: {why}
  - /adv-slop-scan {target} — Trigger: slop/deletion-safety/detector concern; Rationale: {why}
  - /adv-arch-scan {target} — Trigger: architecture or structural-correctness concern; Rationale: {why}
  - /adv-proposal "{summary}" — Trigger: formal durable change needed; Rationale: {why}
  - /adv-task — Trigger: follow-up already bounded; Rationale: {why}
  - /adv-tron {deeper-target} — Trigger: more reconnaissance needed; Rationale: {why}

============================================================
```

## Constraints

- **Read-only** — never write, edit, or create files
- **No ADV mutations** — never call `adv_change_create`, `adv_task_add`, `adv_agenda_add`, or any state-modifying ADV tool
- **Report transport exception** — when an orchestrator packet requires typed handoff, `adv_subagent_report_submit` is the only allowed ADV mutation
- **No shell commands** — use MCP tools only for code exploration
- **Bounded output** — cap findings at 10 for broad scans, 15 for scoped scans
- **Cite everything** — no finding without a file reference
- **Suggest, don't act** — agenda items are human-readable suggestions, not tool calls
- **Recommendations only** — must not invoke `/adv-*`, must not create agenda/change/task state, must not edit files

## Anti-Patterns

- Do NOT run builds, tests, or linters — Tron reads, it does not execute
- Do NOT create changes, tasks, or agenda items — Tron suggests, it does not mutate
- Do NOT duplicate `adv-researcher` work — Tron maps what exists, not what should exist
- Do NOT produce unbounded output — cap findings and prioritize by severity
- Do NOT guess file contents — read them or say "not examined"
