# Contract Traceability

**Change ID:** verifyOpencodeToolVisibility
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-28T06:03:08.529Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | All 42 ADV-owned manifests parse cleanly; check-frontmatter exits 0. adv-tron 11 grants, adv 18 grants, adv-verifier 11. |
| SC2 | success_criterion | pass | review | check-frontmatter.ts chained into pnpm run check; fails with file+error on unparseable YAML |
| SC3 | success_criterion | pass | review | deploy-local.sh check_agent_frontmatter replaced with TS shell-out; blocks ADV-owned assets |
| SC4 | success_criterion | pass | review | injectTier4InvokeRoutingNote test suite (6/6): note placed after frontmatter, idempotent |
| AC1 | acceptance_criterion | pass | test | 9 assets fixed (7 agents via generate:manifests, 2 commands quoted). check-frontmatter exits 0 on all 42. Grant diffs byte-identical. |
| AC2 | acceptance_criterion | pass | test | check-frontmatter.ts exits 1 with file+parser error on unparseable YAML. Unit tests verify parseFrontmatterText returns ok=false for both error classes. |
| AC3 | acceptance_criterion | pass | test | assertPolicyMatch unit tests: detects empty tools map, missing tools key, drifted grants; passes on matching policy |
| AC4 | acceptance_criterion | pass | test | parseFrontmatterText returns ok=true/doc=null for no-frontmatter files (unit test verified) |
| AC5 | acceptance_criterion | pass | test | Reviewer verified: deploy blocks ADV-owned, warns overlay targets. No --force override (KD7). 72/72 deploy tests pass. |
| AC6 | acceptance_criterion | pass | test | Generator unit tests (6/6): note after --- in all manifests, no duplication, grants unchanged. generate:manifests:check green. |
| AC7 | acceptance_criterion | pass | test | Reviewer report: adv-tron 11 grants (was 88), adv 18 (was 88), adv-verifier 11. adv_spec absent from all three. Live agent probe deferred to release. |
| AC8 | acceptance_criterion | pass | test | runtimeFrontmatterCheck unit tests (3/3): budget enforcement, failure reporting. Measured 61ms under Bun vs 300ms budget. |
| C1 | constraint | respected | static_check | generate:manifests:check stays green after generator fix |
| C2 | constraint | respected | static_check | Deploy not yet executed; code ready for trunk deploy after merge |
| C3 | constraint | respected | static_check | Both ingress paths covered: CI check (pnpm run check) + deploy preflight (deploy-local.sh) |
| C4 | constraint | respected | static_check | 300ms budget measured at 61ms under Bun; timing guard skips+warns on exceed |
| C5 | constraint | respected | static_check | All implementation in worktree change/verifyOpencodeToolVisibility |
| DONT1 | avoidance | respected | review | Grant lists byte-identical before/after fix; only note position and description quoting changed |
| DONT2 | avoidance | respected | review | Generator tests confirm note text preserved verbatim, only relocated to body |
| DONT3 | avoidance | respected | review | Static re-probe counted actual ADV grants in parsed manifests, not just parse success |
| DONT4 | avoidance | respected | review | No deployed files hand-edited; deploy preflight runs deploy-local.sh |
| DONT5 | avoidance | respected | review | No capability-warrant tags added to behavioral criteria |
| DONT6 | avoidance | respected | review | Structural guard (check-frontmatter.ts in pnpm run check) + deploy preflight + runtime scan; not a narrow point fix |
| OOS1 | out_of_scope | not_applicable | not_applicable | No agent grant sets changed |
| OOS2 | out_of_scope | not_applicable | not_applicable | No tiering changes |
| OOS3 | out_of_scope | not_applicable | not_applicable | No tool consolidation |
| OOS4 | out_of_scope | not_applicable | not_applicable | No sub-agent prompt routing changes |
| OOS5 | out_of_scope | not_applicable | not_applicable | No opencode.jsonc changes (toolbox-owned) |
| OOS6 | out_of_scope | not_applicable | not_applicable | No skill files modified |
| OOS7 | out_of_scope | not_applicable | not_applicable | rules.yaml not modified (already fixed by b1a2c9af) |
| OOS8 | out_of_scope | not_applicable | not_applicable | No OpenCode core changes |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2dff007e924a | AC2, AC3, AC4 |  | DONT6 |  |
| tk-e79b0750084b | AC6 |  | DONT1, DONT2, DONT6 |  |
| tk-4ff575c816e4 | AC2, AC3, AC4 |  | C1, DONT6 |  |
| tk-8af79cf52fa4 | AC5 |  | C2, DONT4 |  |
| tk-2ca987706ac9 | AC1 |  | DONT1, DONT2 |  |
| tk-cff5c1ca7627 | AC8 |  | C4 |  |
| tk-b51f7a9342d7 |  | AC7 | DONT3 |  |
