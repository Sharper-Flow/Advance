# Contract Traceability

**Change ID:** addOptimizerCommand
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T18:16:23.750Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `.opencode/command/adv-optimizer.md` exists with `name: adv-optimizer`; manifest-doc drift tests passed. |
| SC2 | success_criterion | pass | review | `plugin/src/manifest.ts` registers `adv-optimizer` as utility, requiresChangeId false, successors adv-proposal/adv-task; manifest tests passed. |
| SC3 | success_criterion | pass | review | README and ADV_INSTRUCTIONS rows match manifest description; `manifest-doc-drift.test.ts` passed. |
| SC4 | success_criterion | pass | review | Command boundary states `ADV State Mutation: none` and forbids code edits, ADV mutation, agenda/task creation, and automatic deletion; optimizer asset test passed. |
| SC5 | success_criterion | pass | review | Command includes `No Nested Scanner Delegation`, first-level scanner packet, and bans sub-agent spawning plus `/adv-*`; optimizer asset test passed. |
| SC6 | success_criterion | pass | review | Command includes `Source Evidence Requirement`, requires file/symbol/metric/citation evidence, and separates low-confidence/user-review/actionable groups; optimizer asset test passed. |
| SC7 | success_criterion | pass | review | Command defines `OPTIMIZER PROPOSAL` with Current State, Ranked Simplification Opportunities, Recommended Long-Term Direction, Risks, Non-Goals, and Next ADV Command; optimizer asset test passed. |
| SC8 | success_criterion | pass | review | Command defines degraded execution for partial report, deterministic evidence only, and failed/timed-out scanners; optimizer asset test passed. |
| SC9 | success_criterion | pass | review | RED failed on missing command; final targeted `pnpm exec vitest run src/adv-optimizer-assets.test.ts src/manifest.test.ts src/manifest-doc-drift.test.ts src/cli-surface-matrix.test.ts` passed 66 tests; cleanup rerun passed 24 tests. |
| C1 | constraint | respected | static_check | Static check confirms `.opencode/agents/adv-optimizer.md` does not exist; command uses existing `explore`/optional `adv-researcher`. |
| C2 | constraint | respected | static_check | Static check confirms `bin/adv` contains no optimizer surface. |
| C3 | constraint | respected | static_check | Command states it does not replace `/adv-slop-scan`; output owns proposal synthesis, not detector reporting. |
| C4 | constraint | respected | static_check | Added optimizer asset tests and updated generic manifest/doc/CLI matrix tests; targeted suites passed. |
| C5 | constraint | respected | static_check | Implementation and checkpoints ran in ADV worktree `/home/jon/.local/share/opencode/worktree/.../change/addOptimizerCommand`. |
| DONT1 | avoidance | respected | review | Command explicitly forbids automatic deletion and says deletion candidates are recommendations for tracked follow-up review only. |
| DONT2 | avoidance | respected | review | Command includes `No Nested Scanner Delegation` and bans scanner workers from spawning additional sub-agents/delegates/workers. |
| DONT3 | avoidance | respected | review | No ADV state files were read directly; ADV state accessed through ADV tools during workflow. |
| DONT4 | avoidance | respected | review | Touched files limited to command/doc/test/manifest/CLI-matrix surfaces for optimizer; unrelated Markdown formatting churn was reverted. |
| DONT5 | avoidance | respected | review | No slash commands were invoked inside orchestration; command contract also bans scanner workers from invoking `/adv-*`. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e2b5d19af387 | SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9 | SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-c848c1e8e3a2 |  | SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9, C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
