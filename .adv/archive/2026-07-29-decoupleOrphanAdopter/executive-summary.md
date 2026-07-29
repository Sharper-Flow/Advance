# Executive Summary: Decouple orphan adopter construction

## Outcome

The orphan-queue adopter — the mechanism that lets a live ADV worker adopt stranded prior-session Temporal queues — is now bound to worker lifecycle via a single composition helper (`attachWorkerWithAdoption`), not just the `plugin-init` spawn branch. Both production worker-creation paths (plugin-init spawn and `restartCurrentProjectTemporalWorker`) route through it. A doctor-spawned worker now constructs, drives, and tears down an adopter identically to a plugin-init-spawned one.

## Value / why it matters

Before this change, `adv_doctor`'s `worker_restart` left orphan-queue adoption silently disabled (`{enabled: false, "no active adopter"}`) on lock-owning hosts with a live worker. Workflows created by earlier sessions stayed permanently routed to their per-session task queues with nothing polling them — every signal, mutation, and recovery precheck against them failed, while `adv_doctor` reported the system fully healthy. This was the direct cause of unreachable changes and stuck doctor remediation cycles.

After this change: wherever a live ADV worker exists, a running adopter is attached to it, driven on a ~10s cadence, and torn down cleanly on drain/exhaustion/replacement. Absent or failing adoption is now **visible** (typed diagnostics: `unavailable`, `driver_error`, `construction_failed`, `disabled`) and factors into the doctor health verdict — no more silent masking.

## Verification

- **42 unit tests pass** across 5 files (plugin-init restart-path, worker-singleton, session-registration, doctor health, registrar-guard).
- **2 integration tests pass** against a real Temporal time-skipping server (existing adopter proof + new AC6 restart-path seam proof — workflow becomes queryable via the real helper).
- **typecheck, lint, format clean.**
- **TDD evidence** recorded per task: RED→GREEN for the core defect (T1-T3), GREEN for hardening (T4-T10), reviewer evidence for the structural guard (T8).
- **Acceptance review**: initial verdict BLOCKED (stale teardown state + init-failure leak) → remediated → all blockers resolved.

## Key decisions

- **One helper owns pairing + teardown (KD1):** `attachWorkerWithAdoption` calls `registerInProcessTemporalWorker` AND constructs the adopter. Both sites use it. `registerInProcessTemporalWorker` is now non-exported (structural guard).
- **Attachment-owned tick driver (KD3):** moved from the heartbeat `onBeat` into the attachment. `checkNow()` retained on heartbeat (DONT8). Driver cleared before worker shutdown (C6).
- **Fail-soft, never silent null (KD5):** null client → typed `unavailable`; construction failure → typed `construction_failed`; tick error → typed `driver_error`. Worker startup never breaks from adoption failure (C3).
- **Adoption-aware doctor (KD6):** worker alive + adoption absent/failing → `healthy: false`. No worker → healthy (legitimate non-owner).

## Risks / follow-ups

- **Stale client under concurrent recovery (C7):** `reinitStsl()` swaps `bundle.client` in place; an adopter holding the prior reference can go stale. Mitigated by driver-error observability (typed diagnostic), not locking. Narrow window; acceptable.
- **Reclaiming already-orphaned queues** is desirable but secondary (agreement: out of scope if it can't fit C1-C7). Splits to a follow-up.
- **Pre-existing unrelated failure** in `activities.disk-projection.test.ts` confirmed on parent commit — not caused by this change; separate triage item.
- **Non-blocking review finding:** doctor's `recommendedNextAction` text for adoption-only unhealthy could be clearer ("System healthy" is misleading when adoption is the only issue). Minor UX follow-up.