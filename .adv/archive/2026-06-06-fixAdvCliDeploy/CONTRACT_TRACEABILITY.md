# Contract Traceability

**Change ID:** fixAdvCliDeploy
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T04:29:17Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | deploy-local drift classification and PATH shadow paths covered by plugin/src/deploy-local.test.ts and plugin/src/overlay-sync-assets.test.ts; post-review targeted run passed 89 tests. |
| AC2 | acceptance_criterion | pass | test | scripts/deploy-local.sh syncs bin payload to $ADV_LOCAL_DEPLOY_ROOT/bin and links $HOME/.local/bin/adv; deploy-local/overlay tests passed. |
| AC3 | acceptance_criterion | pass | test | Review remediation added regression for unrelated adv containing schema_version=1; post-review targeted run passed 89 tests. |
| AC4 | acceptance_criterion | pass | test | PATH shadow handling asserted in deploy-local tests and post-review smoke/targeted verification passed. |
| AC5 | acceptance_criterion | pass | test | Release/deploy-local tests assert stable deployed bin tree and managed symlink; smoke and full suite passed after execution. |
| AC6 | acceptance_criterion | pass | test | deploy-local tests assert live Temporal source JSON check and reject schema_version:1 disk-only readiness; cli-bridge contract test passed in targeted run. |
| AC7 | acceptance_criterion | pass | test | plugin/src/overlay-sync-assets.test.ts and plugin/src/deploy-local.test.ts cover missing install, managed install, stale regular file, wrong target, unsafe file, PATH shadow; targeted run passed 89 tests. |
| AC8 | acceptance_criterion | pass | test | SETUP.md guidance asserted by plugin/src/release-install-assets.test.ts; targeted docs/release tests passed 77 tests. |
| AC9 | acceptance_criterion | pass | test | plugin/src/cli-bridge-contract.test.ts passed in targeted run; reviewer found no mutation subcommands. |
| C1 | constraint | respected | static_check | All durable install behavior implemented in scripts/deploy-local.sh; no direct durable hand-edit to ~/.local/bin/adv performed. |
| C2 | constraint | respected | static_check | bin/adv and bin/lib/live-status.ts semantics preserved; deploy-local only installs/syncs the source-current CLI payload. |
| C3 | constraint | respected | static_check | is_recognized_adv_cli_target narrowed by review; unrelated files refused, recognized ADV targets replaceable. |
| C4 | constraint | respected | static_check | check_adv_cli_install increments issue count for PATH shadow in check mode and warns without incrementing in fix mode. |
| C5 | constraint | respected | static_check | Release package includes bin payload; install.sh requires bin/adv then invokes deploy-local --fix for stable local-share deployment. |
| C6 | constraint | respected | static_check | Implementation uses Bash, rsync, readlink, grep, existing pnpm/vitest harness; no new dependency added. |
| C7 | constraint | respected | static_check | overlay-sync-assets fake HOME/PATH and fake rsync tests passed post-review. |
| DONT1 | avoidance | respected | review | Reviewer verdict READY; cli-bridge contract tests passed; no gate/archive/task mutation subcommands introduced. |
| DONT2 | avoidance | respected | review | Reviewer checked live-status surface; bin/adv live-status semantics preserved and cli-bridge contract tests passed. |
| DONT3 | avoidance | respected | review | deploy-local validation requires source:"temporal" and rejects disk-only schema_version:1; tests passed. |
| DONT4 | avoidance | respected | review | Review found and fixed broad ownership heuristic; regression verifies unrelated schema_version=1 file refused. |
| DONT5 | avoidance | respected | review | Source-current proof uses adv status --json live Temporal metadata check, not adv --version alone. |
| DONT6 | avoidance | respected | review | Deploy summary still reports acp-mux archived/skipped; no acp-mux local binary deployment added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-677c5fed0876 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-be6da32bf4e8 | AC8 | AC8 | C1, C5, C6, DONT3, DONT6 |  |
| tk-7e258baa06de |  | AC2, AC5, AC6, AC9 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-526440595ed2 | AC1, AC2, AC3, AC4, AC6, AC8, AC9, C1, C2, C3, C4, C5, C6, C7 | AC7, AC8, AC9 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-de6d6d8edf08 | AC2, AC5, C1, C5, C6, C7 | AC2, AC5, AC7 | DONT1, DONT4, DONT6 |  |
| tk-20911b50c224 | AC1, AC3, AC4, C1, C3, C4, C7 | AC1, AC3, AC4, AC7 | DONT1, DONT4, DONT5, DONT6 |  |
| tk-54eae4ca32ff | AC6, AC9, C2, C5, C6 | AC6, AC7, AC9 | DONT1, DONT2, DONT3, DONT5, DONT6 |  |
| tk-6e66b550ec40 | AC5, AC6, AC8, C1, C2, C4, C5 | AC8 | DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-ff8701595fe1 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | Verification-only task; no implementation obligations. |
