# Executive Summary: Reduce Agent Session Context Floor

## What changed

Every ADV agent session — including every spawned sub-agent — eagerly loaded a large instruction floor every model turn. Much of this content was structurally inapplicable to the agent receiving it (e.g., a CI-polling worker received editing and refactoring rules it couldn't act on). This change reduced that floor by demoting dense rationale and recipes to lazily-loaded skill bodies, gating irrelevant skills per agent, eliminating duplicated content across manifests, and adding a regression-prevention budget check.

## Value delivered

- **Instruction file floor reduced 69%**: from 48,345 bytes (8 files) to ~15,000 bytes. The largest single reduction came from truncating the priority rules file (18,905→5,923 bytes, 81% of the rationale prose moved to a skill) and converting 4 runbook files to routing stubs (18,154→1,793 bytes combined).
- **11 irrelevant Cloudflare/Worker skills removed** from every ADV agent's per-turn catalog via render-time deny globs — these skills had zero relevance to this TypeScript plugin repo.
- **Duplicated content eliminated** across 8+ agent manifests — sections that restated always-on instruction content were deleted after verifying the canonical sources carried identical text. A canonical ADV State Access Policy file was created to replace 6 divergent manifest copies.
- **Regression prevention**: a new `check-prompt-budget.ts` script wired into `pnpm run check` measures both byte size and instruction count, failing on growth. Count is the primary metric (peer-reviewed evidence shows instruction count dominates bytes as a degradation lever).
- **Dead config removed**: `.opencode/token-budgets.json` (zero live code consumers) was deleted.
- **All config-home changes mirrored** to the git-tracked toolbox backup, including a pre-existing gap (`adv-tools.md` was missing from the backup).

## Verification

- Full test suite: 5,300 tests passed, 0 failed
- `pnpm run check` passes (schemas, typecheck, manifest generation, frontmatter, test-isolation, prompt-budget, lockfile, lint, format)
- New test assertions in `manifest-doc-drift.test.ts` verify pointer integrity (every demoted section has an eager pointer), trigger eagerness (no routing trigger was demoted), and cross-surface deduplication (deleted manifest content exists in canonical sources)
- 3 new spec requirements staged on `advance-meta` (eager floor budget, load-class axis, skill deny globs)

## Known calibration caveats

1. The SC1 target (≤50,000 B total floor) was set against the original /adv-improve measurement scope (AGENTS×2 + instructions + catalog). The budget check measures a broader surface that includes all agent manifests. The instruction-file floor alone met the target; the total-surface measurement exceeds it due to scope difference.
2. The SC2 target (adv-ci-waiter floor ≤60%) was set before measuring the AGENTS.md baseline. Global AGENTS.md files alone (10,570 B) exceed what 60% would require. Real reduction: 94%→89%. Achieving 60% requires per-agent instruction scoping (tracked as backlog `bl-u7wvyS3n`, upstream OpenCode #10688).
3. The mirror has pre-existing drift on 2 files (`lgrep-tools.md`, `morph-tools.md`) not touched by this change.

## Risks and follow-ups

- **Demoted content undertrigger**: if an agent needs demoted rationale but never invokes the skill, it won't see it. Mitigated by eager pointer lines and conservative depth (only recipes/matrices/rationale demoted; every trigger and enforcement statement stays always-on).
- **Per-agent prompt scoping** (backlog `bl-u7wvyS3n`): the structural end-state — eliminates the 89% inapplicable floor for worker agents. Requires upstream OpenCode support (#10688).
- **OpenCode V2 migration risk**: V2 changes `instructions[]` merge semantics (highest-precedence config wins, arrays don't merge). Existing `deploy-local.sh` guard partially mitigates.