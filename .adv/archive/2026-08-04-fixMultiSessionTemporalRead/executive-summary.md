# Executive Summary

## Outcome
The project status command (`adv_status`) currently hangs and fails with an unexplained timeout instead of returning an answer. This change makes it always return either a complete result or a clearly-labelled partial result within its time limit. You are approving the fix to move to release preparation.

## Why It Matters
`adv_status` is the primary way an operator or agent checks the state of a project. Today it can fail with no usable information, and a previous attempt at this fix was shipped and deployed but the failure continued — so this work carries direct evidence that the remaining cause was found and closed. When the system is under pressure, users now get a partial answer that names what was unavailable, rather than a dead end that requires restarting the tool.

## Verdict
APPROVED

## What Was Built
1. **Bounded the slow step that survived the last attempt** (D5) — after the main data load finished, a follow-up step that enriched each change ran with no time limit, which is why the earlier deploy did not fix the problem. It is now time-limited, along with every other post-load step (per-iteration deadline admission in both enrichment branches; `cutoffAt`/`signal` threaded into `enrichRecentChangeStatus`).
2. **Stopped pointless retries against a permanently-missing record** (D3) — the system used to retry a lookup that could never succeed, burning the time budget needed to produce a useful answer. It now tells the difference structurally, using a numeric error code plus request-scoped state rather than by pattern-matching error text.
3. **Tied the internal time budget to the external time limit** (D4) — these were two independent numbers that could drift apart silently. The budget is now calculated from the limit, with the safety reserve measured (199 ms, from a 132 ms worst case over 100 runs of a large payload) rather than guessed, and a CI check that fails if the relationship is ever broken.
4. **Verification and re-entry decision** — confirmed every identified unbounded path is now bounded across the data, tool, retry, and configuration layers.

## What Was Verified
- Verdict: APPROVED with 14 findings (2 blockers, 4 issues, 7 suggestions, 1 nit); all blockers and issues fixed, 2 suggestions rejected with evidence
- Tests: 11-file targeted sweep passing (`tr_mseuouaq_138a5344`); `pnpm run check` clean, 0 errors (`tr_mseuredd_ed4d7913`)
- Preview URL: not_applicable — internal read-path and tool-timeout behavior has no browser-visible surface (agreement declares `visual_surface: false`; matching contract matrix rationale recorded)
- Contract matrix: 19 rows, 0 failing — all 6 acceptance criteria pass, all 7 constraints and 4 avoidances respected

## Remaining Concerns
- **Non-blocking, release-gate obligation:** the live symptom must be re-measured on all four views after deploy. The agreement's Open Risk clause states that if the failure survives with every identified path bounded, the change returns to discovery rather than shipping. This matters specifically because a prior deploy of this same change passed its tests yet did not fix production.
- **Non-blocking:** two contract violations were found and fixed *during this review*, not during implementation — the durable-absence result was untyped, and a session-scoped flag would have suppressed legitimate retries. Both are closed with tests that fail against the old code.
- **Non-blocking:** the change title still says "saturation", which the change's own discovery disproved. Cosmetic only; the implemented model is the unbounded-read model.

## Supporting Evidence
- Tasks: tk-9907e3d72b80 (reproduction), tk-06a8657b245b (D1+D2), tk-986501a9fb27 (D6), tk-0fe1c15a108f (D4a), tk-0a6c9ab3707e (D5), tk-f9856986e3f2 (D3), tk-a0bf41cad932 (D4), tk-4c67f765d92e (verification)
- Commits: 2d158ce5/4635a97d (D5), 1592dcf9 (D3), 3d22c428 (D4), 76f943d9 (review blockers), 8e0444de (review findings)
- RED→GREEN proofs independently re-run by the orchestrator, not accepted on worker assertion: D5 reproduced the exact production symptom (`ToolExecutionTimeout` at 10136 ms); D3 showed 3 retries instead of 1; review blockers showed missing typed warnings and a suppressed retry
- Prior-attempt context recorded in wisdom `ws-Kn9Z9P`; unadopted phantom-working-set candidate in `ws-q3iBV2`
- Contract review matrix (19 rows) and this change's agreement and design artifacts

## Consequence Context

| Category | Status | Evidence |
|---|---|---|
| Delivered value | delivered | `adv_status` returns complete or typed-degraded output within its cap; acceptance summary + contract matrix (19/19) |
| Enabling-only / follow-up dependency | none | Change is self-contained; no downstream change required to realize the value |
| Ops readiness | pending | harden owns release/deploy/production/docs/cleanup readiness |
| Migration / data impact | n/a | Read-path and constant changes only; no schema, migration, or persisted-data change (C3 respected — no Temporal mutations added to read paths) |
| Frontend / preview impact | not_applicable | `visual_surface: false` in agreement; no browser-visible surface; matching matrix rationale |
| Collision / release risk | low-moderate | 12 files, concentrated in the status read path; branch rebased on current trunk; prior related work already merged as PR #365 (`da0344dd`) |
| Open follow-ups | 1 non-blocking | Post-deploy live re-measurement on all four views (Open Risk clause); stale change title is cosmetic |
| Next action | ready | Acceptance approval proceeds inline to `/adv-harden fixMultiSessionTemporalRead` |
