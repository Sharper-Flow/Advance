---
name: adv-arch-detection
description: "Architecture inconsistency detection via deterministic tools, research fallback, and AI heuristic"
keywords: ["architecture", "layer", "circular-deps", "drift", "tech-stack", "dependencies", "structure"]
metadata:
  priority: medium
  source: agent-created
---

# Architecture Detection Skill

## Purpose

Reusable architecture inconsistency detection for ADV arch-scan workflows. Three-phase strategy: deterministic tools for known stacks → research fallback for unknown stacks → AI heuristic as universal fallback.

## Three-Phase Detection Strategy

### Phase 1: Deterministic Tools (Known Stacks)

<!-- rq-archp33 -->

Detect stack from project files, then run stack-specific tools from the Known-Stack Rule Matrix.

| Detected File | Stack | Tools |
|---------------|-------|-------|
| `package.json` + `tsconfig.json` | TypeScript/Node | `dependency-cruiser`, `madge` |
| `pyproject.toml` / `setup.py` | Python | `pydeps` |
| `go.mod` | Go | `go vet`, `gocyclo` |
| `Cargo.toml` | Rust | `cargo-deps` |

When tools are absent → graceful fallback with `detectionMethod: degraded` and a note.

Also scan known correctness boundaries for structural ownership: input parsing/normalization, workflow state transitions, gate/spec/compliance outcomes, persistence mutation, and classification. Prefer tool/schema/type evidence; heuristic-only signals are low-confidence candidates.

### Phase 2: Research Fallback (Unknown Stacks)

When stack is NOT in the Known-Stack Rule Matrix OR user requests `--phase 2`:

1. **Detect stack** from project files (e.g., `Gemfile` → Ruby, `pom.xml` → Java)
2. **Kagi query** — search `"{stack} architecture linter"`, `"{stack} circular dependency detector"`
3. **Context7 lookup** — find official docs for architecture analysis tools in that ecosystem
4. **Apply findings** — run discovered tools or rules inline
5. **Cite sources** — every finding must include the source URL or tool name

### Phase 3: AI Heuristic (Universal Fallback)

When Phase 1 and 2 produce no results:

- Analyze file structure and import patterns heuristically
- Detect likely layer violations (e.g., UI importing DB directly)
- Flag circular dependencies via import graph analysis
- Flag suspected structural-correctness boundary violations only when source evidence shows heuristic/prose/regex/LLM judgment owns correctness, security, persistence, workflow state, gate completion, or spec compliance
- Mark all findings with `detectionMethod: heuristic` and `confidence: low`

## Known-Stack Rule Matrix

| Stack | Primary Tool | Fallback Tool | Checks |
|-------|-------------|---------------|--------|
| TypeScript/Node | `dependency-cruiser` | `madge` | Circular deps, layer violations, orphans |
| Python | `pydeps` | `import-deps` | Import cycles, module depth |
| Go | `go vet` | `gocyclo` | Shadowing, complexity, unused code |
| Rust | `cargo-deps` | `cargo-modules` | Dependency graph, unused crates |

## Research-Fallback Protocol

```
detect stack → Kagi query → Context7 lookup → apply → cite
```

Example: Kotlin project detected → Kagi: "Kotlin architecture linter" → Context7: detekt docs → apply detekt architecture rules → cite detekt documentation URL.

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
| blocker | Circular deps at core layer, build-breaking drift | Must fix before merge |
| major | Layer violations, orphaned critical modules | Fix in current sprint |
| minor | Style inconsistency, minor complexity | Fix opportunistically |
| nit | Naming mismatch, formatting | Campsite rule |

Structural-correctness severity: blocker when heuristic-owned authority controls security, persistence, workflow state, gate completion, or spec compliance in touched scope; major when it controls input recognition/classification without immediate mutation; minor/nit only for advisory-only smells with clear guardrails.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns scan orchestration
- **Cite sources** — Phase 2 findings MUST include source URLs
- **No workflow sequencing** — the command owns phase ordering and sub-agent dispatch
- **Graceful degradation** — when tools are missing, continue with degraded detection rather than failing
