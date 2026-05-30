# Executive Summary — addFrontendReviewSkill

## Outcome

Shipped `skills/adv-frontend-review/SKILL.md` as the canonical 6-dimension frontend/design review methodology. Wired both `/adv-review` and `/adv-harden` Reviewer Remediation Packets to reference `skill("adv-frontend-review")` as Primary while keeping the inline checklist as Fallback for backward compatibility. Closes the R2 deferral from `addAdvDesigner`.

## What Was Built

- New `skills/adv-frontend-review/SKILL.md` (86 lines): frontmatter (`name: adv-frontend-review`, description, 11 keywords, metadata `priority: medium` + `source: adv-designer-followup`); body covers Purpose, When to Load (explicit invocation only), the 6 Dimensions (table with what-to-check guidance each), Per-Dimension Verdict (`pass|concern|n/a` format), Ownership Boundary (adv-reviewer owns review/harden; adv-designer apply-phase only), Anti-Patterns (auto-loading, scope-creep, overriding designer decisions, treating 6 dimensions as exhaustive, treating inline fallback as canonical), and Coordination Notes (lists all 6 files that must be updated together if dimensions change — proactive drift prevention).
- Updated `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md` Reviewer Remediation Packets: replaced "inline checklist (iteration 1; replace with `skill("adv-frontend-review")` when the skill ships)" wording with `Primary: load skill("adv-frontend-review") for the canonical 6-dimension methodology` + `Fallback (inline checklist for offline reviewers or older deployments without the skill):` followed by the 6 dimension lines verbatim. Safety-rail line "Review/harden ownership remains with adv-reviewer; adv-designer is apply-phase only and MUST NOT be spawned here." unchanged.
- Extended `plugin/src/adv-reviewer-asset.test.ts` assertion: now requires both `skill("adv-frontend-review")` literal AND each of the 6 inline dimension names in both review and harden packets. Test renamed to reflect dual contract.
- Campsite: prettier --write on the test file cleared a formatting hit from the assertion change.

## What Was Verified

- Focused suites (4 files, asset tests for reviewer + designer + engineer + instructions): **165 tests pass**.
- `pnpm run check` (typecheck + isolation + lockfile + lint + format:check): **clean** after prettier --write.
- Skill picked up by deploy-local sync: `--dry-run --fix` shows `dry-run copy skill: adv-frontend-review/SKILL.md` and `22 skill(s) synced` (was 21).
- Inline 12-dimension self-review verdict: **READY**. No blockers, no issues.
- Contract review matrix: 25 rows, 0 failing.

## Remaining Concerns

- None. Single 4-file scope. Working tree clean at HEAD 3f8e2ca on `change/addFrontendReviewSkill`.
- Future deepening of frontend review methodology (e.g., adding a11y-deep-dive, responsive-grid-rubric sub-skills) is out-of-scope for this change but can land as fast-follows referencing this skill.

## Investment

4 tasks, 4 checkpoint commits, 0 retries, ~7 minutes execution wall-clock, 4 files touched (1 new skill, 2 command updates, 1 test update + format reformat).
