# Contract Traceability

**Change ID:** fixSessionHealthBannerNoise
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T23:21:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | healthSection suppresses message-history banner once surfaced; AC1 tests assert no re-emit. Green 60/60 tr_mrv9tttd. |
| SC2 | success_criterion | pass | review | session.error bypasses the surfaced gate; AC3 asserts sticky emit even when surfaced=true. |
| SC3 | success_criterion | pass | review | ADV_INSTRUCTIONS.md Resume Freshness Advisory — added 'one session per major change' note. Commit 2df0ed82. |
| AC1 | acceptance_criterion | pass | test | system-block.test.ts AC1 pass (already-surfaced does not re-emit; suppressed but others emit). |
| AC2 | acceptance_criterion | pass | test | system-block.test.ts AC2 fresh message-history emits + flags surfacedMessageHistoryHealth. |
| AC3 | acceptance_criterion | pass | test | system-block.test.ts AC3 session.error sticky pass. |
| AC4 | acceptance_criterion | pass | test | AC4 absent-flag=unsurfaced passes; 97/97 existing tests unaffected. |
| AC5 | acceptance_criterion | pass | test | pnpm run check green; 97/97 regression. |
| C1 | constraint | respected | static_check | First emission always fires; AC2 asserts surface-once before suppression. |
| C2 | constraint | respected | static_check | Mirrors consumedWisdomPrompt: pure formatter reports; hook mutates. |
| C3 | constraint | respected | static_check | surfaced is in-memory; no new persistence. |
| DONT1 | avoidance | respected | review | session.error stays sticky; AC3 confirms. |
| DONT2 | avoidance | respected | review | Banner still emits once per event; not removed. |
| DONT3 | avoidance | respected | review | Compaction thresholds untouched. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d04b1760fe25 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
