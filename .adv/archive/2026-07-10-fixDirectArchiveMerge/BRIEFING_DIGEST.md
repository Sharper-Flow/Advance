# Archive Briefing Digest

**Change ID:** fixDirectArchiveMerge
**Title:** Fix direct archive merge
**Status:** archived
**Generated:** 2026-07-10T20:17:08.691Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #214

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

Showing 84 of 84 durable facts.

- **[agenda]** follow_ups: Pre-existing, out-of-scope spec-asset drift observed during the full-suite red run: src/ops-follow-up-assets.test.ts (subagent-reports version expected 1.6.0, received 1.7.1) and src/subagent-reports-spec-assets.test.ts (rq list length mismatch). Owned by the separate spec-update task for this change; no spec files were modified by this task.
- **[archive_only_evidence]** decisions: Routed phase9="run" through the existing awaited finalization path instead of adding new logic — The awaited path was already battle-tested for phase9=undefined in both direct and PR modes; reusing it preserves PR-mode/#198 and the release-evidence->gate->durable-proof->archive->cleanup ordering for free, and makes explicit "run" and default behavior identical (terminal).
- **[archive_only_evidence]** decisions: Did not re-introduce eager changeTipSha/route/repo capture into the synchronous path — finalizeRelease computes reachability synchronously while the change branch still exists, and the branch is never deleted on pending_merge (early return before cleanup), so the squash-merge (rq-fixPhase9SquashMergeRedetect) and PR-detection (rq-fixPhase9PrDetection) invariants hold without a pre-finalization "pending" record. Eager capture would have required persisting a "pending" status, which the task explicitly forbids (no residual pending on throw).
- **[archive_only_evidence]** decisions: Removed the now-unused imports Phase9FinalizationStatus, classifyFinalizationRoute, coercePrWorkflowRoute — They were only referenced inside the deleted detached block; leaving them would fail noUnusedLocals typecheck (confirmed via tsc).
- **[archive_only_evidence]** decisions: Replaced the six legacy async-dispatch tests with four focused synchronous-behavior tests plus updated dryRun/phase9=skip guards — The old tests asserted the removed fire-and-forget contract (dispatchPhase9Finalization called, finalizeRelease not called, phase9:"pending"). The new tests assert terminal outcomes and no-residual-pending, and were proven to fail red against the old code before passing green.
- **[archive_only_evidence]** verification: pnpm test -- src/tools/change.archive-phase9.test.ts (1) — RED (adv_run_test phase=red, runId tr_mrf9ce21_f31d816c): 4 new phase9=run tests failed against old code as expected — finalizeRelease called 0 times (wanted 1), parsed.phase9 'pending' (wanted 'pending_merge'), parsed.success true (wanted false), and no rejection on thrown finalization.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts (0) — GREEN (adv_run_test phase=green, runId tr_mrf9l9na_e31d5b86): 33/33 passed, including the 4 new synchronous-behavior tests.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.test.ts (0) — VERIFY (adv_run_test phase=verify, runId tr_mrf9lp3l_ecefed2f): 101/101 passed after removing the phase9Queue import/spy/assertion; confirms the archived no-op test still passes and no module-load regression.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean; confirms no unused-import or dangling-reference errors after removing the detached block and 4 imports.
- **[archive_only_evidence]** verification: pnpm exec eslint src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts (0) — eslint clean on all touched files.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts (0) — prettier --check clean on all touched files.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts
- **[agenda]** follow_ups: Out-of-scope same-class observation: reconcileArchivedBundleRetry (plugin/src/tools/change/archive-gate.ts:~271) calls verifyReleaseEvidenceFromMain synchronously without try/catch on the already-archived retry path (AC7). That path is verification-only (no git ops, far lower throw risk) and is a different contract than the direct Phase-9 path fixed here; surface for a follow-up if defensive wrapping is desired there too.
- **[archive_only_evidence]** decisions: Wrapped the awaited finalizeRelease/verifyReleaseEvidenceFromMain ternary in try/catch; on catch, record durable phase9_status="failed" (preservePhase9Evidence carries error + startedAt/completedAt) and return formatToolOutput success=false with requirement rq-releaseFinalization01 + remediation, without rethrow and without archiving. — AC2 requires a thrown finalization to be handled (not swallowed, not rethrown) with durable failed evidence and no silent pending/archive state. The early return prevents reaching the change.status="archived" transition.
- **[archive_only_evidence]** decisions: Emitted the failed classification inline (phase9Failure: {status,error,recoverable:false,remediation}) instead of reusing buildFailedPhase9Classification. — That helper keys off change.phase9_status.status==="failed" and requires a non-optional GitFinalizeOutcome; the thrown path has no finalization and the in-memory change is not yet "failed". Reuse would force mutating in-memory change + synthesizing a finalization — broader and riskier than an equivalent inline classification, which the task explicitly permits.
- **[archive_only_evidence]** decisions: Updated the pre-existing test "phase9=run thrown finalization leaves no residual pending state" (asserted rejects.toThrow("boom")) to assert the new handled AC2 contract (resolves success=false, records phase9_status failed with error, no pending, no save). — That test directly encoded the DONT2 (rethrow/lose failure) behavior this change exists to eliminate. Leaving it would keep a RED test against correct behavior and contradict the AC2 contract row; updating it is in-scope, not drift.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: During related-scan I noticed reconcileArchivedBundleRetry (archive-gate.ts:~271) invokes verifyReleaseEvidenceFromMain synchronously without try/catch on the already-archived retry (AC7) path. It is verification-only (no git ops) and outside the direct Phase-9 path this task owns, so I did not touch it.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed" (1) — RED (runId tr_mrfd2p9a_73f96753): new AC2 test failed as expected — 'Error: git push failed: network unreachable' propagated as an unhandled rejection (the DONT2 bug).
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed" (0) — GREEN targeted (runId tr_mrfd484u_02bb4c01): new AC2 test passes — thrown finalization handled, success=false, phase9_status failed recorded.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change.test.ts (0) — GREEN full (runId tr_mrfd5wwf_b7bff711): 135 passed / 0 failed across both files; updated phase9=run thrown test + existing blocked/pending/classify tests all green.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — typecheck (runId tr_mrfd6g2d_6e0be852): tsc --noEmit clean.
- **[archive_only_evidence]** verification: pnpm exec eslint src/tools/change.ts src/tools/change.archive-phase9.test.ts (0) — eslint clean (no output) on both touched files.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/tools/change.ts src/tools/change.archive-phase9.test.ts (0) — prettier check clean: 'All matched files use Prettier code style!'
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/change.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/change.ts src/tools/change.archive-phase9.test.ts
- **[agenda]** follow_ups: Pre-existing: ops-follow-up-assets.test.ts pins advance-workflow 1.26.0 but spec is 1.27.0 (version drift from another change)
- **[agenda]** follow_ups: Pre-existing: subagent-reports-spec-assets.test.ts frozen list expects 22 reqs but rq-subagentReports23 was added (found 23)
- **[agenda]** follow_ups: Pre-existing: adv-skill-backed-commands-assets.test.ts criteria-ownership stage-boundary assertion failing
- **[agenda]** follow_ups: These surface under `pnpm test` full suite but are unrelated to rq-releaseFinalization01 and untouched by this change; assign to their owning changes.
- **[unresolved_action]** required_main_agent_actions: Triage the 4 pre-existing full-suite asset drifts (ops-follow-up version pins, subagent-reports rq-subagentReports23 frozen list, criteria-ownership) under their respective owning changes — out of scope for tk-789feaca52c2.
- **[archive_only_evidence]** decisions: Appended one durability paragraph to the rq-releaseFinalization01 body and added a single scenario rq-releaseFinalization01.12 instead of spawning a new requirement — Agreement LBP decision explicitly says 'Modify rq-releaseFinalization01'; the law is one invariant (direct dispatch must reach durable terminal evidence while retaining release-proof safeguards). AC1-AC5 remain test-evidence items for the implementation tasks; the spec states the law, tests prove the ACs.
- **[archive_only_evidence]** decisions: Did not bump the advance-workflow spec version/updated_at — Task scope is strictly the rq-releaseFinalization01 scenario + generated docs. The ops-follow-up-assets version pin (expects 1.26.0, actual 1.27.0) is already stale/pre-existing and failing independent of this edit; bumping here would expand blast radius into unrelated version-drift ownership without fixing that stale pin.
- **[archive_only_evidence]** decisions: Mirrored docs/specs/advance-workflow.md by hand to match plugin/src/archive/docs.ts generateSpecDoc exactly, then proved byte-equality with a faithful node port of the generator — docs/specs are deterministic generated mirrors of spec.json (regenerated at archive time). Hand-mirror + byte-equality proof satisfies 'generated docs as convention requires' without adding a one-off CLI.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: An inadvertent full-suite `pnpm test` run (file filter did not apply) surfaced 4 pre-existing failures in unrelated specs; the correctly-scoped targeted run (`bin/oc-test targeted`) for this task's checks passes.
- **[archive_only_evidence]** verification: jq -e . .adv/specs/advance-workflow/spec.json (0) — spec.json parses as valid JSON
- **[archive_only_evidence]** verification: node mirror-check (requirement section render vs docs slice) (0) — rq-releaseFinalization01: 12 scenarios, last .12; body exact mirror=true; full requirement section byte-identical to generateSpecDoc template=true
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/archive-release-finalization-assets.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — 2 files, 6 tests passed (body tokens, spec/doc parity, command/voice terminals, ADV_INSTRUCTIONS citations, spec-citation invariant)
- **[archive_only_evidence]** verification: git diff --stat (0) — Blast radius exactly 2 files: spec.json +18/-1, docs/specs/advance-workflow.md +17/-1; no code, no commit
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: jq -e . .adv/specs/advance-workflow/spec.json
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node mirror-check (requirement section render vs docs slice)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/archive-release-finalization-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --stat
- **[archive_only_evidence]** decisions: Bumped pinned spec-version expectations forward (1.26.0->1.27.0 advance-workflow; 1.6.0->1.7.1 subagent-reports) instead of editing specs — Specs are the source of truth and already carry the newer versions on origin/trunk; the tests lagged. Task explicitly forbids changing specs/version metadata.
- **[archive_only_evidence]** decisions: Appended rq-subagentReports23 to the expected requirement id list — The subagent-reports spec now defines 23 requirements (verified via JSON parse of .adv/specs/subagent-reports/spec.json); the asset test asserted only 22 and was missing the new terminal id.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts (1) — RED (before fix): 4 failed / 84 passed — advance-workflow 1.26.0 expected vs 1.27.0 actual (adv-skill:317 + ops-follow-up:144), subagent-reports 1.6.0 expected vs 1.7.1 actual (ops-follow-up:149), requirement list length mismatch missing rq-subagentReports23 (subagent-reports-spec-assets:43)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts (0) — GREEN (after fix): 3 files passed, 88/88 tests passed
- **[archive_only_evidence]** verification: bin/oc-test full (0) — GREEN: 329 test files passed, 4826/4826 tests passed, 0 failed (Duration 134.91s). Epic time-skipping flake from the first run did not recur.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[agenda]** follow_ups: Planning: assert DC1 (no phase9_status:'pending' residue after direct phase9:'run' return) as the AC3 verification rather than a resume-path test.
- **[agenda]** follow_ups: Planning: include change.test.ts:17,3636 and change.archive-phase9.test.ts:171 phase9-queue references in the DC4 consumer-removal scope.
- **[agenda]** follow_ups: Planning: add rq-releaseFinalization01 direct-terminal scenario + run schemas:check/spec doc generation as an explicit task.
- **[archive_only_evidence]** sources: phase9-queue.ts (queue under retirement): dispatchPhase9Finalization uses `.catch(() => {})` fire-and-forget — the exact silent-loss mechanism (DONT1/DONT2 root cause). Imports Store (storage), confirming tool-layer, not workflow-bundle code.
- **[archive_only_evidence]** sources: phase9-queue consumer scan (grep): Exactly one production consumer (change.ts). DC4/design decision #2 (sole-consumer) verified true. Remaining refs are test spy/mock.
- **[archive_only_evidence]** sources: Detached async branch under removal: phase9==='run' branch records pending, then dispatchPhase9Finalization() and returns phase9:'pending' immediately. Contains full finalize→releaseGate→durableProof→archive→cleanup closure duplicated from sync path.
- **[archive_only_evidence]** sources: Awaited sync pipeline (reuse target): Enforces ordered chain: finalizeRelease → blocked/pending_merge handling → completeReleaseGateAfterFinalization → verifyReleaseGateDurableForArchive → archive status → removeChangeDir/advWorktreeCleanup/deleteChangeBranch (same direct+shipped+non-pr_auto_merge guard)/closeLinkedIssue/epic projection. Full behavioral parity with the async closure — removal drops no behavior.
- **[archive_only_evidence]** sources: reconcileArchivedBundleRetry (AC4 recovery reuse): Archived-bundle re-entry calls verifyReleaseEvidenceFromMain, revalidating default-branch proof before release repair. Supports AC4 recovery-after-manual-merge/push without a new tool. Guarded by change.status==='archived' && existingBundlePath!==null (rq-archiveRetryIdempotence01 AC7).
- **[archive_only_evidence]** sources: rq-releaseFinalization01 spec requirement: 11 scenarios enforcing origin/default-branch or merged-PR proof; scenarios .4/.9/.10 already require post-fetch reachability proof and recovery revalidation. Adding a direct-terminal scenario extends one cohesive law (design decision #4) rather than creating a competing requirement. C1 preserved.
- **[archive_only_evidence]** architecture_assessment: Design is a delete-not-add simplification: it removes the detached Phase-9 execution branch (change.ts:2635-2880) and routes direct phase9:'run' through the already-awaited sync finalization pipeline (2882-3235), then retires the single-consumer phase9-queue.ts. Source verification confirms every material claim: (1) the queue's `.catch(()=>{})` is the literal silent-loss mechanism; (2) change.ts is the sole production consumer; (3) the sync path has full behavioral parity with the async closure (same finalize→releaseGate→durableProof→status→cleanup→issue-closure ordering, identical branch-delete guard). Because the sync path already enforces rq-releaseFinalization01 release proof before archive status transition, reusing it structurally guarantees AC1 (shipped only after reachability proof), AC2 (thrown finalization returns a typed blocked/failed tool result, no detached pending), and C3 (no early success). AC3 is satisfied by eliminating the interruption window rather than adding a resumer: an interrupted awaited tool call simply does not complete, leaving an active retryable change — no detached merge work to lose. This is the correct boring solution and matches the agreement's explicit LBP decision to prefer window-elimination over a durable job/resumer subsystem (which would add workflow state, startup reconciliation, and new failure modes). C2 replay-safety is preserved because phase9-queue.ts and the archive branch are tool-layer (import Store/storage), not workflow-bundle code — no signal/query surface is touched. DONT1/DONT2/DONT3 all satisfied (no fire-and-forget, no swallow, no auto-retry). AC4 reuses reconcileArchivedBundleRetry + idempotent re-entry (both revalidate trunk proof). AC5/OOS honored — PR-mode and #198 paths are untouched.
- **[archive_only_evidence]** findings: [info] Direct Phase-9, archive-gate, change, release-finalization asset, and spec-citation regression coverage passed.
- **[agenda]** follow_ups: Unrelated stale subagent-reports asset assertions require separate ownership.
- **[unresolved_action]** required_main_agent_actions: Resolve whether to expand scope to repair unrelated baseline asset drift before execution gate completion.
- **[archive_only_evidence]** findings: [issue] Full suite fails stale advance-workflow and subagent-reports asset expectations unrelated to this change.
- **[archive_only_evidence]** findings: [info] Plugin build passes.
- **[unresolved_action]** recommended_next_action: ask_user
- **[unresolved_action]** required_main_agent_actions: Apply the scoped failed-finalization persistence and structured-error fix in plugin/src/tools/change.ts, then update plugin/src/tools/change.archive-phase9.test.ts.
- **[unresolved_action]** required_main_agent_actions: Rerun `bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts` and the required plugin typecheck/lint before re-review.
- **[unresolved_action]** required_main_agent_actions: Leave PR/#198 boundary, PR-mode behavior, and unrelated archive recovery paths unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Replacing fire-and-forget Phase 9 dispatch with `await` removes detached work but does not by itself satisfy durability: exception paths must also write a terminal failed status before returning.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts results=pass — Focused Phase 9 suite passed: 1 file, 33 tests, exit 0. Static related scan found no remaining `phase9-queue`, `dispatchPhase9Finalization`, or `phase9: "pending"` references.
- **[wisdom_candidate]** wisdom_candidates: [success] Direct archive finalization can preserve durable terminal semantics by reusing the awaited release pipeline: record thrown-finalization failure before returning, then block archive transition.
- **[archive_only_evidence]** verification: tests_run=git diff --check, bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts, bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts results=pass — Diff whitespace check passed. Focused Phase-9 suite passed 34/34. Archive + change suite passed 135/135. Source review confirms thrown finalization is caught, preserves prior Phase-9 evidence while writing status=failed plus error, returns actionable rq-releaseFinalization01 failure, and returns before release-gate/archive transition. PR pending-merge and completed-workflow recovery tests remain covered.
- **[agenda]** follow_ups: Optional: raise testTimeout for Temporal workflow-env test files if CI flakiness persists; out of scope.
- **[archive_only_evidence]** findings: [info] Two full-suite Temporal timeouts reproduce as pass on isolated rerun — transient host-load flake, not change-caused.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/tools/change.archive-phase9.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/change.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts
- finish_owned_scope_then_report: During related-scan I noticed reconcileArchivedBundleRetry (archive-gate.ts:~271) invokes verifyReleaseEvidenceFromMain synchronously without try/catch on the already-archived retry (AC7) path. It is verification-only (no git ops) and outside the direct Phase-9 path this task owns, so I did not touch it.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts -t "records durable phase9_status failed"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/change.ts src/tools/change.archive-phase9.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/change.ts src/tools/change.archive-phase9.test.ts
- Triage the 4 pre-existing full-suite asset drifts (ops-follow-up version pins, subagent-reports rq-subagentReports23 frozen list, criteria-ownership) under their respective owning changes — out of scope for tk-789feaca52c2.
- finish_owned_scope_then_report: An inadvertent full-suite `pnpm test` run (file filter did not apply) surfaced 4 pre-existing failures in unrelated specs; the correctly-scoped targeted run (`bin/oc-test targeted`) for this task's checks passes.
- verification_missing: No adv_run_test evidence found for reported command: jq -e . .adv/specs/advance-workflow/spec.json
- verification_missing: No adv_run_test evidence found for reported command: node mirror-check (requirement section render vs docs slice)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/archive-release-finalization-assets.test.ts src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git diff --stat
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/subagent-reports-spec-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- Resolve whether to expand scope to repair unrelated baseline asset drift before execution gate completion.
- ask_user
- Apply the scoped failed-finalization persistence and structured-error fix in plugin/src/tools/change.ts, then update plugin/src/tools/change.archive-phase9.test.ts.
- Rerun `bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts` and the required plugin typecheck/lint before re-review.
- Leave PR/#198 boundary, PR-mode behavior, and unrelated archive recovery paths unchanged.
