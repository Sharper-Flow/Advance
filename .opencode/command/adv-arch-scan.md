---
name: adv-arch-scan
description: Scan for architecture inconsistencies using deterministic tools, research fallback, and AI heuristic
---
<!-- manifest: adv-arch-scan · requiresChangeId: false -->
# ADV Architecture Scan
> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate architecture inconsistency detection using three-phase strategy: Phase 1 (deterministic tools for known stacks) → Phase 2 (research fallback for unknown stacks) → Phase 3 (AI heuristic as universal fallback).

## Argument Parsing
Parse `$ARGUMENTS`:
| Flag | Description | Default |
|------|-------------|---------|
| `--phase 1\|2\|3` | Run single phase | All |
| `--json` | JSON output | Text |
| `--verbose` | Detailed progress | Off |
| `--timeout N` | Sub-agent timeout (seconds) | 120 |
| `<path>` | Limit scan directory | `.` |

<UserRequest>
  $ARGUMENTS
</UserRequest>

---
## Phase 0: Load Skill
`skill("adv-arch-detection")` → provides three-phase detection strategy, Known-Stack Rule Matrix, Research-Fallback Protocol, finding format, severity scoring. If skill is unavailable, continue with the embedded protocol in this command file.

---
## Pre-flight
1. **Git check** — `git rev-parse --is-inside-work-tree` → stop if not git repo
2. **Detect stack** — scan for `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, or other project files
3. **Display scope** — detected stack, path, phase, options
4. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts.

---
## Phase 1: Stack Packs (Known Stacks)
<!-- rq-archp33 -->
<!-- rq-archstack01 -->
<!-- rq-archstack02 -->

Run stack-specific tools when stack is in the Stack Packs matrix before research fallback or generic AI heuristic fallback:

| Stack Pack | Detection | Primary Tool | Fallback Tool | Checks |
|------------|-----------|--------------|---------------|--------|
| TypeScript/Node | `package.json` + `tsconfig.json` | `dependency-cruiser` | `madge` | Circular deps, layer violations, orphans |
| ADV stack pack | TypeScript/Bun/OpenCode plugin/Temporal/spec-command-skill assets | existing structural enforcers | dependency graph tools | workflow bundle boundary, command/manifest symmetry, spec/asset anchors, command/skill methodology surfaces |
| Python | `pyproject.toml` / `setup.py` | `pydeps` | `import-deps` | Import cycles, module depth |
| Go | `go.mod` | `go vet` | `gocyclo` | Shadowing, complexity, unused code |
| Rust | `Cargo.toml` | `cargo-deps` | `cargo-modules` | Dependency graph, unused crates |

If tools are absent → graceful fallback with `detectionMethod: degraded` and a note. If a relevant stack has no pack → list it in missing-pack coverage before Phase 2. Skip to Phase 2.

If `--phase 1` only → skip to Report.

### Structural Correctness Boundary Checks (P33)

During Phase 1 or Phase 2, inspect architecture paths where correctness boundaries should be structural:

- Input boundaries: parser/schema/allowlist recognition and normalization before business logic
- Workflow/state boundaries: state machines, typed events/signals, validators, or persisted schema contracts own transitions
- Gate/spec/compliance boundaries: tool verdicts, spec validators, conformance results, or explicit user approvals own outcomes
- Classification boundaries: typed metadata/fields take precedence over title/body heuristics

Flag architectural findings when heuristic inference, prose convention, regex-only matching, or LLM/agent judgment owns those boundaries. Mark as `category: structural-correctness`, `detectionMethod: ast|tool|research|heuristic`, and set `confidence: low` for AI-only evidence.

ADV stack pack findings must cite structural owners such as `plugin/src/temporal/workflow-bundle-boundary.test.ts`, manifest/command asset tests, spec/asset anchors, and context-snapshot purity tests instead of treating prose or one external tool as sole authority.

---
## Phase 2: Research Fallback
When stack is NOT in the Stack Packs matrix OR user requests `--phase 2`:

1. **Detect stack** from project files (e.g., `Gemfile` → Ruby, `pom.xml` → Java)
2. **Exa query** — search `"{stack} architecture linter"`, `"{stack} circular dependency detector"`
3. **Context7 lookup** — find official docs for architecture analysis tools
4. **Apply findings** — run discovered tools or rules inline
5. **Cite sources** — every finding must include source URL or tool name

If `--phase 2` only → skip to Report.

---
## Phase 3: AI Heuristic
When Phase 1 and 2 produce no results:

- Analyze file structure and import patterns heuristically
- Detect likely layer violations (e.g., UI importing DB directly)
- Flag circular dependencies via import graph analysis
- Detect suspected structural-correctness boundary violations (heuristic-owned persistence/gates/spec/security) only as low-confidence candidates unless corroborated by source evidence
- Mark all findings with `detectionMethod: heuristic` and `confidence: low`

---
## Phase 4: Write Metadata
After successful completion, call `adv_project_metadata action:"write"` with:
- `key`: `"arch-scan"`
- `count`: total findings count (0 if no findings)
- `summary`: one-line string:
  - If count > 0: `"{count} findings: {blockerCount} blocker, {majorCount} major"`
  - If count = 0: `"no architecture issues detected"`
- `written_by`: `"agent"`

Persists the scan result for display in `/adv-status`.

---
## Report Generation
<!-- rq-archcov01 -->

### Architecture Scanner Coverage Report

Emit ARCHITECTURE SCAN REPORT: detected stack, phases run, architecture scanner coverage summary, severity summary, findings grouped by severity (each with category, location, description, recommendation, source).

Coverage summary includes detected stacks, applied Stack Packs, missing Stack Packs, skipped detectors, and degraded detectors. These gaps are visible without `--verbose`.

If no findings → `[OK] No architecture issues detected.`

### JSON Format (if `--json`)
Output structured JSON: `stack`, `phases`, `summary` (bySeverity, byCategory), `findings[]`, and `coverage` with `coverage.detectedStacks`, `coverage.appliedPacks`, `coverage.missingPacks`, `coverage.skippedDetectors`, and `coverage.degradedDetectors`.

---
## Execution
1. Parse arguments → 2. Pre-flight → 3. Phase 1 (if enabled) → 4. Phase 2 (if enabled) → 5. Phase 3 (if enabled) → 6. Write Metadata → 7. Report
