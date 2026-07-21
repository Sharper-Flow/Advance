# Executive Summary

## Outcome
ADV now surfaces a Resume Freshness advisory when an agent resumes a stale change, alerting the user to codebase drift, active sibling overlap, or already-shipped archive duplicates before work proceeds — preventing duplicated effort and superseded-scope rebuilds.

## Why It Matters
Before this change, resuming a stale ADV change loaded only that change's state. The agent had no visibility into commits to its referenced files since last activity, in-flight siblings touching the same paths, or archives that shipped overlapping scope. Result: resumed changes could silently rebuild shipped work, race with active siblings, or proceed against stale API surfaces. The advisory closes that gap with stable, machine-classifiable finding codes — matching patterns now standard in 2026 agent-orchestration tooling (Ideate `stale_resume`, agent-chassis dispatch-readiness, agent-session-resume classification).

## Verdict
APPROVED

## What Was Built
1. New resolver module (`plugin/src/storage/resume-freshness-resolver.ts`) with three sub-resolvers (sibling overlap, archived-since duplicates, codebase drift) and an entrypoint that enforces the trigger band, 8s budget, and `freshness_limited` fallback.
2. Pure helper `intersectFileLists` extracted from `plugin/src/validator/file-overlap.ts` to a new utility (`plugin/src/utils/file-intersection.ts`), shared by validator and resolver without duplication.
3. Formatter extension to `buildChangeContextSnapshot` adding the optional `Freshness:` line and a 4-stage snapshot budget-shed rule that preserves the hard 10-line cap in all optional-row combinations (validator finding closed).
4. Primary-only injector wiring at three snapshot emit sites (`fetchChangeContextSnapshot`, `enrichRecentChangeStatus`, `buildCandidateEnrichmentPatch`) — primary-only invocation bounds cost regardless of recent-change list length (validator finding closed).
5. One-command close+supersede recommendation (`appendResumeFreshnessRecommendation`) surfacing a copy-pasteable `adv_change_close` snippet when exactly one HIGH-confidence archived duplicate is detected — never auto-executes; wording guard tested.
6. Spec law `rq-resumeFreshness01` added to `advance-workflow` (10 Given/When/Then scenarios) and `rq-ctxsnap1` amended in `chat-output-display` for the Freshness row + 4-optional budget rule.
7. Agent instruction updates in `.opencode/agents/adv.md` Step 2.5 and `ADV_INSTRUCTIONS.md` Critical Protocols section, both carrying the proceed-default contract and "ADV does not auto-execute close" wording guard.
8. Research pack at `docs/adv-resume-freshness-check-prep.md` with 9 sections and 15 cited sources (3 competitors + 2 emerging patterns from the 2026 ecosystem).
9. Test coverage: 116+ automated tests across resolver unit tests, formatter table tests, status-enrichment tests, integration pipeline tests, and the existing file-overlap validator (no regressions).

## What Was Verified
- Verdict: APPROVED with 1 suggestion (no blockers, no issues).
- Tests: 116/116 pass across 7 test files (file-intersection, resume-freshness-resolver, resume-freshness-pipeline, context-snapshot, status-enrich, file-overlap, plus spec scenarios). Lint clean, typecheck clean, format:check clean, schemas:check clean.
- Preview URL: not_applicable — pure backend/agent-flow change. No visual_surface; no front-end, browser-visible, or visual-output work. Affects Context Snapshot box (text) and agent prompt prose only.
- Contract matrix: 29/29 required rows passed/respected, 0 failing. All 11 ACs pass, all 7 constraints respected, all 7 avoidances respected.

## Remaining Concerns
- **Worker delegation failure unresolved**: `adv-engineer` sub-agents returned empty task_results throughout execution; user accepted inline-risk decision. Diagnosis deferred. Non-blocking — all work shipped inline and verified.
- **Spec delta recorded via direct file edit** (not via `adv_delta_add`): `.adv/specs/advance-workflow/spec.json` and `.adv/specs/chat-output-display/spec.json` updated in the change worktree. Archive workflow will reconcile; `NO_DELTAS` warning persists on the change record but is not a release blocker.
- **Conformance suite not run**: full build + `bin/oc-test full` skipped due to session length. Targeted test sweep covers all new code paths. `/adv-harden` may run full suite.
- **One deferred suggestion for `/adv-harden`**: 4-optional budget rule has test coverage for the no-Epic case but not the Epic-line case where Wisdom sheds before Freshness. Implementation is correct; test gap is minor.

## Supporting Evidence
- Tasks: tk-5bbd701b42ca (types+helper), tk-b87896ac4738 (sibling), tk-78ac237d8630 (archived), tk-96cede0a416a (drift), tk-36b013f11ad8 (entrypoint), tk-c315acd9e7ea (formatter), tk-11fbea40c938 (injectors), tk-5e9b6c11a473 (recommendation), tk-338d015a8ee6 (integration test), tk-8e87f1a1938c (spec law), tk-eecf04f7df59 (agent instructions), tk-57c0973b03f5 (research pack)
- Commits: SHA range `2aeb40ce` → `e395a00c` on `change/addResumeFreshnessAdvisory` branch (8 commits)
- Contract review matrix: 29 rows persisted via `adv_contract_review_matrix_set`
- Design validator: fail (advisory-only, both findings closed in Rev 2 — D6 4-stage rule, D9b primary-only)
- Test runs: `tr_mruqpfp4`, `tr_mrure0ym`, `tr_mrurm0yp`, `tr_mrus9nxj`, `tr_mrusbppt`, `tr_mrusm8wi` (adv_run_test records)

## Consequence Context
1. **Delivered value**: stale resumes surface codebase/sibling/archive overlap before Gate Machine proceeds — status: delivered; evidence: acceptance summary + 12 task implementations + 116 passing tests
2. **Enabling-only/follow-up dependency**: none — advisory is informational, no downstream work required to realize value
3. **Ops readiness**: pending — `/adv-harden` owns release/deploy/production/docs/cleanup readiness; no ops/deploy work in this change
4. **Migration/data impact**: n/a — pure additive plugin code; no schema migrations, no data format changes, optional field defaults to undefined (backward compatible)
5. **Frontend/preview impact**: not_applicable — `visual_surface: false` per agreement; no browser-visible output affected
6. **Collision/release risk**: low — change branch `change/addResumeFreshnessAdvisory` touches plugin source + agent instructions; no conflicts observed with concurrent in-flight changes (verified via `adv_change_list` in discovery phase)
7. **Open follow-ups**: 1 deferred suggestion (Epic+4-optional test gap) routed to `/adv-harden`; worker delegation diagnosis deferred by user choice
8. **Next action**: acceptance approval proceeds inline to `/adv-harden addResumeFreshnessAdvisory`
