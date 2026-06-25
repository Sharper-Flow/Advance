# Contract Traceability

**Change ID:** addDesignQualityGates
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T15:42:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | VISUAL_CONTEXT packet (adv-apply.md) + prep-readiness frontend applicability validator give UI work design context before implementation. Reviewer READY. |
| SC2 | success_criterion | pass | review | checkUnresolvedDesignConcerns blocks acceptance+release on undispositioned designer concerns by code, not reviewer goodwill. Reviewer confirmed SC2 holds structurally; no silent path. Tests: gate-readiness.test.ts. |
| SC3 | success_criterion | pass | review | Typed schemas (DesignerSubagentReportSchema, DesignConcernDispositionSchema) + state-resident dispositions + evaluator own correctness; prompt prose demoted to guidance. subagent-reports.test.ts. |
| SC4 | success_criterion | pass | review | adv-designer remains apply-only; adv-reviewer owns review/harden in command/agent docs. Reviewer READY; full suite green. |
| AC1 | acceptance_criterion | pass | test | checkFrontendApplicability (prep-readiness.ts) blocks prep on structured frontend metadata; heuristics advisory only. prep-readiness.test.ts. |
| AC2 | acceptance_criterion | pass | test | adv-apply.md Designer Apply Context Packet carries VISUAL_CONTEXT with surface/patterns/constraints/viewport/unavailable markers. adv-designer-assets.test.ts. |
| AC3 | acceptance_criterion | pass | test | DesignerDesignDimensionsSchema.superRefine requires notes for concern/n/a; six dimensions typed. subagent-reports.test.ts. |
| AC4 | acceptance_criterion | pass | test | On submit, each design_dimensions concern auto-promoted to required-obligation agenda item (consumeDesignerDesignConcerns). subagent-report.test.ts. Plus gate-readiness blocker. |
| AC5 | acceptance_criterion | pass | test | Each neighboring_recommendation auto-promoted with attempt-stable dedupe; cannot be silently dropped. subagent-report.test.ts. |
| AC6 | acceptance_criterion | pass | test | checkUnresolvedDesignConcerns emits DESIGN_CONCERN_UNRESOLVED blocking acceptance+release; cleared by typed disposition or later all-pass report; dispositions persist through projection/continue-as-new (harden fix). gate-readiness.test.ts, change-state.test.ts. |
| AC7 | acceptance_criterion | pass | test | This contract review matrix records design-quality evidence via design_proof/rubric_review/review policies; adv-review.md maps designer evidence into reviewMatrix. adv-review-assets.test.ts. |
| AC8 | acceptance_criterion | pass | test | Browser/design viewport context required for runnable surfaces with explicit fallback rationale in VISUAL_CONTEXT guidance. adv-designer-assets.test.ts. |
| AC9 | acceptance_criterion | pass | test | No accepted_debt terminal/disposition state anywhere; disposition enum is fixed|rejected_with_evidence|split|fast_follow; repo scan shows only prohibiting usages. adv-autonomy-quality-assets.test.ts, subagent-reports.test.ts. |
| AC10 | acceptance_criterion | pass | test | No Storybook dependency; no numeric aesthetic scoring; backend boundary intact; review/harden stay with adv-reviewer. Full suite 4007 tests green. |
| AC11 | acceptance_criterion | pass | test | Keyword-presence asset tests labeled NON-BEHAVIORAL and point at behavioral owners (gate-readiness/subagent-report/design-concern tests). adv-review-assets.test.ts, adv-designer-assets.test.ts, adv-autonomy-quality-assets.test.ts. |
| C1 | constraint | respected | static_check | Seven-gate lifecycle preserved; no new gate added; enforcement reuses gate-readiness blocker rail. |
| C2 | constraint | respected | static_check | Correctness owned by Zod schemas, prep validator, sandbox evaluator, state machine, review matrix, and behavioral tests. |
| C3 | constraint | respected | static_check | adv-designer apply-phase only; guidance limited to apply context. Reviewer READY. |
| C4 | constraint | respected | static_check | adv-reviewer owns review/harden in adv-review.md/adv-harden.md/adv-reviewer.md. |
| C5 | constraint | respected | static_check | VISUAL_CONTEXT requires sourced context or explicit unavailable reasons; precedence defined. adv-designer-assets.test.ts. |
| C6 | constraint | respected | static_check | prep-readiness uses structured metadata (frontend_required/frontend_scope/visual_surface) as hard authority; title/path heuristics warn only. prep-readiness.test.ts. |
| C7 | constraint | respected | static_check | Browser/design evidence required only for runnable surfaces; fallback rationale otherwise (VISUAL_CONTEXT guidance). |
| C8 | constraint | respected | static_check | Reused existing required-obligation agenda rail + gate-readiness blocker pattern + review matrix; no new gate or evidence vocabulary invented. |
| DONT1 | avoidance | respected | review | Backend boundary for adv-designer unchanged; reviewer found no weakening. |
| DONT2 | avoidance | respected | review | Neighboring recommendations require explicit typed disposition; no silent scope broadening. |
| DONT3 | avoidance | respected | review | Categorical design_dimensions with rationale + typed disposition; no numeric aesthetic scoring introduced. |
| DONT4 | avoidance | respected | review | No Storybook dependency added; dependency boundary unchanged. Full suite green. |
| DONT5 | avoidance | respected | review | Review/harden routed to adv-reviewer, not adv-designer. |
| DONT6 | avoidance | respected | review | Scope limited to ADV workflow/schema/validator/evaluator/tool/test surfaces; no design-system product. |
| DONT7 | avoidance | respected | review | No numeric aesthetic scoring; typed evidence + structural blocker + user acceptance remain authority. |
| DONT8 | avoidance | respected | review | Asset keyword-presence tests labeled non-behavioral; structural enforcement covered by behavioral tests. Prose demoted to guidance pointing at the rail. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1d7199a33d14 | SC1, SC2, SC3, SC4 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-3dde4f230f4a | AC3, SC3 | AC3 | C2, DONT3, DONT7 |  |
| tk-cb516607ef47 | AC1, SC1 | AC1 | C2, C6 |  |
| tk-d85d63996712 | AC2, AC6, SC1 | AC2, AC6 | C3, C5, C7, DONT1, DONT4, DONT5 |  |
| tk-56ece2015932 | AC4, AC5, AC7, AC8, SC2, SC3, SC4 | AC4, AC5, AC7, AC8, SC2, SC3, SC4 | C1, C2, C3, C4, DONT2, DONT3, DONT5, DONT6, DONT7 |  |
| tk-d2b724008ea5 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-4270818193d7 | SC1, SC2, SC3, SC4 | AC9 | C1, C8, DONT8 |  |
| tk-1f9ac6139392 | AC3 | AC3 | C2, C8, DONT7 |  |
| tk-07142de98290 | AC6 | AC6 | C1, C2, C8 |  |
| tk-dff558c45316 | AC5 | AC5 | C2, C8, DONT2 |  |
| tk-d620b8ab7b32 | AC4, AC6 | AC4, AC6 | C1, C8 |  |
| tk-d56147f6055a | AC6 | AC6 | C8, DONT8 |  |
| tk-617d073cfb95 | AC9, AC10, AC11 | AC9, AC10, AC11 | C3, C4, DONT5, DONT8 |  |
| tk-9c970f87c10c |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8 | C1, C2, C3, C4, C5, C6, C7, C8 |  |
