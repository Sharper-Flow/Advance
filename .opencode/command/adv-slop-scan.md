---
name: adv-slop-scan
description: Scan for AI slop patterns including defensive and nested code
---

# ADV Slop Scan

> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate codebase scan for AI-generated code quality issues ("slop") using patterns from `slop-smells.yaml`. Two-phase strategy: Phase 1 (AST + regex, deterministic) → Phase 2 (AI heuristic via sub-agents).

## Argument Parsing

| Flag | Description | Default |
|------|-------------|---------|
| `--phase 1\|2` | Run single phase | Both |
| `--json` | JSON output | Text |
| `--verbose` | Detailed progress | Off |
| `--timeout N` | Sub-agent timeout (seconds) | 120 |
| `--include-untracked` | Include untracked git files | Off |
| `<path>` | Limit scan directory | `.` |

<UserRequest>
  $ARGUMENTS
</UserRequest>

---

## Phase 0: Load Skill

`skill("adv-slop-detection")` → provides two-phase detection strategy, smell categories, severity scoring, finding format. If the skill is unavailable, use `slop-smells.yaml` directly as the embedded protocol.

---

## Pre-flight

1. `git rev-parse --is-inside-work-tree` → stop if not git repo
2. Load `slop-smells.yaml` → stop if missing
3. `git ls-files <path>` → filter source files, exclude minified/lock/binary. Stop if 0 files.
4. Display scope. Record `{workdir}` for sub-agent prompts.

---

## Phase 1: Automatable Detection

Fast AST-first structural detection + regex signal layer per the skill's Phase 1 protocol. Load thresholds from `features.slop_scan` in `project.json`. Run AST tools (ESLint/radon/gocyclo) with brace/indent fallback → pattern detection → dead code analysis. If `--phase 1` only → skip to Report.

---

## Phase 2: Heuristic Detection

Spawn up to **9 parallel sub-agents** (`subagent_type: "explore"`) per the skill's Phase 2 scanner categories. Each receives `WORKING DIRECTORY: {workdir}`, smell definitions, file list. Cap each file at 3 scanners.

### No Nested Scanner Delegation (CRITICAL)

Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents.
Scanner workers must NOT invoke any `/adv-*` slash commands; if ADV context is needed they must use ADV tools directly.
Return deeper-analysis gaps to the orchestrator instead.

Timeout/failure: mark category `TIMEOUT`/`INCOMPLETE` → proceed with available results.

---

## Report

1. Combine Phase 1 + Phase 2, deduplicate (same file:line + smell ID), sort by severity
2. Text: emit SLOP SCAN REPORT banner with scope, findings by severity, next steps. No findings → `[OK] No slop detected.`
3. JSON (if `--json`): structured output with `scope`, `phases`, `summary`, `findings[]`

```
/adv-slop-scan COMPLETE
Result: {N findings | No slop detected}
Next: /adv-harden {change-id}
```
