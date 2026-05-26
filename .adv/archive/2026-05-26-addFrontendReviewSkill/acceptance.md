# Acceptance

Reviewed at: 2026-05-26T16:51:59.667Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | New `skills/adv-frontend-review/SKILL.md` with valid frontmatter and body covering all 6 dimensions + when-to-load + ownership boundary (review/harden stays with adv-reviewer). | pass | skills/adv-frontend-review/SKILL.md exists (86 lines); frontmatter has name/description/keywords/metadata; body covers Purpose, When to Load, 6 Dimensions, Per-Dimension Verdict, Ownership Boundary, Anti-Patterns, Coordination Notes |
| SC2 | success_criterion | Both review and harden Reviewer Remediation Packets reference `skill("adv-frontend-review")` AND retain the inline 6-dimension checklist as fallback. | pass | Both packets contain 'Primary: load skill("adv-frontend-review")' + 'Fallback (inline checklist for offline reviewers or older deployments without the skill):' + 6 inline dimension lines; pinned by adv-reviewer-asset.test.ts |
| SC3 | success_criterion | `pnpm exec vitest run src/adv-reviewer-asset.test.ts src/adv-designer-assets.test.ts src/adv-engineer-assets.test.ts` passes from `plugin/`. | pass | vitest run adv-reviewer-asset + adv-designer-assets + adv-engineer-assets + adv-instructions-assets → 165 tests passed |
| SC4 | success_criterion | `pnpm run check` passes from `plugin/`. | pass | pnpm run check passes (typecheck + isolation + lockfile + lint + format:check) after prettier --write campsite fix |
| AC1 | acceptance_criterion | Skill frontmatter has `name: adv-frontend-review`, a description sentence, a `keywords` array (≥5 entries: frontend, design, review, accessibility, responsive at minimum), and optional `metadata` block. | pass | Frontmatter: name: adv-frontend-review, description sentence, keywords array with 11 entries (adv, frontend, design, review, accessibility, responsive, component, ui, polish, semantic-html, a11y), metadata with priority: medium + source: adv-designer-followup |
| AC2 | acceptance_criterion | Skill body has Purpose, When to Load, 6 Dimensions, Ownership Boundary, and Anti-Patterns sections. | pass | Body has ## Purpose, ## When to Load, ## The 6 Dimensions (table + Per-Dimension Verdict subsection), ## Ownership Boundary, ## Anti-Patterns, ## Coordination Notes |
| AC3 | acceptance_criterion | Reviewer Remediation Packet in `.opencode/command/adv-review.md` contains both `skill("adv-frontend-review")` text and the 6 inline dimension names. | pass | adv-review.md Reviewer Remediation Packet contains skill("adv-frontend-review") + all 6 dimension names (semantic html, accessibility, responsive, visual polish, site, component correctness); pinned by adv-reviewer-asset.test.ts |
| AC4 | acceptance_criterion | Reviewer Remediation Packet in `.opencode/command/adv-harden.md` contains both `skill("adv-frontend-review")` text and the 6 inline dimension names. | pass | adv-harden.md Reviewer Remediation Packet contains the same skill ref + 6 dimension names; pinned by same test |
| AC5 | acceptance_criterion | `plugin/src/adv-reviewer-asset.test.ts` assertion verifies both the skill reference AND each of the 6 inline dimension names in both packets. | pass | Test 'review and harden reviewer remediation packets reference skill("adv-frontend-review") AND retain inline 6-dimension checklist as fallback' asserts skill ref + 6 dimensions in both packets; passes |
| AC6 | acceptance_criterion | Existing adv-designer-assets and adv-engineer-assets tests still pass (no collateral regression). | pass | adv-designer-assets.test.ts + adv-engineer-assets.test.ts both pass (165 tests across asset suites); no collateral regression |
| C1 | constraint | Pure markdown (skill + command files) + minor TypeScript test edit. No new dependencies. | respected | Only markdown (skill, commands) + minor TS test edit; no new dependencies |
| C2 | constraint | 4-file scope: 1 new skill file + 2 command files + 1 test file. | respected | 4 files modified: skills/adv-frontend-review/SKILL.md (new), .opencode/command/adv-review.md, .opencode/command/adv-harden.md, plugin/src/adv-reviewer-asset.test.ts |
| C3 | constraint | Inline 6-dimension fallback MUST remain intact (backward compatibility). | respected | Inline 6-dimension fallback retained verbatim in both packets; pinned by test asserting all 6 dimension names present |
| C4 | constraint | Skill must NOT auto-load; reviewer explicitly loads when packet anchor instructs. | respected | Skill's When to Load section explicitly states 'Load explicitly via skill("adv-frontend-review") only when the Reviewer Remediation Packet anchor instructs you to'; no auto-load mechanism added |
| C5 | constraint | No change to ownership: `adv-reviewer` still owns review/harden; `adv-designer` remains apply-only. | respected | Ownership preserved: skill explicitly states adv-reviewer owns review/harden; adv-designer apply-only; safety-rail line in both packets unchanged |
| DONT1 | avoidance | Do not change the 6 dimensions themselves. | respected | 6 dimensions unchanged from addAdvDesigner agreement: component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details |
| DONT2 | avoidance | Do not move review/harden ownership. | respected | Skill Ownership Boundary section + packet safety-rail line both preserve adv-reviewer as review/harden owner |
| DONT3 | avoidance | Do not introduce skill auto-loading or background fetching. | respected | Skill When to Load section requires explicit invocation; no background auto-load mechanism |
| DONT4 | avoidance | Do not add new ADV tool grants or schema changes. | respected | No ADV tool grants modified; no schema changes; only markdown + test edit |
| DONT5 | avoidance | Do not remove the inline fallback checklist. | respected | Inline fallback checklist preserved verbatim in both packets; test pins all 6 dimension names |
| OOS1 | out_of_scope | Changing the 6 dimensions (set by addAdvDesigner agreement). | respected | 6 dimensions unchanged |
| OOS2 | out_of_scope | Reassigning review/harden ownership. | respected | adv-reviewer remains review/harden owner |
| OOS3 | out_of_scope | Adding other frontend skills (a11y-deep-dive, responsive-grid-rubric, etc.) — future scope. | respected | No additional frontend skills shipped; future fast-follow scope only |
| OOS4 | out_of_scope | Touching `.opencode/agents/adv-designer.md` (DESIGN QUALITY BAR section already references the same dimensions). | respected | .opencode/agents/adv-designer.md NOT modified; DESIGN QUALITY BAR section already references same dimensions |
| OOS5 | out_of_scope | Spec/agent/runtime change. | respected | No spec/agent/runtime changes — only skill + command markdown + test |

