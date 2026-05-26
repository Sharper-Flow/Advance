# Add frontend review skill

## Why

The just-shipped `addAdvDesigner` change embedded an inline 6-dimension frontend design review checklist into the Reviewer Remediation Packet in `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md`. The agent file (`.opencode/agents/adv-designer.md`) and the packet text both call out `skill("adv-frontend-review")` as the future home for that checklist — but the skill was deferred to a fast-follow.

This change ships the skill and wires the packet anchor to reference it while keeping the inline checklist as a fallback (so older deployments and offline reviewers still get the guidance).

## Intent

Codify the 6-dimension frontend/design review checklist as a discoverable, loadable ADV skill so:

1. Reviewers can `skill("adv-frontend-review")` for the canonical methodology instead of relying on inline packet text.
2. The inline 6-dimension checklist in the Reviewer Remediation Packets remains as a fallback for backward compatibility.
3. Future deepening of frontend review methodology lives in one file rather than scattered across command prompts.

## What Changes

- New `skills/adv-frontend-review/SKILL.md` with proper frontmatter (name, description, keywords, metadata) and body covering the 6 quality dimensions + when-to-load rules + applicability boundary (never reassigns review/harden ownership).
- Update `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md` Reviewer Remediation Packet `FRONTEND DESIGN REVIEW SKILL` anchor to:
  - Primary: `skill("adv-frontend-review")` reference.
  - Fallback: keep the inline 6-dimension checklist verbatim so deployments without the skill (or offline reviewers) still get the guidance.
- Update `plugin/src/adv-reviewer-asset.test.ts` to assert BOTH the skill reference AND the inline 6-dimension checklist are present in both packets.

## Scope

### In Scope

- `skills/adv-frontend-review/SKILL.md` (new file).
- `.opencode/command/adv-review.md` Reviewer Remediation Packet anchor.
- `.opencode/command/adv-harden.md` Reviewer Remediation Packet anchor.
- `plugin/src/adv-reviewer-asset.test.ts` assertion update.

### Out of Scope

- Changing the 6 dimensions themselves (component correctness, semantic HTML/a11y, responsive behavior, visual polish, site-design consistency, finer details). The set is set by the addAdvDesigner agreement.
- Moving review/harden ownership to adv-designer (explicitly forbidden by addAdvDesigner agreement DONT2/OOS2).
- Adding a second skill for any other review dimension.
- Touching `.opencode/agents/adv-designer.md` — the agent's DESIGN QUALITY BAR section already references the same dimensions.

### Must Not

- Must not remove the inline checklist fallback — backward compatibility required for offline reviewers and older deployments.
- Must not reassign review/harden ownership away from `adv-reviewer`.
- Must not introduce new ADV tool grants or schema changes.
- Must not introduce skill auto-loading; reviewers explicitly load `skill("adv-frontend-review")` when packet anchor instructs.

## Success Criteria

1. `skills/adv-frontend-review/SKILL.md` exists with valid frontmatter (`name`, `description`, `keywords` array, optional `metadata`) and body covering all 6 dimensions + when-to-load + ownership boundary.
2. Both `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md` Reviewer Remediation Packets contain `skill("adv-frontend-review")` reference AND retain the inline 6-dimension checklist as fallback.
3. `plugin/src/adv-reviewer-asset.test.ts` asserts both the skill ref and the inline checklist; tests pass.
4. `pnpm exec vitest run src/adv-reviewer-asset.test.ts src/adv-designer-assets.test.ts src/adv-engineer-assets.test.ts` passes from `plugin/`.
5. `pnpm run check` passes from `plugin/`.
6. `scripts/deploy-local.sh --fix` skill count increases by 1 (the new skill is picked up by the standard sync loop).

## Spec-Law Impact

**No spec law update required.** Skills are not governed by capability specs in `.adv/specs/`. The reviewer packet hook is already structured for skill-or-inline (added by addAdvDesigner tk-ac45ea1f42d5); this change populates the skill side of that hook. Rationale persisted per `/adv-task` Phase 2 contract.

## Verification

- `bash scripts/deploy-local.sh --check` (skill picked up).
- `pnpm exec vitest run src/adv-reviewer-asset.test.ts src/adv-designer-assets.test.ts src/adv-engineer-assets.test.ts src/adv-instructions-assets.test.ts` from `plugin/`.
- `pnpm run check` from `plugin/`.
- Manual: `cat skills/adv-frontend-review/SKILL.md` valid markdown with proper frontmatter.
