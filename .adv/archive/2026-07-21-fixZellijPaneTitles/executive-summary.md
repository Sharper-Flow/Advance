# Executive Summary

## Outcome

Fix delivered for ADV plugin's pane-title cue in zellij: fresh OpenCode sessions and cross-project workflows now display the active change ID in the pane frame, where they previously stayed at zellij's default `Pane #1`. The approver is confirming whether this delivered work matches the agreed acceptance criteria.

## Why It Matters

The pane title is the at-a-glance visual signal for which ADV change an agent is actively working on. With 8+ concurrent OpenCode sessions in a single zellij `main` session, missing this cue creates real coordination friction. The fix removes that friction without re-introducing the ADR 0008 fork-storm pattern (no subprocess forks; purely in-process state).

## Verdict

APPROVED

## What Was Built

1. **Spec law revised** (`rq-activeChangePointer01.7`) — cross-project active-work tool calls now repoint the caller's pane-title pointer to the target change ID, while read/diagnostic calls still skip; terminal-clear (close/archive/forget) fires regardless of project.
2. **Cross-project repoint path** in `handleToolExecuteBefore` — replaces the previous target_path skip with target-project disk-only reachability check; resolves target's `epic_membership.epic_id` so the title shows `epicId | changeId` (not just `changeId`) for Epic members.
3. **Cwd-detect at plugin init** — inspects `process.cwd()` against the canonical ADV worktree path pattern; reachability-gated seed of `state.activeChange.id` so fresh sessions starting in a `change/<id>/` worktree immediately show the change ID.
4. **Test coverage** — 25/25 tests pass in `plugin/src/__tests__/active-change-pointer.test.ts` covering AC1-AC9 + 4 edge cases (trailing slash, nested path, empty changeId segment, unreachable change).

## What Was Verified

- **Verdict:** APPROVED with 1 suggestion (non-blocking; theoretical cross-project changeId collision documented as known limitation).
- **Tests:** 25/25 targeted tests pass; full `pnpm test` 6588/6601 (12 pre-existing trunk failures on commit `3cee25f5`, none touch modified files). `pnpm run typecheck` PASS, `pnpm run lint` PASS, `pnpm run build` PASS.
- **Preview URL:** not_applicable — visual surface is zellij pane frame title, not browser-rendered. Live verification requires deployed plugin + zellij session; unit tests provide behavioral evidence. Browser preview tools (Playwright, Vite) cannot reach this surface.
- **Contract matrix:** 31/31 required rows pass/respected, 0 failing.

## Remaining Concerns

- 12 pre-existing trunk test failures unrelated to this change (spec-citation-invariant, ops-follow-up-assets, adv-triage-*, deploy-local, tool-name-assets, adv-autonomy-quality-assets, change.test closeLinkedIssue). These are environmental debt on trunk `3cee25f5`, not regressions from this change.
- Live verification of the new behavior (fresh-session cwd-detect + cross-project repoint) deferred to post-deploy manual check — open a fresh OpenCode session in a `change/<id>/` worktree, run an allow-list tool, observe the pane title.

## Supporting Evidence

- Tasks 1-3 (`tk-d6aec1b24ef6`, `tk-7f15a4265ba3`, `tk-9c9a7eac113a`) done; Task 4 (`tk-18429121efd0`) cancelled with user-approved rationale (AC10 implicit).
- Two commits on `change/fixZellijPaneTitles` branch: `0c777760` (spec delta) + `578d8aff` (cross-project repoint + cwd-detect).
- Independent design validator (adv-researcher) verdict: CAUTION resolved in design via KD3b + DDC5.
- Worktree: `~/.local/share/opencode/worktree/{projectId}/change/fixZellijPaneTitles/`.

## Consequence Context

1. **Delivered value:** Pane title cue restored for fresh sessions + cross-project workflows; in-process state only; no ADR 0008 regression.
2. **Enabling-only/follow-up dependency:** n/a — no follow-up obligations; cross-project `fixPoisonedRecovery` (in-flight execution) touches different layer (recovery inside tools vs repoint before tools).
3. **Ops readiness:** n/a — purely in-process state; no deploy/migration/ops work needed. Harden owns release/deploy readiness confirmation.
4. **Migration/data impact:** n/a — no persistence layer changes; pointers remain in-process.
5. **Frontend/preview impact:** not_applicable — visual surface is zellij pane title, not browser-rendered; agreement documented this.
6. **Collision/release risk:** Low — branch `change/fixZellijPaneTitles` is isolated; merge will trigger CI; 12 pre-existing trunk failures are independent.
7. **Open follow-ups:** None.
8. **Next action:** Acceptance approval proceeds inline to `/adv-harden fixZellijPaneTitles` for release/deploy/production readiness checks.