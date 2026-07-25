# Archive Briefing Digest

**Change ID:** fixReleaseProofShippedFalse
**Title:** Fix release-proof shipped false-negative
**Status:** archived
**Generated:** 2026-07-25T15:56:32.688Z

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

Showing 29 of 29 durable facts.

- **[archive_only_evidence]** decisions: Added two scenarios (AC1 shipped acceptance, AC2 non-shipped strict-guard affirmation) to rq-releaseProjectionDurability01 — The prompt's preserve/affirm clause and the asset-test enforcement goal both require the non-shipped strict guard to be explicitly present as a scenario with its own warrant, not merely retained implicitly
- **[archive_only_evidence]** decisions: Bumped advance-workflow spec version to 1.38.0 and updated updated_at — Spec-law convention requires version/date to reflect additive requirement changes
- **[archive_only_evidence]** decisions: Replaced the regex-only asset test with parsed spec assertions — Regex could not enforce the new scenario IDs, warrant annotations, or strict-guard wording; structured assertions cover the strengthened shape and prevent silent weakening
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — 34 tests pass, including strengthened release-projection-durability scenario assertions
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/command-requirement-citations.test.ts src/adv-autonomy-quality-assets.test.ts (0) — 39 tests pass across spec-citation invariant, command citations, and autonomy assets
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts (0) — 20 tests pass; no implementation regressions from spec-only change
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: asset-test-rq-releaseProjectionDurability01
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: static-check-pnpm-run-check
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: related-spec-citation-tests
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: related-archive-gate-unit
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts results=pass — Exit 0. Vitest: 2 files passed, 36 tests passed in 433ms. The asset test parses the JSON spec, asserts the requirement identity/tags and exact five-scenario sequence, then checks scenario .4/.5 Given/When/Then/warrant anchors.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[archive_only_evidence]** decisions: Restructured verifyReleaseGateDurableForArchive to check store-done FIRST, then shipped rescue only when store not done — Preserves existing store-done behavior (source=store) and fixes the always-shipped false-negative by limiting rescue to lagging projections
- **[archive_only_evidence]** decisions: Expanded PR route combo to include pr_auto_merge, pr_manual, and merge_queue — GitFinalizeOutcome ReleaseFinalizationRouteName includes all three PR workflow routes; shipped paths on each set pushStatus=pushed and mergeCommitSha is populated
- **[archive_only_evidence]** decisions: Reverted #305 expectation to source=store and also fixed the adjacent shippedBypass store-done test to source=store — Both are store-done paths; the prior pass incorrectly asserted shipped-finalization
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts (pre-correction) (1) — 1 failed (#305 expected shipped-finalization but code returned store due to missing route on finalization) — confirmed bug
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts (0) — 24/24 tests pass including #305 store-done, AC1/AC2/AC3 shipped rescue, existing disk/evidence tests
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript clean
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test isolation, lockfile, lint, format all green
- **[archive_only_evidence]** decisions: Replaced stale finalizationStatus: string inputs in change.archive-phase9.test.ts with typed GitFinalizeOutcome objects — T2 changed verifyReleaseGateDurableForArchive to derive shipped from finalization.status; the old string property no longer affected behavior and caused AC1/AC2/AC4 assertions to fail. Using the real finalization shape preserves the strict-guard test coverage.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/adv-autonomy-quality-assets.test.ts (0) — 118 tests passed across 3 files
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifests:check, test-isolation, lockfile, lint, format:check all clean
- **[wisdom_candidate]** wisdom_candidates: [pattern] Projection-lag rescue tests must exercise the archive caller, not only the durable-proof helper: assert archived persistence plus canonical done release-gate evidence under a persistently pending store projection.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.archive-phase9.test.ts: Added AC1 end-to-end archive regression: shipped direct finalization with a persistently pending store projection and no disk completion archives successfully, returns a done release gate, carries merge SHA/route evidence, and saves archived state.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts, bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts, pnpm run check results=pass — Focused Phase 9 test passed (49 tests). Final focused suite passed (85 tests). `pnpm run check` passed schemas, TypeScript, generated manifests, isolation/lockfile checks, ESLint, and Prettier.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: asset-test-rq-releaseProjectionDurability01
- verification_missing: No durable adv_run_test evidence found for run_id: static-check-pnpm-run-check
- verification_missing: No durable adv_run_test evidence found for run_id: related-spec-citation-tests
- verification_missing: No durable adv_run_test evidence found for run_id: related-archive-gate-unit
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
