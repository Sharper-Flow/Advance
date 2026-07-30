# Archive Briefing Digest

**Change ID:** fixDurableTestEvidence
**Title:** Fix durable test evidence
**Status:** archived
**Generated:** 2026-07-30T20:47:36.420Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Showing 50 of 50 durable facts.

- **[archive_only_evidence]** decisions: Extracted exact typed run-ID resolution into a Temporal-safe utility. — Acceptance readiness and report submission now share one resolver without making the workflow import the tools layer.
- **[archive_only_evidence]** decisions: Re-resolve typed reports only at readiness; retain persisted warnings for legacy reports. — Current task-local durable evidence is authoritative for typed reports while legacy command-based warning behavior remains unchanged.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/subagent-report.test.ts src/temporal/gate-readiness.test.ts && pnpm --dir plugin run typecheck && pnpm --dir plugin exec prettier --check src/tools/subagent-report.ts src/temporal/gate-readiness.ts src/temporal/gate-readiness.test.ts src/utils/typed-verification-evidence.ts (0) — 172 focused tests passed; TypeScript typecheck and Prettier checks passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6tn03u_0802551e
- **[archive_only_evidence]** decisions: Resolved report verification per entry rather than per report. — Mixed reports now exact-resolve typed entries while retaining immutable legacy consumer warnings when untyped entries are present.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/subagent-report.test.ts src/temporal/gate-readiness.test.ts && pnpm --dir plugin run typecheck && pnpm --dir plugin exec prettier --check src/tools/subagent-report.ts src/temporal/gate-readiness.ts src/temporal/gate-readiness.test.ts src/utils/typed-verification-evidence.ts (0) — 173 focused tests passed; TypeScript typecheck and Prettier checks passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6tqsdp_e52b5044
- **[archive_only_evidence]** decisions: Covered acceptance through evaluateGateReadiness rather than only the resolver. — The regressions verify latest-report selection and exact task-local run identity at the acceptance boundary.
- **[archive_only_evidence]** decisions: Kept non-code and inline-TDD checks in change-state completion tests. — Those routes enforce task completion before acceptance and prove non-test work is exempt without weakening behavior-bearing code.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts && pnpm --dir plugin exec prettier --check src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts (0) — 202 focused tests passed; Prettier check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6u2fq4_bcad53ec
- **[report_follow_up]** follow_ups: Unowned concurrent changes exist in plugin/src/temporal/change-state.test.ts and plugin/src/temporal/gate-readiness.test.ts; leave them intact.
- **[unresolved_action]** required_main_agent_actions: Preserve or coordinate the unowned Temporal test-file changes before checkpointing this task.
- **[archive_only_evidence]** decisions: Made typed deliverable, evidence policy, proof target, and TDD intent the proof selector across canonical guidance and task packets. — Prevents titles, generic agent prose, or coverage preference from imposing test evidence.
- **[archive_only_evidence]** decisions: Retained red/green only for behavior-bearing inline code and declared non-test routes sufficient for non-code work. — Preserves TDD where behavior changes need executable proof without manufacturing irrelevant adv_run_test evidence.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: These files became modified during the task but are outside the docs/policy scope and were not edited by this agent.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-prep-assets.test.ts (0) — Passed: 1 file and 8 asset tests; confirms prep guidance remains structurally discoverable.
- **[report_follow_up]** follow_ups: Align typed-v1 verification validation and static_check gate-readiness behavior with the task-appropriate static command/result evidence policy.
- **[unresolved_action]** required_main_agent_actions: Decide whether to schedule runtime/schema enforcement alignment for static_check; this report includes a test run ID solely because the current strict report schema rejects static-check evidence without one.
- **[archive_only_evidence]** decisions: Limit adv_run_test run IDs to selected test execution and retained inline red/green TDD. — Static checks can prove their task through the executed command and result, while valid non-test policies require neither proof form.
- **[archive_only_evidence]** decisions: Add focused asset assertions for engineer, designer, and canonical instruction guidance. — Prevents a future wording change from reintroducing a static-check test-run requirement.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: The current typed-v1 report validator and evidence gate still require a durable adv_run_test ID for static_check. This remediation owns guidance only; changing runtime evidence enforcement exceeds its scoped objective.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/adv-instructions-assets.test.ts (0) — Passed 99 focused asset tests. The report schema currently requires this durable ID; the task's selected static-check proof passed separately without an ID.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ugjzx_5978c0de
- **[report_follow_up]** follow_ups: [spec|must] Rewrite rq-verificationEvidence01 clearing condition (a) to define acceptance-time exact-run re-resolution; remove 'warning-free' ambiguity (spec drift risk).
- **[report_follow_up]** follow_ups: [tests|must] Add acceptance-level integration: earlier invalid report then later valid typed report -> only later evidence governs (AC2). Add positive ring-residency regression for TDD tasks; document >20-run fail-closed UX (AC6 coverage).
- **[report_follow_up]** follow_ups: [impl-guardrail|should] All edits in plugin/src/ (temporal/gate-readiness.ts, tools/subagent-report.ts, specs). Root-level tools/ and temporal/ are vestigial duplicates, NOT shipped.
- **[report_follow_up]** follow_ups: [spec-prose|should] Clarify changeId identity is structural (workflow isolation); explicit match key is {taskId, runId}+exitCode. Prevents redundant forgeable changeId string compare.
- **[research_citation]** sources: gate-readiness.ts checkUnresolvedVerificationEvidence (acceptance authority): Acceptance reads report.consumer_warnings (frozen submit-time warnings) via latestVerificationReportsForTask; does NOT re-resolve typed entries against current durable testRuns. Remediation requires re-submitting a report even when durable evidence exists. Confirmed root cause. (plugin/src/temporal/gate-readiness.ts:704-744)
- **[research_citation]** sources: subagent-report.ts verificationWarnings typed binding + ingestion call: Submit-time resolver already implements rq-subagentReports25 typed provenance: entry.test_run_id (canonical)/run_id (alias) -> exact-key durableByRunId.get(runId) -> compare exitCode; missing/mismatch -> verification_missing/verification_mismatch. Legacy command-only entries keep exact-command binding. Called at ingestion with change.test_runs?.[taskId]. Design's 'shared resolver' = this function reused at acceptance. (plugin/src/tools/subagent-report.ts:471-601,888-893)
- **[research_citation]** sources: testRuns ring-buffer field + writer: state.testRuns keyed by taskId, ring-buffered last TEST_RUN_RING_BUFFER_LIMIT (20) via [...existing, record].slice(-20). Evicted runId -> undefined -> verification_missing blocker. Confirms fail-closed retention (concern 4). (plugin/src/temporal/contracts.ts:573-578; plugin/src/temporal/change-state.ts:820-844)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design structurally sound; leans on machinery already implemented. Root cause confirmed: gate-readiness acceptance trusts frozen submit-time consumer_warnings (gate-readiness.ts:725-730) instead of re-resolving the latest report's typed verification entries against current state.testRuns. The exact-identity typed resolver the design proposes ALREADY exists at report ingestion (verificationWarnings, subagent-report.ts:471-601) with rq-subagentReports25 provenance; the change extracts it into a shared deterministic resolver and ALSO invokes it at acceptance reading state.testRuns[taskId] (mirrored as change.test_runs). changeId identity enforced STRUCTURALLY by workflow isolation (testRuns in ChangeWorkflowState, one per change) - stronger than design prose implies; no cross-change leakage possible. Supersession = latest-report-by-attempt + exact-runId satisfaction (report's own cited runId) so unrelated green run cannot substitute (concern 2). No TDD/adv_run_test widening; non-test policies preserved via existing resolveTaskEvidence/isProofBearingEvidencePolicy (concern 3). 20-entry ring (.slice(-20)) -> undefined lookup -> explicit verification_missing blocker; fails closed (concern 4).
- **[unresolved_action]** required_main_agent_actions: Apply the in-scope guidance correction, then rerun the focused suite above.
- **[unresolved_action]** required_main_agent_actions: Re-review AC4/C4 after correcting all matching static-check run-ID wording; no gate or task state changes were made by this reviewer.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Evidence-policy vocabulary must remain semantically aligned across prep, agent packets, and acceptance guidance: `static_check` is a valid non-test policy and must not implicitly require `adv_run_test` or typed run IDs.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/subagent-report.test.ts src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts results=pass — Exit 0: 3 files, 268 tests passed. Diff inspection confirms exact task-local run-ID and exit-code re-resolution; late valid reports replace prior invalid reports by attempt; missing, cross-task, mismatch, and eviction cases fail closed; non-code source-citation completion and inline TDD preservation regressions are covered. `git diff --name-only origin/trunk...HEAD` shows no package or lockfile changes.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/subagent-report.test.ts src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts
- **[unresolved_action]** required_main_agent_actions: Apply the scoped gate-readiness fix requiring exit_code 0 for command-based static_check proof and add the missing regression, then re-run focused tests and pnpm check.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When adapting typed evidence resolution for a non-run policy, do not treat resolver silence for untyped entries as proof validity. Validate the policy-specific success signal before suppressing submission-time warnings.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts, pnpm --dir plugin run check results=pass — 113 gate-readiness tests passed. Full check passed with 0 errors; ESLint emitted 3 pre-existing unused eslint-disable warnings in src/utils/manifest-frontmatter.ts. The current tests cover command presence but not a nonzero static-check exit code.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** required_main_agent_actions: Checkpoint the reviewer formatting edit in plugin/src/temporal/gate-readiness.ts before final acceptance processing.
- **[wisdom_candidate]** wisdom_candidates: [success] AC4 static-check routing now preserves strict test-run identity for test evidence while allowing command/result proof only when a static check reports exit_code 0; explicit missing and nonzero regressions protect both boundaries.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.ts: Formatted the newly added static-check success guard so the required full check passes; no behavior changed.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/gate-readiness.test.ts, pnpm --dir plugin run check, git diff --check results=pass — 114 focused tests passed. Plugin check passed: schema/type/manifest/frontmatter/isolation/lockfile/lint/Prettier checks completed with 0 errors; ESLint reported 3 existing unused eslint-disable warnings in src/utils/manifest-frontmatter.ts. Diff check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6tn03u_0802551e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6tqsdp_e52b5044
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6u2fq4_bcad53ec
- Preserve or coordinate the unowned Temporal test-file changes before checkpointing this task.
- finish_owned_scope_then_report: These files became modified during the task but are outside the docs/policy scope and were not edited by this agent.
- Decide whether to schedule runtime/schema enforcement alignment for static_check; this report includes a test run ID solely because the current strict report schema rejects static-check evidence without one.
- finish_owned_scope_then_report: The current typed-v1 report validator and evidence gate still require a durable adv_run_test ID for static_check. This remediation owns guidance only; changing runtime evidence enforcement exceeds its scoped objective.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ugjzx_5978c0de
- Apply the in-scope guidance correction, then rerun the focused suite above.
- Re-review AC4/C4 after correcting all matching static-check run-ID wording; no gate or task state changes were made by this reviewer.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/subagent-report.test.ts src/temporal/gate-readiness.test.ts src/temporal/change-state.test.ts
- Apply the scoped gate-readiness fix requiring exit_code 0 for command-based static_check proof and add the missing regression, then re-run focused tests and pnpm check.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- Checkpoint the reviewer formatting edit in plugin/src/temporal/gate-readiness.ts before final acceptance processing.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
