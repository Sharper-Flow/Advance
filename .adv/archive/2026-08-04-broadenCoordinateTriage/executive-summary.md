
# Executive Summary

## Outcome

Work you already have in progress will now actually show up when you ask ADV "what should I work on next?" Previously, a change only surfaced if it belonged to an initiative group (an Epic) or was linked to a GitHub issue. Everything else was counted but never analysed or ranked. You are approving a fix to that blind spot across the two commands that answer that question.

## Why It Matters

In this repository the blind spot covered most open work: 46 of 50 in-flight changes had no Epic link, and 24 of 50 were bugfix-shaped with no linked GitHub issue. Those changes were listed in reports but never examined for drift, and they sorted below feature work whose only advantage was a low-priority label. A project with no Epics at all received an inventory and no analysis whatsoever. After this change, all of that work is visible and rankable.

## Verdict

APPROVED

## What Was Built

1. Wrote three new durable rules (spec law) stating that change analysis must not depend on Epic membership, that unlinked work must stay reachable as "next work", and that bugfix work tracked only inside ADV must appear in the triage report.
2. Fixed the ranking engine so a change without an Epic is no longer pushed to the very bottom of the list forever. It is now ranked on its own strongest signal — whether work is already underway (`computeChangeRank` in the resume projection).
3. Made the triage report show changes that have no linked GitHub issue, and added an advisory "looks like a bugfix" hint that can nudge such work up the list but can never hide, filter, or close anything (`portfolio-report.ts`).
4. Updated the `/adv-coordinate` command so its drift analysis runs even when a project has no Epics, and covers unlinked changes on equal terms.
5. Updated the `/adv-triage` command and its methodology skill to document the new behaviour and to add two explicit prohibitions protecting the boundary.
6. Added automated checks pinning all of the above so the behaviour cannot silently regress.
7. Ran the full project verification suite.

## What Was Verified

- Verdict: APPROVED with 2 findings raised by an independent reviewer (1 fixed, 1 rejected with evidence), plus 3 follow-ups recorded. 0 unresolved blockers, 0 unresolved issues.
- Tests: `pnpm run check` exit 0 (`tr_mse0ggld_fe469469`); smoke 98 tests (`tr_msdzz64i_aae7e635`); targeted 55 tests across all four affected test files (`tr_mse0e2x9_2bac24e2`); asset/contract suites 111 tests (`tr_msdzpxc1_e3f0b6fc`).
- Preview URL: not_applicable — no front-end, browser-visible, or visual output. Deliverables are markdown command contracts, tracked JSON spec law, and pure TypeScript functions with no rendered surface.
- Contract matrix: 30 of 30 required rows pass or respected. 0 fail, 0 violated, 0 unknown.

## Remaining Concerns

Non-blocking, all recorded as follow-ups:

1. The advisory bugfix hint is derived by the agent following the `/adv-triage` contract rather than by a wired TypeScript call path. This matches how the rest of that module already works — the report renderer itself has no production caller either — but it is worth revisiting if that module is ever wired into a tool handler.
2. Two test files now cover the same module (`plugin/src/tools/triage-portfolio-report.test.ts` pre-existing, and the co-located `plugin/src/tools/triage/portfolio-report.test.ts` added here). Both pass. Consolidating them was deliberately deferred rather than churning test layout during acceptance.
3. A latent fragility predating this change: Epic ranking assumes an entry's order stays below 10,000. This change documents the invariant and no longer sits on its boundary, but does not remove the underlying assumption.

A separate in-flight change, `fixWorkerDependentResume`, may later touch the same ranking file. It has no committed code, so this is a pre-merge conflict recheck, not a blocker.

## Supporting Evidence

Tasks `tk-bd814ddcfadf`, `tk-9bc722e52bbf`, `tk-e076ee38f020`, `tk-fb20e8b0040a`, `tk-2e7216031d47`, `tk-32966ede9ce3`, `tk-a78dc5952ad7` (all done, 0 cancelled). Commits `28209bc0`, `232a5b72`, `450ca634`, `c47b4f5f`, `d96b8e51`, `f4dec50f`. Independent reviewer report (scope `reviewer:acceptance-review`). Design-corrections section in `design.md` cataloguing four claims that direct inspection disproved during this change.

## Consequence Context

| # | Category | Status | Evidence |
|---|---|---|---|
| 1 | Delivered value | delivered | Unlinked and bugfix-shaped changes are now analysed and ranked; contract matrix 30/30 pass. |
| 2 | Enabling-only / follow-up dependency | none | No downstream change is required for this to take effect; both commands read the updated contracts and code directly. |
| 3 | Ops readiness | pending | Harden owns release/deploy/production/docs/cleanup readiness. No ops task or runbook exists on this change. |
| 4 | Migration / data impact | n/a | No schema, storage, or persisted-state change. Spec JSON is git-tracked law; ranking weights are computed in memory and never persisted. |
| 5 | Frontend / preview impact | n/a | `visual_surface: false`. No front-end, browser-visible, or visual output; Preview URL `not_applicable` with rationale recorded. |
| 6 | Collision / release risk | warning | `fixWorkerDependentResume` (design gate, 0 tasks, stale) may later touch `plugin/src/projection/resume-projection.ts`. No committed code today; recheck before merge. |
| 7 | Open follow-ups | 3 open | Hint wiring if the triage module is ever wired to a handler; duplicate test-file consolidation; documented Epic band-order invariant. All non-blocking. |
| 8 | Next action | ready | Acceptance approval proceeds inline to `/adv-harden broadenCoordinateTriage`. |
