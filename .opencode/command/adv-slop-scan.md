---
name: adv-slop-scan
description: Scan for AI slop patterns including defensive and nested code
---

# ADV Slop Scan

> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate codebase scan for AI-generated code quality issues ("slop") using patterns from `slop-smells.yaml`. Two-phase strategy: Phase 1 (AST + regex, deterministic) → Phase 2 (AI heuristic via sub-agents).

## Argument Parsing

Parse `$ARGUMENTS`:

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

## Pre-flight

1. **Git check** — `git rev-parse --is-inside-work-tree` → stop if not git repo
2. **Load slop-smells.yaml** → stop if missing or malformed
3. **Enumerate files** — `git ls-files <path>` (+ `--others --exclude-standard` if `--include-untracked`). Filter to source code extensions, exclude minified/lock/binary. Stop if 0 files.
4. **Display scope** — file count, path, phase, options
5. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts and Phase 1 commands.

---

## Phase 1: Automatable Detection

Fast AST-first structural detection + regex signal layer for deterministic patterns.

### Threshold Config

Load `features.slop_scan` from `project.json` (defaults: nesting_depth=4, defensive_guard=3, complexity=10, ast_timeout_ms=10000).

### AST Structural Detection (MAINT-004, QUAL-011)

| Language | Tool | Command |
|----------|------|---------|
| TypeScript/JS | ESLint | `pnpm dlx eslint --rule '{max-depth:[error,{max:N}],complexity:[error,N]}'` |
| Python | radon | `radon cc -n C <path>` |
| Go | gocyclo | `gocyclo -over N <path>` |

Fallback: brace/indent counting → `detectionMethod: degraded`.

### Defensive Overkill (QUAL-011)

Regex for repeated null/undefined checks on same identifier. Escalate when >= `defensive_guard_threshold`.

### Pattern Detection

| Category | Smell IDs | Patterns |
|----------|-----------|----------|
| Debug artifacts | AI-008 | `console.log/debug/info`, `debugger`, `print(`, `fmt.Print` |
| Type evasion | AI-007, AI-006 | `as any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable` |
| Incomplete work | QUAL-004, QUAL-009 | `TODO`, `FIXME`, `HACK`, `XXX` |
| Error suppression | QUAL-007 | Empty catch blocks, `except: pass` |
| Hardcoded env | MAINT-005 | `localhost`, `/Users/`, `/home/`, `127.0.0.1` |
| AI signatures | DOC-003 | `Certainly!`, `Sure!`, `I'll help`, `As an AI` |
| Security | QUAL-003 | String-concat SQL, hardcoded passwords/keys/secrets |

### Dead Code (MAINT-003)

| Language | Tool | Command |
|----------|------|---------|
| Python | vulture | `vulture <path> --min-confidence 80` |
| TypeScript/JS | knip (primary), ts-prune (fallback) | `pnpm dlx knip --no-exit-code` |
| Go | deadcode | `deadcode ./...` |

If no tool available → suggest installation → skip to Phase 2 heuristic.

### Finding Format

Each finding: `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `nestingDepth`, `complexity`, `confidence` (high/medium/low), `detectionMethod` (ast/regex/heuristic/degraded), `phase: 1`.

If `--phase 1` only → skip to Report.

---

## Phase 2: Heuristic Detection

AI-assisted detection via parallel sub-agents (`subagent_type: "explore"`).

### Work Distribution

Divide files among up to 9 scanners by relevance. Cap each file at 3 scanners: `Hallucination`, `Structure`, `Quality` first; if a file also matches a specialized bucket, keep only the strongest specialized match and drop lower-priority extras.

| Scanner | Category | Focus | File Selection |
|---------|----------|-------|---------------|
| Hallucination | HALLU-* | Phantom imports, invented methods, version confusion | All (batched) |
| Structure | STRUCT-* | Cargo cult, context amnesia, frankencode | All (batched) |
| Quality | QUAL-* | Happy path only, confident incorrectness | All (batched) |
| Documentation | DOC-* | Obvious comments, stale docs, copy-paste | Export-heavy |
| Dependency | DEP-* | Bloat, version roulette, phantom deps | Config + imports |
| Maintainability | MAINT-* | Dead code, context collapse, style whiplash | All (batched) |
| AI-Specific | AI-* | Sycophantic code, context blindness | Newest files (git) |
| Performance | PERF-* | N+1 queries, excessive renders | Large files (>100 lines) |
| Test | TEST-* | Magic numbers, assertion roulette | `tests/`, `__tests__/` |

### Sub-Agent Prompt

Each receives: `WORKING DIRECTORY: {workdir}`, smell definitions from yaml for their category, file list, instructions to focus on semantic issues (Phase 1 handles syntax), novelty check (skip if Phase 1 already found same issue unless adding semantic value), return JSON with findings array.

### Timeout/Failure Handling

- Timeout → mark category `TIMEOUT`, proceed with available results
- Failure → mark `INCOMPLETE`, note in report
- All fail → show Phase 1 findings only, suggest `--phase 1` or retry

---

## Report Generation

> Anti-Loop: after Phase 2 → proceed directly to aggregation.

### Aggregate

1. Combine Phase 1 + Phase 2 findings
2. Deduplicate: same file:line + smell ID → merge (prefer Phase 2 description)
3. Sort: CRITICAL > HIGH > MEDIUM > LOW
4. Group by severity, calculate stats per category
5. Note scanner convergence (multiple scanners agree = high confidence)

### Text Format

Emit SLOP SCAN REPORT banner: scope, phase counts, severity summary, category summary, then findings grouped by severity (each with smell ID, file:line, description, fix). End with next steps by severity.

If no findings → `[OK] No slop detected.`

### JSON Format (if `--json`)

Output structured JSON: `scope`, `phases`, `summary` (bySeverity, byCategory), `findings[]`.

---

## Verbose/Debug

`--verbose`: progress output for each scan step, sub-agent spawn/complete timing, per-category match counts.

`ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern match context.

---

## Execution

1. Parse arguments → 2. Pre-flight → 3. Phase 1 (if enabled) → 4. Phase 2 (if enabled) → 5. Aggregate → 6. Report

```
/adv-slop-scan COMPLETE
Result: {N findings | No slop detected}
Next: /adv-harden {change-id}
```
