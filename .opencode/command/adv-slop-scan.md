---
name: adv-slop-scan
description: Scan slop, deletion safety, and detector coverage
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
3. Validate `<path>` resolves inside the repository root, then enumerate `git ls-files <path>` plus `--others --exclude-standard` when `--include-untracked`.
4. Filter source files; exclude minified, lock, generated, binary.
5. Load `features.slop_scan` from `project.json`; canonical defaults: `nesting_depth_threshold=4`, `defensive_guard_threshold=3`, `complexity_threshold=10`, `ast_timeout_ms=10000`. Deprecated aliases (`nesting_depth`, `defensive_guard`, `complexity`) are warnings, not source-of-truth field names.
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

Run deterministic checks through the typed `bin/adv slop-scan [path] --json` runner when CLI execution is available. The runner owns Phase 1 JSON facts, detector coverage, threshold parsing, and prominent warnings; chat output is a view over `slop_scan_report.v1`, not a separate truth source.

Runner adapters:

- AST structural: deep nesting, complexity (`ESLint`, `radon`, `gocyclo`; brace/indent fallback with `detectionMethod: degraded`)
- Polyglot structural and duplication: `ast-grep`, `jscpd` when available
- Dead code / deletion candidates: `vulture`, `knip`, `deadcode` when available; otherwise record detector coverage gap
- External security ownership: Semgrep PR-gate coverage is `externally_covered`; do not duplicate as local slop findings
- Regex/heuristic signal layer remains Phase 2/advisory unless backed by deterministic runner evidence

Each finding MUST include `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `grouping`, `actionability`, `phase: 1`; include `nestingDepth`/`complexity` where applicable.

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

Uncertain candidates go to `low-confidence / user-review`. Heuristic-only or text-only unused-code guesses are not actionable removal proof.

If `--phase 1` only → Phase 3: Report Generation.
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
## Phase 3: Report Generation

> Anti-Loop: after Phase 2 → aggregate directly.

1. Combine Phase 1 + Phase 2.
2. Deduplicate same `file:line` + smell ID; prefer Phase 2 description when richer.
3. Assign `grouping` and `actionability` before sort: high/medium + source evidence → `actionable` / `blocking` or `actionable`; low confidence → `low-confidence` / `non_blocking`; deletion or protected-surface uncertainty → `user-review` / `review_required`. Low-confidence findings are not blocking by default.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity, category, scanner convergence.

### Scanner Coverage Report

Always include compact coverage in text output: `run`, `skipped`, `degraded`, `failed`, `timed_out`, `unavailable`, and `externally_covered` detectors; phase coverage; method coverage. Empty findings still report coverage.

<!-- rq-ss007 -->
Text output: `SLOP SCAN REPORT`, scope, languages, prominent coverage warnings for important failed/missing detectors, severity/category summaries, detector coverage, findings (`id`, `file:line`, description, fix, evidence). No findings + complete coverage → `[OK] No slop detected.` No findings + coverage warnings → state that warnings require review.

JSON output: `schema_version: "slop_scan_report.v1"`, `generated_at`, `scope`, `summary.bySeverity`, `summary.byCategory`, `findings[]` with diagnostic fields + `grouping` + `actionability`, `coverage.detectors[]`, and `coverage.falsePositiveProtections`. `coverage.detectors[].state: 'run' | 'skipped' | 'degraded' | 'failed' | 'timed_out' | 'unavailable' | 'externally_covered'`. `grouping: 'actionable' | 'low-confidence' | 'user-review'`; `actionability: 'blocking' | 'actionable' | 'review_required' | 'non_blocking'`.
## Phase 4: Write Metadata

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"slop-scan"`
- `count`: total findings count, or 0
- `summary`: `"{count} findings: {majorCount} major, {minorCount} minor"` or `"no findings"`; `majorCount = CRITICAL + HIGH`, `minorCount = MEDIUM + LOW`
- `written_by`: `"agent"`
## Verbose/Debug

- `--verbose`: scan progress, sub-agent timing, per-category counts.
- `ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern context.
## Execution

Parse args → pre-flight → Phase 1 if enabled → Phase 2 if enabled → aggregate → report → write metadata.
