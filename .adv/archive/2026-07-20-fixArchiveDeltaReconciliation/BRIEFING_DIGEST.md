# Archive Briefing Digest

**Change ID:** fixArchiveDeltaReconciliation
**Title:** Fix archive delta reconciliation
**Status:** archived
**Generated:** 2026-07-20T16:03:33.746Z

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

Showing 100 of 109 durable facts (9 omitted).

- **[unresolved_action]** required_main_agent_actions: Remediate immutable-proof-1 in this task before accepting it, then add a regression test for external manifest tampering against a valid released commit.
- **[unresolved_action]** required_main_agent_actions: Rerun targeted projection/recovery tests and pnpm run check after immutable manifest binding is implemented.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Projection proof must bind every accepted delta structurally, not just a change ID and aggregate delta hash; manifest capability and disposition coverage must be checked before terminal state.
- **[archive_only_evidence]** changes_made: plugin/src/archive/projection-proof.ts: Projection proof now fail-closes if manifest capability coverage or per-capability disposition IDs do not exactly cover accepted deltas.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: All retry, normal terminal, batch repair, and single status-repair proof calls now provide complete accepted-delta identities.
- **[archive_only_evidence]** changes_made: plugin/src/archive/projection-proof.test.ts: Added regression coverage rejecting a manifest that omits an accepted delta; valid fixture now carries its delta disposition.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/historical-repair.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts, pnpm run check results=pass — Targeted suite: 4 files, 31 tests passed (run tr_mrsx2zxp_16a74141). pnpm run check passed schemas, typecheck, manifests, isolation, lockfile, lint, and formatting (run tr_mrsx5gj6_31e48e6c). Initial targeted command used plugin-prefixed paths from repo root and found no files; corrected command passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/historical-repair.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[wisdom_candidate]** wisdom_candidates: [pattern] Immutable projection proof must make the released commit's manifest authoritative, compare external evidence to it, then verify specs/docs against that committed manifest.
- **[archive_only_evidence]** changes_made: plugin/src/archive/projection-proof.ts: Corrected proof API ownership: manifestGitPath is required by immutable Git-commit verification only, not unused filesystem-path verification.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/archive.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts, pnpm run check results=pass — Targeted suite: 4 files, 61 tests passed (run tr_mrsxc6p5_0ff61dd4). pnpm run check passed schemas, typecheck, manifests, isolation, lockfile, lint, and formatting (run tr_mrsxd7q7_4f03ddba).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/archive.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[wisdom_candidate]** wisdom_candidates: [pattern] Historical repair authority should parse only ID, ordering/proof fields, and typed deltas; unrelated archived metadata must not prevent fail-closed delta classification.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/historical-repair.test.ts src/archive/projection.test.ts src/archive/projection-proof.test.ts src/archive/archive.test.ts, pnpm run check results=pass — Focused suite: 4 files, 40 tests passed (run tr_mrtb9tyr_26e122d9). pnpm run check passed schemas, typecheck, manifests, isolation, lockfile, lint, and formatting (run tr_mrtbb9cj_206b9556).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/historical-repair.test.ts src/archive/projection.test.ts src/archive/projection-proof.test.ts src/archive/archive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** required_main_agent_actions: Before next full run, optionally correct the stale test title at plugin/src/ops-follow-up-assets.test.ts:159 to say 1.8.0; no behavioral/spec change required.
- **[unresolved_action]** required_main_agent_actions: Defer spec-citation invariant redesign to a focused follow-up; retain current lint until a replacement separates executable/contract citations from incidental prose.
- **[unresolved_action]** required_main_agent_actions: If full suite again exceeds 300s, capture per-file timings and design a correctness-preserving Temporal test-environment reuse or suite partition plan; do not disable serial execution or lifecycle isolation ad hoc.
- **[unresolved_action]** required_main_agent_actions: Leave phase9 mock preservation, contract prose anchors, and exact rq-subagentReports inventory intact.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For repaired spec laws, exact ID inventories and semver lower bounds provide useful archival completeness guards; stale assertion titles should be treated as diagnostic debt, not weakened coverage.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/test-contract-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts src/__tests__/spec-citation-invariant.test.ts, Static runtime-architecture inspection: plugin/vitest.config.ts plus 16 *.itest.ts files and 39 TestWorkflowEnvironment creation/helper calls results=pass — Targeted suite passed: 5 files, 78 tests, 7.75s. Full-suite >300s is test-architecture/runtime debt rather than expected unit-test cost: all temporal files are serial (vitest.config.ts:23-29), with 16 integration files and 39 per-case Temporal test-environment lifecycle calls. Isolation likely has correctness value, so do not parallelize blindly. Defer a profile-and-sharing/partitioning redesign; no cleanup is needed before the next full run beyond correcting the stale version-test title.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/test-contract-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Static runtime-architecture inspection: plugin/vitest.config.ts plus 16 *.itest.ts files and 39 TestWorkflowEnvironment creation/helper calls
- **[wisdom_candidate]** wisdom_candidates: [success] Historical spec-law repair remained structural: preserve real archive module exports in Phase 9 tests, keep exact repaired-law inventory, and align prose assertions to the canonical wording rather than weakening contracts.
- **[archive_only_evidence]** verification: tests_run=git diff --check, Targeted route/replay/recovery suites (49 + 134 + 43 tests; caller-provided completed evidence), bin/oc-test full (426 files, 6521 passed, 1 expected fail, 384.09s; caller-provided completed evidence), pnpm run check && pnpm run build (tr_mrte59cg_1c8195f5; caller-provided completed evidence) results=pass — Reassessment confirms the version-test title and 1.8.0 lower-bound assertion align at plugin/src/ops-follow-up-assets.test.ts:159-161. Phase 9 uses a partial-real archive mock at plugin/src/tools/change.archive-phase9.test.ts:123-133, preserving real exports while isolating archive side effects. Exact rq-subagentReports25 inventory is retained. Diff whitespace check passed. Reported targeted, full-wrapper, check, and build evidence is green; 384.09s is within the stated intended full-suite budget.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Targeted route/replay/recovery suites (49 + 134 + 43 tests; caller-provided completed evidence)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full (426 files, 6521 passed, 1 expected fail, 384.09s; caller-provided completed evidence)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check && pnpm run build (tr_mrte59cg_1c8195f5; caller-provided completed evidence)
- **[wisdom_candidate]** wisdom_candidates: [pattern] Operator conflict-disposition input needs one-to-one identity validation before map construction; otherwise duplicate keys silently weaken audit and approval semantics.
- **[archive_only_evidence]** changes_made: plugin/src/archive/historical-repair.ts: Reject duplicate conflict-disposition keys before lookup-map construction, preventing silent overwrite/collapse of an approval row.
- **[archive_only_evidence]** changes_made: plugin/src/archive/historical-repair.test.ts: Added regression proving duplicate dispositions for one historical change/delta are rejected.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/projection-lock.test.ts src/archive/historical-repair.test.ts src/archive/archive.test.ts src/archive/projection.test.ts src/tools/change.test.ts, pnpm run check results=pass — Focused suite: 5 files, 180 tests passed (run tr_mrtcbzwt_c41edc6e). pnpm run check passed schemas, typecheck, manifests, isolation, lockfile, lint, and formatting (run tr_mrtcd7ti_cc79074a).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-lock.test.ts src/archive/historical-repair.test.ts src/archive/archive.test.ts src/archive/projection.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[report_follow_up]** follow_ups: Discovery contract/agreement is not minted; contract ties use exact proposal objectives/constraints and must be rewritten to final AC identifiers by the orchestrator.
- **[report_follow_up]** follow_ups: Conflict-scan prior_consideration data was not supplied; candidate prior consideration remains inconclusive rather than inferred from archive history.
- **[report_follow_up]** follow_ups: Select an authoritative baseline for the already-shipped rq-TDD013evp modification (for example, a release-bound Git revision) during design; I don't know which preserved revision is guaranteed available from current evidence.
- **[research_citation]** sources: Proposal and problem statement: Defines required missing/identical/conflicting reconciliation, archive-owned recovery, preserved evidence, stale versions/docs, and production-shaped regression scope. (adv://change/fixArchiveDeltaReconciliation/proposal)
- **[research_citation]** sources: Existing-bundle terminal bypass: Already-archived bundles route directly to metadata reconciliation; existing bundles for non-archived changes synthesize success with empty spec/doc updates instead of reapplying or verifying deltas. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/change.ts#L2837-L2897)
- **[research_citation]** sources: Retry reconciler: Existing retry path reconciles release-gate and Phase 9 metadata only; phase9=skip returns immediate no-op success. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/change/archive-gate.ts#L299-L512)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Five bounded candidates, sorted by payoff/risk. (1) auto-adopt: route every existing-bundle no-op and status-repair terminal path through one archive-owned reconciliation postcondition before success; evidence shows current bypasses in change.ts and archive-gate.ts. (2) auto-adopt: add a read-only whole-change preflight classifying each delta as missing, identical, or conflict before any write; apply only after all semantic conflicts pass, while retaining retry for crash-partial writes. (3) inconclusive: define modification conflict authority. Current modify deltas lack preimage/base fingerprints, so desired postimage mismatch alone cannot distinguish an unapplied historical value from later conflicting law; future deltas should carry structural preconditions, while recovery of the already-shipped parent needs an evidence-backed baseline source selected during design. (4) auto-adopt: make reconciliation success cover requirement content, expected capability version, generated doc projection, archive bundle authority, and terminal status—not requirement IDs or status alone. (5) auto-adopt: extend production-shaped tests across partial prior application, identical add, missing add/modify, conflicting law, phase9 run/skip, and direct/PR retry; current live test checks metadata only. Existing pattern has a MAJOR deviation from the proposal invariant because terminal paths can report success without proving global spec projection.
- **[report_follow_up]** follow_ups: test follow-up
- **[archive_only_evidence]** findings: test finding
- **[archive_only_evidence]** hotspots: test hotspot
- **[archive_only_evidence]** risks: test risk
- **[unresolved_action]** open_questions: test question
- **[report_follow_up]** follow_ups: Packet omitted the VERIFICATION anchor. Research still used official docs and source examples where possible; orchestrator should preserve its standard verification contract.
- **[report_follow_up]** follow_ups: Local lgrep semantic search timed out twice (including hybrid:false fallback); local discovery continued through lgrep exact-text search and targeted source reads.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative archive-reconciliation decision; recalled entries were not used as evidence.
- **[research_citation]** sources: Current archive delta engine: Current engine mutates a supplied spec clone, applies rename/remove/modify/add in canonical order, stops on first error, and owns existing version-bump semantics. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/delta.ts)
- **[research_citation]** sources: Current archive orchestration: Current orchestration writes each capability while iterating and creates archive bundles after collecting errors, exposing partial-projection and premature-bundle behavior addressed by draft design. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts)
- **[research_citation]** sources: Current release finalization: Existing release proof centralizes route/reachability checks but does not prove spec projection content from one pinned released commit. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/change/archive-gate.ts)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Draft direction is sound and simpler than a general transactional spec store, but four low-risk design clarifications materially strengthen proof consistency: cumulative batch simulation, one pinned release commit, one canonical projection codec, and strict manifest-version parsing. A fixed-point test law gives broad retry coverage with little extra implementation surface.
- **[report_follow_up]** follow_ups: Briefing packet was requested through adv_change_show; transport remained truncated, while artifactOnly returned exact persisted design. Contract and identity anchors came from supplied packet and ADV response, not filesystem reconstruction.
- **[research_citation]** sources: Persisted design: Defines shared Plan→Apply→Prove→Finalize pipeline, canonical codec, projection manifest, worktree-local writes, cumulative historical repair, and terminal proof. (adv://change/fixArchiveDeltaReconciliation/design)
- **[research_citation]** sources: Approved agreement and ChangeContract: Defines AC1–AC9, SC1–SC5, C1–C6, avoidances, and scope boundaries used for validation. (adv://change/fixArchiveDeltaReconciliation/agreement)
- **[research_citation]** sources: Advance Workflow rq-archiveOrdering01: Current law says bundle-present retry skips archiveChange and proceeds directly to archived status transition. (adv://spec/advance-workflow/rq-archiveOrdering01)
- **[research_citation]** sources.omitted: 11 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core shape is sound: pure whole-plan classification, fail-closed structural preconditions, exact worktree staging, immutable released-commit proof, and fixed-point retry directly address AC1–AC3, AC5, AC8, AC9 and C1–C6 (adv://change/fixArchiveDeltaReconciliation/design; adv://change/fixArchiveDeltaReconciliation/agreement). Three design-completeness gaps prevent implementation authorization: current spec law still directs bundle-present retry straight to status; active Temporal archive activity independently reapplies deltas outside proposed shared pipeline; cumulative repair does not define authoritative map seed or chain continuity (adv://spec/advance-workflow/rq-archiveOrdering01; file:///home/jon/dev/advance/plugin/src/temporal/activities.ts#L585-L661; adv://change/fixArchiveDeltaReconciliation/design). Architecture judgement and validation both resolve to fail.
- **[unresolved_action]** validation.blockers: Current spec law contradicts mandatory projection reconciliation on bundle-present retry: rq-archiveOrdering01 says archiveChange is skipped and flow proceeds directly to status transition, while AC2/SC1 require missing projection application and full proof before terminal status (adv://spec/advance-workflow/rq-archiveOrdering01; adv://change/fixArchiveDeltaReconciliation/agreement#AC2).
- **[unresolved_action]** validation.blockers: Design's claimed single pipeline does not account for active archiveChangeActivity, invoked by archiveRequestedSignal and independently applying deltas and committing project files. Leaving it unchanged permits duplicate/bypassing mutation after tool-side proof (file:///home/jon/dev/advance/plugin/src/temporal/workflows.ts#L849-L870; file:///home/jon/dev/advance/plugin/src/temporal/workflows.ts#L1587-L1616; file:///home/jon/dev/advance/plugin/src/temporal/activities.ts#L585-L661).
- **[unresolved_action]** validation.blockers: Cumulative historical repair does not define authoritative initial capability-map state or current-versus-reconstructed comparison. Without seed and chain-continuity rules, historical modify/remove/rename may be classified against later current postimages or incomplete virtual history (adv://change/fixArchiveDeltaReconciliation/design; adv://change/fixArchiveDeltaReconciliation/agreement#AC4; adv://change/fixArchiveDeltaReconciliation/agreement#C6).
- **[report_follow_up]** follow_ups: Generated _briefingPacket was requested through adv_change_show, but tool output exposed only a truncation placeholder and artifact-only readback omitted it. Validation used user-supplied packet anchors plus persisted design/agreement/deltas.
- **[report_follow_up]** follow_ups: Prompt omitted an explicit VERIFICATION anchor block; official docs, source examples, local source, persisted specs, and persisted artifacts were still checked.
- **[report_follow_up]** follow_ups: Episode recall ran once with namespace advance and top_k 5; results were unrelated and not used as authority.
- **[research_citation]** sources: Persisted revised design: Defines one typed plan/apply/prove/finalize pipeline, strict manifests, immutable released-commit proof, patched Temporal migration, and cumulative historical repair. (adv://change/fixArchiveDeltaReconciliation/design)
- **[research_citation]** sources: Approved agreement and contracts: Defines AC1-AC9, C1-C6, current-repository repair scope, replay safety, and fail-closed historical modification authority. (adv://change/fixArchiveDeltaReconciliation/agreement)
- **[research_citation]** sources: Persisted change deltas: Adds rq-archiveDeltaReconciliation01 and modifies rq-archiveOrdering01 plus rq-archiveRetryIdempotence01 so terminal projection requires reconciliation proof. (adv://change/fixArchiveDeltaReconciliation/deltas)
- **[research_citation]** sources.omitted: 9 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: PASS. Revised design maps AC1-AC9/C1-C6 to one typed reconciliation gate, all-capability semantic preflight, immutable released-SHA proof, worktree-only writes, fail-closed historical authority, exact final digest verification, route-matrix tests, and parent recovery. Persisted add/modify deltas remove prior rq-archiveOrdering01 direct bundle-to-status authorization and align retry/no-op law with full projection proof. New signal histories carry projection receipts and use verify/summary-only activity behavior; old mutating command history remains behind wf.patched("archive-projection-reconciler-v1") with old/new replay fixtures and non-deprecation rationale, matching rq-workflowVersioning01 and Temporal's patching model. Historical repair now pins worktree HEAD, orders deterministically, checks per-archive authority/continuity, simulates one evolving cumulative model, compares seed/current bytes, and verifies exact post-write digests. One codec/reconciler and fixed-point model are simpler than markers, dual writers, manual repair, or a transactional spec store. No remaining correctness/spec-law blocker proven.
- **[report_follow_up]** follow_ups: Packet warning: WORKING DIRECTORY, CHANGE, SCOPE KEY, and ATTEMPT were supplied, but explicit TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors were absent. Research followed supplied prose without inventing missing anchor text.
- **[report_follow_up]** follow_ups: Test wrong changeId, wrong deltaId, stale current digest, wrong rejected postimage digest, empty evidence, non-conflicting target, second conflict/unverified row, dependent and independent siblings, dry-run/execute audit parity, peer mutation after proof, and multi-file failure.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative relevant memory; recalled content was not used.
- **[research_citation]** sources: Revised ADV design: Defines Plan → Apply → Prove → Finalize, exact tuple binding, planner-first conflict proof, preserve-current exclusion, sibling re-plan, audit output, and isolated-worktree concurrency mitigation. (adv://change/fixArchiveDeltaReconciliation/design)
- **[research_citation]** sources: Approved agreement AC1-AC9: AC3 requires conflict failure without projection mutation; AC7 requires parent sibling recovery while rq-subagentReports24 remains single-copy; AC9 forbids automatic conflict overwrite. (adv://change/fixArchiveDeltaReconciliation/agreement)
- **[research_citation]** sources: Current projection planner: Structurally classifies typed deltas against an in-memory clone and blocks conflicting or unverified rows. (https://github.com/Sharper-Flow/Advance/blob/426de7ddebee10b21cef2f9c7a9fabc9052d95a9/plugin/src/archive/projection.ts#L190-L392)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core direction is sound and simpler than overwrite or generic ignore mechanisms: exact typed preserve-current authorization, normal planner conflict proof before exclusion, unchanged-state sibling re-plan, and archive-level fail-closed simulation satisfy AC7/AC9 conceptually. Design is not implementation-ready because concurrency mitigation does not close the check/use window and rejected-postimage digest semantics are undefined across the four-operation delta union. Current code confirms archive-level in-memory discard works, while final filesystem writes remain sequential and unlocked.
- **[unresolved_action]** validation.blockers: Disposition binding and clean-worktree checks permit concurrent mutation between check and use, allowing stale approved state to reach filesystem writes.
- **[unresolved_action]** validation.blockers: `rejectedPostimageSha256` has no single structural meaning for every operation admitted by the design; remove produces absence rather than a Requirement postimage.
- **[report_follow_up]** follow_ups: Packet warning: WORKING DIRECTORY, CHANGE, SCOPE KEY, and ATTEMPT were supplied, but explicit TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors were absent. Research followed supplied prose without inventing missing anchor text.
- **[report_follow_up]** follow_ups: Test lock identity across two linked worktrees and prove normal archive versus historical repair cannot overlap projection mutation.
- **[report_follow_up]** follow_ups: Test acquisition ordering before HEAD/spec load; bounded contention; dead-holder recovery; ownership-safe release; and finally-release after planner, write, or readback exceptions.
- **[report_follow_up]** follow_ups: Test reviewed dry-run CAS independently for wrong expectedSeedHeadSha, wrong expectedSeedProjectionSha256, changed extension fields, key-order invariance, and an injected mutation between initial check and immediate pre-write recheck; every mismatch must produce zero writes.
- **[report_follow_up]** follow_ups: Test valid same-ID conflicting add; identical add; absent target; wrong change/delta/current/rejected digest; blank evidence; unsupported modify/remove/rename; duplicate or ambiguous target row; second conflict/unverified sibling; and dependent sibling re-plan.
- **[report_follow_up]** follow_ups: AC7 fixture must prove all named parent laws and rq-TDD013evp modification, matching versions/docs, exactly one byte-identical rq-subagentReports24, no bump attributable solely to preserved_current, and fixed-point retry.
- **[report_follow_up]** follow_ups: Add a structural routing test proving every archive projection writer uses the shared lock, so future call sites cannot bypass the cooperative boundary.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative relevant memory; recalled content was not used as evidence.
- **[research_citation]** sources: Revised ADV design attempt 2: Requires one Git-common-dir cooperative lock across normal archive, active retry, and historical repair; lock spans seed read through readback; historical execute is bound to reviewed HEAD and canonical seed projection digest; preserve-current v1 is same-ID conflicting-add only. (adv://change/fixArchiveDeltaReconciliation/design?hash=ffe7d33cdf90c6cb08093a07dcc2e84466e98953abab25455ada4bba67368008)
- **[research_citation]** sources: Approved agreement AC1-AC9: AC7 requires safe parent sibling recovery with rq-subagentReports24 single-copy; AC9 forbids automatic conflict overwrite; C1 makes archive the sole projection writer; C5 requires bounded deterministic proof. (adv://change/fixArchiveDeltaReconciliation/agreement?hash=860a5e8e56b7467013c1ef2077a30debcc9faf8cfa363f27aaf9d900e5ecb7f1)
- **[research_citation]** sources: Attempt 2 operator packet: States rq-archiveConflictDispositionScope01 was added and asks validation of TOCTOU closure, operation boundary, AC7/AC9, and test plan. (user://fixArchiveDeltaReconciliation/researcher/design-validation-conflict-disposition/attempt/2)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Both prior blockers are resolved at design level. One Git-common-dir lock shared by every archive projection writer is acquired before seed loading and held through planning, writes, and readback; reviewed dry-run HEAD plus canonical projection digest are checked under that lock and repeated immediately before first write. Within C1's cooperative sole-writer boundary, this closes writer interleaving and stale-review TOCTOU. V1 now has a complete structural domain: only a planner-proven same-ID conflicting add can be disposed; the current Requirement and archived add Requirement supply the two canonical digests; modify/remove/rename and non-conflicting rows fail closed. Exact exclusion followed by unchanged-state sibling re-plan preserves AC9 while permitting AC7 recovery. Remaining risk is implementation/test completeness, not unresolved architecture.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Immutable archive acceptance proof should bind the committed projection manifest before validating committed specs and generated documentation; matching IDs or aggregate delta hashes alone are insufficient.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |

## Unresolved Actions

- Remediate immutable-proof-1 in this task before accepting it, then add a regression test for external manifest tampering against a valid released commit.
- Rerun targeted projection/recovery tests and pnpm run check after immutable manifest binding is implemented.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/historical-repair.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts src/archive/archive.test.ts src/storage/store-temporal/changes.test.ts src/temporal/archive-activity.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/historical-repair.test.ts src/archive/projection.test.ts src/archive/projection-proof.test.ts src/archive/archive.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- Before next full run, optionally correct the stale test title at plugin/src/ops-follow-up-assets.test.ts:159 to say 1.8.0; no behavioral/spec change required.
- Defer spec-citation invariant redesign to a focused follow-up; retain current lint until a replacement separates executable/contract citations from incidental prose.
- If full suite again exceeds 300s, capture per-file timings and design a correctness-preserving Temporal test-environment reuse or suite partition plan; do not disable serial execution or lifecycle isolation ad hoc.
- Leave phase9 mock preservation, contract prose anchors, and exact rq-subagentReports inventory intact.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/test-contract-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Static runtime-architecture inspection: plugin/vitest.config.ts plus 16 *.itest.ts files and 39 TestWorkflowEnvironment creation/helper calls
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Targeted route/replay/recovery suites (49 + 134 + 43 tests; caller-provided completed evidence)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full (426 files, 6521 passed, 1 expected fail, 384.09s; caller-provided completed evidence)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check && pnpm run build (tr_mrte59cg_1c8195f5; caller-provided completed evidence)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-lock.test.ts src/archive/historical-repair.test.ts src/archive/archive.test.ts src/archive/projection.test.ts src/tools/change.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- test question
- Current spec law contradicts mandatory projection reconciliation on bundle-present retry: rq-archiveOrdering01 says archiveChange is skipped and flow proceeds directly to status transition, while AC2/SC1 require missing projection application and full proof before terminal status (adv://spec/advance-workflow/rq-archiveOrdering01; adv://change/fixArchiveDeltaReconciliation/agreement#AC2).
- Design's claimed single pipeline does not account for active archiveChangeActivity, invoked by archiveRequestedSignal and independently applying deltas and committing project files. Leaving it unchanged permits duplicate/bypassing mutation after tool-side proof (file:///home/jon/dev/advance/plugin/src/temporal/workflows.ts#L849-L870; file:///home/jon/dev/advance/plugin/src/temporal/workflows.ts#L1587-L1616; file:///home/jon/dev/advance/plugin/src/temporal/activities.ts#L585-L661).
- Cumulative historical repair does not define authoritative initial capability-map state or current-versus-reconstructed comparison. Without seed and chain-continuity rules, historical modify/remove/rename may be classified against later current postimages or incomplete virtual history (adv://change/fixArchiveDeltaReconciliation/design; adv://change/fixArchiveDeltaReconciliation/agreement#AC4; adv://change/fixArchiveDeltaReconciliation/agreement#C6).
- Disposition binding and clean-worktree checks permit concurrent mutation between check and use, allowing stale approved state to reach filesystem writes.
- `rejectedPostimageSha256` has no single structural meaning for every operation admitted by the design; remove produces absence rather than a Requirement postimage.
