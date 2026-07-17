# Executive Summary

## Outcome

`deploy-local.sh` no longer kills healthy Temporal workers. Workers that structurally prove self-roll capability (literal `ADV_TEMPORAL_WORKER_SELF_ROLL=1` in the running process environment) are left alone during deploys — they detect the new bundle generation and roll themselves. Only legacy or unclassifiable workers still get the loud SIGTERM + `[ADV:ACTION_REQUIRED]` treatment.

## Value

Ends the "every deploy ends in ❌ stale workers survived SIGTERM, restart all your sessions" failure — which happened twice during this very release cycle and is a suspected contributor to in-flight workflow poisoning (backlog bl-F5_tYP9R). Deploys become non-disruptive for current workers while keeping fail-closed safety for old ones.

## Delivered

- Fail-closed per-PID capability classifier over exact-path worker processes (`/proc` environ inspection; anything unreadable = legacy)
- Marked workers: advisory, no signal, exit 0. Legacy workers: unchanged SIGTERM/grace/loud-failure semantics
- Heartbeat-owned immediate generation stamp after replacement readiness (sole lock writer preserved; 50s nominal staged budget)
- `--check`/`--dry-run` provably signal-free (reviewer added dry-run regression coverage)
- Spec, generated docs, setup/archive/recovery guidance updated

## Verification

- Reviewer: deterministic rows all pass (114 targeted tests + `pnpm run check` green)
- **Live proof (user-approved deploy):** branch deploy 02:48:58Z → worker restart 02:49:49Z → `worker.lock` `bundle_generation` matched deployed manifest generation `c929e329…` at 02:49:57Z heartbeat — ready replacement + generation convergence ≤ 8s (60s bound, AC5/SC3)
- Live legacy fallback also observed: pre-marker workers correctly classified legacy with `[ADV:ACTION_REQUIRED]` + exit 1
- Contract review matrix: 17/17 rows passing/respected/not-applicable

## Risks / follow-ups

- First rollout on any host passes pre-marker workers through the legacy path once (by design, C3)
- Node timers are not hard real-time; the 60s bound has ~10s nominal margin — live proof confirmed ≤ 8s in practice