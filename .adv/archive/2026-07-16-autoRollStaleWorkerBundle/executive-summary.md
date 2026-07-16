## Executive Summary — autoRollStaleWorkerBundle

### Outcome
Redeploying the Advance Temporal worker bundle now automatically rolls running out-of-process workers onto the new code — eliminating the silent stale-worker hazard where every already-running session kept executing old code until manually restarted.

### Why it matters
On Bun hosts (opencode's runtime), each session's worker loads the bundle once at process start; a rebuild/redeploy left running workers stale with no re-election. In a multi-session setup this multiplied — N sessions meant N independently-stale workers running divergent code. This was a correctness/consistency hazard discovered live (3 stale-bundle workers vs a fresh redeploy).

### What was built
- **Atomic generation manifest** emitted last by `build:worker` (SHA-256 over both `worker.js` and `workflows.js`) so rolls trigger on a coherent bundle set, never a half-synced one.
- **Owner-driven self-roll**: the lock-owning session's heartbeat detects generation drift and gracefully respawns its own Node child (first-class `restartChild`, distinct from crash-respawn — crash budget untouched), draining in-flight work within an explicit `shutdownGraceTime` before a longer parent hard-kill deadline.
- **Single-writer `worker.lock`**: the heartbeat is the sole writer; the roll hands the new generation to it — closing a lost-update race caught in acceptance review.

### Verification
53/53 worker suites green; `pnpm run check` green; `build:worker` manifest E2E verified; independent reviewer verdict READY after the single-writer remediation. `workflows.ts` unchanged; no `defineUpdate`; in-process path untouched.

### Risks / follow-ups
- Lock `bundle_generation` lags ≤1 heartbeat (10s) after a roll; only the owner's in-memory monitor reads it (re-roll-immune); an owner crash stops the heartbeat so a stale stamp dies with the lock.
- Follow-up candidate: `scripts/deploy-local.sh` still SIGTERM-bounces deployed workers cross-session — now redundant with owner-driven self-roll.
- Pre-existing, unrelated: `messages.test.ts` "51 signal surface" fails on clean trunk (not touched here).