# Archive Briefing Digest

**Change ID:** fixAcceptanceReadiness
**Title:** Fix acceptance readiness staleness
**Status:** archived
**Generated:** 2026-07-18T21:28:57.970Z

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

Showing 54 of 54 durable facts.

- **[archive_only_evidence]** decisions: Initialized acceptanceReadinessRevision to 0 in createChangeWorkflowState — Provides deterministic starting point while the field remains optional for replay safety
- **[archive_only_evidence]** decisions: Advanced revision only on non-release gate re-entry — Mirrors existing review-matrix invalidation condition; release re-entry is not relevant to acceptance readiness
- **[archive_only_evidence]** decisions: Advanced revision on every contract amendment including non-invalidating — Per task requirement; matrix-preservation semantics maintained separately
- **[archive_only_evidence]** decisions: Seeded acceptanceReadinessRevision in workflow startup and continue-as-new — Preserves the counter across workflow restart and continue-as-new rotations
- **[archive_only_evidence]** verification: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase red) (1) — Red phase recorded: 5 new acceptanceReadinessRevision assertions failed as expected before implementation (runId tr_mrqq1w34_8646345e)
- **[archive_only_evidence]** verification: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase green) (0) — Green phase: 70 tests pass after implementation (runId tr_mrqqhsrl_107978be)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state*.test.ts (0) — All 7 change-state test files pass (131 tests)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts (0) — Workflow signal-handlers test passes (26 tests), including continue-as-new seed invariant
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflow-start.test.ts (0) — Workflow start test passes (5 tests)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase red)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase green)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state*.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflow-start.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Stored the acceptance criteria snapshot separately from gateCriteria and keyed it to acceptanceReadinessRevision — Preserves gateCriteria as audit evidence while giving the projection a revision-basis so stale snapshots can never be surfaced as current pass.
- **[archive_only_evidence]** decisions: Computed the projection entirely from workflow state plus the persisted snapshot inside a deterministic Temporal query — No nondeterministic calls; satisfies the design requirement that adv_gate_status return a pure typed freshness projection.
- **[archive_only_evidence]** decisions: Made completeness ID-aware only in the criterion evaluators (REVIEW_MATRIX_COMPLETE / ALL_ROWS_PASSING) via a shared coverage helper — Fails closed for missing, duplicate, or unknown review rows without broadening acceptanceContractBlockers into unrelated scope.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/gate-readiness.acceptance-criteria.test.ts --reporter=dot (1) — Red phase: 4 completeness tests failed as expected before implementation (runId tr_mrqrc0of_765fc028)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/gate-readiness.acceptance-criteria.test.ts --reporter=dot (0) — Green phase: all 11 tests pass after implementing projection and ID-aware completeness (runId tr_mrqrl5y7_ec37ccd8)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/gate-readiness.acceptance-criteria.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts src/temporal/messages.test.ts src/tools/gate-status-fail-closed.test.ts (0) — Targeted verification: 166 tests pass (runId tr_mrqrvyoe_d0f1a527)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, and format:check all pass (runId tr_mrqrqrf6_dec2c7ad)
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin and worker bundles build successfully (runId tr_mrqrx0yi_8d3da21c)
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run src/temporal/gate-readiness.acceptance-criteria.test.ts --reporter=dot
- **[archive_only_evidence]** decisions: Placed the acceptance-readiness fence check immediately after readiness passes and before async evidence work, then re-check before applyGateCompletedToState. — This bounds the fence around the asynchronous acceptance evidence work where a contract/review-matrix change can interleave.
- **[archive_only_evidence]** decisions: Used wf.patched('acceptance-readiness-revision-v1') to gate the fence. — Preserves determinism for legacy acceptance histories that lack the marker and never recorded the fence.
- **[archive_only_evidence]** decisions: Emitted a typed ACCEPTANCE_READINESS_CHANGED blocker instead of completing or resetting/terminating the workflow. — The task requires an ordinary retry path; a typed blocker surfaces the exact reason and lets the caller re-attempt gate completion.
- **[archive_only_evidence]** decisions: Interleaved the invalidating amendment via a custom writeArtifactActivity that signals contractAmended during the activity execution. — This creates a reproducible Temporal integration scenario where the revision advances while the acceptance gate-completion handler is awaiting evidence work.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts (0) — All 30 signal-handler tests pass, including the new ACCEPTANCE_READINESS_CHANGED fence and retry tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts (0) — All 4 committed replay fixtures replay deterministically; legacy acceptance histories still skip the new fence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.acceptance-criteria.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts (0) — 156 state/gate-readiness unit tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest isolation, lockfile policy, lint, and Prettier all pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts (0) — Narrow replay test passes: 6/6 fixtures replay deterministically, including acceptance-readiness-revision-v1 patched and legacy histories.
- **[research_citation]** sources: Local contract state transitions: Contract set/amend and matrix set alter readiness basis without invalidating persisted criteria. (plugin/src/temporal/change-state.ts:783-841)
- **[research_citation]** sources: Fresh acceptance readiness: Gate completion evaluates live state fail-closed. (plugin/src/temporal/gate-readiness.ts:340-449)
- **[research_citation]** sources: Workflow status snapshot: Status query returns persisted criteria snapshot rather than fresh evaluation. (plugin/src/temporal/workflows.ts:724-727,1240-1257)
- **[research_citation]** sources.omitted: 1 additional source omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Separate current readiness projection from completion audit snapshot; add a monotonic acceptance readiness revision and a replay-versioned completion fence.
- **[unresolved_action]** required_main_agent_actions: Reissue independent review packet with `SCOPE KEY: review:acceptance` and generated BRIEFING PACKET before delegating review.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed: identity packet defect blocks scope lock.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the two reviewer remediation files before acceptance evidence is finalized; reviewer scope cannot mutate ADV checkpoints.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated recovery paths: no destructive workflow reset, termination, or disk-projection bypass was introduced or needed.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Acceptance criteria are advisory in completeGateWithReadiness; ID-aware review-matrix validation must also participate in evaluateGateReadiness or duplicate/unknown rows can pass completion despite a failing criteria projection.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.ts: Made completion-time acceptance readiness fail closed for invalid review-matrix coverage (missing, duplicate, or unknown required-contract rows), returning typed ACCEPTANCE_REVIEW_MATRIX_INVALID rather than allowing advisory criterion failure to complete acceptance.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.test.ts: Added completion-readiness regression coverage for duplicate and unknown review-matrix rows, complementing existing criterion-only coverage.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/__tests__/replay-determinism.test.ts src/temporal/change-state.test.ts src/temporal/messages.test.ts src/tools/gate-status-fail-closed.test.ts, pnpm --dir plugin run check, git diff --check results=pass — Reviewer TDD red reproduced the defect: duplicate and unknown review rows each left evaluateGateReadiness(..., 'acceptance').ready=true. After scoped fix, 8 focused files passed 200 tests (including replay and concurrent-fence tests); pnpm check passed schemas/typecheck/manifests/isolation/lockfile/lint/format; git diff --check clean. Reviewed committed implementation: revision defaults legacy state to 0 and advances on contract set/amend/matrix/re-entry; current projection is distinct from snapshot/audit evidence; status returns freshness/current/snapshot; patched fence acceptance-readiness-revision-v1 blocks interleaved change with ACCEPTANCE_READINESS_CHANGED and ordinary retry reaches done. No termination/reset/recovery bypass found. Existing execution evidence records full-suite 300s timeout as OOP Temporal budget saturation, followed by isolated signal-handler pass and remaining 170-test contract/projection/replay pass.
- **[unresolved_action]** required_main_agent_actions: Block release until `release-replay-1` is remediated and replay evidence is rerun.
- **[unresolved_action]** required_main_agent_actions: Route an in-scope fix to add and replay committed legacy and patched histories for `acceptance-readiness-revision-v1`; update the acceptance contract matrix with exact fixture/test evidence.
- **[unresolved_action]** required_main_agent_actions: Do not revisit core freshness/revision/fence logic or git cleanliness unless the replay-fixture remediation exposes a deterministic defect.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A passing generic Temporal replay suite does not prove safety for a newly introduced `wf.patched()` branch unless committed histories actually reach and assert that specific marker.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.acceptance-criteria.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/temporal/__tests__/replay-determinism.test.ts, pnpm --dir plugin run check, git diff --check, git status --short results=pass — Targeted suite: 4 files / 48 tests passed in 43.65s. `pnpm --dir plugin run check` passed schemas, typecheck, manifest check, isolation, lockfile policy, lint, and formatting. `git diff --check` and `git status --short` produced no output, confirming a clean checkpointed worktree. Review found no direct-state reset, termination, or disk-projection bypass in the changed workflow path; freshness projection recomputes current criteria and preserves prior criteria only as snapshot audit evidence. However, replay coverage omits the new patch marker, so these passing checks are insufficient for release.
- **[wisdom_candidate]** wisdom_candidates: [success] Replay-determinism coverage keeps both marker-present and pre-marker acceptance-readiness histories committed and exercises each against the current workflow bundle.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts, pnpm run check results=pass — Focused replay test passed 1 file / 6 tests, including acceptance-readiness-fence and acceptance-readiness-fence-legacy fixtures. Both fixture history and metadata pairs are tracked in Git. pnpm run check passed schemas, typecheck, manifest freshness, isolation/lockfile checks, lint, and formatting. Final worktree status and staged/unstaged diff checks were clean.

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

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase red)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test: pnpm exec vitest run src/temporal/change-state.test.ts (phase green)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/change-state*.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflow-start.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run src/temporal/gate-readiness.acceptance-criteria.test.ts --reporter=dot
- Reissue independent review packet with `SCOPE KEY: review:acceptance` and generated BRIEFING PACKET before delegating review.
- Checkpoint the two reviewer remediation files before acceptance evidence is finalized; reviewer scope cannot mutate ADV checkpoints.
- Do not revisit unrelated recovery paths: no destructive workflow reset, termination, or disk-projection bypass was introduced or needed.
- Block release until `release-replay-1` is remediated and replay evidence is rerun.
- Route an in-scope fix to add and replay committed legacy and patched histories for `acceptance-readiness-revision-v1`; update the acceptance contract matrix with exact fixture/test evidence.
- Do not revisit core freshness/revision/fence logic or git cleanliness unless the replay-fixture remediation exposes a deterministic defect.
