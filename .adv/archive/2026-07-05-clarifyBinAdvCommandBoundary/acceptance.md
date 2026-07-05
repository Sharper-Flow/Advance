# Acceptance

Reviewed at: 2026-07-05T03:14:33.169Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `bin/adv --help` includes a command-boundary statement that explicitly says most commands are read-only, while `dashboard install` mutates local user configuration/service state. | pass | `bun test bin/dashboard-cli.test.ts` and final `bun test bin/dashboard-cli.test.ts bin/adv.test.ts` passed. Help test asserts `COMMAND BOUNDARY`, `Most commands are read-only diagnostics/scanners`, and `dashboard install mutates local user configuration/service state`. |
| AC2 | acceptance_criterion | The top-of-file CLI description no longer says or implies the entire `adv` CLI is read-only. | pass | `bin/dashboard-cli.test.ts` static test asserts `bin/adv` source no longer contains `Read-only terminal client` and contains `dashboard install mutates local user service configuration`. |
| AC3 | acceptance_criterion | `dashboard install --dry-run --profile pokeedge --home /home/example` output includes a clear mutation-plan heading and lists both file write targets and `systemctl --user` actions without performing them. | pass | Dry-run test asserts `MUTATION PLAN: dashboard install`, `No changes were made (--dry-run).`, config path, `systemctl --user daemon-reload`, and `systemctl --user enable --now adv-dashboard-pokeedge.service`. |
| AC4 | acceptance_criterion | README local dashboard docs explicitly identify `dashboard install` as the mutating install step and mention `--dry-run` as the preview path. | pass | Static check passed: README contains `preview the mutating install step first`, `bin/adv dashboard install --profile pokeedge --dry-run`, and `This mutating install writes local user configuration/service files`. |
| AC5 | acceptance_criterion | Tests assert the help boundary language and dry-run mutation-plan language. | pass | Dashboard CLI tests lock help boundary, header wording, and dry-run mutation-plan substrings. Final `bun test bin/dashboard-cli.test.ts bin/adv.test.ts` passed (23 tests, 89 expects). |
| AC6 | acceptance_criterion | Existing dashboard server behavior remains read-only and its help/docs still say local dashboard binds to loopback by default. | pass | Help test still asserts `dashboard            Run local read-only ADV/GitHub dashboard` and `Bind host (default: 127.0.0.1)`. No dashboard server code changed. |
| C1 | constraint | Do not remove `dashboard install`. | respected | `dashboard install` remains present; only wording/dry-run output changed. |
| C2 | constraint | Do not change systemd install behavior except wording/output needed to clarify mutation boundaries. | respected | No `runDashboardInstall` non-dry-run behavior changed; changed header/help and `renderDashboardInstallPlan()` dry-run output only. |
| C3 | constraint | Do not add new mutating CLI surfaces. | respected | No new CLI subcommands or mutating surfaces added. |
| C4 | constraint | Do not introduce OCA-specific read-surface/API work. | respected | No OCA-specific read-surface/API references added. |
| C5 | constraint | Keep change scoped to command-boundary clarity and tests. | respected | Touched files limited to `bin/adv`, `bin/dashboard-cli.test.ts`, `README.md`, and `docs/cli-surface-matrix.md`. |
| OOS1 | out_of_scope | Dashboard service redesign. | not_applicable | No dashboard service redesign performed. |
| OOS2 | out_of_scope | Status/roadmap/slop-scan performance optimization. | not_applicable | No status/roadmap/slop-scan performance optimization performed. |
| OOS3 | out_of_scope | Archived listing timeout work. | not_applicable | No archived listing timeout work performed. |
| OOS4 | out_of_scope | Status health-probe TTL work. | not_applicable | No status health-probe TTL work performed. |
| OOS5 | out_of_scope | Broader CLI architecture refactor. | not_applicable | No broader CLI architecture refactor performed. |

