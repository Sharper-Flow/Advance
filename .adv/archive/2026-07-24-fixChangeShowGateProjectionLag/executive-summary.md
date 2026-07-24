# Executive Summary — Fix change-show gate projection lag

## Outcome

The `adv_change_show` gate projection no longer lags `adv_gate_status` after a gate completes. Every ADV read tool that consumes gate state via the change cache now sees fresh, authoritative data immediately after any gate completion — with no re-fetch required.

## Why it matters

This defect caused false "stuck/failed" gate reports, a full `adv-temporal-repair` diagnosis, and blocked routine post-archive worktree cleanup during the `lgrep:addSkipStalenessReindexFlag` session. Operators and agents could not trust `adv_change_show`'s gate status, undermining the reliability of the entire ADV lifecycle. The fix restores trust in the gate projection across all consuming tools.

## What was delivered

**Root cause:** `adv_gate_complete` applied post-confirmation `store.changes.invalidate(changeId)` only for the `release` gate (a #305 residual). All other gates retained a re-poisoned in-memory cache from `fireSignalAndRefresh`'s readback, so subsequent reads via `getTemporalChange` returned stale gate state and status.

**Fix:** Removed the `gateId === "release"` guard in **two** gate-completion paths in `plugin/src/tools/gate.ts`:
1. `handlePlanningGateCompletion` (~line 1180) — the planning-gate handler
2. Main `adv_gate_complete` handler (~line 1958) — discovered during related-scan (P25)

Both now call `store.changes.invalidate(changeId)` unconditionally after gate completion is confirmed. This is a systemic fix — every consumer reading via `getTemporalChange` (change-show, worktree terminal checks, task tools, status enrichment) gets fresh data on the next read.

## Verification

- **AC1** (parity after gate completion): red→green test — non-release planning gate cache freshness verified.
- **AC2** (snapshot ↔ top-level consistency): test — discovery gate; `_contextSnapshot` markers match top-level gates.
- **AC3** (terminal classification): test — archived all-gates-done change classified terminal by worktree delete.
- **AC4** (graceful degradation): read path unchanged; existing fail-closed tests green.
- **AC5** (no mutations): invalidate is write-path only; `adv_change_show` source unchanged.
- **AC6** (poisoned-history fallback): existing fail-closed/poisoned-recovery tests green.
- **Regression sweep:** 292 tests across 6 files, 0 failures.
- **Quality gates:** typecheck, lint, format, contract validation all pass.

## Risks and follow-ups

- **Cache-miss latency:** The next read after gate-complete now does one fresh workflow query (cache miss). This is the same cost as the existing release-gate behavior. Bounded by `TemporalReadContext` deadline + disk fallback. Acceptable.
- **Archive path:** The archive status-transition path already invalidates via Temporal `changes.save` — no additional fix needed (confirmed by engineer).
- **Transient worker:** This session used a transient systemd-managed worker (`adv-transient-worker.service`) to unblock gate operations after the advance project's worker died. For durable ownership, restart OpenCode for the advance project.

## Supporting evidence

- Commits: `e2ec53b3` (TDD fix), `0cbdbf48` (AC tests + second path fix), `b4ae692f` (formatting).
- Contract review matrix: 13/13 pass, 0 failing.
- Worktree: `change/fixChangeShowGateProjectionLag`.
