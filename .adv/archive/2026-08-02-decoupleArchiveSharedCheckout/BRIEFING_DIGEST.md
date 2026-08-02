# Archive Briefing Digest

**Change ID:** decoupleArchiveSharedCheckout
**Title:** Decouple archive shared checkout
**Status:** archived
**Generated:** 2026-08-02T01:09:35.076Z

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

Showing 59 of 59 durable facts.

- **[archive_only_evidence]** decisions: Blocked `no_remote` archive route with `NO_REMOTE_RELEASE_AUTHORITY` and removed shared-trunk merge/update-ref fallback — Reviewer confirmed the shared default-branch mutation was a release-authority bug; without a remote origin, archive cannot prove release and must not touch the shared trunk.
- **[archive_only_evidence]** decisions: Treated a local bare `origin` as a valid `direct` remote route — A bare origin reachable via the `origin` remote still satisfies the remote-first proof requirement; only a missing `origin` remote blocks.
- **[archive_only_evidence]** decisions: Rewrote `prepareNoRemoteReleaseProof` into `prepareLocalReleaseProof` creating a local bare origin, merging the change branch, and pushing `main` — The recovery/no-op tests need a valid `direct` release proof; the old no-remote `shipped` proof is no longer allowed.
- **[archive_only_evidence]** decisions: Updated command/spec docs and autonomy test expectations to remove the local `Merged locally.` terminal and add `NO_REMOTE_RELEASE_AUTHORITY` semantics — Keeps generated assets, specs, and documentation consistent with the new remote-first isolation boundary.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.test.ts src/archive-release-finalization-assets.test.ts src/handoff-footer-drift.test.ts src/adv-autonomy-quality-assets.test.ts (0) — 395 targeted tests passed across git-finalize, archive-gate, change, and archive asset tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest:check, frontmatter, test isolation, lockfile policy, lint, and format:check all passed (only pre-existing manifest-frontmatter warnings).
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_tk-efafa70f12a9_20260801_1915_targeted
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_tk-efafa70f12a9_20260801_1915_check
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.test.ts src/archive-release-finalization-assets.test.ts src/handoff-footer-drift.test.ts src/adv-autonomy-quality-assets.test.ts results=pass — Checkpoint a7415b85 is current HEAD and records the blocker remediation. Current scoped verification passed: 6 test files, 395 tests. Source review confirms no_remote returns blocked with NO_REMOTE_RELEASE_AUTHORITY before ephemeral worktree/merge logic (git-finalize.ts:2925-2937); reachability propagates that blocker (git-finalize.ts:2291-2296; archive-gate.ts:871-885); no shared update-ref occurrence exists in the scoped production subsystem; integration test preserves trunk ref (git-finalize.test.ts:2390-2413). Local bare origin is classified as direct (git-finalize.ts:486-509,552-573) and has coverage (git-finalize.test.ts:341-368). Spec/docs scenarios match behavior (docs/specs/advance-workflow.md:450-473).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.test.ts src/archive-release-finalization-assets.test.ts src/handoff-footer-drift.test.ts src/adv-autonomy-quality-assets.test.ts
- **[archive_only_evidence]** decisions: Fetched origin/default before selecting the ephemeral archive worktree base OID in finalizeRelease direct path — The old code rev-parsed local refs/remotes/origin/<default> without refreshing it, so a stale local origin ref could become the merge base and miss concurrent remote commits. ensureOriginDefaultFetched(state) now runs first, and the origin ref is used only after it is current.
- **[archive_only_evidence]** decisions: Preserved a fallback to the local default branch when the origin ref is missing after a successful fetch — Keeps existing unit tests that mock a remote origin but do not materialize origin/<default> from being blocked, while still fixing the real stale-origin bug.
- **[archive_only_evidence]** decisions: Added a focused stale-origin regression test using a bare seed remote, a main clone, and a separate advancer clone — It proves the ephemeral worktree base is the current remote HEAD, not the stale local origin/trunk ref, and that the shipped merge commit contains both the remote-advance and feature changes.
- **[archive_only_evidence]** decisions: Left changes uncommitted per task instruction — The task explicitly said "Do not commit"; the release gate orchestrator owns the next commit/push.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts (0) — 126/126 git-finalize tests pass, including the new stale-origin regression
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest:check, frontmatter, test isolation, lockfile policy, lint, and format:check all pass (only pre-existing manifest-frontmatter warnings)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bin-oc-test-targeted-git-finalize-20260801
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-20260801
- **[report_follow_up]** follow_ups: Direct-route merge relocation strategy (ephemeral worktree-on-default vs shift direct-mode to PR-only): the one genuine design fork. Needs user input on whether to preserve the local fast-path for direct-mode repos or shift all remote-backed archives to PR-merge. Affects worktree-lifecycle scope and direct-mode UX.
- **[report_follow_up]** follow_ups: Tree-SHA fallback window (last-50 commits in detectSquashMergeByTree): sufficient at normal cadence; verify in design whether to widen the window or add a merge-base-aware scan for high-throughput repos. Non-blocking — remote-ref/PR proof is primary.
- **[report_follow_up]** follow_ups: Spec delta authoring for advance-workflow rq-releaseFinalization01: mandatory. .7 removal and .8 transformation must preserve .4/.9/.10/.12 guarantees. Should be drafted in /adv-design and conformance-checked.
- **[research_citation]** sources: git-finalize.ts — finalizeRelease orchestrator: Single production entry; validates worktree, derives mainCheckout via --git-common-dir, then mutates shared trunk: checkpoint (3368), merge (3417), push (3454). (plugin/src/tools/archive-helpers/git-finalize.ts:3182-3609)
- **[research_citation]** sources: git-finalize.ts — resolveMainCheckout (shared-trunk derivation): dirname(git rev-parse --git-common-dir) — the structural root of shared-trunk coupling; every linked worktree resolves to the same main checkout. (plugin/src/tools/archive-helpers/git-finalize.ts:794-804)
- **[research_citation]** sources: git-finalize.ts — commitDirtyMainCheckpoint: git add -A + git commit on main; the dirty-shared-work capture flagged in the RCA. Mandated by spec rq-releaseFinalization01.7. (plugin/src/tools/archive-helpers/git-finalize.ts:977-1019)
- **[research_citation]** sources.omitted: 16 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: ARCHITECTURE ASSESSMENT:

1. FINALIZATION ROUTE MAP (all roads lead through shared trunk today)
- Single production caller: change.ts:4416 finalizeRelease({workdir: worktreePath, expectedMainCheckout: store.paths.root}). Retry/recovery path (no worktree) uses read-only verifyReleaseEvidenceFromMain.
- DIRECT route (archiveMode direct): checkpoint main -> verifyRemoteNotAhead -> mergeToTrunk(main) -> pushToOrigin(main) -> verifyDefaultBranchPushed.
- PR routes (archiveMode pr OR push-failed): completeMergeQueueHandoff / completeProtectedBranchViaPullRequest -> resetMainToOriginDefault (reset --hard) -> reconcileChangeBranchWithDefault(workdir) -> pushChangeBranch(workdir) -> ensureArchivePullRequest -> armPullRequestAutoMerge -> resolveReleaseReachability.

2. SHARED-CHECKOUT MUTATION INVENTORY (5 points, all on mainCheckout derived via --git-common-dir)
- commitDirtyMainCheckpoint (git-finalize.ts:3368) — git add -A + commit. Captures UNRELATED dirty work into main. RCA surface #1.
- mergeToTrunk/mergeChangeBranch (git-finalize.ts:3417) — git merge --ff-only/--no-ff change/{id} on main.
- pushToOrigin (git-finalize.ts:3454) — git push origin {default} from main.
- resetMainToOriginDefault (git-finalize.ts:1983, 2057) — git reset --hard origin/{default}. DESTRUCTIVE — discards any uncommitted/unpushed local main state. RCA surface #2 (safety risk).
- verifyRemoteNotAhead (git-finalize.ts:3397) — read-only fetch+rev-list but BLOCKS on remote-ahead, the exact DEFAULT_BRANCH_REMOTE_DIVERGED block in PR #356 RCA.

3. REMOTE-FIRST PROOF MACHINERY ALREADY EXISTS AND IS PROVEN
- resolveReleaseReachability (git-finalize.ts:2599) is a complete read-only proof engine covering no_remote/direct/PR routes.
- verifyDefaultBranchPushed uses git ls-remote origin refs/heads/{default} (immutable remote OID, no local mutation) — git-scm docs confirm ls-remote reads remote refs via upload-pack without a checkout.
- detectSquashMergeByTree uses content-addressed %T tree-SHA equivalence against last-50 trunk commits; survives branch deletion via persisted changeTipSha. Canonical squash-merge detection.
- changeTipSha is captured (git-finalize.ts:3222) and persisted durably in phase9_status via recordPhase9Status (Temporal signal). Threaded back through verifyReleaseEvidenceFromMain for retries.
- verifyReleaseEvidenceFromMain (archive-gate.ts:782) is the PROOF-ONLY finalization already running in production for existing-bundle retries — never mutates. THIS IS THE TARGET MODEL.

4. PHASE9 / ARCHIVE PERSISTENCE MODEL
- recordPhase9Status (archive-gate.ts:706) -> Temporal fireSignalAndRefresh -> durable phase9_status {status, changeTipSha, prNumber, repo, route, startedAt, completedAt, error}.
- Ordering (change.ts:4388, rq-archiveOrdering01): Phase9 evidence -> release gate signal -> durable proof verification -> change.status=archived -> source cleanup. Release proof MUST precede status transition.
- Split-brain recovery (archive-phase9-splitbrain.itest.ts): bundle-on-disk + unset phase9_status recovered via idempotent reconcileArchivedBundleRetry through live Temporal. Re-runs safe and durable.

5. WORKTREE ASSUMPTIONS
- resolveMainCheckout = dirname(--git-common-dir) couples EVERY worktree to the shared trunk. Structural, not incidental.
- change.ts:4251 asserts worktreeValidation.mainCheckout === store.paths.root (trust boundary).
- Delta projection + in-repo bundle write REQUIRE worktreePath (rq-archiveDeltaReconciliation01) — never written through main. This isolation already exists for SPECS; the change extends the same isolation to GIT FINALIZATION.
- reconcileChangeBranchWithDefault and pushChangeBranch already operate on the WORKDIR, not main — PR-route merge/push machinery is already worktree-correct except for resetMainToOriginDefault.

6. DEVIATION FROM BY-THE-BOOK
- Reference pattern: ADV's OWN architectural direction (rq-worktreeMutationGuard01) structurally blocks ADV mutations from the main checkout. rq-crossProjectTrunkFirewall01 blocks main-checkout file writes. trunk-worktree-isolation instruction mandates trunk-stays-on-default + deploy-from-merged-trunk. Archive finalization mutating the shared trunk is an INCONSISTENCY with all three.
- Deviation: MAJOR. Archive is the last ADV subsystem that mutates the shared trunk as part of its core flow. Every other ADV mutation path has moved to worktree-isolated or remote-driven models.

7. CONCURRENCY IMPACTS
- Today: two concurrent archives on changes sharing one trunk serialize on the shared checkout (git index lock contention, checkpoint races, reset --hard destroying one archive's in-flight merge). High-risk under 10+ concurrent agents.
- Remote-first: archives become embarrassingly parallel — each proves against immutable remote refs independently; no shared-checkout lock. Only shared resource is the remote (rate-limited via gh/git protocol), already the case for PR routes.

8. SPEC-LAW IMPACT (MANDATORY spec delta)
- rq-releaseFinalization01.7 (dirty-main checkpoint) — REMOVE/REWRITE: currently MANDATES the RCA behavior.
- rq-releaseFinalization01.8 (unsafe-main blocks) — TRANSFORM: MAIN_BRANCH_MISMATCH/MISSING_GIT_IDENTITY/MAIN_IN_PROGRESS_STATE/MAIN_CHECKPOINT_FAILED checks vanish with the checkpoint; remaining checks (merge conflict, push failure) reframe around remote/worktree.
- rq-releaseFinalization01.4/.12 (origin proof, durable terminal) — PRESERVE, sourced from remote refs.
- rq-releaseProjectionDurability01.3 (re-verify from main checkout OR PR branch) — AMEND to permit remote-ref + persisted-tree-SHA proof.
- rq-releaseFinalization01 body: 'must refresh the current default-branch basis before deciding' — reframe to 'must verify post-fetch origin/default reachability or merged-PR proof'.
- **[report_follow_up]** follow_ups: F1 (high): Related-scan (P25) all resolveMainCheckout consumers in archive/cleanup paths — archived-branch-cleanup.ts:306 is a confirmed second shared-checkout touchpoint. Ensure AC1 ('never commits/resets/stashes/merges/pushes/syncs shared trunk') has NO remaining mutation path after syncDefaultBranchAfterMerge removal; extend touched scope or surface as separate work.
- **[report_follow_up]** follow_ups: F2 (medium): Planning — add an explicit acceptance/test that canonical-local-bare-remote validation BLOCKS unsafe direct integration when no valid bare remote is configured (design lists this as a risk/mitigation but it is not in design-derived criteria).
- **[report_follow_up]** follow_ups: F3 (medium): Planning — enumerate AC7 spec/command amendment targets (advance-workflow v1.43.0, worktree-lifecycle v1.8.0, adv-archive.md:517 syncDefaultBranchAfterMerge seam, rq-releaseFinalization03 compatibility); cross-check archived backlog bl--1Jm4pMx (admin/squash-merge phase-9 evidence) for compatibility.
- **[report_follow_up]** follow_ups: F4 (medium): Planning — the detached ephemeral worktree lifecycle + cleanup reaper is the highest-risk NEW operational surface; specify deterministic naming, a retained/inspectable failure receipt, and a bounded reaper with tests so leaks and diagnosis are covered.
- **[report_follow_up]** follow_ups: F5 (low): Tooling — adv_spec search for 'archive finalization reachability' returned empty despite advance-workflow v1.43.0 existing; likely a search-index/match gap, not a spec gap. Not a validation blocker.
- **[research_citation]** sources: git-finalize.ts — current shared-trunk mutation path (lever cited): Verified the bad current behavior the design removes: commitDirtyMainCheckpoint(mainCheckout) at :3368 commits shared dirty trunk; verifyRemoteNotAhead at :2930/:3397 blocks on DEFAULT_BRANCH_REMOTE_DIVERGED before reachability fallback; reconcileChangeBranchWithDefault(:75) is the workdir-scoped merge precedent reused; syncDefaultBranchAfterMerge(:192) runs `git merge --ff-only` on mainCheckout (shared-trunk mutation seam). (plugin/src/tools/archive-helpers/git-finalize.ts:3366-3388,2930-2960,977-1050,75-139,192-304)
- **[research_citation]** sources: git-finalize.ts — remote-first proof (lever cited, to be unified): resolveReleaseReachability(:2599) is pure remote-ref/PR/tree proof — no mainCheckout mutation. verifyDefaultBranchPushed(:1289) and detectSquashMergeByTree(:1424) thread changeTipSha; all unreachable routes return reachable:false (fail-closed) at :2642-2646, :2743-2747, :2827-2829. Confirms design reuse claim and AC2/AC4 fail-closed behavior. (plugin/src/tools/archive-helpers/git-finalize.ts:2599-2829,1289,1424)
- **[research_citation]** sources: change.ts — archive handler shared-trunk seam: syncDefaultBranchAfterMerge({mainCheckout}) at :4537 is advisory-only post-proof trunk sync that STILL mutates shared trunk. AC1 ('never ... syncs shared trunk') requires removing/replacing this call — the in-scope seam the design targets. (plugin/src/tools/change.ts:4530-4541)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design is sound and reuses verified existing seams rather than inventing mechanisms. Remote-first finalization maps directly onto the already-pure resolveReleaseReachability/verifyDefaultBranchPushed/detectSquashMergeByTree proofs (no shared-trunk mutation). The detached ephemeral worktree + fast-forward-push-rejection concurrency model is canonical git (verified against git-worktree(1) and git-push(1)), and the existing per-project git-worktree flock serializes worktree creation so no NEW archive lock is required (DONT3 satisfied structurally). The trunk-write firewall (rq-crossProjectTrunkFirewall01) remains defense-in-depth. Every cited lever exists at the cited line numbers. Existing pattern: archive mutates shared trunk (checkpoint at git-finalize.ts:3368, remote-ahead block at :3397, advisory sync at change.ts:4537). Reference pattern: integrate in isolated worktree, prove release from remote refs, let git's non-fast-forward rejection arbitrate concurrency. Deviation: MINOR-to-zero — the design moves toward the by-the-book reference and removes the deviations; no new non-standard mechanism introduced.
- **[unresolved_action]** required_main_agent_actions: Keep acceptance and release gates pending; do not archive until blocker is remediated and independently re-verified.
- **[unresolved_action]** required_main_agent_actions: Resume scoped implementation: make no-remote archive finalization fail closed, remove the local default-branch update-ref shipping path, and update rq-releaseFinalization01/rq-releaseFinalization03 plus docs/tests to require a validated canonical remote (including local bare).
- **[unresolved_action]** required_main_agent_actions: Rerun focused archive finalization and phase-9 tests, then request a new acceptance review.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A detached worktree protects the shared working tree and index, but updating refs/heads/<default> is still an authority mutation of the branch checked out by shared trunk. Treat an absent canonical remote as a fail-closed release condition when the agreement requires remote proof.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts, durable tr_msawwrq3_c154e6fe (reported execution evidence: 600 tests), git diff --check e9c2e176^ e9c2e176 results=pass — Focused suite: 3 files, 218 tests passed (8.15s). `git diff --check` produced no diagnostics. Source review found the focused suite encodes the conflicting no-remote success path at git-finalize.test.ts:2930; therefore passing tests do not satisfy AC4/C1/C2.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: durable tr_msawwrq3_c154e6fe (reported execution evidence: 600 tests)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check e9c2e176^ e9c2e176
- **[report_follow_up]** follow_ups: User decision: must pure-no-remote local-only release be preserved? If yes, open canonical-bare-remote follow-up change (design intent).
- **[report_follow_up]** follow_ups: git-blame the update-ref block to confirm authorship by THIS change (could not run git blame - execute has no shell). Circumstantial evidence (doc-comment vocabulary, test 'ships no-remote archive without mutating dirty main checkout' at git-finalize.test.ts:2930, problem-statement RCA at git-finalize.ts:3320-3365) strongly indicates it is new to this change.
- **[report_follow_up]** follow_ups: Related-scan (P25): audit archived-branch-cleanup.ts and phase9 persistence for any other shared-ref mutations introduced by this change.
- **[report_follow_up]** follow_ups: AC7: ensure generated schema/contracts (types/changes.ts route enum) still type-check after no_remote success removal; classification+enum remain valid.
- **[research_citation]** sources: git-finalize.ts no_remote update-ref+shipped block: no_remote route runs `git update-ref refs/heads/${defaultBranch} HEAD oldSha` (ff compare-and-set) then returns status:'shipped', pushStatus:'skipped'. Comment admits it uses update-ref because native push is rejected for a checked-out branch. (plugin/src/tools/archive-helpers/git-finalize.ts:2943-3046)
- **[research_citation]** sources: withEphemeralDefaultBranchWorktree (linked worktree): Creates ephemeral worktree via `git worktree add --detach` (line 139) = LINKED worktree sharing $GIT_COMMON_DIR/refs. Doc-comment (109-110) falsely claims mutations are isolated from shared main checkout; only working tree/index/HEAD are isolated, NOT refs. (plugin/src/tools/archive-helpers/git-finalize.ts:112-165)
- **[research_citation]** sources: release-gate accepts no_remote+skipped as shipped: validRoutePushCombo includes (route==='no_remote' && pushStatus==='skipped'); shipped-rescue synthesizes a done release gate from it. (plugin/src/tools/change/archive-gate.ts:1228-1255)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: BLOCKER CONFIRMED. The no_remote route (git-finalize.ts:2943-3046) merges in a linked ephemeral worktree then runs `git update-ref refs/heads/${defaultBranch} HEAD oldSha` and returns status:'shipped'. Because linked worktrees share $GIT_COMMON_DIR/refs (git docs), this mutates the SHARED default-branch ref visible to the main checkout and all peer worktrees. The code uses update-ref precisely to bypass receive.denyCurrentBranch (which refuses push to a checked-out branch to avoid index/worktree inconsistency), so it advances the shared ref while leaving the shared checkout's index/worktree inconsistent - a correctness hazard git refuses by default, and a direct violation of C1 ('Shared trunk is never a release mutation target') and AC1 ('never ... merges ... shared trunk'). It then reports shipped without any remote-authoritative reachability proof (AC4/C2). The spec rq-releaseFinalization01.1 envisions local-only completion, but its documented mechanism (`git -C $MAIN merge --ff-only`) ALSO violates AC1, and the implemented mechanism (ephemeral + update-ref) violates C1/AC1 plus the inconsistency hazard. The design's stated resolution (canonical bare remote for local-only multi-agent repos) was NOT implemented. Therefore a pure-no-remote repo has NO C1-conforming release path; the route is unsound under this change's contract and must fail-closed. Note: terminal rendering itself correctly says 'Merged locally.' for no_remote (command-prompt-decided, not the status field), so the 'reports shipped' harm concerns the internal status/proof authority, not the visible label.
- **[unresolved_action]** validation.blockers: no_remote route mutates the shared default-branch ref via `git update-ref refs/heads/${defaultBranch}` (git-finalize.ts:2993-2998) from a linked ephemeral worktree (git-finalize.ts:112-165, `git worktree add --detach`), bypassing receive.denyCurrentBranch and leaving the shared checkout index/worktree inconsistent; it then returns status:'shipped' (git-finalize.ts:3036-3046) and is accepted as shipped proof (archive-gate.ts:1235). Violates AC1/C1 (shared-trunk merge/mutation) and AC4/C2 (release success without remote-authoritative proof).
- **[unresolved_action]** required_main_agent_actions: Treat release-concurrency-1 as a release blocker; keep the change active and do not archive or complete release.
- **[unresolved_action]** required_main_agent_actions: Remediate the direct finalization freshness path in plugin/src/tools/archive-helpers/git-finalize.ts, then run the targeted archive-finalization tests and re-establish durable verification evidence for tr_msawwrq3_c154e6fe and tr_msb2wn0v_8bab6405.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated storage-suite failures; they are outside this review scope.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A cached-fetch helper is not release protection unless the direct finalization path invokes it before selecting its merge base; unit tests that only exercise the helper cannot prove the archive path is fresh.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Inspected commit a7415b855bb15f6e7a227e9e13518811aa5f859a and the finalization/release-proof paths. `resolveReleaseReachability` and no-remote handling are structurally guarded. Gate evidence records tr_msawwrq3_c154e6fe as passing 12 files/600 tests. Direct detailed durable-run lookup is unavailable on this tool surface; adv_change_show and adv_status both timed out with structured ToolExecutionTimeout.

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
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_tk-efafa70f12a9_20260801_1915_targeted
- verification_missing: No durable adv_run_test evidence found for run_id: tr_tk-efafa70f12a9_20260801_1915_check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.test.ts src/archive-release-finalization-assets.test.ts src/handoff-footer-drift.test.ts src/adv-autonomy-quality-assets.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: bin-oc-test-targeted-git-finalize-20260801
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-20260801
- Keep acceptance and release gates pending; do not archive until blocker is remediated and independently re-verified.
- Resume scoped implementation: make no-remote archive finalization fail closed, remove the local default-branch update-ref shipping path, and update rq-releaseFinalization01/rq-releaseFinalization03 plus docs/tests to require a validated canonical remote (including local bare).
- Rerun focused archive finalization and phase-9 tests, then request a new acceptance review.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: durable tr_msawwrq3_c154e6fe (reported execution evidence: 600 tests)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check e9c2e176^ e9c2e176
- no_remote route mutates the shared default-branch ref via `git update-ref refs/heads/${defaultBranch}` (git-finalize.ts:2993-2998) from a linked ephemeral worktree (git-finalize.ts:112-165, `git worktree add --detach`), bypassing receive.denyCurrentBranch and leaving the shared checkout index/worktree inconsistent; it then returns status:'shipped' (git-finalize.ts:3036-3046) and is accepted as shipped proof (archive-gate.ts:1235). Violates AC1/C1 (shared-trunk merge/mutation) and AC4/C2 (release success without remote-authoritative proof).
- Treat release-concurrency-1 as a release blocker; keep the change active and do not archive or complete release.
- Remediate the direct finalization freshness path in plugin/src/tools/archive-helpers/git-finalize.ts, then run the targeted archive-finalization tests and re-establish durable verification evidence for tr_msawwrq3_c154e6fe and tr_msb2wn0v_8bab6405.
- Do not revisit unrelated storage-suite failures; they are outside this review scope.
