# Archive Briefing Digest

**Change ID:** fixTemporalPatchNondeterminism
**Title:** Fix Temporal patch nondeterminism
**Status:** archived
**Generated:** 2026-07-21T20:21:51.041Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage

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

Epic: hardenTemporalReliability · Fix Temporal patch nondeterminism (order 4)

## Durable Facts

Showing 59 of 59 durable facts.

- **[archive_only_evidence]** decisions: Used a dedicated recording/replay workflow pair with identical exported workflow names. — A live history is recorded against activity-then-timer code, then replayed against timer-then-activity code; this isolates a real command-boundary ordering divergence without production workflow or captured-history changes.
- **[archive_only_evidence]** decisions: Used an activity and timer rather than patch markers. — The regression directly asserts Temporal nondeterminism from command order drift, as required by SC4.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run --project temporal src/temporal/__tests__/command-boundary-replay-drift.itest.ts (0) — GREEN: dedicated Temporal integration test records a live activity-then-timer history and confirms replay rejects timer-then-activity code.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — VERIFY: TypeScript typecheck passes.
- **[archive_only_evidence]** decisions: Excluded both plugin and Temporal manifests from payload rsync, then published the Temporal manifest atomically after destination worker/workflow hash validation. — The Temporal manifest becomes the final worker-bundle publication marker and no refresh occurs on missing, malformed, or mismatched bundles.
- **[archive_only_evidence]** decisions: Updated adjacent deployment fixtures to include valid hash-bearing Temporal manifests and required MCP output. — Deploy freshness and worker-refresh tests must reach their publication/refresh assertions under the stricter manifest contract.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-plugin-manifest.test.ts (0) — 3 manifest-publication tests pass, including new Temporal manifest publish-last regression.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts (0) — 8 deployed-worker refresh regression tests pass after valid temporal-manifest fixture update.
- **[archive_only_evidence]** verification: bash -n scripts/deploy-local.sh (0) — Shell syntax validation passes.
- **[archive_only_evidence]** decisions: Aligned both session-registration assertions with NanoID's canonical URL-safe alphabet. — The generator uses nanoid(8), whose valid alphabet includes underscore and hyphen; broadening only the assertions preserves secure opaque generation.
- **[archive_only_evidence]** decisions: Restored literal change.json to the ADV state-access policy while contracting nearby wording. — The agent contract must name the forbidden artifact explicitly; removing 'including' keeps the compressed prompt no larger.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/plugin-init.session-registration.test.ts src/subagent-reports-spec-assets.test.ts src/deploy-local.test.ts src/tool-name-assets.test.ts (0) — Passed: 4 test files, 111 tests. Covers session registration IDs, artifact-access prompt contract, prompt compression ceiling, and effective-prompt byte budget.
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION headings; analysis followed the user's five validation points and stated boundaries.
- **[report_follow_up]** follow_ups: I do not know whether each live poisoned history contains oldId until capture and inspection; per-marker deprecatePatch safety remains undecided.
- **[report_follow_up]** follow_ups: Verify semantics against the exact pnpm-locked @temporalio version during implementation; current official docs/source establish canonical behavior.
- **[research_citation]** sources: Temporal TypeScript Workflow Versioning docs: Official patch lifecycle requires patched(), then deprecatePatch() only after pre-patch executions are gone, then removal. (https://docs.temporal.io/develop/typescript/workflows/versioning)
- **[research_citation]** sources: Temporal TypeScript patch implementation: Replay lookahead populates known patches; an absent newly inserted patch returns false and emits no marker command. (https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/internals.ts#L1191-L1212)
- **[research_citation]** sources: Temporal Core patch state machine: State table covers present, absent, and deprecated markers during execution and replay. (https://github.com/temporalio/sdk-core/blob/master/crates/sdk-core/src/worker/workflow/machines/patch_state_machine.rs)
- **[research_citation]** sources.omitted: 12 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: NEEDS_REVISION. Design correctly chooses real-history replay and fail-closed startup validation, but incorrectly treats patched() as occupying a fixed absolute command index. Core lookahead omits/skips patch calls absent from history, so inserting patched("B") above patched("A") does not alone invalidate history containing only A. Path B also overstates deprecatePatch: it is safe only after pre-patch histories are gone, while v2 is a separate subsequent versioning operation. Manifest design duplicates an existing dist/temporal/bundle-manifest.json primitive; needed work is cryptographic file verification and atomic deploy/startup enforcement across every Worker.create path.
- **[unresolved_action]** validation.blockers: Absolute patch-index premise is false: patched("B") inserted above recorded patched("A") is a supported lenient case when B is absent from history, so the proposed marker-only forward-drift fixture does not prove TMPRL1100.
- **[unresolved_action]** validation.blockers: Path B incorrectly presents deprecatePatch(oldId)+patched(v2) as a generic marker-relocation migration. deprecatePatch is safe only after no live pre-patch histories/workers remain; v2 is a distinct later patch.
- **[unresolved_action]** validation.blockers: Subsystem 3 proposes a new worker manifest despite an existing bundle-manifest.json build primitive, while missing the actual gaps: file rehash verification, deploy validation/publish-last, and enforcement across all Worker.create paths.
- **[report_follow_up]** follow_ups: The scout packet did not expose conflict-scan prior-consideration data; candidate status 'new' in final output means no contrary evidence was supplied, not archive proof.
- **[research_citation]** sources: Temporal TypeScript versioning documentation: Documents patched → deprecatePatch → remove lifecycle and safety window for open executions. (https://docs.temporal.io/develop/typescript/workflows/versioning)
- **[research_citation]** sources: Temporal Worker-process documentation: Documents runtime workflowsPath for development and prebuilt workflowBundle for production. (https://docs.temporal.io/develop/typescript/workers/run-worker-process)
- **[research_citation]** sources: Temporal TypeScript production sample: Official sample builds workflow code ahead of time and selects workflowBundle in production. (https://github.com/temporalio/samples-typescript/tree/main/production)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Scout candidates, in payoff/risk order: (1) shared production-only pre-Worker.create artifact rehash verifier across all worker creation paths (SC3/SC4/C4/DONT5; low risk; design around); (2) add six sanitized histories to existing replay fixture registry (SC1/SC5/C5/DONT4; low risk; adopt); (3) one command-boundary forward-drift regression rather than patch-order-only oracle (SC2/SC4/C2; low risk; adopt); (4) deploy temporal bundle files then publish and destination-verify manifest last (SC3/C4/DONT5; low risk; design around); (5) explicit decision on prebuilt production workflowBundle (SC3/SC4/C4; medium risk; surface).
- **[report_follow_up]** follow_ups: Packet supplied all required identity and scope anchors. Episode recall capability was unavailable on active surface, so no advisory recall was performed.
- **[research_citation]** sources: Temporal TypeScript Workflow Versioning: Documents patching lifecycle, replay marker behavior, deprecatePatch timing, and Replay Testing. (https://docs.temporal.io/develop/typescript/workflows/versioning)
- **[research_citation]** sources: Temporal safe Workflow deployments: Recommends replaying existing event histories against current Workflow code before deployment. (https://docs.temporal.io/develop/safe-deployments)
- **[research_citation]** sources: Temporal Workflow definition: Lists Activities, timers, patch calls, and Workflow Search Attribute upserts among deterministic Workflow command-affecting operations. (https://docs.temporal.io/workflow-definition)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Caution. Design matches canonical Temporal approach: derive compatibility work from real replay histories, use patched/deprecatePatch only as versioned branches, and pin fixes with replay tests. It reuses existing local replay and manifest primitives rather than introducing a second subsystem. One design ambiguity remains: repository resolvers select workflows.ts solely when workflows.js is absent, so no existing explicit development/production boundary establishes when manifest enforcement may be bypassed. The verifier design must name a non-spoofable production discriminator and reject arbitrary workflowsPath overrides in production. Spec-law implication: extend existing replay-determinism and Worker.create drift guards, preserving no deletion/recreation, unchanged changeWorkflow signature, one manifest format, and real-history coverage.
- **[unresolved_action]** required_main_agent_actions: Remediate AC6: create or identify the recovery Epic entry, add a typed validated recovery target for immutable classifications, populate all five immutable fixtures, and rerun replay corpus tests.
- **[unresolved_action]** required_main_agent_actions: Remediate C4/AC2: enforce auditSanitizedHistory against every committed poisoned-production fixture in replay-determinism.test.ts; add nested document/task/subagent-report sanitization cases, regenerate or re-sanitize any failing fixtures, and rerun targeted plus full verification.
- **[unresolved_action]** required_main_agent_actions: After remediation, request a new independent acceptance review. Leave worker manifest architecture, deployment publication ordering, command-boundary regression, and workflow signatures unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Fixture-generation sanitization is not durable proof: replay corpus tests must re-audit committed captured histories so later fixture edits cannot reintroduce task/document/evidence payloads.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/temporal/replay-history-classification.test.ts plugin/src/temporal/__tests__/replay-determinism.test.ts, bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts, git diff --check $(git merge-base HEAD trunk)..HEAD results=pass — First targeted invocation used repo-root-relative filters while oc-test runs package tests from plugin/, so it found no files (command construction error, not test failure). Corrected invocation passed 2 files / 19 tests in 14.30s. git diff --check produced no whitespace errors. Static review also confirmed no workflow source diff from trunk, Worker.create production entrypoints route through verifyWorkerArtifactPolicy, and deployment validates worker/workflows hashes before manifest-last publication.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/temporal/replay-history-classification.test.ts plugin/src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check $(git merge-base HEAD trunk)..HEAD
- **[wisdom_candidate]** wisdom_candidates: [pattern] Captured-history fixture safety must be enforced by the replay corpus itself. Generator-only sanitization is not durable because later fixture edits bypass it.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/replay-history-classification.ts: Added exact typed recoveryTarget schema/constant; immutable classifications require it, non-immutable classifications reject it; extended sensitive-key detection to documents and subagent reports.
- **[archive_only_evidence]** changes_made: plugin/scripts/finalize-poisoned-replay-histories.ts: Updated fixture generator to emit the canonical recovery target only for immutable classifications.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/replay-history-classification.test.ts: Added recovery-target edge cases and nested document/task/evidence/subagent-report/secret audit coverage.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/__tests__/replay-determinism.test.ts: Added auditSanitizedHistory assertion for every classified poisoned-production fixture before replay.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/__tests__/replay/histories/*.poisoned-production.classification.json: Populated the exact recovery target on all five immutable classifications.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/__tests__/replay/histories/*.poisoned-production.history.json: Re-sanitized all six committed captured histories under the strengthened nested-document/subagent-report policy.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts, pnpm run typecheck, pnpm exec prettier --check src/temporal/replay-history-classification.ts src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts scripts/finalize-poisoned-replay-histories.ts src/temporal/__tests__/replay/histories/*.poisoned-production.classification.json src/temporal/__tests__/replay/histories/*.poisoned-production.history.json, git diff --check results=pass — Targeted replay/classification suite passed 2 files and 21 tests in 17.56s. TypeScript typecheck passed. Prettier check passed for all affected sources and fixture corpus; git diff --check passed. Re-sanitization used the strengthened existing sanitizer; subsequent corpus audit and replay verification passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/temporal/replay-history-classification.ts src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts scripts/finalize-poisoned-replay-histories.ts src/temporal/__tests__/replay/histories/*.poisoned-production.classification.json src/temporal/__tests__/replay/histories/*.poisoned-production.history.json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** verification: tests_run= results=n/a — Read-only post-remediation review at HEAD a5c3fcf7b3cbc52d6d69242ae15df5918fd3beeb. Independently confirmed clean worktree; recoveryTarget literal schema and conditional enforcement (replay-history-classification.ts:25-79); five immutable corpus rows populated and one self-healed row omits target; corpus audit before replay (replay-determinism.test.ts:254-273); nested sanitation and schema edge tests (replay-history-classification.test.ts:41-204). User-provided verification evidence: targeted 21/21 and full suite 453/453 files, 6778 passed, 1 expected failure, 12 todo.
- **[archive_only_evidence]** findings: [info] test-coverage: Operator script finalize-poisoned-replay-histories.ts has no co-located test; matches existing convention for one-off scripts
- **[archive_only_evidence]** findings: [info] test-coverage: Fixture completeness structurally guarded; optional disk-existence assertion would add early check
- **[epic_terminal_note]** epic.membership: hardenTemporalReliability · Fix Temporal patch nondeterminism (order 4)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| SC6 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- Absolute patch-index premise is false: patched("B") inserted above recorded patched("A") is a supported lenient case when B is absent from history, so the proposed marker-only forward-drift fixture does not prove TMPRL1100.
- Path B incorrectly presents deprecatePatch(oldId)+patched(v2) as a generic marker-relocation migration. deprecatePatch is safe only after no live pre-patch histories/workers remain; v2 is a distinct later patch.
- Subsystem 3 proposes a new worker manifest despite an existing bundle-manifest.json build primitive, while missing the actual gaps: file rehash verification, deploy validation/publish-last, and enforcement across all Worker.create paths.
- Remediate AC6: create or identify the recovery Epic entry, add a typed validated recovery target for immutable classifications, populate all five immutable fixtures, and rerun replay corpus tests.
- Remediate C4/AC2: enforce auditSanitizedHistory against every committed poisoned-production fixture in replay-determinism.test.ts; add nested document/task/subagent-report sanitization cases, regenerate or re-sanitize any failing fixtures, and rerun targeted plus full verification.
- After remediation, request a new independent acceptance review. Leave worker manifest architecture, deployment publication ordering, command-boundary regression, and workflow signatures unchanged.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/temporal/replay-history-classification.test.ts plugin/src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check $(git merge-base HEAD trunk)..HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/temporal/replay-history-classification.ts src/temporal/replay-history-classification.test.ts src/temporal/__tests__/replay-determinism.test.ts scripts/finalize-poisoned-replay-histories.ts src/temporal/__tests__/replay/histories/*.poisoned-production.classification.json src/temporal/__tests__/replay/histories/*.poisoned-production.history.json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
