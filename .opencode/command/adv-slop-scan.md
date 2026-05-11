---
name: adv-slop-scan
description: Scan for AI slop patterns including defensive and nested code
---

<!-- manifest: adv-slop-scan · requiresChangeId: false -->

# ADV Slop Scan

> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate AI-code quality scan. Methodology lives in `adv-slop-detection`; command owns args, pre-flight, dispatch, aggregation, metadata.

## Argument Parsing

Parse `$ARGUMENTS`:

| Flag | Description | Default |
|------|-------------|---------|
| `--phase 1\|2` | Run single phase | Both |
| `--json` | JSON output | Text |
| `--verbose` | Detailed progress | Off |
| `--timeout N` | Sub-agent timeout seconds | 120 |
| `--include-untracked` | Include untracked git files | Off |
| `<path>` | Limit scan directory | `.` |

<UserRequest>
$ARGUMENTS
</UserRequest>

---

## Phase 0: Load Skill

`skill("adv-slop-detection")` → two-phase detection strategy, smell categories, thresholds, confidence, report schema. If unavailable, use fallback below.

Fallback: run AST/regex checks from `slop-smells.yaml`, then first-level `explore` scanners for semantic smells. Preserve `WORKING DIRECTORY` in all prompts.

---

## Pre-flight

1. Git repo check: `git rev-parse --is-inside-work-tree`; stop if false.
2. Load `slop-smells.yaml`; stop if missing/malformed.
3. Enumerate `git ls-files <path>` plus `--others --exclude-standard` when `--include-untracked`.
4. Filter source files; exclude minified, lock, generated, binary.
5. Load `features.slop_scan` from `project.json`; defaults: `nesting_depth=4`, `defensive_guard=3`, `complexity=10`, `ast_timeout_ms=10000`.
6. Record `{workdir}` via `pwd`. Include `WORKING DIRECTORY: {workdir}` in Phase 1 commands and sub-agent prompts.
7. Display scope: file count, path, phases, options. Stop if 0 files.

---

## Phase 1: Automatable Detection

<!-- rq-ss001 -->
<!-- rq-ss002 -->
<!-- rq-ss003 -->
<!-- rq-ss004 -->
<!-- rq-ss005 -->
<!-- rq-ss006 -->
<!-- rq-ss009 -->

Run deterministic checks from skill:

- AST structural: deep nesting, complexity (`ESLint`, `radon`, `gocyclo`; brace/indent fallback with `detectionMethod: degraded`)
- Regex signal layer: defensive overkill, debug artifacts, type evasion, incomplete work, error suppression, hardcoded env, AI signatures, security, `QUAL-012`
- Dead code: `vulture`, `knip`, `deadcode` when available; otherwise note skipped detector

Each finding MUST include `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `phase: 1`; include `nestingDepth`/`complexity` where applicable.

If `--phase 1` only → Report Generation.

---

## Phase 2: Heuristic Detection

AI-assisted semantic scan via first-level `explore` sub-agents only.

### No Nested Scanner Delegation (CRITICAL)

`/adv-slop-scan` may fan out to first-level `explore` scanners only.

- Scanner workers MUST do analysis inline with their own tools.
- Scanner workers MUST NOT spawn sub-agents, delegates, or worker agents.
- Scanner workers MUST NOT invoke `/adv-*` slash commands.
- Deeper-analysis need → return gap to orchestrator.

### Work Distribution

Use skill scanner table. Divide files across up to 9 scanners. Cap each file at 3 scanners: `Hallucination`, `Structure`, `Quality` first; add only strongest specialized bucket.

Inject this context packet into every prompt:

```text
WORKING DIRECTORY: {workdir}
[if active change] CHANGE: {change-id} | {title} | gate: release
AFFECTED FILES:
  - {file}: {one-line change summary}
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | tdd: {phase}
EXPECTED OUTPUT: JSON with findings array per dimension schema
```

Also include smell definitions for category, file list, novelty check, and these bans: do all work inline; do NOT spawn sub-agents/delegates; do NOT invoke `/adv-*`.

<!-- rq-ss008 -->
Context packet is orientation only, not finding location. Findings MUST cite target source file/line or scoped source evidence.

Timeout → `TIMEOUT`; failure → `INCOMPLETE`; all fail → report Phase 1 findings only and suggest `--phase 1` or retry.

---

## Report Generation

> Anti-Loop: after Phase 2 → aggregate directly.

1. Combine Phase 1 + Phase 2.
2. Deduplicate same `file:line` + smell ID; prefer Phase 2 description when richer.
3. Assign `grouping` and `actionability` before sort: high/medium + source evidence → `actionable` / `blocking`; low confidence or context/fixture uncertainty → `low-confidence` / `non-blocking`.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity, category, scanner convergence.

<!-- rq-ss007 -->
Text output: `SLOP SCAN REPORT` banner, scope, phase counts, severity/category summaries, actionable findings with smell ID, `file:line`, description, fix, then `Low-confidence / non-blocking findings`, then next steps. No findings → `[OK] No slop detected.`

JSON output: `scope`, `phases`, `summary.bySeverity`, `summary.byCategory`, `findings[]` with diagnostic fields plus `grouping` and `actionability`.

---

## Phase 4: Write Metadata

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"slop-scan"`
- `count`: total findings count, or 0
- `summary`: `"{count} findings: {majorCount} major, {minorCount} minor"` or `"no findings"`
- `written_by`: `"agent"`

---

## Verbose/Debug

- `--verbose`: scan progress, sub-agent timing, per-category counts.
- `ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern context.

---

## Execution

Parse args → pre-flight → Phase 1 if enabled → Phase 2 if enabled → aggregate → report → write metadata.
