# Acceptance

Reviewed at: 2026-07-21T23:21:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | A message-history session-health banner emits at most once per distinct compaction event, not on every subsequent turn. | pass | healthSection suppresses message-history banner once surfaced; AC1 tests assert no re-emit. Green 60/60 tr_mrv9tttd. |
| SC2 | success_criterion | `session.error` session-health banners remain sticky (emit every turn until the error state clears). | pass | session.error bypasses the surfaced gate; AC3 asserts sticky emit even when surfaced=true. |
| SC3 | success_criterion | Session-hygiene guidance ("start a fresh session per major change") is documented in an agent-visible location. | pass | ADV_INSTRUCTIONS.md Resume Freshness Advisory — added 'one session per major change' note. Commit 2df0ed82. |
| AC1 | acceptance_criterion | After a `message-history` health issue is recorded and the banner is surfaced once, a subsequent system-block assembly with the same (already-surfaced) issue does NOT re-emit the banner. | pass | system-block.test.ts AC1 pass (already-surfaced does not re-emit; suppressed but others emit). |
| AC2 | acceptance_criterion | A newly-recorded `message-history` issue (fresh compaction event) re-emits the banner exactly once. | pass | system-block.test.ts AC2 fresh message-history emits + flags surfacedMessageHistoryHealth. |
| AC3 | acceptance_criterion | A `session.error` health issue emits the banner on every assembly until `lastSessionHealthIssue` is cleared (sticky behavior unchanged). | pass | system-block.test.ts AC3 session.error sticky pass. |
| AC4 | acceptance_criterion | `SessionHealthIssue` gains an optional `surfaced` flag; the field is additive and existing callers/tests are unaffected when it is absent. | pass | AC4 absent-flag=unsurfaced passes; 97/97 existing tests unaffected. |
| AC5 | acceptance_criterion | `pnpm run check` is green and existing `system-block.test.ts` session-health tests pass (updated where the one-shot behavior changes expectations). | pass | pnpm run check green; 97/97 regression. |
| C1 | constraint | The warning MUST surface at least once prominently — the fix suppresses repeats, never the first emission. | respected | First emission always fires; AC2 asserts surface-once before suppression. |
| C2 | constraint | Reuse the existing assembler result-flag pattern (mirror `consumedWisdomPrompt`): the pure formatter reports emission; the `index.ts` hook owns the state mutation that marks the issue surfaced. | respected | Mirrors consumedWisdomPrompt: pure formatter reports; hook mutates. |
| C3 | constraint | `surfaced` is in-memory volatile state only — no new persistence layer. | respected | surfaced is in-memory; no new persistence. |
| DONT1 | avoidance | Do NOT make `session.error` banners one-shot — they are safety-critical and stay sticky. | respected | session.error stays sticky; AC3 confirms. |
| DONT2 | avoidance | Do NOT remove the banner entirely. | respected | Banner still emits once per event; not removed. |
| DONT3 | avoidance | Do NOT change the compaction thresholds (`MAX_PROMPT_DIFF_CHARS` / `MAX_PROMPT_TOOL_OUTPUT_CHARS`). | respected | Compaction thresholds untouched. |
| OOS1 | out_of_scope | The cross-session state-bleed fix (separate change `fixConcurrentSessionStateBleed`). | missing |  |
| OOS2 | out_of_scope | Changing what gets compacted or the excerpt size. | missing |  |

