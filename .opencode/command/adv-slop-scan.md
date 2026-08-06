---
name: adv-slop-scan
description: Scan slop, deletion safety, and detector coverage
---

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

`skill("adv-slop-detection")` → two-phase detection strategy, smell categories, thresholds, confidence, report schema. Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).
## Pre-flight

1. Git repo check: `git rev-parse --is-inside-work-tree`; stop if false.
2. Load `slop-smells.yaml`; stop if missing/malformed.
3. Validate `<path>` resolves inside the repository root, then enumerate `git ls-files <path>` plus `--others --exclude-standard` when `--include-untracked`.
4. Filter source files; exclude minified, lock, generated, binary.
5. Load `features.slop_scan` from `project.json`; canonical defaults: `nesting_depth_threshold=4`, `defensive_guard_threshold=3`, `complexity_threshold=10`, `ast_timeout_ms=10000`. Deprecated aliases (`nesting_depth`, `defensive_guard`, `complexity`) are warnings, not source-of-truth field names.
6. Record `{workdir}` via `pwd`. Include `WORKING DIRECTORY: {workdir}` in Phase 1 commands and sub-agent prompts.
7. Display scope: file count, path, phases, options. Stop if 0 files.
## Phase 1: Automatable Detection

Run deterministic checks through the typed `bin/adv slop-scan [path] --json` runner when CLI execution is available. The runner owns Phase 1 JSON facts, detector coverage, threshold parsing, and prominent warnings; chat output is a view over `slop_scan_report.v1`, not a separate truth source.

Runner adapters:

- AST structural: deep nesting, complexity (`ESLint`, `radon`, `gocyclo`). Applicable required detector degradation fails the scan; no brace/indent fallback findings are generated.
- Polyglot structural and duplication: `ast-grep`, `jscpd` when available
- Dead code / deletion candidates: `vulture`, `knip`, `deadcode` when available; otherwise record detector coverage gap
- External security ownership: Semgrep PR-gate coverage is `externally_covered`; do not duplicate as local slop findings
- Regex/heuristic signal layer remains Phase 2/advisory unless backed by deterministic runner evidence

Each finding MUST include `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `grouping`, `actionability`, `phase: 1`; include `nestingDepth`/`complexity` where applicable.

If `--phase 1` only → Phase 3: Report Generation.
## Phase 2: Heuristic Detection

AI-assisted semantic scan via first-level `explore` sub-agents only.

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

## Phase 3: Report Generation

> Anti-Loop: after Phase 2 → aggregate directly.

1. Combine Phase 1 + Phase 2.
2. Deduplicate same `file:line` + smell ID; prefer Phase 2 description when richer.
3. Assign `grouping` and `actionability` before sort: high/medium + source evidence → `actionable` / `blocking` or `actionable`; low confidence → `low-confidence` / `non_blocking`; deletion or protected-surface uncertainty → `user-review` / `review_required`. Low-confidence findings are not blocking by default.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity, category, scanner convergence.

### Rewrite Assessment (mandatory, derived)

After aggregation and before report assembly, derive a rewrite assessment that explicitly labels and answers two questions:

1. If the project/app were completely rewritten, what architecture would definitely change?
2. If the project/app were completely rewritten, what would definitely not be carried over?

Evidence rules:

- Every definite answer MUST cite source/tool evidence or stable finding references (smell id + `file:line`) from the scan.
- Heuristic-only content is tentative: label it tentative and keep it out of the definite answers.
- A question with no evidence-backed answer yields the literal `No definite conclusion from scan evidence`.
- Required coverage degradation (`SLOP_SCAN_DEGRADED` or any required degraded detector) sets `status: "indeterminate"`; emit the assessment even in a `SLOP SCAN FAILED` report. Indeterminate is never a no-change conclusion; do not claim nothing would change.

Advisory boundary: the assessment must not alter severity, grouping, actionability, or coverage, and must never authorize deletion. `wouldNotCarryOver` entries are not deletion actions; the deletion candidate safety and actionability rules above are unchanged.

Text output: a `REWRITE ASSESSMENT` section that answers both labeled questions, each definite entry followed by its evidence references.

JSON output (command-level `rewriteAssessment` only):

```json
"rewriteAssessment": {
  "status": "complete" | "indeterminate",
  "wouldChange": { "answer": "...", "evidence": ["..."], "confidence": "confirmed" | "tentative" },
  "wouldNotCarryOver": { "answer": "...", "evidence": ["..."], "confidence": "confirmed" | "tentative" },
  "tentative": [{ "statement": "...", "evidence": ["..."] }]
}
```

`wouldChange` answers question 1; `wouldNotCarryOver` answers question 2. Each is one evidence-cited answer object. When no evidence-backed answer exists, use the literal `No definite conclusion from scan evidence` as `answer`, an empty `evidence` array, and `confidence: "tentative"`. The command appends `rewriteAssessment` beside the typed report; it does not extend `slop_scan_report.v1` and runner output is unchanged.

### Scanner Coverage Report

Always include compact coverage in text output: `run`, `skipped`, `degraded`, `failed`, `timed_out`, `unavailable`, and `externally_covered` detectors; phase coverage; method coverage. Empty findings still report coverage.

Text output: `SLOP SCAN REPORT` for successful scans or `SLOP SCAN FAILED` for required degraded coverage, scope, languages, prominent coverage warnings for important failed/missing detectors, severity/category summaries, detector coverage, findings (`id`, `file:line`, description, fix, evidence). No findings + complete coverage → `[OK] No slop detected.` No findings + required degraded coverage → print the failed required detectors and do not print `[OK]`.

JSON output: `schema_version: "slop_scan_report.v1"`, `generated_at`, `scope`, `summary.bySeverity`, `summary.byCategory`, `findings[]` with diagnostic fields + `grouping` + `actionability`, `coverage.detectors[]`, and `coverage.falsePositiveProtections`. Required degraded coverage additionally includes `failure.code: "SLOP_SCAN_DEGRADED"`, `failure.message`, and `failure.failedDetectors[]`. `coverage.detectors[].state: 'run' | 'skipped' | 'degraded' | 'failed' | 'timed_out' | 'unavailable' | 'externally_covered'`. `grouping: 'actionable' | 'low-confidence' | 'user-review'`; `actionability: 'blocking' | 'actionable' | 'review_required' | 'non_blocking'`. Command-level `rewriteAssessment` is appended beside the typed report envelope; see Rewrite Assessment.
## Phase 4: Write Metadata

Skip metadata success writes when Phase 1 required coverage failed with `SLOP_SCAN_DEGRADED`.

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"slop-scan"`
- `count`: total findings count, or 0
- `summary`: `"{count} findings: {majorCount} major, {minorCount} minor"` or `"no findings"`; `majorCount = CRITICAL + HIGH`, `minorCount = MEDIUM + LOW`
- `written_by`: `"agent"`
## Verbose/Debug

- `--verbose`: scan progress, sub-agent timing, per-category counts.
- `ADV_DEBUG=1`: raw sub-agent prompts/responses to stderr, pattern context.
## Execution

Parse args → pre-flight → Phase 1 if enabled → Phase 2 if enabled → aggregate → rewrite assessment → report → write metadata.
