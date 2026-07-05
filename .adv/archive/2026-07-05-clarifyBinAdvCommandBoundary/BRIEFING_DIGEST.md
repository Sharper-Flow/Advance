# Archive Briefing Digest

**Change ID:** clarifyBinAdvCommandBoundary
**Title:** Clarify bin/adv command boundary
**Status:** archived
**Generated:** 2026-07-05T03:35:05.894Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

Epic: optimizeAdvPerformanceStructure · Clarify bin/adv command boundary (order 1)

## Durable Facts

Showing 15 of 15 durable facts.

- **[agenda]** follow_ups: Optional: add bin/adv 'dashboard install' disposition row (mutating/no-cli-dangerous-equivalent) to docs/cli-surface-matrix.md — currently the matrix omits the only mutating bin/adv subcommand.
- **[agenda]** follow_ups: Optional: align SETUP.md:1108 CLI description with the clarified mutation boundary if the boundary should be visible in the primary install doc (out of current AC scope).
- **[archive_only_evidence]** sources: bin/adv header + help + install + dry-run: Header line 5 states 'Read-only terminal client' (overstated). runDashboardInstall (412-423) writes config/unit + runs systemctl enable --now (genuine mutation). renderDashboardInstallPlan (499-509) currently starts with 'install <svc>' — no MUTATION PLAN heading, no 'No changes were made' line. runHelp (536-588) lists read-only and mutating subcommands together with no COMMAND BOUNDARY section; --dry-run help (573) is generic.
- **[archive_only_evidence]** sources: bin/dashboard-cli.test.ts existing coverage: Help test only asserts 'dashboard' and '--config <path>' present. Install dry-run test asserts service name/config path/systemctl line but NOT a mutation-plan heading or no-changes line. Confirms AC3/AC5 changes are needed and testable; no existing test locks the current overstated wording.
- **[archive_only_evidence]** sources: README local dashboard section: Already lists write targets (161-162) and systemctl commands (167-168) and labels dashboard server read-only (151,245-247). Does NOT explicitly label 'dashboard install' as the mutating step nor show a --dry-run preview example. AC4 change needed and consistent with existing doc structure.
- **[archive_only_evidence]** sources: advance-meta spec — installer authority law: rq (line 153) constrains scripts/deploy-local.sh CLI installer ('must not add CLI mutation authority'); this governs the deploy-local install of the adv CLI, not the pre-existing dashboard install subcommand. rq-dashboardWorkerFree01 requires dashboard /api/state stay read-only/worker-free — unaffected since design makes no server changes. No spec-law conflict.
- **[archive_only_evidence]** sources: CLI surface matrix: Matrix covers /adv-* commands and adv_* tools only; has no row for bin/adv 'dashboard' or 'dashboard install' subcommands. CI test cli-surface-matrix.test.ts enforces /adv-* and adv_* coverage, not bin/adv subcommands, so absence is not a CI break — but the matrix is silent on the only mutating bin/adv subcommand.
- **[archive_only_evidence]** sources: SETUP.md CLI description: Describes adv as 'Standalone terminal client' — does not overstate whole-CLI read-only, so not a blocker. Design AC scope excludes SETUP.md; low-value optional follow-up only.
- **[archive_only_evidence]** architecture_assessment: The design correctly diagnoses this as a documentation/help/test ambiguity, not a behavioral bug. Evidence confirms bin/adv:5 overstates the whole CLI as read-only while runDashboardInstall genuinely mutates (writes files + systemctl enable --now). The chosen approach — keep CLI shape, fix header/help/dry-run/README wording plus lock with tests — is the minimal boring solution and maps cleanly to all six ACs. Rejected alternatives (split binary, remove install, interactive confirm) are correctly declined: split/remove are heavier and constraint-violating; interactive confirm would change behavior/automation (violates C2/C5). No spec-law conflict: the advance-meta installer-authority law targets deploy-local.sh, not the dashboard install subcommand, and no new mutating CLI surface is added (respects C3). Server/systemd behavior is untouched beyond dry-run text (respects C2, AC6, rq-dashboardWorkerFree01). Two non-blocking gaps: (1) CLI surface matrix has no bin/adv dashboard-install row and design doesn't add one — matrix stays silent on the only mutating bin/adv subcommand though CI won't fail; (2) SETUP.md:1108 also describes the CLI but is neutral, so out-of-scope omission is acceptable.
- **[archive_only_evidence]** verification: tests_run=bun test bin/dashboard-cli.test.ts bin/adv.test.ts, bin/oc-test targeted -- src/cli-surface-matrix.test.ts, bun bin/adv --help && bun bin/adv dashboard install --dry-run --profile pokeedge --home /home/example results=pass — Reviewed bin/adv, bin/dashboard-cli.test.ts, bin/adv.test.ts, README.md, docs/cli-surface-matrix.md, and plugin/src/cli-surface-matrix.test.ts. Bun CLI tests passed: 23 tests, 89 expects. Matrix test passed: 2 tests. Manual help/dry-run command showed COMMAND BOUNDARY, mutation-plan heading, file write targets, and systemctl --user actions; dry-run returned plan only. runDashboardInstall still gates mkdir/writeFile/systemctl behind dryRun=false, preserving non-dry-run behavior aside from wording/output.
- **[unresolved_action]** required_main_agent_actions: Capture the AGENTS.md hardening fix in the change before release/archive.
- **[unresolved_action]** required_main_agent_actions: Do not revisit dashboard install behavior: review found only dry-run/help/docs wording changes; non-dry-run install path still writes config/unit and runs the same systemctl commands.
- **[archive_only_evidence]** changes_made: AGENTS.md: Replaced stale `bin/adv` heading that described the whole CLI as a read-only status CLI with wording that says the CLI has explicit subcommand boundaries.
- **[archive_only_evidence]** verification: tests_run=test -e checks for bin/adv, bin/dashboard-cli.test.ts, README.md, docs/cli-surface-matrix.md, git status --short; git diff --stat origin/trunk...HEAD; git diff --name-only origin/trunk...HEAD, lgrep_search_text: Read-only terminal client; read-only; read-only status CLI; OCA; performance, bun test bin/dashboard-cli.test.ts bin/adv.test.ts, bin/oc-test targeted -- src/cli-surface-matrix.test.ts results=pass — Preflight found all referenced files. Branch diff vs origin/trunk is scoped to README.md, bin/adv, bin/dashboard-cli.test.ts, docs/cli-surface-matrix.md; local hardening fix additionally updates AGENTS.md. `Read-only terminal client` remains only as a negative test assertion; `read-only status CLI` has no hits. OCA/performance scans did not show new in-scope branch content. Bun CLI tests passed: 23 pass, 0 fail, 89 expects. CLI surface matrix targeted Vitest passed: 2 pass, 0 fail.
- **[epic_terminal_note]** epic.membership: optimizeAdvPerformanceStructure · Clarify bin/adv command boundary (order 1)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |

## Unresolved Actions

- Capture the AGENTS.md hardening fix in the change before release/archive.
- Do not revisit dashboard install behavior: review found only dry-run/help/docs wording changes; non-dry-run install path still writes config/unit and runs the same systemctl commands.
