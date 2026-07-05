# Contract Traceability

**Change ID:** clarifyBinAdvCommandBoundary
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T03:14:33.169Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `bun test bin/dashboard-cli.test.ts` and final `bun test bin/dashboard-cli.test.ts bin/adv.test.ts` passed. Help test asserts `COMMAND BOUNDARY`, `Most commands are read-only diagnostics/scanners`, and `dashboard install mutates local user configuration/service state`. |
| AC2 | acceptance_criterion | pass | test | `bin/dashboard-cli.test.ts` static test asserts `bin/adv` source no longer contains `Read-only terminal client` and contains `dashboard install mutates local user service configuration`. |
| AC3 | acceptance_criterion | pass | test | Dry-run test asserts `MUTATION PLAN: dashboard install`, `No changes were made (--dry-run).`, config path, `systemctl --user daemon-reload`, and `systemctl --user enable --now adv-dashboard-pokeedge.service`. |
| AC4 | acceptance_criterion | pass | test | Static check passed: README contains `preview the mutating install step first`, `bin/adv dashboard install --profile pokeedge --dry-run`, and `This mutating install writes local user configuration/service files`. |
| AC5 | acceptance_criterion | pass | test | Dashboard CLI tests lock help boundary, header wording, and dry-run mutation-plan substrings. Final `bun test bin/dashboard-cli.test.ts bin/adv.test.ts` passed (23 tests, 89 expects). |
| AC6 | acceptance_criterion | pass | test | Help test still asserts `dashboard            Run local read-only ADV/GitHub dashboard` and `Bind host (default: 127.0.0.1)`. No dashboard server code changed. |
| C1 | constraint | respected | static_check | `dashboard install` remains present; only wording/dry-run output changed. |
| C2 | constraint | respected | static_check | No `runDashboardInstall` non-dry-run behavior changed; changed header/help and `renderDashboardInstallPlan()` dry-run output only. |
| C3 | constraint | respected | static_check | No new CLI subcommands or mutating surfaces added. |
| C4 | constraint | respected | static_check | No OCA-specific read-surface/API references added. |
| C5 | constraint | respected | static_check | Touched files limited to `bin/adv`, `bin/dashboard-cli.test.ts`, `README.md`, and `docs/cli-surface-matrix.md`. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No dashboard service redesign performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No status/roadmap/slop-scan performance optimization performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No archived listing timeout work performed. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No status health-probe TTL work performed. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No broader CLI architecture refactor performed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c0c991e1ccc2 | AC1, AC2, AC3, AC5, AC6, C1, C2, C3, C5 | AC1, AC2, AC3, AC5, AC6 | C1, C2, C3, C5 |  |
| tk-0e9f7c945a4f | AC4, AC6, C4, C5 | AC4 | C4, C5 |  |
| tk-25ae0ea8fd38 |  | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5 |  |
