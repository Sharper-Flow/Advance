# Agreement

## Objectives

1. Ship `skills/adv-frontend-review/SKILL.md` as the canonical home for the 6-dimension frontend/design review methodology.
2. Wire the existing `FRONTEND DESIGN REVIEW SKILL` packet anchor in `/adv-review` + `/adv-harden` Reviewer Remediation Packets to reference the new skill while preserving the inline checklist as a backward-compat fallback.
3. Pin the wiring with a test assertion on both anchors (skill reference + inline checklist).

## Success Criteria

1. New `skills/adv-frontend-review/SKILL.md` with valid frontmatter and body covering all 6 dimensions + when-to-load + ownership boundary (review/harden stays with adv-reviewer).
2. Both review and harden Reviewer Remediation Packets reference `skill("adv-frontend-review")` AND retain the inline 6-dimension checklist as fallback.
3. `pnpm exec vitest run src/adv-reviewer-asset.test.ts src/adv-designer-assets.test.ts src/adv-engineer-assets.test.ts` passes from `plugin/`.
4. `pnpm run check` passes from `plugin/`.

## Acceptance Criteria

1. Skill frontmatter has `name: adv-frontend-review`, a description sentence, a `keywords` array (≥5 entries: frontend, design, review, accessibility, responsive at minimum), and optional `metadata` block.
2. Skill body has Purpose, When to Load, 6 Dimensions, Ownership Boundary, and Anti-Patterns sections.
3. Reviewer Remediation Packet in `.opencode/command/adv-review.md` contains both `skill("adv-frontend-review")` text and the 6 inline dimension names.
4. Reviewer Remediation Packet in `.opencode/command/adv-harden.md` contains both `skill("adv-frontend-review")` text and the 6 inline dimension names.
5. `plugin/src/adv-reviewer-asset.test.ts` assertion verifies both the skill reference AND each of the 6 inline dimension names in both packets.
6. Existing adv-designer-assets and adv-engineer-assets tests still pass (no collateral regression).

## Constraints

1. Pure markdown (skill + command files) + minor TypeScript test edit. No new dependencies.
2. 4-file scope: 1 new skill file + 2 command files + 1 test file.
3. Inline 6-dimension fallback MUST remain intact (backward compatibility).
4. Skill must NOT auto-load; reviewer explicitly loads when packet anchor instructs.
5. No change to ownership: `adv-reviewer` still owns review/harden; `adv-designer` remains apply-only.

## Avoidances

1. Do not change the 6 dimensions themselves.
2. Do not move review/harden ownership.
3. Do not introduce skill auto-loading or background fetching.
4. Do not add new ADV tool grants or schema changes.
5. Do not remove the inline fallback checklist.

## Out of Scope

1. Changing the 6 dimensions (set by addAdvDesigner agreement).
2. Reassigning review/harden ownership.
3. Adding other frontend skills (a11y-deep-dive, responsive-grid-rubric, etc.) — future scope.
4. Touching `.opencode/agents/adv-designer.md` (DESIGN QUALITY BAR section already references the same dimensions).
5. Spec/agent/runtime change.

## Spec-Law Impact

**No spec law update required.** Skills are not governed by capability specs.

## Sign-Off

Quick Contract confirmed by user via question tool reply "Confirmed — execute". Fast-track exemption per `/adv-task` Phase 0.
