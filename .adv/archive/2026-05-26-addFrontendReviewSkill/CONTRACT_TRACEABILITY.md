# Contract Traceability

**Change ID:** addFrontendReviewSkill
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-26T16:51:59.667Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | skills/adv-frontend-review/SKILL.md exists (86 lines); frontmatter has name/description/keywords/metadata; body covers Purpose, When to Load, 6 Dimensions, Per-Dimension Verdict, Ownership Boundary, Anti-Patterns, Coordination Notes |
| SC2 | success_criterion | pass | review | Both packets contain 'Primary: load skill("adv-frontend-review")' + 'Fallback (inline checklist for offline reviewers or older deployments without the skill):' + 6 inline dimension lines; pinned by adv-reviewer-asset.test.ts |
| SC3 | success_criterion | pass | review | vitest run adv-reviewer-asset + adv-designer-assets + adv-engineer-assets + adv-instructions-assets → 165 tests passed |
| SC4 | success_criterion | pass | review | pnpm run check passes (typecheck + isolation + lockfile + lint + format:check) after prettier --write campsite fix |
| AC1 | acceptance_criterion | pass | test | Frontmatter: name: adv-frontend-review, description sentence, keywords array with 11 entries (adv, frontend, design, review, accessibility, responsive, component, ui, polish, semantic-html, a11y), metadata with priority: medium + source: adv-designer-followup |
| AC2 | acceptance_criterion | pass | test | Body has ## Purpose, ## When to Load, ## The 6 Dimensions (table + Per-Dimension Verdict subsection), ## Ownership Boundary, ## Anti-Patterns, ## Coordination Notes |
| AC3 | acceptance_criterion | pass | test | adv-review.md Reviewer Remediation Packet contains skill("adv-frontend-review") + all 6 dimension names (semantic html, accessibility, responsive, visual polish, site, component correctness); pinned by adv-reviewer-asset.test.ts |
| AC4 | acceptance_criterion | pass | test | adv-harden.md Reviewer Remediation Packet contains the same skill ref + 6 dimension names; pinned by same test |
| AC5 | acceptance_criterion | pass | test | Test 'review and harden reviewer remediation packets reference skill("adv-frontend-review") AND retain inline 6-dimension checklist as fallback' asserts skill ref + 6 dimensions in both packets; passes |
| AC6 | acceptance_criterion | pass | test | adv-designer-assets.test.ts + adv-engineer-assets.test.ts both pass (165 tests across asset suites); no collateral regression |
| C1 | constraint | respected | static_check | Only markdown (skill, commands) + minor TS test edit; no new dependencies |
| C2 | constraint | respected | static_check | 4 files modified: skills/adv-frontend-review/SKILL.md (new), .opencode/command/adv-review.md, .opencode/command/adv-harden.md, plugin/src/adv-reviewer-asset.test.ts |
| C3 | constraint | respected | static_check | Inline 6-dimension fallback retained verbatim in both packets; pinned by test asserting all 6 dimension names present |
| C4 | constraint | respected | static_check | Skill's When to Load section explicitly states 'Load explicitly via skill("adv-frontend-review") only when the Reviewer Remediation Packet anchor instructs you to'; no auto-load mechanism added |
| C5 | constraint | respected | static_check | Ownership preserved: skill explicitly states adv-reviewer owns review/harden; adv-designer apply-only; safety-rail line in both packets unchanged |
| DONT1 | avoidance | respected | review | 6 dimensions unchanged from addAdvDesigner agreement: component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details |
| DONT2 | avoidance | respected | review | Skill Ownership Boundary section + packet safety-rail line both preserve adv-reviewer as review/harden owner |
| DONT3 | avoidance | respected | review | Skill When to Load section requires explicit invocation; no background auto-load mechanism |
| DONT4 | avoidance | respected | review | No ADV tool grants modified; no schema changes; only markdown + test edit |
| DONT5 | avoidance | respected | review | Inline fallback checklist preserved verbatim in both packets; test pins all 6 dimension names |
| OOS1 | out_of_scope | respected | not_applicable | 6 dimensions unchanged |
| OOS2 | out_of_scope | respected | not_applicable | adv-reviewer remains review/harden owner |
| OOS3 | out_of_scope | respected | not_applicable | No additional frontend skills shipped; future fast-follow scope only |
| OOS4 | out_of_scope | respected | not_applicable | .opencode/agents/adv-designer.md NOT modified; DESIGN QUALITY BAR section already references same dimensions |
| OOS5 | out_of_scope | respected | not_applicable | No spec/agent/runtime changes — only skill + command markdown + test |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-47a3fbe0be81 | SC1, AC1, AC2 | SC1, AC1, AC2 | C1, C2, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-631a2d7b6c69 | SC2, AC3, AC4 | SC2, AC3, AC4 | C2, C3, C5, DONT2, DONT5 |  |
| tk-27bd0f264b83 | AC5 | SC2, SC3, AC3, AC4, AC5 | C2, C5 |  |
| tk-ddc3ced794c2 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
