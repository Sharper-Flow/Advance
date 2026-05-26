# Design

## Spec-Law Impact

**No spec law update required.** Skills aren't governed by `.adv/specs/`. The reviewer packet hook was added by addAdvDesigner tk-ac45ea1f42d5; this change populates the skill side.

## LBP Validation

Skill format verified against `skills/adv-clarify/SKILL.md` template: YAML frontmatter with `name`, `description`, `keywords` (array), optional `metadata`. Body is markdown with Purpose + methodology sections. **Confirmed** — no library research needed.

## Architecture

1. **New skill file** `skills/adv-frontend-review/SKILL.md` modeled on `adv-clarify` shape, body codifies the 6 dimensions + when-to-load + ownership boundary + anti-patterns.
2. **Packet anchor rewrite** in both `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md`: prepend `Primary: skill("adv-frontend-review")` line, keep the inline 6-dimension checklist verbatim labeled as `Fallback (inline checklist for offline/older deployments):`.
3. **Test update** in `plugin/src/adv-reviewer-asset.test.ts`: extend the existing assertion to require BOTH `skill("adv-frontend-review")` text AND each of the 6 inline dimension names in both review and harden packets.

## Files Affected

- `skills/adv-frontend-review/SKILL.md` (new, ~90 lines)
- `.opencode/command/adv-review.md` (~6 line tweak to Reviewer Remediation Packet anchor)
- `.opencode/command/adv-harden.md` (~6 line tweak to Reviewer Remediation Packet anchor)
- `plugin/src/adv-reviewer-asset.test.ts` (add 1-2 assertions to existing test)

## Implementation Strategy

1. Write the skill file.
2. Update both packet anchors with `Primary:` + `Fallback:` labels.
3. Extend the existing test assertion.
4. Run focused suites + `pnpm run check`.
5. Verify deploy-local picks up the skill (`bash scripts/deploy-local.sh --check`).

## Risks

| Risk | Mitigation |
| --- | --- |
| Test regex too tight, breaks on future skill renames | Use `skill("adv-frontend-review")` literal match; rename would be tracked as a separate change |
| Inline fallback drifts from skill content | Both are pinned by the same assertion (6 dimension names enumerated); future dimension changes require updating skill + both packets together |
| Skill loaded auto by some agent | Per `customize-opencode` skill docs, skills only auto-surface to the model when their description matches user intent; explicit `skill("adv-frontend-review")` invocation in the reviewer packet keeps it scoped |
