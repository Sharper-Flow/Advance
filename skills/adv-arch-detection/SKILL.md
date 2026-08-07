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
| `package.json` + ADV command/spec/skill assets | ADV stack pack | dependency graph tools; plugin bundle boundary tests; command/manifest symmetry tests; spec/asset anchors; command/skill methodology surfaces |
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
| ADV stack pack | existing structural enforcers | dependency graph tools | TypeScript/Bun/OpenCode plugin bundle boundary, command/manifest symmetry, spec/asset anchors, command/skill methodology surfaces |
| Capability Consistency | `bun run bin/arch-scan.ts` (typed adapter) | (none — typed pipeline is primary) | Config↔code↔deps inconsistencies: plumbed-but-unused env vars, present-but-inactive artifacts, deferred migrations, scaffold without tests |
| Python | `pydeps` | `import-deps` | Import cycles, module depth |
| Go | `go vet` | `gocyclo` | Shadowing, complexity, unused code |
| Rust | `cargo-deps` | `cargo-modules` | Dependency graph, unused crates |

The ADV stack pack cites existing tests and validators as authoritative structural checks instead of restating those boundaries as prose authority.

The Capability Consistency pack is the primary detector for config↔code↔deps disagreements. The typed pipeline (`bin/lib/arch-scan/registry.ts`) is the structural owner; this skill cites it rather than restating rule semantics as prose authority. Each shipped rule declares `detection_phase` (1 or 3), `severity_hint`, `confidence`, optional `intent_required` (Phase 3 false-positive gate), and optional `exception_semantics` (`suppress` | `escalate`) controlling how matched exception signals are interpreted.

<!-- rq-archcov01 -->
<!-- rq-archcap01 -->

## Capability Sub-Phase (Phase 3 Heuristics)

Phase 3 capability rules (`manifest-reference-vs-runtime-registration`, `scaffold-vs-test-green-path`) run in an explicit sub-phase that is NOT subject to the default Phase 3 skip-on-no-prior-findings behavior. The sub-phase runs whenever the capability-consistency pack applies, regardless of whether Phase 1/2 produced findings.

### `intent_required` gate

Each Phase 3 capability rule declares an `intent_required` list of declaration strings searched repo-wide:

- **gate closed** (no declaration matches) → rule skipped, `coverage_entry.state: "skipped"` with reason mentioning "intent". False-positive protection for intentional omissions (e.g., a marketing site that ships a manifest for icons but no offline support).
- **gate open** (≥1 declaration matches) → rule produces a low-severity finding (intent declared but capability not honored at runtime).

### `exception_semantics` (`suppress` | `escalate`)

Each registry entry may declare how the evaluator interprets a matched `exception_signal`:

- **`suppress`** (default when omitted): the rule does NOT fire when any exception_signal matches.
- **`escalate`**: the rule FIRES even when an exception_signal matches; severity is boosted by one level (nit → minor → major → blocker, capped at blocker) and the matched signal is attached as `exception` evidence.

Rule 3 (`report-only-header-with-deferred-todo`) uses `exception_semantics: "escalate"` — a nearby TODO/FIXME/HACK/XXX debt marker referencing enforcement counts as an exception signal and escalates severity from `major` → `blocker`. Default `suppress` semantics would silence the rule, which is the opposite of what deferred-enforcement detection requires.

## Architecture Scanner Coverage Report

Text output: detected stacks, applied Stack Packs, missing Stack Packs, skipped detectors, degraded detectors. JSON: `coverage.detectedStacks`, `coverage.appliedPacks`, `coverage.missingPacks`, `coverage.skippedDetectors`, `coverage.degradedDetectors`.

Missing pack ≠ finding by itself. It is coverage debt.

## Rewrite Assessment Method

The command derives a mandatory rewrite assessment after scan evidence is final and before report assembly. Skill owns the evidence rules:

- It explicitly labels and answers two questions:
  1. If the project/app were completely rewritten, what architecture would definitely change?
  2. If the project/app were completely rewritten, what would definitely not be carried over?
- Definite answers require source/tool evidence or stable finding references; Phase 1 tool output and Phase 2 cited sources qualify.
- Phase 3 heuristic-only content is tentative, never definite.
- A question with no evidence-backed answer yields `No definite conclusion from scan evidence`.
- Degraded detector coverage forces `status: "indeterminate"` — never a no-change conclusion.
- Advisory only: no severity, confidence, or coverage changes, and must never authorize deletion. Command-level `rewriteAssessment` JSON semantics only.

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
