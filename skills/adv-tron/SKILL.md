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

### Broad (no target)

Scan the entire repository for structural understanding:

1. **Repo outline** — use `lgrep_get_repo_outline` or `lgrep_get_file_tree` for top-level structure
2. **Hotspot detection** — identify files with high complexity, deep nesting, or many dependencies
3. **Pattern inventory** — note recurring patterns, conventions, and deviations
4. **Risk surface** — flag areas with no tests, stale code, or unclear ownership
5. **Open questions** — list things that need human clarification

### Scoped (target provided)

Investigate a specific target — file path, module, symbol, feature area, or problem description:

1. **Target normalization** — resolve the target to concrete files/symbols:
   - If it looks like a path → read it directly
   - If it looks like a symbol → use `lgrep_search_symbols`
   - If it looks like a concept/theme → use `lgrep_search_semantic`
   - If ambiguous → try all three, report what was found
2. **Deep read** — read the target files, understand structure and behavior
3. **Dependency mapping** — trace what the target depends on and what depends on it
4. **Related code** — find similar patterns, sibling modules, or coupled components
5. **Risk assessment** — evaluate test coverage, complexity, and change risk for the target
6. **Open questions** — list things that need human clarification about this target

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
  - /adv-proposal "{summary}" — if findings warrant a formal change
  - /adv-task — if the follow-up is already well-understood
  - /adv-audit {capability} — if drift was detected
  - /adv-tron {deeper-target} — if a finding needs deeper investigation

============================================================
```

## Constraints

- **Read-only** — never write, edit, or create files
- **No ADV mutations** — never call `adv_change_create`, `adv_task_add`, `adv_agenda_add`, or any state-modifying ADV tool
- **No shell commands** — use MCP tools only for code exploration
- **Bounded output** — cap findings at 10 for broad scans, 15 for scoped scans
- **Cite everything** — no finding without a file reference
- **Suggest, don't act** — agenda items are human-readable suggestions, not tool calls

## Anti-Patterns

- Do NOT run builds, tests, or linters — Tron reads, it does not execute
- Do NOT create changes, tasks, or agenda items — Tron suggests, it does not mutate
- Do NOT duplicate `adv-researcher` work — Tron maps what exists, not what should exist
- Do NOT produce unbounded output — cap findings and prioritize by severity
- Do NOT guess file contents — read them or say "not examined"
