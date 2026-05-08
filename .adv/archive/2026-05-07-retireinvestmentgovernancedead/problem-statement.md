## Problem

ADV's investment governance v1 (Phase J judgment-call identification, Phase 1.5 surfacing, threshold tier classification with hardstop) has produced **zero surfaced calls in the last 14 archives**, hardstop tier is advisory-only and never blocks any flow, and its functional intents appear redundant with surviving mechanisms (doom-loop, `rq-autonomy01`'s "unresolved user-value tradeoff" escape clause, and the `/adv-discover` + `/adv-design` gates).

The system delivers ~250 lines of tool code + 291 lines of canonical skill + two phase hooks + spec entries + instruction file + a sync target across `~/.config/opencode/skills/` for **no observed value**, while one open umbrella-tracker bug (`ag-55f13852` item 2 — hardstop false positive on smooth runs) sits in this dead surface awaiting fix.

## Evidence

| Observation | Source |
|---|---|
| Phase 1.5 has surfaced 0 judgment calls in 14 most recent archived changes | Survey: `judgment_calls === absent` (legacy) or `[]` (Phase J ran, found nothing); `batch_surfaced_at: null` on all |
| Hardstop tier is explicitly advisory-only | `skills/adv-cost-governance-methodology/SKILL.md` §Hard-Stop Semantics lines 208–220 |
| Tier classification ignores `elapsed_minutes` despite config | `plugin/src/tools/investment.ts:78` (`_elapsedMinutes` parameter unused) |
| Doom-loop already covers retry safety at 3+ retries; hardstop fires at 5+ | `plugin/src/events/status.ts` (doom-loop) vs `plugin/src/tools/investment.ts:74-92` |
| `rq-autonomy01.1`–`.6` already permit pause for unresolved user-value tradeoffs | `.adv/specs/advance-workflow/spec.json:382-462` |

## Desired Outcome

Retire Phase J + Phase 1.5 + threshold tier surfacing + `change.judgment_calls[]` machinery + supporting skill/instructions, **only after** verifying functional intents are covered by surviving mechanisms in observable practice. Keep `adv_investment_report` slimmed to the metrics that reflection plane1 already directly imports (`computePerGateDurations`, raw task counts, retry total, doom-loop signal). Closes umbrella item `ag-55f13852` part 2 by elimination, not patch.

## Why this is correct (LBP rationale)

- **Less code is better than more code that does nothing observable.** The investment governance surface has been live for ~3+ months across dozens of changes and produced exactly zero judgment-call surfaces. That's not "rare correct fires" — that's dead-letter.
- **Single canonical surface for user-value pause.** `rq-autonomy01` is the canonical autonomy contract. Adding a parallel structural prompt path (Phase 1.5) for the same intent fragments where agents look for the rule.
- **Doom-loop is the right shape for retry safety.** Investment hardstop's retry threshold is duplicative.

## Out of scope

- Doom-loop mechanism (separate, working, untouched)
- `rq-autonomy01` escape clause (survives unconditionally as the canonical user-value tradeoff pause path)
- v2 redesign of investment governance (explicitly not happening — if a future user-value-surfacing system is needed, it ships as a fresh design, not a v2 of this one)
- Reflection plane1 metrics consumption (adapts to slimmed tool surface, no semantic change)