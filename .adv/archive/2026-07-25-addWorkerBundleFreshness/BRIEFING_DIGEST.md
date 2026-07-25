# Archive Briefing Digest

**Change ID:** addWorkerBundleFreshness
**Title:** Add worker-bundle freshness release gate
**Status:** archived
**Generated:** 2026-07-25T19:06:48.387Z

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

Showing 60 of 60 durable facts.

- **[unresolved_action]** required_main_agent_actions: Schedule adv-reviewer to sign off on static_check evidence
- **[archive_only_evidence]** decisions: Inserted rq-workerBundleReleaseProvenance01 between rq-releaseProjectionDurability01 and rq-archiveRecoveryConsistency01 — Keeps the new archive/release-gate requirement adjacent to existing release projection durability requirements in the advance-workflow capability spec
- **[archive_only_evidence]** decisions: Used exact array comparison for scenario IDs in the asset test instead of arrayContaining — Matches the existing releaseProjectionDurability01 assertion style in the same file
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — All 35 tests pass, including new worker bundle release provenance assertions
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-oc-test-targeted-asset-test
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-pnpm-run-check
- **[unresolved_action]** required_main_agent_actions: Remediate review-issue-1 within this task's existing spec/test scope, then rerun the targeted test command before task completion.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts, git diff --check results=pass — Targeted suite: 2 files / 37 tests passed, exit 0. `git diff --check` passed. The asset test parses JSON and checks requirement existence, exact five scenario IDs, tags, warrants, and scenario content; it is not a no-op, but it omits AC5/KD2 hard-readiness assertions.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** decisions: Re-warranted rq-workerBundleReleaseProvenance01.5 from AC5 to no warrant — Scenario .5 is a scope clarification (post-deploy runtime freshness out of scope), not the acceptance criterion. Removing the warrant matches the repo convention for out-of-scope scenarios (e.g., rq-reviewBadTestCleanup01.2).
- **[archive_only_evidence]** decisions: Added rq-workerBundleReleaseProvenance01.6 for AC5 — The actual AC5 is that the provenance check is a hard blocking release-readiness gate in evaluateGateReadiness, not an advisory CRITERION_EVALUATORS criterion. This needed its own scenario.
- **[archive_only_evidence]** decisions: Updated asset test to assert 6 scenarios and the new warrant mapping — Keeps the non-behavioral asset test in sync with the spec change and prevents regression of the warrant placement.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — 37 tests pass across 2 files
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test-isolation, lockfile policy, lint, and format:check all clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-tk-50e16e7530b0
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-tk-50e16e7530b0
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts, git diff --check results=pass — Targeted suite passed: 2 test files / 37 tests, exit 0. `git diff --check` passed. rq-workerBundleReleaseProvenance01 now has exact scenarios .1-.6; .5 has no warrant and remains the runtime out-of-scope boundary; .6 warrants AC5 and explicitly requires evaluateGateReadiness/GateReadinessBlocker placement outside advisory CRITERION_EVALUATORS. Asset assertions lock the six IDs and .5/.6 warrant mapping.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** decisions: Defined WorkerBundleProvenance shape inline in contracts.ts ChangeWorkflowState rather than importing a shared type — Keeps the workflow-state contract self-describing; the payload schema in types/signals.ts is the authoritative validation boundary, and the inline interface mirrors it exactly
- **[archive_only_evidence]** decisions: Added worker_bundle_impact to ChangeWorkflowState/seedState in addition to ChangeSchema — The field is on-disk in Change; preserving it through continue-as-new requires it on workflow state and in the seed allowlist
- **[archive_only_evidence]** decisions: Added workerBundleProvenance only to workflow state and continue-as-new seed, not to Change (disk) seed helper — It is a workflow-provenance receipt, not a disk Change field; it survives rotation via continue-as-new seedState
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/contracts.test.ts (1) — RED: new tests fail before implementation (missing applyWorkerBundleProvenanceRecordedToState and evidence_kind field)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/messages.test.ts src/temporal/change-state.test.ts src/temporal/contracts.test.ts (0) — GREEN: 91 tests pass after implementation including new worker-bundle and evidence_kind tests
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check clean (schemas:check, typecheck, manifests:check, test isolation, lockfile policy, lint, format:check)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/workflows.signal-handlers.itest.ts (0) — Signal-handler integration test suite passes with new signal wired
- **[archive_only_evidence]** decisions: Added `enforceWorkerBundleProvenance` option to `evaluateGateReadiness` rather than making the provenance check unconditional — KD7 requires guarding the new readiness rule with `wf.patched`; the pure evaluator has no access to Temporal APIs, so the workflow passes the flag via options. This preserves pre-patch behavior when the flag is false (default).
- **[archive_only_evidence]** decisions: Matched provenance run IDs to `state.testRuns` by typed `evidence_kind` instead of command substring — KD3 mandates typed matching; command strings vary and are not reliable.
- **[archive_only_evidence]** decisions: Updated `TestRunRecord` interface to include `evidence_kind` — The signal payload already carries the field and stores it in state, but the record type was missing it, so the helper could not type-safely match by evidence kind.
- **[archive_only_evidence]** decisions: Removed unused `checkCompletedTaskEvidencePlan` import from gate-readiness.test.ts while adding the new helper import — Existing lint violation surfaced by `pnpm run check`; fixed as part of the touched test file.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts (1) — RED phase: 4 new worker-bundle provenance tests fail against stub helper (expected missing/failing blockers not returned)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts (0) — GREEN phase: 89 tests pass, including new KD2/KD7 provenance coverage
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript clean across plugin/
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest sync, test isolation, lint, and format all clean
- **[archive_only_evidence]** decisions: Fixed workflows.ts to copy worker_bundle_impact, workerBundleProvenance, and testRuns from input.seedState — Verification revealed these fields were written into continueAsNew/disk-reseed seed by buildChangeWorkflowContinueAsNewSeed/changeSeedStateFromChange but never read back at workflow start, so release-gate evidence was lost after rotation
- **[archive_only_evidence]** decisions: Covered the KD7 replay patch-marker requirement with a continue-as-new replay test instead of a new replay fixture — The deliverable explicitly allowed 'a replay fixture or a continue-as-new replay test covering the patch marker'; the continue-as-new test exercises real workflow rotation with the patched code and verifies the new run still enforces provenance
- **[archive_only_evidence]** decisions: Added AC matrix tests through evaluateGateReadiness rather than only the helper — AC5 requires the check to live in hard readiness; end-to-end tests through evaluateGateReadiness with enforceWorkerBundleProvenance prove the blocker surfaces at the release gate and disappears when not enforced
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/contracts.test.ts src/temporal/__tests__/replay-determinism.test.ts src/tools/change.worker-bundle.test.ts src/temporal/__tests__/continue-as-new.itest.ts (0) — 128 tests passed across 5 files (gate-readiness, contracts, replay-determinism, change.worker-bundle, continue-as-new)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test-isolation, lockfile, lint, format all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.itest.ts (0) — Workflow signal-handlers integration tests pass after workflows.ts seedState fix
- **[unresolved_action]** required_main_agent_actions: Add and verify a committed legacy release-gate replay fixture for `worker-bundle-freshness-v1` before acceptance/release.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated worker manifest/runtime freshness behavior; evaluator intentionally remains state-only and does not claim post-deploy freshness.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A `wf.patched` branch needs a committed replay fixture for both its marker-present and marker-absent history behavior; unit-testing an options flag does not verify Temporal command-history replay.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.ts: Fail closed when `not_applicable` lacks a non-empty rationale or provenance has a blank `source_sha`, preserving typed applicability and valid durable provenance requirements.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.test.ts: Added negative AC coverage for a rationale-free not-applicable declaration and blank provenance source SHA.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/contracts.test.ts, pnpm run check, bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts, pnpm run build:worker, bin/oc-test targeted -- src/temporal/__tests__/continue-as-new.itest.ts results=pass — Targeted gate/contracts tests passed (106 tests); `pnpm run check` passed; committed replay suite passed (13 tests); worker build passed; continue-as-new integration passed (4 tests). A first integration invocation used `bin/oc-test` from plugin/ and failed because that path does not exist; rerun from worktree root passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/contracts.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build:worker
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/continue-as-new.itest.ts
- **[archive_only_evidence]** decisions: Sanitized only the `identity` fields in the exported history and kept the original workflow/run IDs — Matches the existing fixture sanitization policy (identity only); run IDs are required for Temporal history replay
- **[wisdom_candidate]** wisdom_candidates: [success] A committed pre-patch Temporal replay fixture that omits the new wf.patched marker provides deterministic regression coverage for release-gate compatibility paths.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts src/temporal/gate-readiness.test.ts, pnpm --dir plugin run check, git diff --check 5687a5a6^ 5687a5a6 results=pass — Targeted suite passed: 2 files, 112 tests, exit 0. The committed legacy metadata/history pair exists and replay-determinism.test.ts registers it in replayFixtures; its generic replay assertion resolves. gate-readiness.ts blocks blank/absent not_applicable rationale and blank source_sha; gate-readiness.test.ts covers both. Plugin check completed schemas, typecheck, manifest, isolation, lockfile, lint, and formatting checks successfully. Commit diff check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts src/temporal/gate-readiness.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 5687a5a6^ 5687a5a6

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
| OOS3 | out_of_scope | missing |

## Unresolved Actions

- Schedule adv-reviewer to sign off on static_check evidence
- verification_missing: No durable adv_run_test evidence found for run_id: manual-oc-test-targeted-asset-test
- verification_missing: No durable adv_run_test evidence found for run_id: manual-pnpm-run-check
- Remediate review-issue-1 within this task's existing spec/test scope, then rerun the targeted test command before task completion.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-tk-50e16e7530b0
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-tk-50e16e7530b0
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Add and verify a committed legacy release-gate replay fixture for `worker-bundle-freshness-v1` before acceptance/release.
- Do not revisit unrelated worker manifest/runtime freshness behavior; evaluator intentionally remains state-only and does not claim post-deploy freshness.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/contracts.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build:worker
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/continue-as-new.itest.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts src/temporal/gate-readiness.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 5687a5a6^ 5687a5a6
