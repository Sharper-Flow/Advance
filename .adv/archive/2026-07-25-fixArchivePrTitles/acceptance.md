# Acceptance

Reviewed at: 2026-07-25T18:52:23.255Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** — Given a target project that requires Conventional Commit PR titles, when Phase 9 creates the archive PR, then the title conforms to an allowed type and is releasable (`feat` / `fix` / `perf`) when a release is intended. | pass | git-finalize.ts:1521-1531,1680-1706 (conventional title construction + release_types enforcement); tests git-finalize.test.ts:4298-4311,5224-5269 |
| AC2 | acceptance_criterion | **AC2** — Given the constructed title would violate the target's title policy, then Phase 9 stops before merge with a typed, actionable blocker (does NOT arm auto-merge, does NOT claim shipped). | pass | git-finalize.ts:1625-1706,1839-1855 (guard blocks before arm; both call sites map !armed.ok→blocked); tests :4276-4296,4336-4420,5277-5313 (re-drive path regression) |
| AC3 | acceptance_criterion | **AC3** — Given a target without Conventional Commit enforcement, then current behavior is preserved with no regression. | pass | project.ts:213 (plain default); git-finalize.ts:1518-1534 (plain→Archive {id} unchanged); tests :4235-4262,5393-5433 |
| AC4 | acceptance_criterion | **AC4** — Tests reproduce the PokeEdge PR #1020 scenario (generic `Archive …` title rejected) and the fixed conforming-title path. | pass | PokeEdge #1020 repro tests git-finalize.test.ts:5217-5270,5354-5387 (generic Archive rejected → fix: title accepted + arms) |
| AC5 | acceptance_criterion | **AC5** — The semantic type (`feat` / `fix` / `perf` / `chore`) is selected from typed change metadata or an explicit bounded choice — never inferred from title-text heuristics. | pass | change.ts:3494-3511 (bounded prTitleType enum); tests change.archive-phase9.test.ts:430-455, git-finalize.test.ts:5437-5487 (metadata + explicit param; no heuristic inference) |
| C1 | constraint | Do not infer semantic impact or prefix from title text heuristics; use typed project policy / change metadata, or require an explicit bounded choice. | respected | Bounded explicit type + typed policy; no title-text inference: change.ts:3494-3511, git-finalize.ts:1531 |
| C2 | constraint | Preserve compatibility for repositories without Conventional Commit enforcement. | respected | Plain/absent policy compatibility unchanged: git-finalize.ts:1518-1534,1624-1707; tests :4235-4262 |
| C3 | constraint | Do not bypass CI, force-merge, rewrite merged commits, or auto-create synthetic release commits. | respected | Normal gh pr merge --auto; policy/lookup failures block instead of force-merge: git-finalize.ts:1711-1719,1839-1855 |
| DONT1 | avoidance | Do not make fragile repository-file inspection the primary CC-detection mechanism. Discovery confirmed the PR-title validator is NOT a required merge check (required = `Sharperflow CI Gate` only); the policy lives in workflow files + semantic-release config, which is unreliable for ADV to read as the source of truth. | respected | Typed project config + bounded input supply the policy; no target repo-file inspection: project.ts:210-228, change.ts:3494-3511 |
| DONT2 | avoidance | Do not treat a "valid Conventional Commit title" as sufficient. A `chore:` title passes the title check but does not trigger a release. The chosen type must match the release intent, not merely the format rule. | respected | Separate release_types membership check (non-releasing type blocks): git-finalize.ts:1693-1706; tests :4276-4311 |

