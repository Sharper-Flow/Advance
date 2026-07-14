## Executive Summary: Fix temporal timeouts and worker reaping

### Outcome
Multi-step Temporal/git operations no longer get killed by a blanket 10s timeout, and orphaned worker processes from crashed sessions now self-reap. The two highest-friction infrastructure defects observed across this session's work (#216, #217) are fixed — plus a real phase9 split-brain recovery bug was found and fixed during testing.

### Value / why it matters
A single ADV change lifecycle can now complete reliably under concurrent OpenCode sessions without 16 STSL reconnects, session restarts, or silent split-brain projections. The gate-complete signal that timed out repeatedly this session (sometimes landing, sometimes not, always with a bare error) now gets a 30s budget + an honest "may have landed, verify via gate_status" classifier. Dead-session workers no longer poll indefinitely. And the phase9 recovery path that silently skipped status recording on the unset-state split-brain now durably records it.

### What was built
- **T1 (AC1)** — `adv_gate_complete` registered with `timeoutMs: 30_000` + advisory `onToolTimeout` classifier (`gate-timeout.ts`); was bare 10s default.
- **T2 (AC2)** — source-presence regression guard for the existing archive 420s override (already in source; guard prevents future regression).
- **T3 (AC3)** — re-run reconciliation itest against live Temporal; **found+fixed a real bug**: the phase9 guard `if (change.phase9_status?.status && ...)` was falsy on UNSET status, skipping `recordPhase9Status` on the #216 split-brain recovery path. Fixed to `!== "done" && !recoveryMutation` (correctly separates live-workflow record from completed-workflow skip).
- **T4 (AC4)** — parent-liveness watchdog in the worker child (`worker.ts`): captures ppid once, probes `process.kill(ppid, 0)` every 3s, self-exits on ESRCH (parent crash-orphan). Deleted dead `spawnTemporalWorkerProcess` (zero callers).
- **T5 (AC5)** — `adv_status` health surfaces `worker_processes {workerCount, orphanCount, processes}` via a /proc scan + ESRCH orphan check.

### Verification
- `pnpm run check` green (schemas + typecheck + isolation + lockfile + lint + format).
- AC coverage suite: 6 files / 69 tests pass (incl. live-Temporal itest). Per-task suites: 35+62+92+29+42 all green.
- Independent adv-reviewer verdict: **READY** — no blockers; two scoped remediations (stop watchdog on clean shutdown; abort-aware /proc census).
- Contract review matrix: 9/9 items pass/respected.
- **Fixes deployed and live** during execution to break an STSL catch-22 (the pre-fix deployed worker was contending); verified watchdog + gate-timeout code in deployed dist.

### Constraints honored
- Out-of-process Node-worker model preserved (C1); no STSL/server/signal-contract change (C2); inner git budgets untouched (C3); backward-compatible (C4).

### Risks / follow-ups
- The watchdog's 3s poll adds minor worker overhead; mitigated by cheap signal-0 check + unref'd timer.
- Per-session task queue isolation (#217's larger architectural fix) deferred to a follow-up change — the watchdog handles crash-orphaning, but N live sessions still share one task queue.
- Two agent follow-ups filed during design validation (deploy-freshness guard; subreaper-robust ppid detection).