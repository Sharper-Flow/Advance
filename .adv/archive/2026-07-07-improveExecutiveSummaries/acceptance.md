# Acceptance

Reviewed at: 2026-07-07T04:03:15.037Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Future executive summaries give non-technical release-approval context. | pass | adv-reviewer READY report: executive-summary guidance now targets non-technical release-approval readers; no blockers/issues. |
| SC2 | success_criterion | Each summary covers decision essentials: what changes, why it matters, verification, risk/follow-ups, and supporting evidence. | pass | adv-reviewer READY report and command assets require outcome, why it matters/value, verification, risks/follow-ups, and supporting evidence. |
| SC3 | success_criterion | Technical terms appear only as parenthetical support, not lead explanation. | pass | adv-reviewer READY report confirmed technical terms are constrained to parenthetical/supporting detail and dense jargon does not lead. |
| SC4 | success_criterion | Repo-owned caveman-full policy no longer compresses away executive-summary substance. | pass | adv-reviewer READY report confirmed caveman carve-out is scoped to executive-summary/release-readiness artifact substance. |
| SC5 | success_criterion | Regression coverage prevents return to terse technical changelog summaries. | pass | Targeted asset regression passed: workflow-noise-reduction, approval-consequence-context, and adv-skill-backed-commands tests (72 tests). |
| AC1 | acceptance_criterion | Executive-summary guidance requires hybrid minimum sections for outcome, value, verification, risks/follow-ups, and supporting evidence. | pass | Targeted tests assert executive-summary audience law and adv-review summary sections for outcome, value/why it matters, verification, risks/follow-ups, and supporting evidence. |
| AC2 | acceptance_criterion | Summary guidance uses evidence-only impact wording: no unsupported business/user benefit claims. | pass | Targeted tests assert evidence-only impact wording in spec/docs and review command guidance. |
| AC3 | acceptance_criterion | Unavoidable technical terms are allowed as parenthetical supporting detail. | pass | Targeted tests assert technical terms appear as parenthetical supporting detail in spec/docs and review command guidance. |
| AC4 | acceptance_criterion | Repo-owned caveman-full policy carves out executive-summary/release-readiness substance from context-removing compression. | pass | adv-skill-backed-commands asset test asserts caveman-full preserves executive-summary/release-readiness artifact substance and must not compress away decision essentials. |
| AC5 | acceptance_criterion | Archive/sign-off guidance preserves improved summary context at approval time. | pass | approval-consequence-context asset test asserts adv-archive and ADV sign-off preserve improved summary context/source from _executiveSummary before Tier B approval. |
| AC6 | acceptance_criterion | Tests/assets fail if non-technical audience, decision essentials, evidence-only impact, caveman carve-out, or traceability preservation are missing. | pass | Targeted regression suite passed: 3 asset files, 72 tests; bin/oc-test smoke also passed check and smoke tests. |
| AC7 | acceptance_criterion | Historical archived summaries are not rewritten. | pass | Implementation touched only current workflow/spec/docs/command/test assets; no archived summary files or archive bundles rewritten; git status clean. |
| C1 | constraint | Preserve technical traceability, release evidence, verification, risk, and follow-up context. | respected | Guidance keeps supporting evidence, technical traceability, verification, risk/follow-up, and Approval Consequence Context rows visible. |
| C2 | constraint | Keep summaries scannable; do not turn executive summaries into long essays. | respected | Guidance uses scannable sections/bullets and explicitly warns against long essay or dense scanner/report jargon; no raw logs/diffs/task spam. |
| C3 | constraint | Keep this change current-repo scoped to `advance`; no product-linked or cross-repo scope is in effect. | respected | All changed files are in current advance repo/worktree; no product-linked or cross-repo files modified. |
| C4 | constraint | Use spec/test/asset anchors where durable behavior is required; avoid relying on prose-only guidance for correctness-critical workflow behavior. | respected | Added spec law plus structural asset-test anchors; behavior not left as prose-only guidance. |
| DONT1 | avoidance | Do not replace audit evidence with vague marketing prose. | respected | adv-reviewer READY report found no vague marketing prose replacing audit evidence. |
| DONT2 | avoidance | Do not fabricate business or user impact that is not supported by proposal, agreement, task, review, or release evidence. | respected | Guidance requires evidence-only impact; reviewer found no unsupported impact language. |
| DONT3 | avoidance | Do not hide release risks, follow-ups, migrations, frontend impact, rollback readiness, or ops readiness. | respected | Guidance requires risks/follow-ups, ops/readiness context, and warning/blocked states for missing harden evidence. |
| DONT4 | avoidance | Do not change task implementation summaries or sub-agent report schemas unless later design proves they directly block the approved outcome. | respected | No task implementation summary or sub-agent report schemas changed. |
| OOS1 | out_of_scope | Rewriting historical archived executive summaries. | not_applicable | Historical archived executive summaries were not modified. |
| OOS2 | out_of_scope | Changing global user-owned caveman configuration under `~/.config/opencode`. | not_applicable | Global user-owned caveman config under ~/.config/opencode was not modified. |
| OOS3 | out_of_scope | Adding a new dependency or external summarization service. | not_applicable | No dependency or external summarization service was added. |
| OOS4 | out_of_scope | Changing unrelated gate handoff voice outside executive-summary and release-approval surfaces. | not_applicable | Changes stayed on executive-summary and release-approval surfaces, not unrelated gate handoff voice. |

