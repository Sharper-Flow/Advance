# Research Pack: ADV Scan Improvement Opportunities

- Target: `/adv-slop-scan` bloat/dead-code reachability and `/adv-arch-scan` technology-specific anti-pattern detection
- Mode: scoped
- Created: 2026-05-21
- Updated: 2026-05-21

## Purpose & Scope

This pack evaluates two scanner improvements: expanding `/adv-slop-scan` from generic slop/dead-code signals into bloat-removal and uncallable-path detection, and expanding `/adv-arch-scan` from generic dependency/structural-correctness checks into technology-specific anti-pattern checks for each detected stack component. It deliberately does not create ADV changes, mutate ADV state, run scanner commands, or prescribe exact task graphs.

## Current State

### Security

- MEDIUM — `/adv-arch-scan` can detect structural-correctness/security boundary ownership generically, but it does not define stack-specific security anti-pattern packs (for example Temporal workflow/activity boundary misuse or OpenCode plugin trust-boundary mistakes). Evidence: `.opencode/command/adv-arch-scan.md:53-63`; `skills/adv-arch-detection/SKILL.md:31-34`; `docs/specs/arch-scan.md:16-17`.

### Reliability

- HIGH — The repo already documents project-specific Temporal replay and workflow-surface hazards, but `/adv-arch-scan` has no corresponding Temporal rule pack, so a scan is unlikely to immediately flag ADV-specific Temporal anti-patterns. Evidence: `AGENTS.md:79-89`; `plugin/src/temporal/workflow-bundle-boundary.test.ts:45-53`, `97-106`, `113-137`; `.opencode/command/adv-arch-scan.md:42-49` only lists generic TypeScript/Node graph tools.

### Testing

- HIGH — Existing asset tests guard that `/adv-slop-scan` documents dead-code and structural-correctness behavior, and `/adv-arch-scan` documents P33 boundaries, but there is no asset/spec evidence for uncallable path detection or per-technology anti-pattern packs. Evidence: `plugin/src/adv-slop-scan-assets.test.ts:68-86`, `88-104`; `plugin/src/adv-arch-scan-assets.test.ts:28-49`; `lgrep_search_text("Temporal", path="/home/jon/dev/advance/.opencode/command")` returned no results.

### Observability

- MEDIUM — Both scanners persist only aggregate finding counts to project metadata, which is useful for status but not enough to trend detector coverage gaps such as skipped dead-code tools, missing stack packs, or degraded detection. Evidence: `.opencode/command/adv-slop-scan.md:125-132`; `.opencode/command/adv-arch-scan.md:87-96`.

### Developer Experience

- HIGH — `/adv-slop-scan` already mentions dead code, but the user-facing command description and phase text frame the command as AI slop/defensive/nested code, not bloat-removal and “raise if unsure” cleanup guidance. Evidence: `.opencode/command/adv-slop-scan.md:2-3`, `54-60`; `README.md:280`; `ADV_INSTRUCTIONS.md:148`.

### Code Quality

- HIGH — The dead-code model is present but too narrow for the requested “code paths that aren’t ever used or potentially even able to be called” goal. Current guidance covers unreferenced symbols/files and warns about false positives; it does not specify call graph, entrypoint reachability, feature-flag truthiness, or impossible branch analysis. Evidence: `skills/adv-slop-detection/DEAD_CODE.md:13-24`; `slop-smells.yaml:458-467`; `lgrep_search_text("reachable", path="/home/jon/dev/advance/skills")` found only `DEAD_CODE.md:23`.

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction |
|---|---|---|---|---|
| Dead/bloat detection | `/adv-slop-scan` runs `vulture`, `knip`, `deadcode` when available and reports `MAINT-003`. Evidence: `.opencode/command/adv-slop-scan.md:56-60`; `skills/adv-slop-detection/DEAD_CODE.md:5-18`. | Knip detects unused dependencies, exports, and files; package `main`, `bin`, `exports`, and scripts define entry files; `includeEntryExports` can report unused entry exports; `@public` can protect intentional public exports. Source: Context7 `/websites/knip_dev`. | DRIFTED | Add a bloat/removal detector mode that distinguishes unused dependency/export/file, protected public/exported surfaces, generated/fixture scopes, and “ask user if unsure” findings. Minimum fix: extend `DEAD_CODE.md`, `slop-smells.yaml`, command prompt, and asset tests with reachability/confidence rules. Greenfield: design slop scan around “actionable deletion candidates” plus low-confidence review candidates. |
| Uncallable path/reachability | Current catalog includes unreachable branches as a `MAINT-003` indicator, but no detector contract beyond dead-code tools. Evidence: `slop-smells.yaml:461-467`; `skills/adv-slop-detection/DEAD_CODE.md:21-24`. | Graph-backed tools are increasingly emphasizing deterministic reachability and dead-code graph queries; Fallow advertises unused files/exports/dependencies, circular deps, boundaries, and optional runtime evidence. Sources: `https://pharaoh.so/blog/codebase-intelligence-tool-comparison-2026/`; `https://github.com/fallow-rs/fallow/`. | ANTI-PATTERN | Do not treat text-only “unused-looking” code as deletion authority. Add deterministic reachability stages: configured entrypoints → import graph → exported/public-surface classification → optional test/runtime coverage evidence → low-confidence user escalation. Greenfield: scanner outputs deletion-safety class, not just severity. |
| Architecture dependency rules | `/adv-arch-scan` knows TypeScript/Node via dependency-cruiser/madge and generic circular/layer/orphan categories. Evidence: `.opencode/command/adv-arch-scan.md:37-49`; `skills/adv-arch-detection/SKILL.md:55-63`. | dependency-cruiser supports explicit forbidden rules for circular deps, production-to-test imports, devDependencies from `src`, and orphan modules; it can run validation in CI. Source: Context7 `/sverweij/dependency-cruiser`. | SOUND, incomplete | Keep dependency-cruiser/madge, but add generated rule packs per detected local architecture: `temporal/`, `tools/`, `storage/`, `utils/`, command/skill/spec assets. Greenfield: repo-owned `.dependency-cruiser`/equivalent config generated from ADV architecture facts. |
| Temporal-specific anti-patterns | ADV documents Temporal-specific constraints outside arch-scan: signal/query-only change workflow surface, no forbidden imports into workflow bundle, and cache refresh discipline. Evidence: `AGENTS.md:79-89`; `plugin/src/temporal/workflow-bundle-boundary.test.ts:97-137`. | Temporal TypeScript docs separate deterministic Workflow logic from Activities for external work/retries, show signals/queries/updates, and model Activity retry/timeouts/cancellation. Source: Context7 `/temporalio/sdk-typescript`. | DRIFTED | Add stack packs: Temporal TypeScript pack checks workflow bundle imports, workflow/activity boundary, signal/update policy, retry/timeout/heartbeat placement, deterministic timer API usage, and project-specific “no `defineUpdate` on change workflow surface.” Greenfield: arch-scan detects stack components from source roots and applies pack rules before generic heuristics. |
| Evidence/confidence | Slop scan has strong confidence grouping and low-confidence separation. Evidence: `.opencode/command/adv-slop-scan.md:115-124`; `skills/adv-slop-detection/SKILL.md:90-98`. | External AI security/code review tools increasingly emphasize repository-wide reasoning with transparent evidence and explicit uncertainty. Source: `https://aws.amazon.com/blogs/security/aws-security-agent-full-repository-code-scanning-feature-now-available-in-preview/`. | SOUND | Reuse this model for deletion candidates and tech anti-pattern packs: actionable only when tool/source evidence proves it; otherwise raise to user as low-confidence review. |

## Competitors & Alternatives

1. **Fallow** — TS/JS static layer for unused code, duplication, circular deps, complexity hotspots, and architecture boundaries; optional runtime layer for production execution evidence. Relevance: closest match for bloat + reachability/deletion safety. Source: `https://github.com/fallow-rs/fallow/`.
2. **SonarQube architecture management** — reverse-engineers current architecture and enforces intended architecture through quality gates. Relevance: validates `/adv-arch-scan` direction toward explicit architecture rules, not just heuristics. Source: `https://www.sonarsource.com/blog/code-architecture-management-general-availability-in-sonarqube`.
3. **TrueCourse** — AI architecture/code intelligence with deterministic and LLM rules for circular deps, layer violations, dead modules, race conditions, and security anti-patterns. Relevance: supports hybrid deterministic + semantic rule packs similar to ADV scanners. Source: `https://github.com/truecourse-ai/truecourse`.

## Emerging Patterns

1. **Graph-backed codebase intelligence over MCP** — deterministic repo graphs provide reachability, blast-radius, duplicate-logic, and dead-code answers to coding agents. Maturity: growing. Source: `https://pharaoh.so/blog/codebase-intelligence-tool-comparison-2026/`.
2. **Repo-wide AI review with explicit uncertainty and evidence** — scanners reason across architecture/trust boundaries and present findings with transparent evidence instead of raw pattern matches. Maturity: preview/growing. Source: `https://aws.amazon.com/blogs/security/aws-security-agent-full-repository-code-scanning-feature-now-available-in-preview/`.

## Applicability to This Repo

- Apply high confidence: extend `/adv-slop-scan` dead-code guidance into deletion-candidate taxonomy: unused dependency, unused export, unused file, unreachable branch, impossible feature-flag path, and uncallable private symbol. Local refs: `skills/adv-slop-detection/DEAD_CODE.md`, `slop-smells.yaml`, `.opencode/command/adv-slop-scan.md`.
- Apply high confidence: add “raise to user if unsure” handling as low-confidence/non-blocking findings, aligned with current confidence model. Local refs: `.opencode/command/adv-slop-scan.md:115-124`; `skills/adv-slop-detection/DEAD_CODE.md:21-24`.
- Apply high confidence: introduce `/adv-arch-scan` stack rule packs for detected tech pieces: Temporal TypeScript, OpenCode plugin/Bun runtime, Zod schemas, Vitest/Node test boundary, pnpm lock policy, command/skill/spec assets. Local refs: `project.md` Tech Stack; `AGENTS.md:79-123`; `plugin/package.json:33-60`.
- Apply medium confidence: consider dependency-cruiser config or generated rule-set output, but avoid making dependency-cruiser the sole authority for Temporal workflow safety because project-specific tests already encode stronger invariants. Local refs: `plugin/src/temporal/workflow-bundle-boundary.test.ts`.
- Reject for now: paid/runtime-only execution evidence as a mandatory requirement. It is useful for deletion safety but conflicts with scanner portability unless optional.

## Open Questions for Research

1. Should `/adv-slop-scan` run `knip` via `pnpm dlx` opportunistically, or require a repo-local config to avoid noisy public-export false positives?
2. Which entrypoints should define deletion reachability in ADV: `plugin/src/index.ts`, `tool-registry.ts`, command/skill files, package scripts, tests, or all of the above?
3. Should `/adv-arch-scan` tech packs be static markdown prompt rules, executable detectors, or generated config for tools such as dependency-cruiser?
4. Which Temporal anti-patterns should be project-specific hard blockers versus general low-confidence warnings?
5. Should scanner metadata persist skipped detectors and degraded coverage, or only final finding counts?

## Sources

- Context7 `/temporalio/sdk-typescript`
- Context7 `/websites/knip_dev`
- Context7 `/sverweij/dependency-cruiser`
- `https://pharaoh.so/blog/codebase-intelligence-tool-comparison-2026/`
- `https://github.com/fallow-rs/fallow/`
- `https://www.sonarsource.com/blog/code-architecture-management-general-availability-in-sonarqube`
- `https://github.com/truecourse-ai/truecourse`
- `https://aws.amazon.com/blogs/security/aws-security-agent-full-repository-code-scanning-feature-now-available-in-preview/`
- Local evidence: `.opencode/command/adv-slop-scan.md`, `.opencode/command/adv-arch-scan.md`, `skills/adv-slop-detection/*`, `skills/adv-arch-detection/SKILL.md`, `docs/specs/slop-scan.md`, `docs/specs/arch-scan.md`, `AGENTS.md`, `plugin/src/temporal/workflow-bundle-boundary.test.ts`, `plugin/src/adv-slop-scan-assets.test.ts`, `plugin/src/adv-arch-scan-assets.test.ts`.
