---
name: adv-slop-scan
description: Scan for AI slop patterns including defensive and nested code
---

<!-- manifest: adv-slop-scan · requiresChangeId: false -->

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

## Phase 0: Load Skill

`skill("adv-slop-detection")` → provides two-phase detection strategy, smell categories, severity scoring, finding format. If the skill is unavailable, continue with the embedded protocol in this command file.

---

## Pre-flight

1. **Git check** — `git rev-parse --is-inside-work-tree` → stop if not git repo
2. **Load slop-smells.yaml** → stop if missing or malformed
3. **Enumerate files** — `git ls-files <path>` (+ `--others --exclude-standard` if `--include-untracked`). Filter to source code extensions, exclude minified/lock/binary. Stop if 0 files.
4. **Display scope** — file count, path, phase, options
5. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts and Phase 1 commands.

---

## Phase 1: Automatable Detection

<!-- rq-ss001 -->
<!-- rq-slopscan01 -->

Fast AST-first structural detection + regex signal layer for deterministic patterns.

### Threshold Config

<!-- rq-ss002 -->

Load `features.slop_scan` from `project.json` (defaults: nesting_depth=4, defensive_guard=3, complexity=10, ast_timeout_ms=10000).

### AST Structural Detection (MAINT-004, QUAL-011)

| Language      | Tool    | Command                                                                     |
| ------------- | ------- | --------------------------------------------------------------------------- |
| TypeScript/JS | ESLint  | `pnpm dlx eslint --rule '{max-depth:[error,{max:N}],complexity:[error,N]}'` |
| Python        | radon   | `radon cc -n C <path>`                                                      |
| Go            | gocyclo | `gocyclo -over N <path>`                                                    |

Fallback: brace/indent counting → `detectionMethod: degraded`.

### Defensive Overkill (QUAL-011)

<!-- rq-ss003 -->

Regex for repeated null/undefined checks on same identifier. Escalate when >= `defensive_guard_threshold`.

### Pattern Detection

| Category          | Smell IDs          | Patterns                                                                 |
| ----------------- | ------------------ | ------------------------------------------------------------------------ |
| Debug artifacts   | AI-008             | `console.log/debug/info`, `debugger`, `print(`, `fmt.Print`              |
| Type evasion      | AI-007, AI-006     | `as any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable` |
| Incomplete work   | QUAL-004, QUAL-009 | `TODO`, `FIXME`, `HACK`, `XXX`                                           |
| Error suppression | QUAL-007           | Empty catch blocks, `except: pass`                                       |
| Hardcoded env     | MAINT-005          | `localhost`, `/Users/`, `/home/`, `127.0.0.1`                            |
| AI signatures     | DOC-003            | `Certainly!`, `Sure!`, `I'll help`, `As an AI`                           |
| Security          | QUAL-003           | String-concat SQL, hardcoded passwords/keys/secrets                      |

### Dead Code (MAINT-003)

<!-- rq-ss005 -->

| Language      | Tool                                | Command                              |
| ------------- | ----------------------------------- | ------------------------------------ |
| Python        | vulture                             | `vulture <path> --min-confidence 80` |
| TypeScript/JS | knip (primary), ts-prune (fallback) | `pnpm dlx knip --no-exit-code`       |
| Go            | deadcode                            | `deadcode ./...`                     |

If no tool available → suggest installation → skip to Phase 2 heuristic.

### Finding Format

<!-- rq-ss004 -->

Each finding: `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `nestingDepth`, `complexity`, `confidence` (high/medium/low), `detectionMethod` (ast/regex/heuristic/degraded), `phase: 1`.

### Phase 1 Confidence Defaults

<!-- rq-ss006 -->

AST-backed structural findings default to `confidence: high`. Regex-only defensive-overkill findings default to `confidence: medium` unless corroborated by same-identifier redundant guard evidence. Degraded fallback findings default to `confidence: low` unless corroborated by another detector.

If `--phase 1` only → skip to Report.

---

## Phase 2: Heuristic Detection

AI-assisted detection via parallel sub-agents (`subagent_type: "explore"`).

### No Nested Scanner Delegation (CRITICAL)

`/adv-slop-scan` may fan out to first-level `explore` scanners only.

- Scanner workers must perform all analysis inline with their own tools
- Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents
- Scanner workers must NOT invoke any `/adv-*` slash commands; if ADV context is needed they must use ADV tools directly
- If a scanner needs deeper analysis, it must return the gap to the orchestrator instead of delegating

### Work Distribution

Divide files among up to 9 scanners by relevance. Cap each file at 3 scanners: `Hallucination`, `Structure`, `Quality` first; if a file also matches a specialized bucket, keep only the strongest specialized match and drop lower-priority extras.
| Scanner | Category | Focus | File Selection |
|---------|----------|-------|---------------|
| Hallucination | HALLU-_ | Phantom imports, invented methods, version confusion | All (batched) |
| Structure | STRUCT-_ | Cargo cult, context amnesia, frankencode | All (batched) |
| Quality | QUAL-_ | Happy path only, confident incorrectness | All (batched) |
| Documentation | DOC-_ | Obvious comments, stale docs, copy-paste | Export-heavy |
| Dependency | DEP-_ | Bloat, version roulette, phantom deps | Config + imports |
| Maintainability | MAINT-_ | Dead code, context collapse, style whiplash | All (batched) |
| AI-Specific | AI-_ | Sycophantic code, context blindness | Newest files (git) |
| Performance | PERF-_ | N+1 queries, excessive renders | Large files (>100 lines) |
| Test | TEST-\* | Magic numbers, assertion roulette | `tests/`, `__tests__/` |

### Sub-Agent Prompt

**Slop-Scan Context Packet (inject into every sub-agent spawn prompt):**

```
WORKING DIRECTORY: {workdir}
[if active change] CHANGE: {change-id} | {title} | gate: release
AFFECTED FILES:
  - {file}: {one-line change summary}
  - ...
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | tdd: {phase}
  - ...
EXPECTED OUTPUT: JSON with findings array per dimension schema
```

### Context Boundary (Non-Scannable)

<!-- rq-ss008 -->

Context packet text is orientation only, not a finding location. Every finding must cite a target source file and line or scoped source evidence. Do NOT emit findings against CHANGE, AFFECTED FILES summaries, TASK EVIDENCE SUMMARY, examples, or fixture descriptions.

When an active ADV change exists, build packet from `adv_task_list` and `adv_change_show` outputs at spawn time. When running standalone, omit the CHANGE and TASK EVIDENCE SUMMARY lines. Do NOT give explore agents ADV tool access.

Each also receives: smell definitions from yaml for their category, file list, instructions to focus on semantic issues (Phase 1 handles syntax), novelty check (skip if Phase 1 already found same issue unless adding semantic value).

Every scanner prompt must also include:

- Do all work inline with your own tools
- Do NOT spawn additional sub-agents or delegates
- Do NOT invoke `/adv-*` slash commands

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
3. Assign `actionability` and `grouping` before severity sorting: high/medium confidence with source evidence → `actionability: 'blocking'`, `grouping: 'actionable'`; low confidence or context/fixture uncertainty → `actionability: 'non-blocking'`, `grouping: 'low-confidence'`
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW
5. Group by severity, calculate stats per category, and keep low-confidence / non-blocking findings separate
6. Note scanner convergence (multiple scanners agree = high confidence)

### Text Format

<!-- rq-ss007 -->

Emit SLOP SCAN REPORT banner: scope, phase counts, severity summary, category summary, then actionable findings grouped by severity (each with smell ID, file:line, description, fix). Add a separate `Low-confidence / non-blocking findings` section. Low-confidence findings are not blocking by default. End with next steps by severity.

If no findings → `[OK] No slop detected.`

### JSON Format (if `--json`)

Output structured JSON: `scope`, `phases`, `summary` (bySeverity, byCategory), `findings[]`. Each finding keeps diagnostic fields and includes `grouping: 'actionable' | 'low-confidence'` and `actionability: 'blocking' | 'non-blocking'`.

---

## Phase 4: Write Metadata

After successful completion, call `adv_project_metadata action:"write"` with:

- `key`: `"slop-scan"`
- `count`: total findings count (0 if no findings)
- `summary`: one-line string:
  - If count > 0: `"{count} findings: {majorCount} major, {minorCount} minor"`
  - If count = 0: `"no findings"`
- `written_by`: `"agent"`

This persists the scan result for display in `/adv-status`.

---

## Verbose/Debug

`--verbose`: progress output for each scan step, sub-agent spawn/complete timing, per-category match counts.

`ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern match context.

---

## Execution

1. Parse arguments → 2. Pre-flight → 3. Phase 1 (if enabled) → 4. Phase 2 (if enabled) → 5. Aggregate → 6. Report → 7. Write Metadata
