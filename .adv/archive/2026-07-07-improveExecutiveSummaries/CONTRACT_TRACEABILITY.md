# Contract Traceability

**Change ID:** improveExecutiveSummaries
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T04:03:15.037Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer READY report: executive-summary guidance now targets non-technical release-approval readers; no blockers/issues. |
| SC2 | success_criterion | pass | review | adv-reviewer READY report and command assets require outcome, why it matters/value, verification, risks/follow-ups, and supporting evidence. |
| SC3 | success_criterion | pass | review | adv-reviewer READY report confirmed technical terms are constrained to parenthetical/supporting detail and dense jargon does not lead. |
| SC4 | success_criterion | pass | review | adv-reviewer READY report confirmed caveman carve-out is scoped to executive-summary/release-readiness artifact substance. |
| SC5 | success_criterion | pass | review | Targeted asset regression passed: workflow-noise-reduction, approval-consequence-context, and adv-skill-backed-commands tests (72 tests). |
| AC1 | acceptance_criterion | pass | test | Targeted tests assert executive-summary audience law and adv-review summary sections for outcome, value/why it matters, verification, risks/follow-ups, and supporting evidence. |
| AC2 | acceptance_criterion | pass | test | Targeted tests assert evidence-only impact wording in spec/docs and review command guidance. |
| AC3 | acceptance_criterion | pass | test | Targeted tests assert technical terms appear as parenthetical supporting detail in spec/docs and review command guidance. |
| AC4 | acceptance_criterion | pass | test | adv-skill-backed-commands asset test asserts caveman-full preserves executive-summary/release-readiness artifact substance and must not compress away decision essentials. |
| AC5 | acceptance_criterion | pass | test | approval-consequence-context asset test asserts adv-archive and ADV sign-off preserve improved summary context/source from _executiveSummary before Tier B approval. |
| AC6 | acceptance_criterion | pass | test | Targeted regression suite passed: 3 asset files, 72 tests; bin/oc-test smoke also passed check and smoke tests. |
| AC7 | acceptance_criterion | pass | test | Implementation touched only current workflow/spec/docs/command/test assets; no archived summary files or archive bundles rewritten; git status clean. |
| C1 | constraint | respected | static_check | Guidance keeps supporting evidence, technical traceability, verification, risk/follow-up, and Approval Consequence Context rows visible. |
| C2 | constraint | respected | static_check | Guidance uses scannable sections/bullets and explicitly warns against long essay or dense scanner/report jargon; no raw logs/diffs/task spam. |
| C3 | constraint | respected | static_check | All changed files are in current advance repo/worktree; no product-linked or cross-repo files modified. |
| C4 | constraint | respected | static_check | Added spec law plus structural asset-test anchors; behavior not left as prose-only guidance. |
| DONT1 | avoidance | respected | review | adv-reviewer READY report found no vague marketing prose replacing audit evidence. |
| DONT2 | avoidance | respected | review | Guidance requires evidence-only impact; reviewer found no unsupported impact language. |
| DONT3 | avoidance | respected | review | Guidance requires risks/follow-ups, ops/readiness context, and warning/blocked states for missing harden evidence. |
| DONT4 | avoidance | respected | review | No task implementation summary or sub-agent report schemas changed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Historical archived executive summaries were not modified. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Global user-owned caveman config under ~/.config/opencode was not modified. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No dependency or external summarization service was added. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Changes stayed on executive-summary and release-approval surfaces, not unrelated gate handoff voice. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-62d43c3249ec | SC1, SC2, SC5, AC1, AC2, AC3, AC6, C4 | AC6 | DONT1, DONT2, DONT4, OOS1, OOS3 |  |
| tk-5bb16da9d15b | SC1, SC2, SC3, SC5, AC1, AC2, AC3, AC5, AC6, C1, C2, C4 | AC1, AC2, AC3, AC5, AC6 | DONT1, DONT2, DONT3, DONT4, OOS1, OOS4 |  |
| tk-46aa74582fb0 | SC4, SC5, AC4, AC6, C2, C4 | AC4, AC6 | DONT1, DONT2, OOS2, OOS4 |  |
| tk-dd549b58711e |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3, OOS4 |  |  |
