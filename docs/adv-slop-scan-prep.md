# Research Pack: ADV Slop Scan Tooling

Target: `/adv-slop-scan` command and `adv-slop-detection` skill
Mode: scoped
Created: 2026-06-11
Updated: 2026-06-11

## Purpose & Scope

This pack evaluates how `/adv-slop-scan` can surface real tool-backed data for overengineering, dead code, bad abstractions, unneeded flexibility, and complexity-cost signals instead of relying primarily on agent prompting.

In scope:

- `.opencode/command/adv-slop-scan.md`
- `skills/adv-slop-detection/*`
- `slop-smells.yaml`
- `.adv/specs/slop-scan/spec.json` and `docs/specs/slop-scan.md`
- `plugin/src/adv-slop-scan-assets.test.ts`
- `plugin/src/slop-scan-false-positive-fixtures.test.ts`
- CLI surface evidence in `bin/adv` and `docs/cli-surface-matrix.md`

Deliberate non-scope:

- Creating an ADV change or task.
- Implementing detector code.
- Mutating specs, command contracts, or runtime plugin code.

## Current State

### Security

- Severity: MEDIUM
- Category: Security
- Evidence: `.opencode/command/adv-slop-scan.md:57-63`, `skills/adv-slop-detection/CATEGORIES.md:24-36`
- Finding: Security smell detection is defined as regex/signal guidance, but no runtime detector implementation was found in `plugin/src` (`lgrep_search_symbols query="slop"` returned 0 symbols). Secret/security findings therefore depend on whoever executes the command to remember and implement the signal layer correctly.
- Impact: Security and correctness-boundary slop can be missed or inconsistently labeled.
- Recommendation: Add a deterministic detector runner with a typed `security` detector adapter. Prefer existing scanner outputs (`gitleaks`, `semgrep`, or current repo security gates) where available; normalize into slop finding schema.
- Follow-up: `/adv-proposal Add slop detector runner`

### Reliability

- Severity: HIGH
- Category: Reliability
- Evidence: `.opencode/command/adv-slop-scan.md:57-62`, `.opencode/command/adv-slop-scan.md:143-150`, `bin/adv --help` output only lists `status` and `roadmap`; `bin/adv slop-scan --json` returns `unknown command: slop-scan`.
- Finding: The command requires Phase 1 automatable detection, coverage reporting, and JSON output, but the repo exposes no first-class slop-scan CLI or MCP tool implementation. The current surface is a slash-command prompt contract plus asset tests.
- Impact: Results are not reproducible across agents/sessions; missing detectors can be hidden by prompt drift; CI cannot consume slop-scan data.
- Recommendation: Implement `adv slop-scan --json` as the canonical deterministic Phase 1 runner and let `/adv-slop-scan` orchestrate around that output.
- Follow-up: `/adv-proposal Add slop detector runner`

### Testing

- Severity: HIGH
- Category: Testing
- Evidence: `plugin/src/slop-scan-false-positive-fixtures.test.ts:21-60`, `plugin/src/slop-scan-false-positive-fixtures.test.ts:90-153`, `plugin/src/adv-slop-scan-assets.test.ts:21-215`
- Finding: False-positive tests use sentinel-string simulation (`source.includes("DIRTY_REDUNDANT_GUARD_CHAIN")`) instead of executing real detectors. Asset tests verify prose contains required phrases, not that detectors run or normalize findings.
- Impact: Regressions in dead-code, overengineering, complexity, and JSON schema behavior can pass CI.
- Recommendation: Add golden fixture tests that execute the deterministic runner against clean/dirty fixture projects and assert normalized findings, coverage gaps, and false-positive protections.
- Follow-up: `/adv-task` or `/adv-proposal Add slop detector runner`

### Observability

- Severity: MEDIUM
- Category: Observability
- Evidence: `.opencode/command/adv-slop-scan.md:143-150`, `.opencode/command/adv-slop-scan.md:151-158`, `docs/specs/slop-scan.md:528-564`
- Finding: Coverage reporting is required in text/JSON, but metadata write records only a count and summary. There is no persisted breakdown of skipped/degraded/missing detectors.
- Impact: A “0 findings” scan can be indistinguishable from “most important detectors skipped.”
- Recommendation: Emit typed coverage in JSON and store compact metadata such as `{detectorsRun, skipped, degraded, timedOut, missingBySubtype}`.
- Follow-up: `/adv-proposal Add slop detector runner`

### Developer Experience

- Severity: HIGH
- Category: Developer Experience
- Evidence: `docs/cli-surface-matrix.md:23-26` says `/adv-slop-scan` is `mcp+cli-additive`; `bin/adv --help` output lists only `status` and `roadmap`; `bin/adv slop-scan --json` returns `unknown command: slop-scan`.
- Finding: Docs promise additive CLI JSON value for deterministic slop scanning, but no CLI entry exists.
- Impact: Users cannot run or compare scans outside chat; CI cannot gate; tool adoption stays agent-dependent.
- Recommendation: Add a CLI subcommand with stable JSON schema and no agent dependency for Phase 1.
- Follow-up: `/adv-proposal Add slop detector runner`

### Code Quality

- Severity: MEDIUM
- Category: Code Quality
- Evidence: `.opencode/command/adv-slop-scan.md:41`, `skills/adv-slop-detection/CATEGORIES.md:5-12`, `plugin/src/types/project.ts:65-90`, `project.json:16-21`
- Finding: Threshold names drift across docs: command/skill mention `nesting_depth`, `defensive_guard`, `complexity`, while the typed schema and repo config use `nesting_depth_threshold`, `defensive_guard_threshold`, and `complexity_threshold`.
- Impact: Future implementation can silently ignore intended overrides or normalize the wrong fields.
- Recommendation: Make `SlopScanConfigSchema` the only source of field names; update command/skill/spec docs or add explicit legacy aliases in a parser with tests.
- Follow-up: `/adv-task`

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction | Greenfield note |
|---|---|---|---|---|---|
| Dead-code/dependency detection | `skills/adv-slop-detection/DEAD_CODE.md:20-24` names Knip, but `plugin/package.json:45-60` has no Knip dev dependency and `pnpm exec knip --version` fails with `Command "knip" not found`. | Context7 `/websites/knip_dev`: Knip reports unused files, unlisted dependencies, and unused exports; `knip --reporter json` provides machine-readable output; defaults use entry/project file patterns. | DRIFTED | Add optional Knip adapter with `--reporter json`; record absence as coverage gap; do not require network `pnpm dlx` for CI path unless intentionally accepted. | Build detector registry around Knip JSON first, not around agent summaries. |
| Complexity/depth detection | `.opencode/command/adv-slop-scan.md:59` says use ESLint; `pnpm exec eslint --version` succeeds (`v10.4.1`). | Context7 `/eslint/eslint`: ESLint supports `--format json`; CLI accepts files/dirs and formatter options; `--stats --format json` can include performance stats. | SOUND but incomplete | Use local `pnpm exec eslint` with temporary/override rules for `max-depth` and `complexity`; normalize JSON into `MAINT-004`. | Prefer ESLint JSON adapter over prose instructions. |
| Structural overengineering/bad abstraction detection | `slop-smells.yaml:94-155` defines structural smells, but Phase 2 is agent-scanner driven (`.opencode/command/adv-slop-scan.md:96-125`). | Context7 `/ast-grep/ast-grep.github.io`: `ast-grep run --json` returns structured AST match objects with file/range/metavariables; supports structural search/linting. | ANTI-PATTERN | Move common structural smells to AST rules first: single-implementation interfaces, singleton/factory with one variant, excessive wrapper layers, redundant guard chains. Agent scan becomes advisory fallback. | Use rule packs (`slop-smells.yaml` → detector registry) before human/LLM review. |
| Duplication/code-quality trend data | `slop-smells.yaml:817` lists `jscpd`, but slop command has no concrete duplication detector phase. | Exa `https://jscpd.dev/`: jscpd v5 advertises Rust-powered duplicate detection, JSON/AI-oriented reporters, and large speedups over v4. | DRIFTED | Add optional duplication adapter for `jscpd` compact/JSON output; classify as `QUAL-006` or `MAINT-*` with low/medium confidence based on threshold and file type. | Treat token clone detection as fast Phase 1, not Phase 2 agent opinion. |
| CLI/CI surface | `docs/cli-surface-matrix.md:25` says additive CLI JSON; actual `bin/adv` has no `slop-scan` subcommand. | Repo-local CLI pattern already exists for `status`/`roadmap`; no external reference needed. | ANTI-PATTERN | Add `bin/adv slop-scan [path] --json --phase 1`; make slash command call/interpret it. | Greenfield: all deterministic utility commands expose JSON before chat report. |

## Competitors & Alternatives

1. **Knip** — Finds unused files, exports, dependencies, unlisted dependencies, and has JSON reporter support. Source: `https://knip.dev/`, Context7 `/websites/knip_dev`. Relevance: strongest default for TypeScript dead-code and dependency hygiene.
2. **SonarQube / SonarCloud** — TypeScript static analysis for bugs, code smells, security vulnerabilities, quality gates, and PR decoration. Source: `https://www.sonarsource.com/knowledge/languages/ts/`. Relevance: useful if ADV wants cross-repo trend dashboards rather than local command-only reports.
3. **Semgrep / AST structural scanners** — Lightweight static analysis for bugs, standards, and security; stronger for custom rules than plain regex. Source: Exa result `Code Quality & Static Analysis 2026 Deep Dive`, Context7 `/semgrep/semgrep-docs`, Context7 `/ast-grep/ast-grep.github.io`. Relevance: good fit for QUAL-012 and bad-abstraction structural patterns.

## Emerging Patterns

1. **Fast native/Rust scanning layer** — Exa sources highlight Rust-era tools such as jscpd v5, Biome, Oxlint, and Ruff reducing scan cost enough for frequent local/CI runs. Relevance: slop scan should prioritize fast Phase 1 tools before agents.
2. **Structured JSON as source of truth** — Knip, ESLint, ast-grep, and scanner platforms expose JSON outputs. Relevance: `/adv-slop-scan` can normalize tool JSON into one finding schema and reserve agents for interpretation only.

## Applicability to This Repo

High applicability:

- Build a deterministic `slop-scan` runner and CLI subcommand. Evidence: `docs/cli-surface-matrix.md:25` already classifies this as `mcp+cli-additive`.
- Normalize existing tools into the current slop schema: `id`, `name`, `severity`, `file`, `line`, `description`, `fix`, `confidence`, `detectionMethod`, `grouping`, `actionability`, `phase`. Evidence: `.opencode/command/adv-slop-scan.md:63`.
- Start with local TypeScript signals: ESLint complexity/depth, Knip dead-code/dependencies, ast-grep structural rules, regex signal layer from `skills/adv-slop-detection/CATEGORIES.md:24-36`.

Medium applicability:

- Add jscpd duplication detection for `QUAL-006`, because clone detection is helpful but extraction can be subjective.
- Add Semgrep for security/correctness rules once local rule ownership is clear.

Low applicability / reject for now:

- Fully replacing Phase 2 with enterprise platforms. Sonar/DeepSource-style dashboards solve portfolio governance, not immediate local command determinism.
- Auto-deleting unused files or exports. Current spec correctly blocks this: deletion candidates are review inputs only (`docs/specs/slop-scan.md:488-524`).

Deduplication notes:

- ROADMAP already has `#84 Sweep unused type exports flagged by knip` (`ROADMAP.md:41`). That is narrower than this pack; do not duplicate it unless scope expands from cleanup to scanner implementation.
- Active changes shown by `adv_change_list` do not directly cover `/adv-slop-scan` runner work.
- Agenda has many scanner/cleanup follow-ups, but no clear active item for a slop detector runner.

## Open Questions for Research

1. Should `knip` be a devDependency for deterministic local/CI scans, or should the runner use optional `pnpm dlx` with explicit network/offline behavior?
2. Which output schema owns the canonical normalized finding contract: new Zod schema in `plugin/src/schema-registry.ts`, or command-local TypeScript type first?
3. Should Phase 1 live in `bin/adv` only, plugin tool code only, or a shared module consumed by both?
4. What false-positive threshold should apply per detector type: Knip, ESLint complexity, ast-grep structural rules, jscpd duplication?
5. Which structural overengineering patterns are safe enough for deterministic AST rules: single-implementation interfaces, one-variant factories, pass-through wrappers, redundant config objects, unreachable feature flags?

## Sources

- `.opencode/command/adv-slop-scan.md`
- `skills/adv-slop-detection/SKILL.md`
- `skills/adv-slop-detection/CATEGORIES.md`
- `skills/adv-slop-detection/DEAD_CODE.md`
- `slop-smells.yaml`
- `.adv/specs/slop-scan/spec.json`
- `docs/specs/slop-scan.md`
- `plugin/src/adv-slop-scan-assets.test.ts`
- `plugin/src/slop-scan-false-positive-fixtures.test.ts`
- `plugin/src/types/project.ts`
- `plugin/package.json`
- `project.json`
- `docs/cli-surface-matrix.md`
- `ROADMAP.md`
- Local commands: `bin/adv --help`, `bin/adv slop-scan --json`, `pnpm exec eslint --version`, `pnpm exec knip --version`, `command -v eslint knip ts-prune vulture deadcode radon gocyclo`
- Context7 `/websites/knip_dev`
- Context7 `/eslint/eslint`
- Context7 `/ast-grep/ast-grep.github.io`
- Exa: `https://knip.dev/`
- Exa: `https://knip.dev/explanations/comparison-and-migration`
- Exa: `https://www.sonarsource.com/knowledge/languages/ts/`
- Exa: `https://jscpd.dev/`
- Exa: `https://www.youngju.dev/blog/culture/2026-05-16-code-quality-static-analysis-2026-sonarqube-codeclimate-codacy-deepsource-qodo-cover-snyk-code-semgrep-eslint-deep-dive.en`
- Exa: `https://devtoollab.com/blog/best-static-code-analysis-tools`
