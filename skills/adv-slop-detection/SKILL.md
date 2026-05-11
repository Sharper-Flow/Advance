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

Reusable methodology for `/adv-slop-scan` and hardening flows. Use it to detect AI-generated code quality issues with deterministic checks first, heuristic scanners second. Command owns orchestration, state mutation, and gate flow; skill gives read-only method.

**Canonical source:** `slop-smells.yaml` owns smell IDs and definitions. Reference it; do not fork the catalog here.

## Phase 1: Automatable Detection

Run AST-first structural checks plus regex signals. Prefer tool-backed evidence; fallback allowed only with lower confidence.

### Thresholds

Load `features.slop_scan` from `project.json`.

Defaults:

| Key | Default | Use |
| --- | --- | --- |
| `nesting_depth` | 4 | Deep nesting threshold |
| `defensive_guard` | 3 | Repeated guard threshold |
| `complexity` | 10 | Cyclomatic complexity threshold |
| `ast_timeout_ms` | 10000 | Per-detector timeout |

### AST Structural Tools

| Language | Tool | Command |
| --- | --- | --- |
| TypeScript/JS | ESLint | `pnpm dlx eslint --rule '{max-depth:[error,{max:N}],complexity:[error,N]}'` |
| Python | radon | `radon cc -n C <path>` |
| Go | gocyclo | `gocyclo -over N <path>` |

If unavailable or timed out: brace/indent counting fallback; set `detectionMethod: "degraded"`.

### Regex / Signal Layer

| Category | Smell IDs | Signals |
| --- | --- | --- |
| Debug artifacts | AI-008 | `console.log/debug/info`, `debugger`, `print(`, `fmt.Print` |
| Type evasion | AI-007, AI-006 | `as any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable` |
| Incomplete work | QUAL-004, QUAL-009 | `TODO`, `FIXME`, `HACK`, `XXX` |
| Error suppression | QUAL-007 | Empty catch blocks, `except: pass` |
| Hardcoded env | MAINT-005 | `localhost`, `/Users/`, `/home/`, `127.0.0.1` |
| AI signatures | DOC-003 | `Certainly!`, `Sure!`, `I'll help`, `As an AI` |
| Security | QUAL-003 | String-concat SQL, hardcoded passwords/keys/secrets |
| Structural correctness bypass | QUAL-012 | Heuristic/fuzzy/LLM decisions owning correctness boundaries; security/persistence/workflow/gate/spec behavior |

### Defensive Overkill (QUAL-011)

Detect repeated null/undefined guards on same identifier. Escalate at `defensive_guard` threshold. Same-identifier redundant-guard evidence upgrades confidence.

### Dead Code (MAINT-003)

| Language | Tool priority | Command |
| --- | --- | --- |
| Python | vulture | `vulture <path> --min-confidence 80` |
| TypeScript/JS | knip → ts-prune fallback | `pnpm dlx knip --no-exit-code` |
| Go | deadcode | `deadcode ./...` |

No tool available → note skipped detector; continue Phase 2.

### Confidence Defaults

- AST-backed structural findings default to `confidence: high`
- Regex-only defensive-overkill findings default to `confidence: medium` unless corroborated by same-identifier redundant guards
- Degraded fallback findings default to `confidence: low` unless corroborated by another detector
- Security secret patterns may be high confidence only when source evidence is concrete; never print secret values

## Structural Correctness Boundary (QUAL-012)

<!-- rq-ss009 -->

Report `QUAL-012 structural_correctness_bypass` when heuristic inference owns correctness, security, persistence, workflow state, gate completion, or spec compliance.

Look for:

- Fuzzy/title/Jaccard/similarity matches suppressing or mutating records without exact refs or explicit user confirmation
- Regex/prose parsing as sole authority where schema/parser/typed fields/validator/state machine should own boundary
- LLM/agent judgment deciding compliance, gate completion, persistence, or security without validator/tool evidence
- Untrusted input reaching business logic before parser/schema/allowlist recognition and normalization
- Title/body heuristics used despite typed metadata or schema fields

False-positive controls:

- Advisory heuristics for discovery/ranking/triage are allowed
- Legacy fallback allowed when typed metadata/schema precedence is explicit
- User-confirmed candidate actions allowed when heuristic output is not authority
- Low confidence stays non-blocking unless structural-boundary ownership is proven

## Phase 2: Heuristic Detection

AI-assisted semantic detection uses first-level `explore` scanners only. Phase 1 owns syntax and simple pattern signals; Phase 2 looks for semantic problems and duplicated/regressive patterns.

### Scanner Buckets

| Scanner | Category | Focus | File selection |
| --- | --- | --- | --- |
| Hallucination | `HALLU-*` | Phantom imports, invented methods, version confusion | All, batched |
| Structure | `STRUCT-*` | Cargo cult, context amnesia, frankencode | All, batched |
| Quality | `QUAL-*` | Happy path only, confident incorrectness | All, batched |
| Documentation | `DOC-*` | Obvious comments, stale docs, copy-paste | Export-heavy |
| Dependency | `DEP-*` | Bloat, version roulette, phantom deps | Config + imports |
| Maintainability | `MAINT-*` | Dead code, context collapse, style whiplash | All, batched |
| AI-Specific | `AI-*` | Sycophantic code, context blindness | Newest files from git |
| Performance | `PERF-*` | N+1 queries, excessive renders | Large files (>100 lines) |
| Test | `TEST-*` | Magic numbers, assertion roulette | `tests/`, `__tests__/` |

Cap each file at 3 scanners. Priority: `Hallucination`, `Structure`, `Quality`; add only strongest specialized bucket.

### Scanner Prompt Rules

Every scanner prompt includes:

```text
WORKING DIRECTORY: {workdir}
[if active change] CHANGE: {change-id} | {title} | gate: release
AFFECTED FILES:
  - {file}: {one-line change summary}
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | tdd: {phase}
EXPECTED OUTPUT: JSON with findings array per dimension schema
```

Also include: relevant smell definitions from `slop-smells.yaml`, file list, novelty check, and category focus.

Mandatory bans:

- Do all work inline with own tools
- Do NOT spawn additional sub-agents or delegates
- Do NOT invoke `/adv-*` slash commands
- If deeper analysis needed, return gap to orchestrator

Timeout → category `TIMEOUT`; failure → `INCOMPLETE`; all fail → report deterministic findings only and suggest `--phase 1` or retry.

## False-Positive Control

### Context Boundary

<!-- rq-ss008 -->

Scanner context packets are orientation only, not finding locations. Context packets are orientation only, not finding locations. Do not report findings against ADV change summaries, task evidence, examples, or fixture descriptions unless same issue exists in target source.

### Source Evidence Requirement

Every finding must cite a target source file via `file:line` or scoped source evidence. If evidence unavailable, omit or return low confidence.

### Low-Confidence Grouping

Low-confidence findings are non-blocking by default. Preserve for JSON/audit output, but separate from actionable findings in text reports.

## Finding Format

<!-- rq-ss004 -->

Each finding must include:

| Field | Description |
| --- | --- |
| `id` | Smell ID from `slop-smells.yaml` |
| `name` | Smell name |
| `severity` | CRITICAL / HIGH / MEDIUM / LOW |
| `file` | File path |
| `line` | Line number |
| `description` | What was found |
| `fix` | Suggested fix |
| `confidence` | high / medium / low |
| `detectionMethod` | ast / regex / heuristic / degraded |
| `grouping` | actionable / low-confidence |
| `actionability` | blocking / non-blocking |
| `phase` | 1 or 2 |

Add `nestingDepth` and `complexity` when relevant.

## Severity + Actionability

| Level | Criteria |
| --- | --- |
| CRITICAL | Security/data-loss risk, e.g. `HALLU-006`, `QUAL-003` |
| HIGH | Silent failures, context amnesia, e.g. `QUAL-001`, `STRUCT-002` |
| MEDIUM | Maintainability debt, e.g. `STRUCT-004`, `QUAL-006` |
| LOW | Style/minor inefficiency, e.g. `STRUCT-003` |

Before severity sorting, classify:

- High/medium confidence + source evidence → `grouping: "actionable"`, `actionability: "blocking"`
- Low confidence or context/fixture uncertainty → `grouping: "low-confidence"`, `actionability: "non-blocking"`

## Report Assembly

<!-- rq-ss007 -->

Aggregate algorithm:

1. Combine Phase 1 and Phase 2 findings.
2. Deduplicate same `file:line` + smell ID; prefer richer Phase 2 description.
3. Assign actionability/grouping before severity sorting.
4. Sort actionable findings: CRITICAL > HIGH > MEDIUM > LOW.
5. Group by severity and category; note scanner convergence.
6. Keep low-confidence/non-blocking findings separate.

Text report includes `SLOP SCAN REPORT`, scope, phase counts, severity summary, category summary, actionable findings, low-confidence section, next steps by severity. No findings → `[OK] No slop detected.`

JSON report includes `scope`, `phases`, `summary.bySeverity`, `summary.byCategory`, and `findings[]` with all diagnostic fields plus `grouping` and `actionability`.

## Constraints

- Read-only guidance only — no ADV state mutation
- Command owns scan orchestration, metadata write, gate flow, and sub-agent dispatch
- Canonical smell catalog is `slop-smells.yaml`
- No nested delegation for scanner workers
- Use structural evidence before heuristic judgment
