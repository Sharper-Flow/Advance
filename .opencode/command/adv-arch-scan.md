---
name: adv-arch-scan
description: Scan architecture stack packs, coverage, and heuristic fallbacks
---
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
`skill("adv-arch-detection")` → three-phase detection strategy, Known-Stack Rule Matrix, Research Fallback, finding format, severity rubric, P33 boundaries. Unavailable → use embedded protocol.

---
## Pre-flight
1. **Git check** — `git rev-parse --is-inside-work-tree` → stop if not git repo
2. **Detect stack** — scan for `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, or other project files
3. **Validate scope** — ensure `<path>` resolves inside the repository root, then display detected stack, path, phase, options
4. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts.

---
## Phase 1: Stack Packs (Known Stacks)

Run stack-specific tools when stack is in the Stack Packs matrix before research fallback or generic AI heuristic fallback:

| Stack Pack | Detection | Primary Tool | Fallback Tool | Checks |
|------------|-----------|--------------|---------------|--------|
| TypeScript/Node | `package.json` + `tsconfig.json` | `dependency-cruiser` | `madge` | Circular deps, layer violations, orphans |
| ADV stack pack | TypeScript/Bun/OpenCode plugin/Temporal/spec-command-skill assets | existing structural enforcers | dependency graph tools | workflow bundle boundary, command/manifest symmetry, spec/asset anchors, command/skill methodology surfaces |
| Capability Consistency | `package.json` + IaC files (`*.bicep`, `*.tf`) + source files | `bun run bin/arch-scan.ts` (typed adapter) | (none — typed pipeline is primary) | Config↔code↔deps inconsistencies: plumbed-but-unused env vars, present-but-inactive artifacts, deferred migrations, scaffold without tests |
| Python | `pyproject.toml` / `setup.py` | `pydeps` | `import-deps` | Import cycles, module depth |
| Go | `go.mod` | `go vet` | `gocyclo` | Shadowing, complexity, unused code |
| Rust | `Cargo.toml` | `cargo-deps` | `cargo-modules` | Dependency graph, unused crates |

If tools are absent → graceful fallback with `detectionMethod: degraded` and a note. If a relevant stack has no pack → list it in missing-pack coverage before Phase 2. Skip to Phase 2.

If `--phase 1` only → skip to Report.

### Capability-Consistency Pack Invocation (Phase 1)

When the capability-consistency pack applies (project has `package.json` AND IaC files AND/OR manifest references), invoke the typed adapter to surface cross-artifact inconsistencies:

```bash
bun run bin/arch-scan.ts --format json <repoRoot>
```

The typed pipeline is the primary detector for capability-consistency findings; the markdown layer (this command + SKILL.md) is advisory only and cites the typed pipeline as the structural owner per P33. Findings are evidence-backed with file:line cross-references per P34: each CapabilityFinding carries structured `trigger` evidence (file:line:matchedSignal), `absence_proof` (searchedRoots, includedGlobs, parseFailures), `detection_method` (`regex` or `ast`), and `confidence` (`high`, `medium`, or `low`).

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

If `--phase 2` only → skip to Phase 4: Report Generation.

Timeout or research failure → keep Phase 1 findings, record the detector as degraded/skipped coverage, then continue to Phase 4: Report Generation or Phase 3 according to selected phases.

---
## Phase 3: AI Heuristic
Run Phase 3 when the user requests `--phase 3`, or during the default all-phases flow only when Phase 1 and Phase 2 produce no findings. `--phase 3` is a single-phase heuristic scan; it does not depend on prior Phase 1/2 results, and every uncorroborated finding remains low-confidence.

- Analyze file structure and import patterns heuristically
- Detect likely layer violations (e.g., UI importing DB directly)
- Flag circular dependencies via import graph analysis
- Detect suspected structural-correctness boundary violations (heuristic-owned persistence/gates/spec/security) only as low-confidence candidates unless corroborated by source evidence
- Mark all findings with `detectionMethod: heuristic` and `confidence: low`

Timeout or heuristic failure → keep deterministic/research findings, record the detector as degraded coverage, and continue to Phase 4: Report Generation.

### Capability Sub-Phase (Phase 3 Heuristics)

The capability-consistency pack runs Phase 3 rules (manifest-reference-vs-runtime-registration, scaffold-vs-test-green-path) in an **explicit sub-phase**, NOT subject to the default Phase 3 skip-on-no-prior-findings behavior above. Other Phase 3 categories (layer violations, circular deps, structural-correctness candidates) remain governed by the default Phase 3 trigger semantics — only the two capability Phase 3 rules run in this distinct sub-phase.

Each Phase 3 capability rule declares an `intent_required` list (declaration strings searched repo-wide). The rule fires only when at least one declaration matches:

- **intent gate closed** (no declaration matches) → rule is skipped, `coverage_entry.state: "skipped"` with reason mentioning "intent". False-positive protection for projects that intentionally omit a capability.
- **intent gate open** (≥1 declaration matches) → rule produces a low-severity finding (intent declared but capability not honored at runtime).

This sub-phase runs whenever the capability-consistency pack applies, regardless of whether Phase 1/2 produced findings. The default Phase 3 confidence `low` and `detectionMethod: heuristic` markers still apply to sub-phase findings unless corroborated by source evidence.

---
## Phase 4: Report Generation

### Rewrite Assessment (mandatory, derived)

After all scan evidence (findings + coverage) is final and before report assembly, derive a rewrite assessment that explicitly labels and answers two questions:

1. If the project/app were completely rewritten, what architecture would definitely change?
2. If the project/app were completely rewritten, what would definitely not be carried over?

Evidence rules:

- Every definite answer MUST cite source/tool evidence or stable finding references (finding category + location) collected during the scan.
- Heuristic-only content is tentative: label it tentative and keep it out of the definite answers.
- A question with no evidence-backed answer yields the literal `No definite conclusion from scan evidence`.
- Any degraded detector coverage sets `status: "indeterminate"`. Indeterminate is never a no-change conclusion; do not claim nothing would change.

Advisory boundary: the assessment must not alter severity, confidence, coverage, or phase results, and must never authorize deletion or remediation by itself.

Text output: a `REWRITE ASSESSMENT` section that answers both labeled questions, each definite entry followed by its evidence references.

JSON output (command-level `rewriteAssessment`, when `--json`):

```json
"rewriteAssessment": {
  "status": "complete" | "indeterminate",
  "wouldChange": { "answer": "...", "evidence": ["..."], "confidence": "confirmed" | "tentative" },
  "wouldNotCarryOver": { "answer": "...", "evidence": ["..."], "confidence": "confirmed" | "tentative" },
  "tentative": [{ "statement": "...", "evidence": ["..."] }]
}
```

`wouldChange` answers question 1; `wouldNotCarryOver` answers question 2. Each is one evidence-cited answer object. When no evidence-backed answer exists, use the literal `No definite conclusion from scan evidence` as `answer`, an empty `evidence` array, and `confidence: "tentative"`.

### Architecture Scanner Coverage Report

Emit `ARCHITECTURE SCAN REPORT`: detected stack, phases run, coverage summary, severity summary, findings by severity (category, location, description, recommendation, source).

Coverage includes: detected stacks, applied Stack Packs, missing Stack Packs, skipped detectors, degraded detectors. Gaps visible even when findings are empty.

No findings → `[OK] No architecture issues detected.`

### JSON Format (if `--json`)

Output JSON: `stack`, `phases`, `summary` (`bySeverity`, `byCategory`), `findings[]`, `coverage.detectedStacks`, `coverage.appliedPacks`, `coverage.missingPacks`, `coverage.skippedDetectors`, `coverage.degradedDetectors`, plus command-level `rewriteAssessment`. Severity: `blocker|major|minor|nit`. Heuristic-only findings stay low-confidence and non-blocking unless source/tool evidence corroborates.

---
## Phase 5: Write Metadata
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
1. Parse arguments → 2. Pre-flight → 3. Phase 1 (if enabled) → 4. Phase 2 (if enabled) → 5. Phase 3 (if enabled) → 6. Rewrite Assessment → 7. Report → 8. Write Metadata
