# Executive Summary: Fix Finding Routing

## Outcome

Mid-lifecycle findings now have a friction-free durable home in the backlog, avoidance/out-of-scope respects claims require independent review verification before acceptance, retry accounting distinguishes productive review rounds from failed retries, and the retry budget clamp is visible rather than silent.

## Why It Matters

ADV had a claims-vs-facts gap: command contracts told agents to route findings to the backlog, but nothing structural enforced it; avoidance items declared review-evidence requirements that nothing checked; every BLOCKED verdict counted as a retry regardless of whether it surfaced new ground; and the retention clamp that bounded retry history dropped entries silently. Together these meant the system could assert compliance it hadn't verified and miscount progress as failure.

## What Was Verified

- 31 new tests across 5 test files (change-state, gate-readiness, tool-formatters, portfolio-state, finding-routing-assets) — all green
- Red/green TDD cycles recorded for every code task (5 RED run IDs, 5 GREEN run IDs)
- Full suite: 305/305 targeted + 20/20 replay determinism + `pnpm run check` clean
- Typecheck clean across all changes
- Schema regeneration verified (change.schema.json, task.schema.json)
- Drift-guard asset tests confirm routing claims fail on removal
- Acceptance review: adv-reviewer multi-dimensional review, verdict APPROVED (formatting fixes applied)

## What Was Delivered

- **Finding routing** (T1/T2): prep, design, apply, review, and harden command contracts now name `adv_backlog_add` as the durable middle-tier option, each with a drift-guard asset test
- **Portfolio state** (T3): `adv_change_create` surfaces bounded portfolio stats (open count, never-terminal share, soft nudge above threshold) with graceful degradation to `{available: false}`
- **Progress-vs-retry** (T4): BLOCKED verdicts with disjoint findings are recorded as progress, not retries — error_recovery is not inflated
- **Budget warning** (T5): the retention clamp emits a visible `budget_warning` marker; submission never refuses at/over budget; doom-loop UX surfaces it
- **Respects authority** (T6): gate-readiness blocks acceptance/release for tasks respecting DONT/OOS items without task-scoped adv-reviewer authority; no grandfathering
- **Spec deltas** (T7): four requirements staged (rq-findingRouting01, rq-respectsEvaluation01, rq-createPortfolioLine01, rq-retryProgressAccounting01) + CHANGELOG

## Risks / Follow-ups

- The respects-authority check (T6) will block ANY change's acceptance if done tasks respect DONT/OOS items without per-task reviewer reports. This is the intended enforcement, but teams should be aware that `/adv-review` must produce per-task reports.
- The portfolio read at create time adds a bounded (2s deadline) Temporal query to every `adv_change_create` call. Degradation is explicit, but the latency is additive.