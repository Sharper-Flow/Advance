# Archive Briefing Digest

**Change ID:** fixQuarantineRouting
**Title:** Fix quarantine routing
**Status:** archived
**Generated:** 2026-08-01T22:13:37.732Z

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

No Epic membership

## Durable Facts

Showing 24 of 24 durable facts.

- **[archive_only_evidence]** decisions: Resolved identity from store.paths.root and quarantine/audit state from store.paths.external ?? store.paths.root — External state directories are non-Git; identity must come from the actual Git root.
- **[archive_only_evidence]** decisions: Renamed executeQuarantine input field from projectDir to stateRoot — Makes the identity/state separation structural.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change-projection-quarantine.test.ts -t "resolves project identity from git root when external state root is non-git" (1) — RED: new external-vs-git identity test fails on pre-fix code because identity resolution receives the non-git external path
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change-projection-quarantine.test.ts -t "resolves project identity from git root when external state root is non-git" (0) — GREEN: same targeted test passes after separating git identity from external state root
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change-projection-quarantine.test.ts (0) — VERIFY: full quarantine test file passes (15/15) with the fix applied
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msaw79vw_6ee97c26
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msaw7uaj_32bb2ed1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msawa9fg_cd3f8e1e
- **[unresolved_action]** required_main_agent_actions: Before checkpoint, resolve the worktree's 12-commit origin/trunk drift under the normal worktree workflow; rerun the focused test if rebase changes this subsystem.
- **[unresolved_action]** required_main_agent_actions: No code remediation required from this review.
- **[archive_only_evidence]** verification: tests_run=git diff --check, pnpm exec vitest run src/tools/change-projection-quarantine.test.ts results=pass — git diff --check returned clean. Focused Vitest run passed: 1 file, 15 tests, exit 0 (durable run tr_msawie8t_1c391e1b). Source review confirms project identity is resolved from store.paths.root while quarantine/audit operations use store.paths.external ?? store.paths.root; approval/refusal, locked re-diagnosis, atomic rename, audit rollback, and no store/Temporal reconstruction remain covered.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec vitest run src/tools/change-projection-quarantine.test.ts
- **[archive_only_evidence]** decisions: Resolved identity from store.paths.root and quarantine/audit state from store.paths.external ?? store.paths.root — External state is non-Git; identity must come from the repository root.
- **[archive_only_evidence]** verification: node baseline assertion against HEAD quarantine tool (1) — RED: pre-fix baseline derived Git identity from external state path.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change-projection-quarantine.test.ts (0) — GREEN: full quarantine file passed 15/15.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-projection-quarantine.test.ts (0) — Post-rebase verification: targeted suite passed 15/15.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msawlk53_3d7a40d1
- **[archive_only_evidence]** decisions: Resolved identity from store.paths.root and quarantine/audit state from store.paths.external ?? store.paths.root — External state is non-Git; identity must come from the repository root.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-projection-quarantine.test.ts (0) — Final durable post-rebase verification: targeted suite passed 15/15.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msaxar9n_e58fe5ee
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change-projection-quarantine.test.ts, bin/oc-test targeted -- src/cli-bridge-contract.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts results=pass — Targeted quarantine suite passed: 1 file, 15 tests (1.88s). Registration/role-policy/CLI bridge contract suite passed: 3 files, 59 tests (7.50s). Review confirmed dry-run diagnosis is non-mutating, project identity resolves from git root while containment/audit use external state root, approved quarantines are rename-only with audit and rollback, and healthy/missing/unapproved/evidence-free inputs are refused.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-projection-quarantine.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/cli-bridge-contract.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts

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

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_msaw79vw_6ee97c26
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msaw7uaj_32bb2ed1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msawa9fg_cd3f8e1e
- Before checkpoint, resolve the worktree's 12-commit origin/trunk drift under the normal worktree workflow; rerun the focused test if rebase changes this subsystem.
- No code remediation required from this review.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec vitest run src/tools/change-projection-quarantine.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msawlk53_3d7a40d1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msaxar9n_e58fe5ee
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-projection-quarantine.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/cli-bridge-contract.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts
