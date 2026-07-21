# Executive Summary

## Outcome

The `[ADV:SESSION_HEALTH]` warning that history was truncated now appears **once per compaction event** instead of repeating on every turn. Critical `session.error` warnings still persist. The approver is deciding whether to ship this banner-noise fix.

## Why It Matters

In a long session that chained three archives, the banner fired 33 diffs' worth of compaction once, then repeated on every subsequent turn — crowding the system context and desensitizing the reader to a genuine safety warning. The fix keeps the warning prominent (first emission) while removing the every-turn repeat, and documents the behavioral root cause (one session per major change).

## Verdict

APPROVED

## What Was Built

1. **One-shot message-history banner** — `SessionHealthIssue` gains an optional `surfaced` flag; `healthSection` suppresses the `message-history` banner once surfaced. `session.error` banners ignore the flag and stay sticky (they drive BLOCKED status).
2. **Assembler reports, hook mutates** — `applyAdvSystemBlock` returns `surfacedMessageHistoryHealth`; the `index.ts` system-transform hook sets `surfaced = true` after emission (mirrors the existing `consumedWisdomPrompt` pattern; keeps the formatter pure).
3. **Session-hygiene doc** — ADV_INSTRUCTIONS.md Resume Freshness Advisory now advises one OpenCode session per major change.

## What Was Verified

- Verdict: APPROVED, 0 findings. TDD red (5 failures, tr_mrv9ssf5) → green (60/60, tr_mrv9tttd).
- Tests: 97/97 pass across `system-block.test.ts`, `system-block-ac.verification.test.ts`, `integration.test.ts`. `pnpm run check` green.
- Preview URL: not_applicable — internal system-block behavior, no UI.
- Contract matrix: 16 rows (3 SC + 5 AC + 3 C + 3 DONT + 2 OOS), 0 failing.

## Remaining Concerns

None. Behavioral UX refinement; `session.error` stickiness and the diagnostic record (`lastSessionHealthIssue` for BLOCKED status) are preserved.

## Supporting Evidence

- Task tk-d04b1760fe25 (done, checkpoint 2df0ed82).
- Commit 2df0ed82 — 4 files (system-block.ts, index.ts, ADV_INSTRUCTIONS.md, system-block.test.ts).
- Contract review matrix: 16 rows, 0 failing.

## Consequence Context

1. Delivered value: removes every-turn banner noise while preserving the one-shot warning and session.error stickiness.
2. Enabling-only/follow-up dependency: none.
3. Ops readiness: ready — standard plugin rebuild; no migrations/config.
4. Migration/data impact: n/a — additive optional in-memory field.
5. Frontend/preview impact: not_applicable.
6. Collision/release risk: low — touches system-block.ts + index.ts (different region from the hot replaceRecoveryToolSprawl peer). No public API change.
7. Open follow-ups: none. Sibling `fixConcurrentSessionStateBleed` (state bleed) staged separately.
8. Next action: acceptance approval proceeds inline to push + merge + archive.