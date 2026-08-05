# Executive Summary

## Outcome

A safety mechanism in ADV could destroy the work it was meant to protect. When a
task accumulated four blocked reviews, ADV wrote a record it then refused to read —
making the whole change unreadable *and* unwritable, with no way to repair it from
inside the tool. This change fixes that, and repairs affected changes automatically.

## Why It Matters

The fault was systemic, not a one-off: any task in any ADV project that reached four
blocked sub-agent reviews would brick its change the same way. It happened for real on
2026-08-04 to `resolveAdvPersistenceRecovery`, which had four completed gates and a
substantial design document, and took operator-level Temporal surgery to rescue.

The fix removes the need for that surgery. Because ADV rebuilds a change's state by
replaying its history, correcting the recording rule means already-broken changes
repair themselves the next time they are read — no manual intervention, no data loss.

## Verdict

APPROVED

## What Was Built

1. **The retry recorder no longer writes unreadable records.** It keeps the most recent
   attempts within the allowed budget instead of growing without limit
   (`applySubagentReportSubmittedToState`).
2. **Already-broken changes repair themselves.** Because the correction lives in the
   code that replays history, changes bricked before this shipped come back on their own.
3. **The retry budget has one definition.** Previously two places each hard-coded it,
   which is why an operator's earlier repair attempt was silently undone.
4. **Counts stay honest after trimming.** Trimming the retained history would have made
   ADV report "3 attempts" after twelve. The true total is now recorded and reported
   everywhere an operator sees it.
5. **The rule is written into durable spec law** (`subagent-reports` 1.8.0 → 1.9.0), so a
   future simplification cannot quietly remove the self-repair property.

## What Was Verified

- Verdict: APPROVED with 3 findings (0 blockers at close, 2 issues fixed, 1 style fixed)
- Tests: repo check passes; 8,480 unit tests pass; 90/90 Temporal tests pass, including
  replay of five real production histories carrying 7–24 recorded reviews
- Preview URL: not_applicable — internal state-recording logic with no browser-visible
  or visual output; rationale recorded in the contract matrix
- Contract matrix: 15 of 15 required rows pass or respected, 0 failing

## Remaining Concerns

- **Non-blocking, pre-existing:** five test assertions about a command document fail on
  the main branch itself. This change does not touch that file. Independently confirmed
  as failing before this work and unrelated to it; owned by four other in-flight changes.
- **Non-blocking follow-up:** one pre-existing ambiguity was surfaced and documented
  rather than silently resolved — whether two attempt lists that feed a diagnostic
  counter can overlap. Recorded in the test that exercises it.
- No migration, no data change, no user-visible behavior change.

## Supporting Evidence

Tasks tk-cbacac2f2659, tk-42a6bc88cba6, tk-80adf9566bfa, tk-c0e4b16123ac,
tk-e01d69110f0b, tk-4db168229b5d (tk-187b0b2a8edd cancelled with user approval).
Independent review scanner and three `adv-verifier` gate runs. Contract review matrix
(15 rows). Design-gate research validating replay safety against Temporal SDK
documentation. Incident record at `/tmp/opencode/adv-incident-2026-08-04/`.

## Consequence Context

| Category | Status | Evidence |
|---|---|---|
| Delivered value | delivered | Retry guardrail can no longer brick a change; bricked changes self-repair on replay. Contract matrix 15/15. |
| Enabling-only / follow-up dependency | none | Self-contained. No dependent change required for the fix to take effect. |
| Ops readiness | pending | Harden owns release/deploy/docs/cleanup readiness. |
| Migration / data impact | n/a | Additive optional field only; no migration, no backfill. Existing records read unchanged via legacy fallbacks. |
| Frontend / preview impact | not_applicable | Internal state-recording logic; no browser-visible surface. Matching matrix rationale recorded. |
| Collision / release risk | warning | `change-state.ts` is contested by in-flight `fixTaskUpdatePersistence` and `improveCrossProject`. Rebased clean onto current trunk; branch is behind trunk and should rebase again before merge. |
| Open follow-ups | 2 non-blocking | Pre-existing `adv-review.md` asset failures (base-attributable, owned elsewhere); loop-ledger attempt-list overlap ambiguity (documented in test). |
| Next action | ready | Acceptance approval proceeds inline to `/adv-harden clampDoomLoopAccumulator`. |
