# Archive Briefing Digest

**Change ID:** fixArchivedProvenanceRecovery
**Title:** Fix archived provenance recovery
**Status:** archived
**Generated:** 2026-08-02T22:03:02.561Z

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

Showing 33 of 33 durable facts.

- **[archive_only_evidence]** decisions: Added one shared helper evaluateWorkerBundleProvenanceForChange and called it from every release-completion writer — Design required a single chokepoint so no route could bypass provenance; avoids duplication and drift.
- **[archive_only_evidence]** decisions: Used not_applicable provenance in test fixtures rather than required-with-fake-proof — Test harnesses have no real worker bundle; not_applicable with rationale is the valid declaration path and keeps tests self-contained.
- **[archive_only_evidence]** decisions: Removed three unused eslint-disable-next-line no-console directives from plugin/src/utils/manifest-frontmatter.ts — They were the only remaining lint warnings and blocked bin/oc-test smoke; removing them is safe and restores smoke.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — 62/62 gate tests pass after fixing disk fixture provenance and removing debug log
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passes: schemas, typecheck, manifests, frontmatter, test isolation, lockfile, lint, format:check, and 98 smoke tests
- **[archive_only_evidence]** verification: OC_TEST_REAPER_DISABLE=1 pnpm vitest run --project=unit --reporter=dot (0) — Full unit project passes (8185+ tests, expected failures/skips/todos as baseline)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscaof13_e4bbe354
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb9m18_6c7a7402
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb4v9p_7ee4b925
- **[report_follow_up]** follow_ups: adv_change_show projection read for fixArchivedProvenanceRecovery exceeds the 10s tool deadline on every attempt (bare + artifact includes) despite adv_doctor reporting worker_alive/queue_serviceable; I could not read design.md or the 13-item agreement contract. Triage as a reliability defect - likely a slow/expensive projection rebuild specific to this change. Until fixed, research/design agents cannot read this change's artifacts via tools.
- **[report_follow_up]** follow_ups: Verify in planning that EVERY release writer (including reconcileReleaseGateAfterAmbiguousSignal and any Phase-9 status paths) routes through the new provenance chokepoint; add a test invariant asserting no code path can set release gate status:'done' in archive-gate.ts without passing evaluateWorkerBundleProvenance (related-scan P25).
- **[research_citation]** sources: Spec law rq-workerBundleReleaseProvenance01 (MUST, scenarios .1-.6): Governing requirement: worker_bundle_impact:required MUST enforce provenance receipt (source_sha+build_run_id+replay_run_id, both runs passing) before release; absent declaration MUST NOT be bypassed by path heuristics (.4); runtime freshness out of scope at archive time (.5); check is a HARD BLOCKING release-readiness gate living in evaluateGateReadiness emitting GateReadinessBlocker, NOT advisory (.6). (docs/specs/advance-workflow.md:866-951)
- **[research_citation]** sources: Reusable pure readiness check: Pure, deterministic, reads only ChangeWorkflowState. Handles all 4 cases: absent impact (declaration-required blocker), not_applicable +/- rationale, required missing provenance, missing source_sha, missing/failing runs. Single source of truth the design proposes to reuse at every release writer. (plugin/src/temporal/gate-readiness.ts:1019-1131 (evaluateWorkerBundleProvenance))
- **[research_citation]** sources: Provenance enforcement is opt-in per caller: evaluateGateReadiness only runs evaluateWorkerBundleProvenance().blockers when options.enforceWorkerBundleProvenance is true. A release writer omitting the flag silently skips provenance. Rescue/disk paths bypass evaluateGateReadiness entirely. (plugin/src/temporal/gate-readiness.ts:49,1133,1176-1177 (enforceWorkerBundleProvenance option))
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design concept is architecturally sound and directly targets a confirmed spec violation. DEFECT VERIFIED: grep for evaluateWorkerBundleProvenance|evaluateGateReadiness|workerBundleProvenance|worker_bundle_impact in archive-gate.ts returns ZERO matches; the archive release writers and all recovery paths (verifyReleaseGateDurableForArchive store-done/disk-fallback/shipped-rescue, recoverReleaseGateViaDiskProjection, completeReleaseGateAfterFinalization) mark the release gate done without ever invoking the provenance readiness check. The shipped-rescue path synthesizes a done gate purely from git-finalization shipped + releasedCommitSha + route/push, which for a worker_bundle_impact:required change can report shipped success without provenance - violating rq-workerBundleReleaseProvenance01.1 (must block) and .6 (hard blocking gate in evaluateGateReadiness). DESIGN CONCEPT VALIDATED: (1) Reusing evaluateWorkerBundleProvenance (already pure, deterministic, reads only workflow state) at every release writer is the correct single-source-of-truth fix and matches spec .6's placement; feasibility confirmed because the durable disk projection carries worker_bundle_impact + workerBundleProvenance + test_runs, so recovery paths can reconstruct ChangeWorkflowState and run the check. (2) Gating pre-terminal archive entry is correctly framed as provenance-readiness gating, not release-done gating, preserving rq-releaseFinalization01's allowReleasePending contract. (3) Typed archived release-pending recovery with immutable proof aligns with the existing recoverReleaseGateViaDiskProjection pattern; immutable proof = durable change.json + git-verified releasedCommitSha. REFERENCE PATTERN (by-the-book): a release-readiness invariant should have exactly one evaluator consulted at every state-writing boundary that can mint a done gate; the current code violates this by having archive writers mint done gates independently of the readiness evaluator; the design restores it.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the three scoped review-remediation files through the normal ADV task workflow before acceptance completion.
- **[unresolved_action]** required_main_agent_actions: Reconcile/rebase the behind worktree only through the orchestrator-owned worktree flow before final release decisions.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When a release gate evaluates typed test-run evidence from a persisted Change projection, ChangeSchema must preserve evidence_kind. Zod's object parsing otherwise strips it, causing valid build_worker/replay_determinism receipts to fail recovery validation.
- **[archive_only_evidence]** changes_made: plugin/src/types/changes.ts: Preserved typed test-run evidence_kind in the durable Change projection schema used by archived recovery.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.test.ts: Added regression proof that a parsed durable Change retains build_worker/replay_determinism evidence and satisfies the shared recovery chokepoint.
- **[archive_only_evidence]** changes_made: plugin/schemas/change.schema.json: Regenerated public JSON schema after the ChangeSchema addition.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/tools/change/archive-gate.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-phase9.test.ts, pnpm --dir plugin run check results=pass — Targeted suite: 4 files, 232 tests passed. Full check passed schemas:check, typecheck, generated manifests check, frontmatter/test-isolation/lockfile checks, ESLint, and Prettier. Initial targeted command using plugin-prefixed paths found no tests; corrected to the wrapper's plugin-relative paths.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/tools/change/archive-gate.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** required_main_agent_actions: No scoped code remediation required. Before archive/release, re-evaluate current origin/trunk reachability and follow normal Phase 9 finalization.
- **[wisdom_candidate]** wisdom_candidates: [success] Release-provenance enforcement is centralized in evaluateWorkerBundleProvenanceForChange and exercised at archive preflight, completed-workflow disk recovery, shipped rescue, and direct gate recovery.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts, bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts src/temporal/gate-readiness.test.ts, pnpm run check, pnpm run build, bin/oc-test full results=pass — Targeted provenance test: 115 passed. Scoped recovery/release suite: 294 passed. pnpm run check passed schemas, typecheck, generated manifests, frontmatter, isolation, lockfile, lint, and formatting. pnpm run build passed plugin, worker, and build-identity builds. Full suite passed: 531 files passed, 1 skipped; 8186 passed, 1 expected fail, 1 skipped, 12 todo. git diff --check passed; worktree clean after verification.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts src/temporal/gate-readiness.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscaof13_e4bbe354
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb9m18_6c7a7402
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb4v9p_7ee4b925
- Checkpoint the three scoped review-remediation files through the normal ADV task workflow before acceptance completion.
- Reconcile/rebase the behind worktree only through the orchestrator-owned worktree flow before final release decisions.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/tools/change/archive-gate.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- No scoped code remediation required. Before archive/release, re-evaluate current origin/trunk reachability and follow normal Phase 9 finalization.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts src/temporal/gate-readiness.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
