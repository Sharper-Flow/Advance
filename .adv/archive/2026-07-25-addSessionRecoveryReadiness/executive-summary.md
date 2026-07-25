# Executive Summary — Add session recovery readiness barrier

## Outcome
ADV mutations now fail-closed to a typed **`ADV_SESSION_NOT_READY`** response when the target workflow queue has not been proven serviceable, instead of executing against an orphaned prior-session queue and producing an ambiguous `no_poller` whose recovery path was unknown. The barrier is **per-target-queue**: a fresh own-queue mutation is never blocked by an unrelated orphaned queue, and worker **startup remains non-blocking** (the barrier lives in post-init tool exposure / per-mutation execution, not worker init).

## Why it matters
This closes a real correctness/operability gap in ADV's Temporal mutation path. Previously, a mutation could fire a signal at a queue with no live poller (e.g., after a session/worker replacement), yielding an indeterminate `no_poller` that left callers unsure whether to retry, wait, or treat it as a hard failure. Callers now receive an explicit, classifiable, retryable response with heartbeat-aware retry guidance, and the signal is **not** fired until the queue is proven ready. The ambiguous window also no longer silently re-opens if a worker dies mid-session after initial readiness.

## How it works (KD decisions)
- **Per-target-queue readiness** (KD1): each mutation proves its own target queue; fresh own-queue work is never gated by an unrelated orphan.
- **Proof truth table** (KD3): for an existing change workflow, a bounded read-only **Query** proves serviceability (a failed Query overrides a fresh `DescribeTaskQueue`); for a not-yet-existing workflow, observed local-worker readiness is required; `DescribeTaskQueue` freshness is advisory-only and never the sole authority.
- **Single authoritative gate** (KD4): the pre-check at the top of `fireSignalAndRefresh` is the sole eligibility authority; the exposure-time tool-map wrapper is informational/degraded-mode only (it cannot know the per-mutation target queue and must not over-block).
- **Continuous re-check** (KD5): readiness cache TTL + worker-death staleness hook (`markStale` in the orphan-queue-adopter) re-close the window.
- **Typed envelope** (KD6): `ADV_SESSION_NOT_READY` carries `blockers[]` + a heartbeat-aware `retryHint` (no false ETA), and is preserved end-to-end through `safeExecute` so callers can discriminate it from `ADV_PLUGIN_INIT_FAILED` and `no_poller`.
- **Kill-switch** (KD7): `ADV_SESSION_READINESS_BYPASS=1` skips the barrier for tests/dev (default OFF).
- **Spec law** (KD8): new additive requirement `rq-sessionReadinessBarrier01` (advance-workflow); `rq-isolSessionTaskQueue05` retains the non-blocking-startup invariant.

## Verification
- `pnpm run check` clean (schemas, typecheck, agent-manifest, test-isolation, lockfile, lint, format).
- Full unit suite green; **full Temporal `.itest.ts` suite green (24 files / 82 tests)** — confirms the live barrier does **not** break real Temporal signals, workflows, adoption, projection, or archive.
- Integration + DDC-budget suite (136 tests); AC1–AC7 + SC1–SC5 all pass; C1–C6 + DONT1–7 respected.
- Independent `adv-reviewer` acceptance review: **READY** (initial BLOCKED verdict on envelope-loss through `safeExecute` + undocumented `"true"` bypass, both remediated in commit `23ed585f`, re-reviewed clean).

## Risks / Follow-ups
- **Deploy requires a plugin rebuild + OpenCode restart** to take effect (no hot reload); the new `rq-sessionReadinessBarrier01` spec ships with the change.
- **Worktree was 1 commit behind `origin/trunk`** at acceptance — sync/rebase before release.
- Out-of-scope items deferred (tracked): cross-project `target_path` worker lifecycle (Issue #205), non-session-bound worker fleet, orphan-adopter cooldown redesign, stable operation-id mutation dedup.
- The `ADV_SESSION_READINESS_BYPASS` escape hatch is OFF by default; operators should leave it off in production and use it only for deterministic test/dev.

## Supporting evidence
Key commits on `change/addSessionRecoveryReadiness`: task checkpoints `bd54ee15`→`a65c1a2f` (T1–T8) + remediation `23ed585f`. Durable TDD evidence recorded via `adv_run_test` for every code task; reviewer-owned static-check report for the spec task.