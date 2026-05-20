# Problem Statement

## What's broken
The pre-archive sign-off Change Report (defined in `.opencode/agents/adv.md` § Sign-Off Boundary) has no Executive Summary section. The acceptance review (`/adv-review` Phase 4) produces an executive summary as ephemeral chat output. At archive sign-off — minutes or sessions later — the orchestrator has to re-compose the same summary from scratch, risking drift between what was accepted and what gets shipped.

## Why it matters
- The executive summary is the highest-density, most user-valuable artifact of a change. It should be durable.
- "Restate" semantics require persistence; "re-compose" introduces unverified drift.
- ARCHIVE_SUMMARY.md (programmatic) covers tasks + specs but lacks the verdict-grounded narrative outcome.
- Multi-session archives (worktree → trunk merge later, or `dry run` review iteration) compound the drift risk.

## Root cause
The current 4 narrative artifacts (proposal, problem-statement, agreement, design) cover gates 1–3 (proposal, discovery, design). No persisted artifact captures the post-acceptance outcome narrative — the gap between gate 6 (acceptance) and gate 7 (release).

## In-scope
- Add `executive-summary.md` as the 5th narrative artifact
- Extend `adv_change_update`, `adv_change_create`, `adv_change_show` (include flag), and storage layer to handle it
- Update `/adv-review` Phase 7 to compose + persist before completing acceptance gate
- Update Sign-Off Boundary template in `.opencode/agents/adv.md` to read + restate

## Out-of-scope
- Changing the existing programmatic `ARCHIVE_SUMMARY.md` shape
- Modifying the `REVIEW_FINDINGS` block
- Adding executive summary to mid-flight gates (proposal/discovery/etc.)
- Auto-generating without agent narrative input
