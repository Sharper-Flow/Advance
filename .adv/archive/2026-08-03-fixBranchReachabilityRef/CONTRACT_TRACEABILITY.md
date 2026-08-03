# Contract Traceability

**Change ID:** fixBranchReachabilityRef
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-03T02:05:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Origin variant no longer requires refs/heads/change/<id>. Tier 1 persisted changeTipSha, Tier 2 refreshed origin ref. Tests: uses persisted tip without network; refreshes remote change ref before ancestry. tr_mscij4n4_8ad3cba6 250/250. |
| AC2 | acceptance_criterion | pass | test | verifyChangeBranchReachable resolves ref before log, returns refUnresolved instead of git fatal text. RED tr_mschxjxc_4d248aca reproduced defect, GREEN tr_mschyiyq_2cc3973e. Validator confirmed sibling not release-critical; hardened as P25 hygiene. |
| AC3 | acceptance_criterion | pass | test | Unresolved returns unmergedCommits [] with refUnresolved true in both functions; terminal proof change_ref_unresolved maps to distinct reason CHANGE_BRANCH_REF_UNRESOLVED. Spec invariant delta dl-refUnresolvedInvariant01 reviewed READY with SHA-256 395ee1cb body-fidelity proof. |
| AC4 | acceptance_criterion | pass | test | Bare-origin/clone fixture reproduces live shape: merged no-ff, local branch and tracking ref deleted, no changeTipSha, resolves via refreshed ref and returns reachable. Pre-implementation probe confirmed same shape on real repo. |
| AC5 | acceptance_criterion | pass | test | Genuinely unmerged change still blocks with real unmerged-commit evidence. Pre-existing real-git test retained; Probe 4 returned REACHABLE no for an unmerged branch after refresh. |
| AC6 | acceptance_criterion | pass | test | Fetch failure and ref-absent both fail closed via refUnresolved. merge-base exit 0/1/other distinguished; no error path yields reachable true. Probe 3 confirmed absent ref exits 128 cleanly. adv-reviewer attempt 3 re-confirmed. |
| AC7 | acceptance_criterion | pass | test | dryRun result carries finalization evaluated false with reason; continueFrom stays keyed to real finalization so dry run does not synthesize continuation state. Breaking assertion at change.archive-phase9.test.ts:1198 updated. RED tr_msci7643_a9235215, GREEN tr_msciem2z_a2f8101b. |
| AC8 | acceptance_criterion | pass | test | No regression. Targeted green: tr_mscij4n4_8ad3cba6 250/250, tr_mschz142_029435b3 204/204, reviewer attempt 3 239 passed. Full-sweep failures classified environmental, all pass in isolation (tr_msckhrq6_96800cad 78/78, tr_msckj8aj_4a6c9b90 9/9). DISCLOSED CAVEAT: archive-phase9-splitbrain.itest.ts AC3 fails NO_REMOTE_RELEASE_AUTHORITY, independently verified PRE-EXISTING at base 2de43a3b by orchestrator and by adv-reviewer attempts 2 and 3. Satisfied as no-regression, not literal green. |
| C1 | constraint | respected | static_check | No fail-open, force, or bypass. Rejected rev-1 design would have trusted a stale tracking ref; shipped code reads remote-tracking ref only after successful refresh. Stale-ref guard returns a reachable answer for the stale tip so it fails if code ever reads unrefreshed. adv-reviewer attempt 3 re-confirmed. |
| C2 | constraint | respected | static_check | All positive results backed by real git ancestry via merge-base --is-ancestor against origin/<default>. changeTipSha is an input to the proof, not the proof. No metadata-derived or inferred reachability. |
| C3 | constraint | respected | static_check | No NEW network round-trip. Reviewer raised this as a blocker at attempt 2 and WITHDREW it at attempt 3 on baseline evidence: base 2de43a3b already performed two fetches in the direct route (verifyDefaultBranchPushed line 1054, verifyChangeBranchReachableFromOrigin line 812, called at 2310 and 2322). Refreshed-ref path still two, folding change refspec into the pre-existing fetch; persisted-tip path one, strictly fewer. Parity documented in the function doc block. |
| C4 | constraint | respected | static_check | Return types widened additively (refSource, refUnresolved optional); existing two-field shape preserved for consumers and test mocks. New proof-to-reason branch inserted ahead of the existing terminal return, leaving every pre-existing mapping byte-for-byte unchanged. External ReleaseReachabilityProof shape unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5dbdda8dafa7 | AC3 |  | C1, C2 |  |
| tk-4934326ab99d | AC1, AC3, AC4, AC6 | AC1, AC3 | C1, C2, C3, C4 |  |
| tk-7d6bd2177fb5 | AC2 | AC2 | C1, C4 |  |
| tk-28ffec64ffba | AC7 | AC7 | C1, C4 |  |
| tk-17bc62896e53 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4 |  |
