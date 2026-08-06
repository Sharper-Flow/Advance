---
name: adv-arch-scan
description: Scan architecture stack packs, coverage, and heuristic fallbacks
---
# ADV Architecture Scan
> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate architecture inconsistency detection. The `adv-arch-detection` skill owns the three detection passes: pass 1 (deterministic tools for known stacks) → pass 2 (research fallback for unknown stacks) → pass 3 (AI heuristic as universal fallback).

## Argument Parsing
Parse `$ARGUMENTS`:
| Flag | Description | Default |
|------|-------------|---------|
| `--phase 1\|2\|3` | Run a single detection pass (see skill) | All |
| `--json` | JSON output | Text |
| `--verbose` | Detailed progress | Off |
| `--timeout N` | Sub-agent timeout (seconds) | 120 |
| `<path>` | Limit scan directory | `.` |

<UserRequest>
  $ARGUMENTS
</UserRequest>

---
## Phase 0: Load Skill
`skill("adv-arch-detection")` → three-phase detection strategy, Known-Stack Rule Matrix, Research Fallback, finding format, severity rubric, P33 boundaries.

Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

---
## Pre-flight
1. **Git check** — `git rev-parse --is-inside-work-tree` → stop if not git repo
2. **Detect stack** — scan for `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, or other project files
3. **Validate scope** — ensure `<path>` resolves inside the repository root, then display detected stack, path, phase, options
4. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts.

---
## Phase 1: Stack Packs (Known Stacks)

If `--phase 1` only → skip to Report.

### Capability-Consistency Pack Invocation (Phase 1)

When the capability-consistency pack applies (project has `package.json` AND IaC files AND/OR manifest references), invoke the typed adapter to surface cross-artifact inconsistencies:

```bash
bun run bin/arch-scan.ts --format json <repoRoot>
```

The typed pipeline is the primary detector for capability-consistency findings; the markdown layer (this command + SKILL.md) is advisory only and cites the typed pipeline as the structural owner per P33. Findings are evidence-backed with file:line cross-references per P34: each CapabilityFinding carries structured `trigger` evidence (file:line:matchedSignal), `absence_proof` (searchedRoots, includedGlobs, parseFailures), `detection_method` (`regex` or `ast`), and `confidence` (`high`, `medium`, or `low`).

### Structural Correctness Boundary Checks (P33)

During detection passes 1 and 2, inspect architecture paths where correctness boundaries should be structural:

- Input boundaries: parser/schema/allowlist recognition and normalization before business logic
- Workflow/state boundaries: state machines, typed events/signals, validators, or persisted schema contracts own transitions
- Gate/spec/compliance boundaries: tool verdicts, spec validators, conformance results, or explicit user approvals own outcomes
- Classification boundaries: typed metadata/fields take precedence over title/body heuristics

Flag architectural findings when heuristic inference, prose convention, regex-only matching, or LLM/agent judgment owns those boundaries. Mark as `category: structural-correctness`, `detectionMethod: ast|tool|research|heuristic`, and set `confidence: low` for AI-only evidence.

ADV stack pack findings must cite structural owners such as manifest/command asset tests, spec/asset anchors, and context-snapshot purity tests instead of treating prose or one external tool as sole authority.

---
## Report Generation

### Architecture Scanner Coverage Report

Emit `ARCHITECTURE SCAN REPORT`: detected stack, phases run, coverage summary, severity summary, findings by severity (category, location, description, recommendation, source).

Coverage includes: detected stacks, applied Stack Packs, missing Stack Packs, skipped detectors, degraded detectors. Gaps visible even when findings are empty.

No findings → `[OK] No architecture issues detected.`

### JSON Format (if `--json`)

Output JSON: `stack`, `phases`, `summary` (`bySeverity`, `byCategory`), `findings[]`, `coverage.detectedStacks`, `coverage.appliedPacks`, `coverage.missingPacks`, `coverage.skippedDetectors`, `coverage.degradedDetectors`, plus command-level `rewriteAssessment`. Severity: `blocker|major|minor|nit`. Heuristic-only findings stay low-confidence and non-blocking unless source/tool evidence corroborates.

---
## Write Metadata
After report generation, call `adv_project_metadata action:"write"` with:
- `key`: `"arch-scan"`
- `count`: total findings count (0 if no findings)
- `summary`: one-line string:
  - If count > 0: `"{count} findings: {blockerCount} blocker, {majorCount} major"`
  - If count = 0: `"no architecture issues detected"`
- `written_by`: `"agent"`

Persists the scan result for display in `/adv-status`.

---
## Execution
1. Parse arguments → 2. Pre-flight → 3. Detection passes per skill (as enabled by `--phase`) → 4. Rewrite Assessment → 5. Report → 6. Write Metadata
