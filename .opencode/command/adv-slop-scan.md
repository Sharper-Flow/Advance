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
## Phase 0: Load Skill

`skill("adv-slop-detection")` → two-phase detection strategy, smell categories, thresholds, confidence, report schema. If unavailable, use fallback below.

Fallback: run AST/regex checks from `slop-smells.yaml`, then first-level `explore` scanners for semantic smells. Preserve `WORKING DIRECTORY` in all prompts.
## Pre-flight

1. Git repo check: `git rev-parse --is-inside-work-tree`; stop if false.
2. Load `slop-smells.yaml`; stop if missing/malformed.
3. Enumerate `git ls-files <path>` plus `--others --exclude-standard` when `--include-untracked`.
4. Filter source files; exclude minified, lock, generated, binary.
5. Load `features.slop_scan` from `project.json`; defaults: `nesting_depth=4`, `defensive_guard=3`, `complexity=10`, `ast_timeout_ms=10000`.
6. Record `{workdir}` via `pwd`. Include `WORKING DIRECTORY: {workdir}` in Phase 1 commands and sub-agent prompts.
7. Display scope: file count, path, phases, options. Stop if 0 files.
## Phase 1: Automatable Detection

<!-- rq-ss001 -->
<!-- rq-ss002 -->
<!-- rq-ss003 -->
<!-- rq-ss004 -->
<!-- rq-ss005 -->
<!-- rq-ss006 -->
<!-- rq-ss009 -->
<!-- rq-ss010 -->
<!-- rq-ss011 -->
<!-- rq-ss012 -->

Run deterministic checks from skill:

- AST structural: deep nesting, complexity (`ESLint`, `radon`, `gocyclo`; brace/indent fallback with `detectionMethod: degraded`)
- Regex signal layer: defensive overkill, debug artifacts, type evasion, incomplete work, error suppression, hardcoded env, AI signatures, security, `QUAL-012`
- Dead code / deletion candidates: `vulture`, `knip`, `deadcode` when available; otherwise note skipped detector

Each finding MUST include `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `phase: 1`; include `nestingDepth`/`complexity` where applicable.

### Phase 1 Confidence Defaults

- AST-backed structural findings default to `confidence: high`
- Regex-only defensive-overkill findings default to `confidence: medium`
- Degraded fallback findings default to `confidence: low`
- Assign `actionability` and `grouping` before severity sorting

### Structural Correctness Bypass (QUAL-012)

Heuristics used only for discovery/ranking/triage/advisory notes are not findings.

### Deletion Candidate Taxonomy

Deletion candidates are `MAINT-003 deletion_candidate` findings, not automatic deletion actions. Subtypes:

- unused dependency
- unused export
- unused file
- unreachable branch
- uncallable private symbol
- impossible feature-flag path

Every deletion candidate must include source evidence, confidence, detectionMethod, grouping, actionability, and a verification-oriented fix. Public exports, generated files, tests, fixtures, command modules, plugin registration surfaces, prompt context, examples, and task summaries are protected false-positive surfaces unless target source evidence proves otherwise.

### Deletion Safety / Actionability Boundary

Do not auto-delete. A deletion candidate is actionable only when structural evidence exists: tool-backed symbol/file/dependency evidence, exact reachability proof, entrypoint/config checks, typed roots, or source citations. No single external tool is the sole correctness authority for deletion safety.

Uncertain candidates go to `low-confidence / user-review`. heuristic-only or text-only unused-code guesses are not actionable removal proof.

If `--phase 1` only → Report Generation.
## Phase 2: Heuristic Detection

AI-assisted semantic scan via first-level `explore` sub-agents only.

### No Nested Scanner Delegation (CRITICAL)

`/adv-slop-scan` may fan out to first-level `explore` scanners only.

- Scanner workers MUST do analysis inline with their own tools.
- Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents.
- Scanner workers must NOT invoke any `/adv-*` slash commands; if ADV context is needed they must use ADV tools directly.
- Deeper-analysis need → return gap to orchestrator.

### Work Distribution

Use skill scanner table. Categories: `HALLU-*`, `STRUCT-*`, `QUAL-*`, `DOC-*`, `DEP-*`, `MAINT-*`, `AI-*`, `PERF-*`, `TEST-*`. Divide files across up to 9 scanners. Cap each file at 3 scanners: `Hallucination`, `Structure`, `Quality` first; add only strongest specialized bucket.

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

### Context Boundary (Non-Scannable)

<!-- rq-ss008 -->
Context packet text is orientation only, not a finding location. Every finding must cite a target source file and line or scoped source evidence. Do NOT emit findings against CHANGE, AFFECTED FILES summaries, TASK EVIDENCE SUMMARY, examples, or fixture descriptions.

Timeout → `TIMEOUT`; failure → `INCOMPLETE`; all fail → report Phase 1 findings only and suggest `--phase 1` or retry.
## Report Generation

> Anti-Loop: after Phase 2 → aggregate directly.

1. Combine Phase 1 + Phase 2.
2. Deduplicate same `file:line` + smell ID; prefer Phase 2 description when richer.
3. Assign `grouping` and `actionability` before sort: high/medium + source evidence → `actionable` / `blocking`; low confidence or context/fixture/deletion uncertainty → `low-confidence` / `non-blocking`. Low-confidence findings are not blocking by default.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity, category, scanner convergence.

### Scanner Coverage Report

Always include a compact scanner coverage summary in normal text output. Track skipped detectors, degraded detectors, timed-out detectors, missing deletion-candidate proof sources, and active false-positive protections.

<!-- rq-ss007 -->
Text output: `SLOP SCAN REPORT` banner, scope, phase counts, severity/category summaries, actionable findings with smell ID, `file:line`, description, fix, then `Low-confidence / non-blocking findings`, then next steps. No findings → `[OK] No slop detected.`

JSON output: `scope`, `phases`, `summary.bySeverity`, `summary.byCategory`, `findings[]` with diagnostic fields plus `grouping` and `actionability`, and `coverage` with `coverage.skippedDetectors`, `coverage.degradedDetectors`, and `coverage.falsePositiveProtections`. `grouping: 'actionable' | 'low-confidence'`; `actionability: 'blocking' | 'non-blocking'`.
## Phase 4: Write Metadata

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"slop-scan"`
- `count`: total findings count, or 0
- `summary`: `"{count} findings: {majorCount} major, {minorCount} minor"` or `"no findings"`
- `written_by`: `"agent"`
## Verbose/Debug

- `--verbose`: scan progress, sub-agent timing, per-category counts.
- `ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern context.
## Execution

Parse args → pre-flight → Phase 1 if enabled → Phase 2 if enabled → aggregate → report → write metadata.
