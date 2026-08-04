# Archive Briefing Digest

**Change ID:** broadenCoordinateTriage
**Title:** Broaden coordinate triage coverage
**Status:** archived
**Generated:** 2026-08-04T06:05:27.408Z

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

Showing 42 of 42 durable facts.

- **[report_follow_up]** follow_ups: Separate task tk-32966ede9ce3 owns updating the legacy asset assertion described in the packet; the current checkout's targeted suite did not reproduce that expected failure, so no test was edited.
- **[archive_only_evidence]** decisions: Made change-scoped inventory, repository-overlap, sequencing, and refactor-coverage analysis independent of active Epic presence. — Satisfies rq-epicCoordinateChangeCoverage01 while retaining Epic-dependent short-circuit behavior and existing mutation boundaries.
- **[archive_only_evidence]** decisions: Added explicit hasMore/resumeHint exhaustion language and widened report coverage to Epic-unlinked changes. — Makes complete inventory and equivalent linked/unlinked evidence treatment structural in the command contract.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts src/consumer-integration.test.ts (0) — Passed: 2 test files and 87 tests; contract and consumer integration checks pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdypcm4_bf046977
- **[report_follow_up]** follow_ups: Review and stage only the two owned triage files; leave the separate adv-coordinate change with its task owner.
- **[unresolved_action]** required_main_agent_actions: Keep .opencode/command/adv-coordinate.md out of this task's commit; its separate task owns that file.
- **[archive_only_evidence]** decisions: Rewired the Phase 2 kind hint wording to the landed deriveDefectHint mechanism. — Avoids a declaration without a producer or consumer and documents origin_kind as primary plus title_prefix as secondary/weak.
- **[archive_only_evidence]** decisions: Kept unlinked changes in the existing Important to complete section rather than adding a fourth section. — Preserves the required three-section portfolio contract while making nonterminal unlinked defect work visible.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Owned triage command and skill edits are complete. The adjacent coordinate-contract change remains outside this task and must stay with its owner.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-triage-portfolio-assets.test.ts src/adv-triage-relevance-assets.test.ts src/skill-loading-policy-assets.test.ts (0) — Passed: 3 test files and 17 tests; final triage command/skill contract edits validated.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdz154w_f2017f09
- **[archive_only_evidence]** decisions: Added standalone assertions for coordinate reachability, Epic-dependent no-active messaging, Epic-unlinked overlap/sequencing coverage, pagination discipline, and the complete Command Boundary MUST NOT line. — Pins each newly landed command contract without changing existing assertions.
- **[archive_only_evidence]** decisions: Added standalone portfolio assertions for structurally represented unlinked changes, structural membership, evidence-sourced advisory hints, and both new advisory-hint MUST NOT boundaries. — Keeps the existing three-heading contract test intact while covering the new Phase 6 law.
- **[archive_only_evidence]** decisions: Preserved lines 213–219 of advance-epics-assets.test.ts byte-for-byte. — Those lines assert project inventory precedes the no-active-Epics message and remain required under the corrected task scope.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts src/adv-triage-portfolio-assets.test.ts src/adv-triage-relevance-assets.test.ts src/consumer-integration.test.ts (0) — Passed: 4 test files, 105 tests. Prettier check also passed for both modified asset tests.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdzi77j_9ea0e9b1
- **[report_follow_up]** follow_ups: WARNING: the spawn prompt provided the four identity anchors (WORKING DIRECTORY/CHANGE/SCOPE KEY/ATTEMPT) but did not include the standard TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION block; scope was inferred from the 5 numbered questions and the 'no code edits' instruction. No identity anchors were inferred.
- **[report_follow_up]** follow_ups: If a future consumer needs defect-vs-feature as a hard query dimension (e.g. bug-backlog burn-down), revisit optional change_kind with default + expand-contract migration rather than required-from-day-one.
- **[report_follow_up]** follow_ups: Consider measuring hint accuracy (origin.kind vs title-prefix agreement) once deployed, to decide whether to graduate to opt-in triage-exit enforcement (Linear model).
- **[research_citation]** sources: YouTube DNN two-stage recommender (Google Research): Canonical two-stage architecture: candidate generation (high recall, broad) then ranking (high precision, fine scoring). Explicitly states the two-stage split lets you recommend from a huge corpus while keeping the surfaced set personalized \u2014 i.e. eligibility and ordering are intentionally separate concerns. (https://research.google.com/pubs/archive/45530.pdf)
- **[research_citation]** sources: Pinterest multi-stage retrieval+ranking: Confirms industry-standard funnel: retrieval narrows billions\u2192thousands, ranking scores the trimmed set. Retrieval intentionally over-inclusive (recall); ranking does discrimination (precision). Collapsing retrieval into a precision classifier loses recall. (https://medium.com/pinterest-engineering/establishing-a-large-scale-learned-retrieval-system-at-pinterest-eb0eaf7b92c5)
- **[research_citation]** sources: GitHub Issue Types docs (GA Jan 2025): Issue Types are OPTIONAL metadata. Defaults task/bug/feature shipped per org. Phrasing 'when you add an issue type to an issue' confirms not required. Evolved from labels; an issue can have no type. (https://docs.github.com/en/issues/tracking-your-work-with-issues/configuring-issues/managing-issue-types-in-an-organization)
- **[research_citation]** sources.omitted: 11 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The two-layer split (structural eligibility + heuristic advisory ranking) is the canonical multi-stage funnel pattern documented at industrial scale by YouTube and Pinterest: retrieval/eligibility is intentionally high-recall and over-inclusive, ranking is high-precision discrimination. Collapsing eligibility into a precision classifier (i.e. letting a defect/feature classifier gate visibility) is exactly the anti-pattern the recsys literature warns against. Locally, the ADV codebase already encodes this exact invariant for Epic ordering ('order stays advisory \u2014 may guide display/next-work but must not block gates, tasks, promotion, or change progress'), and the existing triage ranking already uses advisory existing-signals (issue priority, gate proximity, recency) with explicit non-filtering. The proposed change (title prefix + existing origin.kind provenance enum, advisory label, never filters/suppresses/authorizes) is fully consistent with the codebase's proven pattern and reuses an already-declared structural field (origin.kind) rather than minting a new one \u2014 a P19/P38 win (declaration that already has runtime effect, vs a freshly-inferred title prefix). The rejected structural change_kind enum is heavier, carries documented backfill/required-field friction (Jira-style), and would diverge from the codebase's own established non-blocking advisory invariant. Mature trackers split cleanly: GitHub (optional types, GA 2025) and Linear (no type field, opt-in enforcement at triage exit) chose the advisory/optional model; only Jira uses required-issue-type, and it pays for it with documented creation-blocking failure modes.
- **[unresolved_action]** required_main_agent_actions: Repair both blocking findings within the existing agreement scope, then rerun the targeted suite with task-bound adv_run_test evidence if a remediation task is created.
- **[unresolved_action]** required_main_agent_actions: Do not revisit release/deploy readiness, the deferred change_kind enum, or pre-existing temporal eslint warnings in this review pass.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A fixed numeric rank band requires a matching structural bound on every valid entry-order input; otherwise rank uniqueness and advisory ordering become input-order dependent at the boundary.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts results=pass — typed-v1 evidence: PASS, 3 files / 51 tests / exit 0. Independent review packet has no TASK id, so adv_run_test cannot record a task-bound runId; evidence is command/exit-output bound only.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts
- **[unresolved_action]** required_main_agent_actions: Checkpoint or otherwise commit the two scoped comment-only hygiene fixes before final release handling; this reviewer may not perform ADV task checkpoints.
- **[unresolved_action]** required_main_agent_actions: After merge, redeploy only from updated trunk using `pnpm run build`, `./scripts/deploy-local.sh --fix`, then restart the plugin host. This replaces the worktree-sourced global command/skill assets with trunk-provenance files.
- **[unresolved_action]** required_main_agent_actions: Record the NO_DELTAS warning as a follow-up process improvement; no release block or source change is required for this accepted change.
- **[unresolved_action]** required_main_agent_actions: Release Readiness Summary: Safe to ship after the normal merged-trunk build, deploy, and host restart. Ranking now stays finite and consumer/bundle checks pass. Residual risk is operational: the current global install contains three worktree-sourced assets until trunk is redeployed; NO_DELTAS is a non-blocking process caveat.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Harden reviews must distinguish `Number.MAX_SAFE_INTEGER` uses in unrelated archive ordering from the removed resume-projection `MAX_RANK` sentinel. Search by the exact old policy identifier before treating remaining numeric-sentinel references as regressions.
- **[archive_only_evidence]** changes_made: plugin/src/projection/resume-projection.test.ts: Replaced obsolete `MAX_RANK` wording with the current finite-rank policy wording.
- **[archive_only_evidence]** changes_made: plugin/src/tools/resume-projection.test.ts: Replaced obsolete sentinel-name wording with a descriptive historical reference.
- **[archive_only_evidence]** verification: tests_run=pnpm run check, ../bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts src/advance-epics-assets.test.ts src/adv-triage-portfolio-assets.test.ts, ../bin/oc-test targeted -- src/temporal/workflow-bundle-boundary.test.ts, git diff --check results=pass — `pnpm run check` completed successfully: schemas:check, typecheck, generated manifests, frontmatter, isolation, lockfile, lint, and format checks passed (four pre-existing ESLint warnings, no errors). Targeted suite: 5 files / 131 tests passed. Workflow boundary suite: 1 file / 8 tests passed. Static review found computeChangeRank is only consumed within the pure projection kernel, whose plugin and bin adapters do not compare ranks against a sentinel; PRIORITY_WEIGHT is private to portfolio-report.ts. Resume-projection is not workflow-reachable; boundary test passed. Rank branches use finite arithmetic for zero/one Epic and undefined activity is falsy; deriveDefectHint safely returns undefined for absent origin, empty title, and title `fix`.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts src/advance-epics-assets.test.ts src/adv-triage-portfolio-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

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
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdypcm4_bf046977
- Keep .opencode/command/adv-coordinate.md out of this task's commit; its separate task owns that file.
- finish_owned_scope_then_report: Owned triage command and skill edits are complete. The adjacent coordinate-contract change remains outside this task and must stay with its owner.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdz154w_f2017f09
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdzi77j_9ea0e9b1
- Repair both blocking findings within the existing agreement scope, then rerun the targeted suite with task-bound adv_run_test evidence if a remediation task is created.
- Do not revisit release/deploy readiness, the deferred change_kind enum, or pre-existing temporal eslint warnings in this review pass.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts
- Checkpoint or otherwise commit the two scoped comment-only hygiene fixes before final release handling; this reviewer may not perform ADV task checkpoints.
- After merge, redeploy only from updated trunk using `pnpm run build`, `./scripts/deploy-local.sh --fix`, then restart the plugin host. This replaces the worktree-sourced global command/skill assets with trunk-provenance files.
- Record the NO_DELTAS warning as a follow-up process improvement; no release block or source change is required for this accepted change.
- Release Readiness Summary: Safe to ship after the normal merged-trunk build, deploy, and host restart. Ranking now stays finite and consumer/bundle checks pass. Residual risk is operational: the current global install contains three worktree-sourced assets until trunk is redeployed; NO_DELTAS is a non-blocking process caveat.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/projection/resume-projection.test.ts src/tools/resume-projection.test.ts src/tools/triage/portfolio-report.test.ts src/advance-epics-assets.test.ts src/adv-triage-portfolio-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
