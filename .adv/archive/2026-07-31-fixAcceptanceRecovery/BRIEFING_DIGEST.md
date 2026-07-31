# Archive Briefing Digest

**Change ID:** fixAcceptanceRecovery
**Title:** Fix acceptance recovery divergence
**Status:** archived
**Generated:** 2026-07-31T18:03:48.537Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #346

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

Showing 100 of 108 durable facts (8 omitted).

- **[archive_only_evidence]** decisions: Added optional payload to ProjectionCommitAuditEntry instead of a new audit table — Keeps audit history co-located with the projection commit that recorded the mutation; avoids a separate schema surface and migration.
- **[archive_only_evidence]** decisions: Made MutationIntent.payload a lazy generator (mutationReceiptId) => payload — The signal needs the payload after the receipt id is minted, but synchronous prepare/cleanup happens before mutation; generator resolves both ordering needs.
- **[archive_only_evidence]** decisions: Unified design-concern recovery onto coordinateChangeMutation — Eliminated duplicate fireSignalAndRefresh/saveRecoveredDesignConcernDisposition code and guarantees design-concern recovery writes carry the same latest-wins payload as verification-evidence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-mutation-coordinator.test.ts src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts (0) — 44 tests pass across coordinator, design-concern, and verification-evidence
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/contract.test.ts -t "adv_contract_review_matrix_set" (0) — 9 contract review-matrix tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts -t "records the optional payload" (0) — 1 payload audit test passes
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-coordinator-design-concern-verification
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-contract-review-matrix
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-projection-payload
- **[report_follow_up]** follow_ups: Investigate and repair src/tools/status-health-integration-blockers.test.ts B.1 and B.2 failures (recent changes list is empty) independently of this task
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Two pre-existing tests in src/tools/status-health-integration-blockers.test.ts fail in this worktree and are unrelated to the acceptance reconciliation changes; they should be triaged separately.
- **[archive_only_evidence]** decisions: Rebound verification to durable adv_run_test evidence — Replaces non-durable oc-test synthetic run IDs with the canonical adv_run_test run tr_ms96iph2_de544811 so acceptance consumers resolve verification_missing warnings.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-mutation-coordinator.test.ts src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts (0) — 44 tests pass across coordinator, design-concern, and verification-evidence suites
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms96iph2_de544811
- **[archive_only_evidence]** decisions: Cleared recovery_audit markers only after coordinateChangeMutation confirms the disposition signal was received via the mutation-receipt query. — Preserves recovery markers on disk when re-delivery fails, so the next acceptance attempt can retry reconciliation instead of silently losing blockers.
- **[archive_only_evidence]** decisions: Routed all recovered gate completions through the conditional coordinator and recorded the full gate-completion signal payload in the projection commit. — Makes poisoned/unreachable-workflow recovery re-deliverable later when the workflow becomes reachable, satisfying the acceptance reconciliation requirement.
- **[archive_only_evidence]** decisions: Returned a single typed AcceptanceReconciliationBlocker from reconcileRecoveredAcceptanceRemediation instead of replaying stale acceptance blockers. — Surfaces one actionable remediation block per failed reconciliation, matching the task’s AC4 failure-mode contract.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state.test.ts src/tools/acceptance-reconciliation.test.ts src/tools/gate.acceptance-reconciliation.test.ts (0) — 101 tests passed across 3 files
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts src/tools/contract.test.ts src/tools/change-mutation-coordinator.test.ts src/storage/change-projection-transaction.test.ts (0) — 87 tests passed across 5 related files
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — 62 tests passed in gate.test.ts (including updated poisoned-recovery cases)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/subagent-report.test.ts -t "plugin preflight caps nested report issues at 10 and signals no mutation" (0) — 1 smoke-level test passed (previously flaky under concurrent load)
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — JSON schemas match generated output
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passed
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Agent manifests match generated output
- **[archive_only_evidence]** verification: pnpm exec eslint <touched files> (0) — No lint errors on all touched files
- **[archive_only_evidence]** verification: pnpm exec prettier --check <touched files> (0) — All touched files use Prettier code style
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/check-frontmatter.ts (0) — frontmatter check passed: 42 file(s) scanned
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/check-test-isolation.ts (0) — Test isolation check passed
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/check-lockfile-policy.ts (0) — Lockfile policy check passed
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eafxx_527b2b64
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eawds_e352d56b
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eb9mt_ebce12d0
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eldgz_ed007e22
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8enpet_467fd90e
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eo3yh_3c58e6f6
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8enrtt_cc3b6d91
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epcnn_29d43600
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8ep8kc_beef7600
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epm4o_0b2751ed
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epmo1_36e962d2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eplh3_ca7b8735
- **[archive_only_evidence]** decisions: Added AC4-focused coverage in gate-readiness.acceptance-criteria.test.ts rather than duplicating change-state tests — Task 2 already advanced acceptanceReadinessRevision in the reducers and tested the increment; AC4 still needed an end-to-end proof that a captured acceptance snapshot becomes stale after a disposition remediation
- **[archive_only_evidence]** decisions: Covered both design-concern and verification-evidence remediation dispositions — Both disposition families can clear acceptance blockers, so both must advance readiness and invalidate any prior acceptance readiness snapshot
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.acceptance-criteria.test.ts (0) — 13 tests pass, including 2 new AC4-focused tests that prove disposition remediation invalidates prior acceptance readiness evidence
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state.test.ts (0) — 90 tests pass, including existing design-concern and verification-evidence acceptanceReadinessRevision advance coverage
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8exw5u_b03b2251
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eydyb_bb7215bc
- **[archive_only_evidence]** decisions: No code changes were required; existing branch tests already cover the acceptance-recovery scenarios — Inspection showed the preceding implementation tasks (tk-467752f44b03 and tk-2c24294facf2) already added focused tests for reconcileRecoveredAcceptanceRemediation, gate-level reconciliation integration, readiness-freshness invalidation, and poisoned/unreachable-workflow recovery. Running the smallest relevant workflow regression suite produced all green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/temporal/change-state.test.ts src/tools/gate.test.ts (0) — 179 tests passed across acceptance reconciliation, gate reconciliation integration, acceptance-criteria freshness/reducers, change-state reducers, and gate recovery paths
- **[report_follow_up]** follow_ups: Confirm fixVisionHealthMetrics remediation tool outputs in Vision carried recovered:true / reconciliationWarning (distinguishes recovery-divergence from applied_temporal staleness).
- **[report_follow_up]** follow_ups: Decide the reconciliation marker: acceptanceReadinessRevision divergence (requires revision-parity fix first) vs a per-disposition reconciled flag.
- **[report_follow_up]** follow_ups: Scope decision: limit reconciliation to the three acceptance-clearing dispositions (review-matrix, verification-evidence, design-concern) or generalize to all acceptance-affecting recovery mutations (tasks, subagent_report, artifact_metadata, contract_set).
- **[report_follow_up]** follow_ups: Migrate design-concern disposition (design-concern.ts:131-159) onto the unified coordinateChangeMutation coordinator so all recovery mutations share one reconciliation seam (long-term).
- **[report_follow_up]** follow_ups: Draft a clarifying spec-law requirement on recovery-mutation authority reconciliation for the design phase.
- **[research_citation]** sources: Coordinator recovery path (disk-only, no signal to workflow): executeRecoveryPath commits the disk projection via commitChangeProjection only; sendSignal is never invoked, so the live workflow never absorbs the mutation. (plugin/src/tools/change-mutation-coordinator.ts:512-548)
- **[research_citation]** sources: Coordinator temporal path (signal + verify + dual-write): Healthy path confirms receipt via waitForQueryPredicate and verifies postcondition against refreshed workflow state; only this path returns applied_temporal. verifyTemporal passing proves the workflow absorbed the disposition. (plugin/src/tools/change-mutation-coordinator.ts:410-509)
- **[research_citation]** sources: MutationOutcome type: applied_temporal carries live T; recovered_verified carries disk Change only. Readiness adapter treats both as evaluable. (plugin/src/tools/change-mutation-coordinator.ts:57-71)
- **[research_citation]** sources.omitted: 14 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: ROOT CAUSE (structurally confirmed): Acceptance-clearing disposition mutations that take the disk-recovery path (recovered_verified from coordinateChangeMutation.executeRecoveryPath) write ONLY the disk projection and never deliver the typed signal to the live workflow. When the workflow becomes queryable again before the next acceptance attempt (wedge ends / transient blackout), the NORMAL acceptance path (adv_gate_complete -> fireSignalAndRefresh(gateCompletedSignal) -> workflow completeGateWithReadiness -> evaluateGateReadiness(state)) re-evaluates the workflow's OWN stale state, which lacks the recovered dispositions, and re-emits the original ACCEPTANCE_REVIEW_MATRIX_MISSING / VERIFICATION_EVIDENCE_MISSING blockers -> stuck. The RECOVERY gate-completion path (gate.ts:836-878) reads the disk projection and WOULD pass, but it is entered only when the workflow is unreachable at acceptance time - not the bug scenario. Thus success is reported by the disposition tools (disk advanced) while the authoritative workflow never advances, and the next live-workflow gate attempt replays obsolete blockers. This is the divergence RECOVERY_RECONCILIATION_WARNING names but nothing settles. Why applied_temporal is NOT the scenario: the healthy path verifies BOTH the mutation receipt (waitForQueryPredicate) AND the disposition postcondition against refreshed workflow state before returning applied_temporal, and dual-writes disk; so a true applied_temporal makes the stuck symptom impossible. SAME-PATTERN FINDING (high value): readiness-revision advancement is inconsistent - applyContractReviewMatrixSetToState bumps acceptanceReadinessRevision but the verification-evidence and design-concern disposition reducers do not, breaking deriveAcceptanceCriteriaProjection freshness and the readiness-fence semantics for those families. Existing reference principle: rq-gateReadiness01.3 states success must not be reported unless workflow state advanced, but it is scoped to gate tools, not disposition mutations. Deviation: MAJOR (authority-divergence at the most safety-critical gate).
- **[report_follow_up]** follow_ups: At planning, confirm whether the design introduces a new persisted reconciliation-obligation record or sources obligations from recovery_audit markers (candidate 3) — this shapes the data model and the no-new-persistence constraint.
- **[report_follow_up]** follow_ups: Add regression coverage (per design step 7) that exercises BOTH recovery outputs: coordinator-recovered (no current recovery_audit) and saveRecovered*-recovered, to lock candidate 5 parity.
- **[research_citation]** sources: change-state.ts: advanceAcceptanceReadinessRevision + reducers: Revision advanced only by contract set/amend, review-matrix set (line 1295, also records receipt), and gate re-enter. applyDesignConcernDispositionedToState (2519) and applyVerificationEvidenceDispositionedToState (2551) record receipts but do NOT advance the revision. (plugin/src/temporal/change-state.ts:311-314,1253-1307,2519-2578)
- **[research_citation]** sources: gate-readiness.ts: deriveAcceptanceCriteriaProjection freshness: Snapshot marked stale iff basisRevision != state.acceptanceReadinessRevision. So dispositions that don't advance the revision leave a prior acceptance snapshot appearing fresh (AC4 gap). (plugin/src/temporal/gate-readiness.ts:1504-1538)
- **[research_citation]** sources: workflows.ts: acceptance readiness fence: completeGateWithReadiness already captures and re-checks acceptanceReadinessRevision within one acceptance attempt behind wf.patched(ACCEPTANCE_READINESS_FENCE_PATCH). Existing structural anchor + replay-marker convention for new reconciliation behavior. (plugin/src/temporal/workflows.ts:1263-1274,1525-1538)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design correctly identifies the divergence: executeRecoveryPath (change-mutation-coordinator.ts:512-548) writes disk projection only and never reconciles the live workflow, so a reachable acceptance attempt re-evaluates stale workflow state. Two additional structural gaps confirmed beyond the design's narrative: (1) design + verification disposition reducers record mutation receipts but do NOT advance acceptanceReadinessRevision (change-state.ts:2519-2578), so deriveAcceptanceCriteriaProjection cannot mark a prior acceptance snapshot stale after those remediations (direct AC4 gap); (2) a recovery_audit stamping divergence exists between coordinator-recovery (no stamp) and the saveRecovered* writers (stamps). Existing reuse anchors are strong: the acceptance-readiness fence (workflows.ts:1525-1538), the wf.patched() replay-marker convention, the waitForQueryPredicate(getMutationReceipt) confirmation primitive, and optional recovery_audit on dispositions. The legacy design-concern seam can be retired through the coordinator because resolveChangeAuthority already performs the same proactive describe()-based poisoning detection as classifyMutationRecoveryDecision — migration does not lose proactive detection. Deviation from by-the-book approach: MINOR (leverage candidates are refinements, no architectural blockers).
- **[unresolved_action]** required_main_agent_actions: Checkpoint the two reviewer remediation files on the change branch before advancing gates.
- **[unresolved_action]** required_main_agent_actions: Rebase or otherwise integrate change/fixAcceptanceRecovery with origin/trunk, then rerun acceptance-relevant verification before final gate action.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Acceptance reconciliation must compare the full recovered disposition identity when clearing audit markers. Clearing by latest-wins key alone can erase a newer disk recovery committed between signal confirmation and projection clear, leaving it unreconciled.
- **[archive_only_evidence]** changes_made: plugin/src/tools/acceptance-reconciliation.ts: Made recovery-marker clearing conditional on the exact recovered disposition and its audit identity, so a newer latest-wins recovery cannot be silently cleared before re-delivery.
- **[archive_only_evidence]** changes_made: plugin/src/tools/acceptance-reconciliation.test.ts: Added a regression that injects a newer recovered design disposition after the older signal confirms and proves its marker remains actionable.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts, bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/tools/gate.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/tools/change-mutation-coordinator.test.ts src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin exec prettier --check src/tools/acceptance-reconciliation.ts src/tools/acceptance-reconciliation.test.ts, git diff --check results=pass — 7 reconciliation tests passed; expanded acceptance/recovery suite passed 223 tests across 8 files; typecheck, Prettier, and diff whitespace checks passed. Reviewed origin/trunk...HEAD: recovered payloads, reconciliation block behavior, readiness revision invalidation, and recovery completion coverage satisfy AC1–AC5 and SC1–SC3.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/tools/gate.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/tools/change-mutation-coordinator.test.ts src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/acceptance-reconciliation.ts src/tools/acceptance-reconciliation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Resolve recovery-suite-1 before acceptance: reproduce the projection concurrency test in a clean/inode-available environment and apply only an evidence-backed test or implementation remediation.
- **[unresolved_action]** required_main_agent_actions: Leave schema generation, formatting, and TypeScript typing unchanged: all passed and git status/diff --check were clean.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When /tmp has no free inodes, tsx cannot create its IPC socket and schema checks fail with ENOSPC. Setting TMPDIR to an existing non-/tmp directory permits deterministic schema/type/format checks, but filesystem-sensitive tests may need clean-environment confirmation.
- **[archive_only_evidence]** verification: tests_run=TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run schemas:check, TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run format:check, TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run typecheck, TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/storage/change-projection-transaction.test.ts, TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts results=fail — schemas:check passed. format:check passed (all src files formatted). typecheck passed. Recovery suite: 44/45 tests passed; acceptance-reconciliation and gate-readiness suites passed. change-projection-transaction's 100-iteration concurrent test timed out twice (15,062 ms and 15,101 ms against 15,000 ms). Initial schemas:check attempt hit environmental ENOSPC because /tmp had 1 free inode; rerun with TMPDIR passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run format:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/storage/change-projection-transaction.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts
- **[unresolved_action]** required_main_agent_actions: Rebase the clean committed change branch onto current origin/trunk using the ADV-owned worktree flow; do not merge or release until that succeeds.
- **[unresolved_action]** required_main_agent_actions: Preserve the reviewer edits, checkpoint them via the task owner, then rerun the 73-test targeted reconciliation/gate suite and relevant release validation after rebase.
- **[unresolved_action]** required_main_agent_actions: Do not revisit frontend, migration, dependency, environment, external-service, or deployment configuration: the diff and context show none are in scope.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Acceptance recovery must validate the final acceptance-artifact readback after a successful write; fallback evidence is not a substitute for durable proof under the no-late-homework contract.
- **[archive_only_evidence]** changes_made: plugin/src/tools/gate.ts: Acceptance recovery now fails closed with ACCEPTANCE_PROJECTION_READBACK_FAILED when the just-written acceptance artifact cannot be read back, rather than completing with fallback evidence.
- **[archive_only_evidence]** changes_made: plugin/src/tools/gate.acceptance-reconciliation.test.ts: Added regression coverage for failed acceptance-projection readback during recovered acceptance completion.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts, pnpm run check, pnpm exec prettier --check src/tools/gate.ts src/tools/gate.acceptance-reconciliation.test.ts, bin/adv slop-scan plugin/src/tools/gate.ts --json, bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts src/tools/acceptance-reconciliation.test.ts src/tools/gate.test.ts, git diff --check origin/trunk...HEAD, git diff --check results=pass — Targeted suite passed 4/4, then related reconciliation/gate suites passed 73/73. schemas:check, tsc --noEmit, manifest/frontmatter/isolation/lockfile checks, and ESLint completed without errors; pnpm run check exceeded the 120s command cap during whole-src Prettier, then changed-file Prettier passed. Slop scan had complete important-detector coverage; no findings in src/tools/gate.ts (global results were 0 critical, 0 high, 15 medium, 520 low). Both diff whitespace checks passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/tools/gate.ts src/tools/gate.acceptance-reconciliation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/gate.ts --json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts src/tools/acceptance-reconciliation.test.ts src/tools/gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
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
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-coordinator-design-concern-verification
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-contract-review-matrix
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-tk-467752f44b03-projection-payload
- finish_owned_scope_then_report: Two pre-existing tests in src/tools/status-health-integration-blockers.test.ts fail in this worktree and are unrelated to the acceptance reconciliation changes; they should be triaged separately.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms96iph2_de544811
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eafxx_527b2b64
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eawds_e352d56b
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eb9mt_ebce12d0
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eldgz_ed007e22
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8enpet_467fd90e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eo3yh_3c58e6f6
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8enrtt_cc3b6d91
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epcnn_29d43600
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8ep8kc_beef7600
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epm4o_0b2751ed
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8epmo1_36e962d2
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eplh3_ca7b8735
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8exw5u_b03b2251
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8eydyb_bb7215bc
- Checkpoint the two reviewer remediation files on the change branch before advancing gates.
- Rebase or otherwise integrate change/fixAcceptanceRecovery with origin/trunk, then rerun acceptance-relevant verification before final gate action.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/tools/gate.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/tools/change-mutation-coordinator.test.ts src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/acceptance-reconciliation.ts src/tools/acceptance-reconciliation.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Resolve recovery-suite-1 before acceptance: reproduce the projection concurrency test in a clean/inode-available environment and apply only an evidence-backed test or implementation remediation.
- Leave schema generation, formatting, and TypeScript typing unchanged: all passed and git status/diff --check were clean.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run schemas:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run format:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx pnpm run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/temporal/gate-readiness.acceptance-criteria.test.ts src/storage/change-projection-transaction.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: TMPDIR=/home/jon/.cache/advance-review-tsx bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts
- Rebase the clean committed change branch onto current origin/trunk using the ADV-owned worktree flow; do not merge or release until that succeeds.
- Preserve the reviewer edits, checkpoint them via the task owner, then rerun the 73-test targeted reconciliation/gate suite and relevant release validation after rebase.
- Do not revisit frontend, migration, dependency, environment, external-service, or deployment configuration: the diff and context show none are in scope.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/tools/gate.ts src/tools/gate.acceptance-reconciliation.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/gate.ts --json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.acceptance-reconciliation.test.ts src/tools/acceptance-reconciliation.test.ts src/tools/gate.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
