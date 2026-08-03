# Archive Briefing Digest

**Change ID:** fixBranchReachabilityRef
**Title:** Fix branch reachability ref resolution
**Status:** archived
**Generated:** 2026-08-03T02:20:57.136Z

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
| acceptance | pending |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 64 of 64 durable facts.

- **[unresolved_action]** required_main_agent_actions: No remediation required. Use this review report as the task evidence and proceed with the owning workflow.
- **[archive_only_evidence]** verification: tests_run=jq/body-diff + SHA-256 postimage verification, source inspection: plugin/src/archive/delta.ts:107-111; archive-gate.ts:847-859; git-finalize.ts:784-922, 2484-2490 results=pass — Baseline body is 2003 chars. Reconstructed postimage inserts exactly the supplied 307-character invariant immediately before the unchanged final sentence; it is 2310 chars and SHA-256 395ee1cbc2bad5aa7002d429c0b517a5a73fd8df6362e9bee1cea5a1f1ba05de. Unified diff shows no other character changes. Delta changes contains only body; baseline requirement retains 12 scenarios. The invariant is mechanism-independent and agrees with implementation: refUnresolved maps to change_ref_unresolved, then archive-gate blocks with CHANGE_BRANCH_REF_UNRESOLVED; unmerged commits are empty on resolution/operational failure.
- **[archive_only_evidence]** decisions: Use persisted changeTipSha directly and skip the verifier fetch when present. — The content-addressed tip survives local branch cleanup and satisfies the no-network Tier 1 path.
- **[archive_only_evidence]** decisions: When persisted tip is absent, refresh default and change remote-tracking refs in one fetch using fully expanded refspecs, forcing only the change ref. — This prevents stale origin/change refs from being read and preserves rebased remote branches without adding a network round-trip.
- **[archive_only_evidence]** decisions: Replace range/log output with merge-base --is-ancestor and return empty unmergedCommits for non-ancestor or resolution errors. — Ancestry is the required reachability proof, and git diagnostics must never be misclassified as commit evidence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts (1) — RED: three new reachability tests failed against the pre-fix implementation, establishing the failing behavior.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts (0) — GREEN: focused git-finalize suite passed, 130 tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-phase9.test.ts (0) — Verification: all three relevant suites passed, 203 tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and format checks passed; four pre-existing explicit-any warnings remain.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mschf3gj_9f950d9e
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mschgios_e512a058
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mschnir3_df959ef1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mschrmno_f96d1099
- **[archive_only_evidence]** decisions: Emit change_ref_unresolved only at the direct-route terminal after PR discovery, PR merge-state, and squash-tree fallbacks fail. — Preserves fallback order and keeps squash-merged changes rescuable while distinguishing unresolved refs from real unmerged evidence.
- **[archive_only_evidence]** decisions: Add an explicit archive-gate branch for CHANGE_BRANCH_REF_UNRESOLVED with adv_doctor remediation. — The new proof must remain fail-closed and needs a distinct actionable blocker without changing existing proof-to-reason mappings.
- **[archive_only_evidence]** decisions: Expose a structured unevaluated finalization object only in successful dry-run archive output. — Dry runs still skip Phase 9; the result now discloses that limitation without changing execution or non-dry-run behavior.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts (1) — RED: 3 expected failures captured before implementation for unresolved proof mapping, archive-gate reason mapping, and dry-run disclosure.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts (0) — GREEN: 4 test files passed; 250 tests passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Repository check passed: schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and formatting; four pre-existing explicit-any warnings remain.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msci7643_a9235215
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msciem2z_a2f8101b
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscidzcg_fdae833b
- **[unresolved_action]** required_main_agent_actions: Create the task checkpoint commit for plugin/src/tools/archive-helpers/git-finalize.test.ts before marking tk-17bc62896e53 done.
- **[archive_only_evidence]** decisions: Added the stale-tracking-ref guard as a stateful mock that returns a merged old tip only when refresh is skipped and an unmerged new tip after refresh. — This proves the answer depends on the refreshed ref and makes a stale-ref fail-open impossible to hide behind a passing ancestry assertion.
- **[archive_only_evidence]** decisions: Enhanced the existing unresolved-origin test with an ordered fallback event trace. — The terminal reason alone does not prove discoverMergedPr, readPrMergeState, and detectSquashMergeByTree remain ahead of change_ref_unresolved.
- **[archive_only_evidence]** decisions: Added a real bare-origin/clone fixture for deleted local and tracking refs, plus an explicit non-ancestor squash tree-rescue test. — These cover the live AC4 archive shape and ensure merge-base status 1 still reaches pr_merged through tree evidence without changing production behavior.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts (0) — 135 targeted git-finalize tests passed, including stale-ref, fallback-ordering, squash-rescue, and AC4 fixture guards.
- **[archive_only_evidence]** verification: VITEST_MAX_WORKERS=8 bin/oc-test full (0) — Full unit sweep passed under the repository throttle wrapper.
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Schemas, typecheck, manifests, frontmatter, isolation, lockfile policy, lint, and formatting checks passed; four pre-existing eslint warnings remain.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke checks passed: 98 tests passed and repository checks completed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjl44o_53113c31
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msck2ypy_7c6c59a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjodzp_7e585a11
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjr8bd_f032b465
- **[report_follow_up]** follow_ups: Add a test that a stale refs/remotes/origin/change/<id> does NOT yield origin_default without a sound backstop.
- **[report_follow_up]** follow_ups: Audit whether any in-flight change lacks phase9_status.changeTipSha to size the legacy-recovery population.
- **[report_follow_up]** follow_ups: Consider widening detectSquashMergeByTree to merge-base --is-ancestor for true no-ff merges (tree-match can miss them).
- **[research_citation]** sources: origin verify fn: verifyChangeBranchReachableFromOrigin (RELEASE path): git fetch origin <defaultBranch> (812) fetches ONLY default branch; range origin/${defaultBranch}..change/${changeId} (822); nonzero -> reachable:false, fatal into unmergedCommits (824-828). Sole release caller: resolveReleaseReachability@2322. (plugin/src/tools/archive-helpers/git-finalize.ts:805-832)
- **[research_citation]** sources: resolveReleaseReachability direct route: direct route: originReachability@2322 -> discoverMergedPr@2340 -> readPrMergeState@2353 -> detectSquashMergeByTree@2377 -> terminal origin_unmerged@2392. reachable:true returns EARLY proof origin_default@2328-2333 and SKIPS all sound fallbacks. (plugin/src/tools/archive-helpers/git-finalize.ts:2285-2397)
- **[research_citation]** sources: changeTipSha capture: changeTipSha captured via git rev-parse change/<id> AFTER archive commit, BEFORE any merge/delete, for ALL routes (pr@2877 + direct@2931). Persisted to phase9_status; read back archive-gate.ts:770,792. (plugin/src/tools/archive-helpers/git-finalize.ts:2863-2875)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Defect confirmed: bare change/{id} ref fails post-merge branch deletion; nonzero exit -> reachable:false with git fatal packed as unmerged-commit evidence (git-finalize.ts:824-828). But proposed D1/D2 has a SOUNDNESS HOLE on a release-safety gate: git fetch origin <defaultBranch> (812) fetches ONLY default branch and does NOT refresh refs/remotes/origin/change/<id>. So a remote-tracking ref is (a) often missing and (b) potentially STALE. A stale tracking ref at an old merged tip makes origin/default..staleTip empty -> reachable:true, and because reachable:true returns EARLY @2328-2333 with proof origin_default, it SKIPS the sound gh/tree fallbacks -> potential release FAIL-OPEN (C1/C2). The design IGNORES the authoritative branch-deletion-safe source already present: persisted changeTipSha (captured git-finalize.ts:2866, threaded archive-gate.ts:770). Sound simpler fix: prefer changeTipSha via git merge-base --is-ancestor <tip> origin/<default> in resolveReleaseReachability -> no branch ref, no new network, no new reason code, no new spec scenario, strictly more correct than tree-match for true no-ff merges. Deviation of PROPOSED design: MAJOR (introduces stale-ref fail-open risk; simpler persisted-tip fix removes it).
- **[unresolved_action]** validation.blockers: D1/D2 remote-tracking-ref fallback is not a sound reachability proof without refresh: git fetch origin <defaultBranch> (git-finalize.ts:812) does NOT refresh refs/remotes/origin/change/<id>, so the ref may be missing or stale; a stale ref at an old merged tip yields reachable:true that returns EARLY (git-finalize.ts:2328-2333) with proof origin_default and SKIPS the sound gh/tree fallbacks -> release fail-open.
- **[unresolved_action]** validation.blockers: Design clause D4 claims 'no behavioral change, only disclosure' but adding finalization:{evaluated:false} to the dryRun result is a result-SHAPE change that breaks the existing assertion parsed.finalation === undefined (change.archive-phase9.test.ts:1198).
- **[report_follow_up]** follow_ups: Probe-test the combined-fetch refspec to determine if C3 amendment can be avoided entirely
- **[report_follow_up]** follow_ups: Verify detectSquashMergeByTree's 50-commit trunk window (line 1212) sufficient for high-velocity repos -- pre-existing, track separately
- **[report_follow_up]** follow_ups: Ensure AC3 new typed outcome for ref-resolution failure handled by all callers (resolveReleaseReachability at 2322 AND verifyChangeBranchReachable local sibling at 859 per AC2)
- **[research_citation]** sources: git-finalize.ts verifyChangeBranchReachableFromOrigin (805-832): Current primitive: git fetch origin <default> (812) then git log origin/<default>..change/<id> (819-823) using bare local ref. Nonzero exit conflated with unmergedCommits (824-828). (plugin/src/tools/archive-helpers/git-finalize.ts:805-832)
- **[research_citation]** sources: git-finalize.ts resolveReleaseReachability direct route (2322-2396): Early-return short-circuit at 2328-2333 (proof:origin_default) skips fallbacks when reachable:true. Fallback chain: discoverMergedPr(2340) -> readPrMergeState(2353) -> detectSquashMergeByTree(2377). (plugin/src/tools/archive-helpers/git-finalize.ts:2322-2396)
- **[research_citation]** sources: git-finalize.ts detectSquashMergeByTree (1183-1228): tipRef = deps.changeTipSha ?? change/<id> (1198). Tree-SHA match vs last 50 trunk commits (1212). Returns reachable:false if rev-parse fails (1200-1201). Legacy changes without changeTipSha AND deleted branch cannot be rescued. (plugin/src/tools/archive-helpers/git-finalize.ts:1183-1228)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Rev 2 replaces the unsound git-log-range primitive with git merge-base --is-ancestor <tip> origin/<default> in both tiers. Tier 1 uses persisted changeTipSha (content-addressed, no network, branch-deletion-safe). Tier 2 refreshes a single remote ref via bounded refspec fetch THEN resolves (never reads stale). Tier 3 fails closed on unresolved. The --is-ancestor primitive correctly handles all merge types: FF/no-ff -> true (genuine ancestry), squash -> false (falls through to tree-matching fallback). The early-return at 2328-2333 is safe under --is-ancestor because a true result is always a genuine ancestry proof, never a false positive from a stale/missing ref. The user's counter-argument is upheld: changeTipSha has exactly one writer (git-finalize.ts:2868, requires rev-parse change/<id> to succeed at finalization time) and no backfill path, so the 26 legacy changes with pre-deletion finalization have undefined changeTipSha, making Tier 2 genuinely necessary.
- **[unresolved_action]** required_main_agent_actions: packet_defect: Provide a Context Packet containing `SCOPE KEY: review:acceptance`, then respawn acceptance review.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Analysis not started: packet identity validation failed before scope lock.
- **[unresolved_action]** required_main_agent_actions: Remediate review-c3-1: consolidate direct-route default and change-ref refresh into exactly one successful combined fetch, then preserve a structural successful-refresh signal for the subsequent ref resolution.
- **[unresolved_action]** required_main_agent_actions: Rerun the four targeted suites, including src/temporal/__tests__/archive-phase9-splitbrain.itest.ts; retain its NO_REMOTE_RELEASE_AUTHORITY failure as pre-existing only if post-fix output and no_remote causal path remain unchanged.
- **[unresolved_action]** required_main_agent_actions: Do not revisit stale-ref, typed unresolved-ref, fallback ordering, or dry-run coverage unless the C3 refactor changes those paths.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A combined git fetch only satisfies the stale-ref safety invariant when its success is carried structurally to the subsequent ref read; merely relying on a remote-tracking ref after a prior fetch reintroduces a fail-open path.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/temporal/__tests__/archive-phase9-splitbrain.itest.ts results=fail — 239/240 tests passed. The known split-brain integration test failed with Archive finalization blocked: NO_REMOTE_RELEASE_AUTHORITY. Its test source is byte-identical at 2de43a3b and HEAD; the no_remote early return in resolveReleaseReachability is outside this change's direct-route diff, supporting the pre-existing-failure claim. The new unit tests passed, including stale-ref ordering and unresolved-ref fallback coverage. Initial targeted invocation using plugin-prefixed paths found no tests; rerun with documented src-relative paths.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/temporal/__tests__/archive-phase9-splitbrain.itest.ts
- **[unresolved_action]** required_main_agent_actions: No remediation required. Record this attempt-3 READY acceptance review; C3 blocker is withdrawn and acceptance may proceed.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts, git diff --check 2de43a3b..HEAD results=pass — Targeted suite: 3 files, 239 tests passed (exit 0). git diff --check returned exit 0. Independently compared the current working-tree diff with baseline 2de43a3b: baseline direct route calls verifyDefaultBranchPushed (its fetch origin <default>) then verifyChangeBranchReachableFromOrigin (its own fetch origin <default>), so it already has two fetches. Current refreshed-ref route retains the second fetch but adds the change refspec to it; persisted-tip route removes that second fetch. C3's prohibition on a NEW round-trip is satisfied. AC1-AC8 and C1-C4 re-confirmed: only a successful combined fetch permits reading origin/change/<id>; nonzero merge-base is fail-closed; unresolved refs map to change_ref_unresolved with empty details; dryRun returns evaluated:false.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 2de43a3b..HEAD

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

- No remediation required. Use this review report as the task evidence and proceed with the owning workflow.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mschf3gj_9f950d9e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mschgios_e512a058
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mschnir3_df959ef1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mschrmno_f96d1099
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msci7643_a9235215
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msciem2z_a2f8101b
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscidzcg_fdae833b
- Create the task checkpoint commit for plugin/src/tools/archive-helpers/git-finalize.test.ts before marking tk-17bc62896e53 done.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjl44o_53113c31
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msck2ypy_7c6c59a1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjodzp_7e585a11
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscjr8bd_f032b465
- D1/D2 remote-tracking-ref fallback is not a sound reachability proof without refresh: git fetch origin <defaultBranch> (git-finalize.ts:812) does NOT refresh refs/remotes/origin/change/<id>, so the ref may be missing or stale; a stale ref at an old merged tip yields reachable:true that returns EARLY (git-finalize.ts:2328-2333) with proof origin_default and SKIPS the sound gh/tree fallbacks -> release fail-open.
- Design clause D4 claims 'no behavioral change, only disclosure' but adding finalization:{evaluated:false} to the dryRun result is a result-SHAPE change that breaks the existing assertion parsed.finalation === undefined (change.archive-phase9.test.ts:1198).
- packet_defect: Provide a Context Packet containing `SCOPE KEY: review:acceptance`, then respawn acceptance review.
- Remediate review-c3-1: consolidate direct-route default and change-ref refresh into exactly one successful combined fetch, then preserve a structural successful-refresh signal for the subsequent ref resolution.
- Rerun the four targeted suites, including src/temporal/__tests__/archive-phase9-splitbrain.itest.ts; retain its NO_REMOTE_RELEASE_AUTHORITY failure as pre-existing only if post-fix output and no_remote causal path remain unchanged.
- Do not revisit stale-ref, typed unresolved-ref, fallback ordering, or dry-run coverage unless the C3 refactor changes those paths.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/temporal/__tests__/archive-phase9-splitbrain.itest.ts
- No remediation required. Record this attempt-3 READY acceptance review; C3 blocker is withdrawn and acceptance may proceed.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 2de43a3b..HEAD
