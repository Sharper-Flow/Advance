# Archive Briefing Digest

**Change ID:** completeDeltaTooling
**Title:** Complete delta tooling
**Status:** archived
**Generated:** 2026-07-22T21:35:44.864Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

- **[report_follow_up]** follow_ups: Spec-law delta staging for the new tools is left for the orchestrator (deploy + adv_delta_add after plugin restart)
- **[report_follow_up]** follow_ups: Pre-existing lint errors in plugin/src/tools/archive-helpers/git-finalize.test.ts and plugin/src/temporal/orphan-queue-adopter.test.ts cause `pnpm run check` to fail; they are unrelated to this change
- **[unresolved_action]** required_main_agent_actions: Stage the spec-law delta for these tools via adv_delta_add once the plugin is deployed and the new tool surface is live
- **[unresolved_action]** required_main_agent_actions: Address the unrelated pre-existing lint errors in git-finalize.test.ts / orphan-queue-adopter.test.ts if tk-6 (full suite) needs `pnpm run check` green
- **[archive_only_evidence]** decisions: Implemented four new staged-delta write paths by mirroring the existing add/modify signal → reducer → store → tool chain — Contract requires additive only, no archive-apply changes, and reusing the proven pattern preserves invariants and replay safety
- **[archive_only_evidence]** decisions: Added disk fallback implementations for amend/retract/remove/rename in store-disk.ts — Store interface expanded; any legacy/disk-backed consumers need a complete implementation, and the disk fallback mirrors the Temporal reducer contract
- **[archive_only_evidence]** decisions: Updated registry/policy/catalog/title/banner/preflight/index allowlist snapshots for all four tools — The repository enforces exhaustive parity across these surfaces; leaving any one out breaks CI
- **[archive_only_evidence]** verification: npx vitest run src/temporal/change-state.spec-delta.test.ts (1) — RED phase: new reducer tests failed as expected before implementation fixes (tk-1)
- **[archive_only_evidence]** verification: npx vitest run src/temporal/change-state.spec-delta.test.ts (0) — GREEN phase: tk-1 reducer + signal tests pass (37 tests)
- **[archive_only_evidence]** verification: npx vitest run src/storage/store-temporal/spec-deltas.test.ts (0) — GREEN phase: tk-2 store amend/retract/remove/rename tests pass (7 tests)
- **[archive_only_evidence]** verification: npx vitest run src/tools/spec-delta.test.ts (0) — GREEN phase: tk-3/tk-4 adv_delta_amend/retract/remove/rename tool tests pass (46 tests)
- **[archive_only_evidence]** verification: npx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/tools/spec-delta.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts src/cli-bridge-contract.test.ts src/deploy-local.test.ts (0) — tk-5 wiring: all delta, policy, inventory, contract, and deploy-local tests pass (221 tests)
- **[archive_only_evidence]** verification: npx tsc --noEmit (0) — TypeScript clean
- **[archive_only_evidence]** verification: npx eslint <changed files> (0) — ESLint clean on all changed files
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Tracked JSON schemas in sync
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Generated agent manifests in sync
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkkzan_0452c93b
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkm98u_db51fb57
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkorjy_09f733c3
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwku8x2_4aa27f1a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tsc-typed-v1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: eslint-typed-v1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: schemas-check-typed-v1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manifests-check-typed-v1

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- Stage the spec-law delta for these tools via adv_delta_add once the plugin is deployed and the new tool surface is live
- Address the unrelated pre-existing lint errors in git-finalize.test.ts / orphan-queue-adopter.test.ts if tk-6 (full suite) needs `pnpm run check` green
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkkzan_0452c93b
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkm98u_db51fb57
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwkorjy_09f733c3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrwku8x2_4aa27f1a
- verification_missing: No durable adv_run_test evidence found for run_id: tsc-typed-v1
- verification_missing: No durable adv_run_test evidence found for run_id: eslint-typed-v1
- verification_missing: No durable adv_run_test evidence found for run_id: schemas-check-typed-v1
- verification_missing: No durable adv_run_test evidence found for run_id: manifests-check-typed-v1
