# Acceptance

Reviewed at: 2026-06-06T04:29:17Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `scripts/deploy-local.sh --check` fails or reports exact drift when PATH `adv` is missing, stale, wrong target, or shadowed. | pass | deploy-local drift classification and PATH shadow paths covered by plugin/src/deploy-local.test.ts and plugin/src/overlay-sync-assets.test.ts; post-review targeted run passed 89 tests. |
| AC2 | acceptance_criterion | `scripts/deploy-local.sh --fix` manages the local `adv` install through deploy-local, not manual edits. | pass | scripts/deploy-local.sh syncs bin payload to $ADV_LOCAL_DEPLOY_ROOT/bin and links $HOME/.local/bin/adv; deploy-local/overlay tests passed. |
| AC3 | acceptance_criterion | `--fix` replaces only recognized ADV CLI artifacts; unrelated `~/.local/bin/adv` content is refused with manual remediation. | pass | Review remediation added regression for unrelated adv containing schema_version=1; post-review targeted run passed 89 tests. |
| AC4 | acceptance_criterion | If `~/.local/bin/adv` is correct but PATH resolves another `adv`, `--check` fails and `--fix` warns with PATH remediation. | pass | PATH shadow handling asserted in deploy-local tests and post-review smoke/targeted verification passed. |
| AC5 | acceptance_criterion | After `--fix`, PATH `adv --version` executes source-current ADV CLI behavior. | pass | Release/deploy-local tests assert stable deployed bin tree and managed symlink; smoke and full suite passed after execution. |
| AC6 | acceptance_criterion | After `--fix`, PATH `adv status --json` emits live-status metadata (`source: "temporal"` on success or fail-closed live error metadata), not stale disk-only `schema_version: 1` JSON. | pass | deploy-local tests assert live Temporal source JSON check and reject schema_version:1 disk-only readiness; cli-bridge contract test passed in targeted run. |
| AC7 | acceptance_criterion | Tests cover missing install, valid managed install, stale regular ADV file, wrong symlink/target, unsafe non-ADV file, and PATH shadowing. | pass | plugin/src/overlay-sync-assets.test.ts and plugin/src/deploy-local.test.ts cover missing install, managed install, stale regular file, wrong target, unsafe file, PATH shadow; targeted run passed 89 tests. |
| AC8 | acceptance_criterion | Docs state supported install path, `--check`, `--fix`, PATH-shadow remediation, and unsafe-file manual recovery. | pass | SETUP.md guidance asserted by plugin/src/release-install-assets.test.ts; targeted docs/release tests passed 77 tests. |
| AC9 | acceptance_criterion | No CLI mutation subcommands are added. | pass | plugin/src/cli-bridge-contract.test.ts passed in targeted run; reviewer found no mutation subcommands. |
| C1 | constraint | Use deploy-local as the durable owner. No direct durable hand-edit of `/home/jon/.local/bin/adv` outside source/deploy logic. | respected | All durable install behavior implemented in scripts/deploy-local.sh; no direct durable hand-edit to ~/.local/bin/adv performed. |
| C2 | constraint | Keep status semantics in source `bin/adv`; this change only ensures installed PATH `adv` reaches source-current behavior. | respected | bin/adv and bin/lib/live-status.ts semantics preserved; deploy-local only installs/syncs the source-current CLI payload. |
| C3 | constraint | Recognized legacy ADV CLI files may be replaced; unrecognized non-ADV files must be refused. | respected | is_recognized_adv_cli_target narrowed by review; unrelated files refused, recognized ADV targets replaceable. |
| C4 | constraint | PATH-shadowing remains visible: `--check` fails; `--fix` repairs managed target then reports PATH remediation if shell resolution still points elsewhere. | respected | check_adv_cli_install increments issue count for PATH shadow in check mode and warns without incrementing in fix mode. |
| C5 | constraint | Release installs must not create a symlink to a temporary extraction directory. | respected | Release package includes bin payload; install.sh requires bin/adv then invokes deploy-local --fix for stable local-share deployment. |
| C6 | constraint | Keep implementation dependency-light: Bash + existing test harness unless design proves otherwise. | respected | Implementation uses Bash, rsync, readlink, grep, existing pnpm/vitest harness; no new dependency added. |
| C7 | constraint | Keep install behavior testable in temporary HOME/PATH fixtures. | respected | overlay-sync-assets fake HOME/PATH and fake rsync tests passed post-review. |
| DONT1 | avoidance | Do not add CLI mutation authority: no gate completion, archive, cancellation, task mutation, destructive repair, or automatic Temporal restart. | respected | Reviewer verdict READY; cli-bridge contract tests passed; no gate/archive/task mutation subcommands introduced. |
| DONT2 | avoidance | Do not duplicate or weaken source live-status surfaces: `bin/adv`, `bin/lib/live-status.ts`, `plugin/src/cli-bridge-contract.test.ts`, or `advance-meta` `rq-statusCliBridge01`. | respected | Reviewer checked live-status surface; bin/adv live-status semantics preserved and cli-bridge contract tests passed. |
| DONT3 | avoidance | Do not silently fall back to stale disk-only `schema_version: 1` status JSON. | respected | deploy-local validation requires source:"temporal" and rejects disk-only schema_version:1; tests passed. |
| DONT4 | avoidance | Do not overwrite unrelated `~/.local/bin/adv` content. | respected | Review found and fixed broad ownership heuristic; regression verifies unrelated schema_version=1 file refused. |
| DONT5 | avoidance | Do not treat matching `adv --version` output alone as proof of source-current behavior. | respected | Source-current proof uses adv status --json live Temporal metadata check, not adv --version alone. |
| DONT6 | avoidance | Do not reintroduce `acp-mux` local binary deployment. | respected | Deploy summary still reports acp-mux archived/skipped; no acp-mux local binary deployment added. |

