# Contract Traceability

**Change ID:** reduceWorkflowNoise
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-02T17:21:10.044Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | bin/oc-test smoke and full passed; targeted workflow-noise tests passed. Updated policy preserves seven gates, spec-law, TDD/task evidence, worktree isolation, contract proof, and release proof. |
| SC2 | success_criterion | pass | review | Specs, command contracts, checklists, allowlists/registry, and asset tests updated; bin/oc-test smoke/full passed. |
| SC3 | success_criterion | pass | review | Status tests verify one canonical next action; archive/reflect report lines keep deploy/reflection visible but nonblocking; reviewer verdict READY. |
| AC1 | acceptance_criterion | pass | test | plugin/src/workflow-noise-reduction-assets.test.ts and plugin/src/optimized-handoff-assets.test.ts pass; review/harden commands and checklists no longer require fixed finding quotas. |
| AC2 | acceptance_criterion | pass | test | workflow-noise tests assert mandatory remediation language remains for blocker/issue and validated in-scope findings; bin/oc-test targeted suite passed. |
| AC3 | acceptance_criterion | pass | test | workflow-noise tests assert review owns contract/correctness/security/tests/scope and harden owns release/deploy/production/docs/cleanup; targeted suite passed. |
| AC4 | acceptance_criterion | pass | test | advance-workflow spec and review/harden command/checklist tests assert risk-triggered scanner policy and high-risk mandatory checks; targeted suite passed. |
| AC5 | acceptance_criterion | pass | test | adv-discover spec/command/checklist updated for trigger-based scout with skipped/inconclusive paths; workflow-noise and discover asset tests passed. |
| AC6 | acceptance_criterion | pass | test | discover ambiguity policy tests passed; status next-action warning separation tests passed. |
| AC7 | acceptance_criterion | pass | test | plugin/src/tools/status.test.ts passed; stale pre-execution recommendations no longer emit wrong duplicate /adv-apply. |
| AC8 | acceptance_criterion | pass | test | adv_investment_report removed from registry, tool title, allowlists, commands, and tests; reflection owns local metric extraction; targeted tests and full suite passed. |
| AC9 | acceptance_criterion | pass | test | archive/reflect command tests assert deploy/reflection visible, failure nonblocking, rerun guidance, and structural release-safety exception; targeted tests passed. |
| AC10 | acceptance_criterion | pass | test | Design and rq-archiveVisibility01 record boundaries for addArchiveCleanupScanner and firstClassExecutiveSummary; implementation avoids duplicate cleanup-scanner and executive-summary scope. |
| AC11 | acceptance_criterion | pass | test | bin/oc-test smoke passed (pnpm run check plus smoke tests); targeted 9-file suite passed; bin/oc-test full passed. |
| C1 | constraint | respected | static_check | No gate count or gate ordering changes; gate status proposal/discovery/design/planning/execution complete, acceptance/release pending as expected. |
| C2 | constraint | respected | static_check | Spec-law and command contract updates made in tracked specs/docs; no direct ADV state file edits. |
| C3 | constraint | respected | static_check | Contract review matrix, task contract refs, and release proof language remain in commands/specs. |
| C4 | constraint | respected | static_check | TDD evidence recorded per task with RED/GREEN/VERIFY; final verification ran smoke/targeted/full tests. |
| C5 | constraint | respected | static_check | Implementation stayed in change worktree /home/jon/.local/share/opencode/worktree/.../change/reduceWorkflowNoise on branch change/reduceWorkflowNoise. |
| C6 | constraint | respected | static_check | No new runtime policy subsystem/table added; policy encoded in specs, commands, checklists, skills, and tests. |
| C7 | constraint | respected | static_check | Archive deploy/reflection policy keeps structural release-safety blockers intact for conformance, contract proof, merge/push, dirty main, and projection durability. |
| DONT1 | avoidance | respected | review | Tests assert no fixed review/harden finding quota remains. |
| DONT2 | avoidance | respected | review | Risk-triggered scanners and trigger-based discovery scout tests passed; no blanket broad fan-out required for narrow changes. |
| DONT3 | avoidance | respected | review | adv_investment_report active-surface scan passes; only historical changelog/test guard references remain. |
| DONT4 | avoidance | respected | review | Archive cleanup scanner behavior explicitly left to related active change scope; no duplicate implementation added. |
| DONT5 | avoidance | respected | review | Executive-summary ownership unchanged except removal of investment summary noise; no first-class executive summary duplicate implementation added. |
| DONT6 | avoidance | respected | review | Status and ambiguity tests separate canonical next actions from advisory warnings; no extra prompts added. |
| OOS1 | out_of_scope | respected | not_applicable | No archive cleanup scanner implementation introduced. |
| OOS2 | out_of_scope | respected | not_applicable | No first-class executive summary subsystem implemented; only current command summary text adjusted. |
| OOS3 | out_of_scope | respected | not_applicable | Temporal getInvestmentReport compatibility query left in place by design. |
| OOS4 | out_of_scope | respected | not_applicable | No roadmap/triage backlog behavior changed. |
| OOS5 | out_of_scope | respected | not_applicable | No production deploy automation added; archive keeps production deploy nudge only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2c8b4227cabd | SC1, SC2, AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, OOS1, OOS2, OOS3 |  |
| tk-c0cadc94f0cb | SC1, SC2, SC3, AC5, AC6 | AC5, AC6 | C1, C2, C4, C5, C6, DONT2, DONT6, OOS1, OOS2, OOS4 |  |
| tk-8cde3a4f9d54 | SC3, AC6, AC7 | AC6, AC7 | C1, C4, C5, C6, DONT6, OOS4 |  |
| tk-04e296f5c1e6 | SC1, SC2, AC8 | AC8 | C1, C2, C4, C6, DONT3, OOS2, OOS3 |  |
| tk-4ce9be88f917 | SC3, AC9, AC10 | AC9, AC10 | C1, C2, C3, C6, C7, DONT4, DONT5, OOS1, OOS2, OOS4, OOS5 |  |
| tk-b32cf202100e |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
