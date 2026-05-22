---
name: adv-arch-detection
description: "Architecture inconsistency detection via deterministic tools, research fallback, and AI heuristic"
keywords: ["architecture", "layer", "circular-deps", "drift", "tech-stack", "dependencies", "structure"]
metadata:
  priority: medium
  source: .adv/specs/arch-scan/spec.json
---

# Architecture Detection Skill

## Purpose

Detect architecture inconsistencies across codebase, specs, command docs, and workflow assets. Three phases: deterministic tools → research fallback → AI heuristic.

## Three-Phase Detection Strategy

### Phase 1: Deterministic Tools (Stack Packs)

<!-- rq-archp33 -->
<!-- rq-archstack01 -->
<!-- rq-archstack02 -->

Detect stack from project files, then run stack-specific tools from the Stack Packs matrix before research fallback or generic AI heuristic fallback.

| Detected File | Stack Pack | Tools / Structural owners |
|---------------|------------|---------------------------|
| `package.json` + `tsconfig.json` | TypeScript/Node | `dependency-cruiser`, `madge` |
| `package.json` + ADV command/spec/skill/Temporal assets | ADV stack pack | dependency graph tools; workflow bundle boundary tests; command/manifest symmetry tests; spec/asset anchors; command/skill methodology surfaces |
| `pyproject.toml` / `setup.py` | Python | `pydeps` |
| `go.mod` | Go | `go vet`, `gocyclo` |
| `Cargo.toml` | Rust | `cargo-deps` |

When tools are absent → graceful fallback with `detectionMethod: degraded` and a note. When a relevant detected stack has no pack, report it as missing pack coverage.

Also scan known correctness boundaries for structural ownership: input parsing/normalization, workflow state transitions, gate/spec/compliance outcomes, persistence mutation, and classification. Prefer tool/schema/type evidence; heuristic-only signals are low-confidence candidates.

### Phase 2: Research Fallback (Unknown Stacks)

When stack is NOT in the Stack Packs matrix OR user requests `--phase 2`:

1. **Detect stack** from project files (e.g., `Gemfile` → Ruby, `pom.xml` → Java)
2. **Exa query** — search `"{stack} architecture linter"`, `"{stack} circular dependency detector"`
3. **Context7 lookup** — find official docs for architecture analysis tools in that ecosystem
4. **Apply findings** — run discovered tools or rules inline
5. **Cite sources** — every finding must include the source URL or tool name

### Phase 3: AI Heuristic (Universal Fallback)

Run Phase 3 when the user requests `--phase 3`, after Phase 1/2 produce no findings, or when no Stack Pack applies.
- Compare claimed architecture vs implementation evidence.
- Flag orphaned layers, bypassed abstractions, dead integration paths, duplicate responsibility, doc/spec/code drift.
- Flag P33 boundary violations only when source shows heuristic/prose/regex/LLM judgment owns correctness, security, persistence, workflow state, gate completion, or spec compliance.
- Mark all findings `detectionMethod: heuristic`, `confidence: low`.
- Do not create blocking findings from vibes; cite concrete evidence.

## Stack Packs Matrix

| Stack Pack | Primary Tool / Structural Owner | Fallback Tool | Checks |
|------------|----------------------------------|---------------|--------|
| TypeScript/Node | `dependency-cruiser` | `madge` | Circular deps, layer violations, orphans |
| ADV stack pack | existing structural enforcers | dependency graph tools | TypeScript/Bun/OpenCode plugin/Temporal workflow bundle boundary, command/manifest symmetry, spec/asset anchors, command/skill methodology surfaces |
| Python | `pydeps` | `import-deps` | Import cycles, module depth |
| Go | `go vet` | `gocyclo` | Shadowing, complexity, unused code |
| Rust | `cargo-deps` | `cargo-modules` | Dependency graph, unused crates |

The ADV stack pack cites existing tests and validators as authoritative structural checks instead of restating those boundaries as prose authority.

<!-- rq-archcov01 -->

## Architecture Scanner Coverage Report

Text output: detected stacks, applied Stack Packs, missing Stack Packs, skipped detectors, degraded detectors. JSON: `coverage.detectedStacks`, `coverage.appliedPacks`, `coverage.missingPacks`, `coverage.skippedDetectors`, `coverage.degradedDetectors`.

Missing pack ≠ finding by itself. It is coverage debt.

## Research-Fallback Protocol

```
detect stack → Exa query → Context7 lookup → apply → cite
```

Example: Kotlin project detected → Exa: "Kotlin architecture linter" → Context7: detekt docs → apply detekt architecture rules → cite detekt documentation URL.

## Finding Format

```json
{
  "category": "circular-dep|layer-violation|orphan|complexity|drift",
  "severity": "blocker|major|minor|nit",
  "location": "file:line or module path",
  "description": "what was found",
  "recommendation": "how to fix",
  "source": "https://... or tool name (optional for Phase 3)"
}
```

## Severity Scoring

| Level | Criteria | Action |
|-------|----------|--------|
| blocker | Core circular deps, build-breaking drift | Must fix before merge |
| major | Layer violations, orphaned critical modules | Fix current sprint |
| minor | Style inconsistency, minor complexity | Fix opportunistically |
| nit | Naming mismatch, formatting | Campsite rule |

Structural-correctness severity: `blocker` when heuristic-owned authority controls security, persistence, workflow state, gate completion, or spec compliance in touched scope; `major` for input recognition/classification authority without immediate mutation; `minor`/`nit` for advisory-only smells with guardrails.

Cross-scanner comparison: arch-scan `blocker≈CRITICAL`, `major≈HIGH`, `minor≈MEDIUM`, `nit≈LOW` vs slop-scan. Keep each scanner's native labels.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns scan orchestration
- **Cite sources** — Phase 2 findings MUST include source URLs
- **No workflow sequencing** — the command owns phase ordering and sub-agent dispatch
- **Graceful degradation** — when tools are missing, continue with degraded detection rather than failing
