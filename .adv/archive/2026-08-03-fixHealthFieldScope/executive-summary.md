## Outcome

Advance's health reporting claimed more than it could prove. A field named `worker_alive` reported `false` from a process that had no worker to report on — because the type had no way to say "I cannot answer that question." The false looked identical to a real dead worker, and an operator (this session) spent an hour diagnosing a system that was healthy throughout.

This change makes the illegal state unrepresentable. A process that never attempted the worker bootstrap now reports `{status: "unavailable", reason: "not_host_capable"}` — a value that cannot be confused with a genuine negative.

## Why it matters

The defect was not a wrong value; it was a type that couldn't represent reality. `worker_alive: boolean` has exactly two inhabitants. There was no third for "not my question to answer," so a workerless process (like the Vision MCP server) was forced to emit `false`, byte-identical to a real dead-worker report. Adjacent to a genuinely-remote `server_alive: true` in the same flat object, the two readings looked equivalent — but one crossed the network and the other read local memory.

The fix is structural (P33): a discriminated `WorkerLiveness` union carries either an available value or an unavailable reason. The distinction is now enforced by the type system, not by documentation or reviewer vigilance.

## What was fixed

**The producer now knows whether it can answer.** A `workerRoleResolved` flag is set when worker-role resolution completes (`plugin-init.ts:280`), before the spawn branch. A process that resolves its role and spawns is host-capable; one that never attempts the bootstrap (the MCP server) is not. The health producer reads this flag and emits the union accordingly.

**The two failure modes are now distinguishable.**
- Bootstrap never attempted → `{status: "unavailable", reason: "not_host_capable"}`
- Bootstrap ran, no worker registered → `{status: "available", value: false}`
These are provably different states with provably different reporting, asserted by automated tests.

**A duplicate-type trap was removed.** Two separate declarations of `TemporalHealthSnapshot` (`status-health.ts:62` and `doctor.ts:159`) had been papered over by `as unknown as` casts. Reconciling them to one shared declaration made the type system actually enforce the migration: removing the casts surfaced 9 hidden consumer errors that the duplication had been masking.

**A helper predicate gives every consumer one vocabulary.** `isWorkerAffirmativelyAlive` returns `false` for both `unavailable` and `available:false`, and `true` only for `available:true`. Consumers and the operator docs matrix share it, so the unavailable state cannot be silently coerced to falsy or truthy.

**Operator guidance was migrated.** The six-row diagnostic matrix at `docs/temporal-recovery.md:637-642` and the field table at `SETUP.md:244` now use the shipped vocabulary, including a new `not_host_capable` row. Grep confirmed no stale `worker_alive` boolean literals remain in operator guidance.

## Verification

- Full test suite green: **8,260 tests passing, 0 failures**, 538 files
- `pnpm run check` exit 0; only the 4 known baseline `no-explicit-any` warnings (unchanged Temporal SDK-boundary casts)
- Every fix written test-first — red failures proving the gap, then green proving the fix
- The MCP end-to-end path is verified by a regression test that exercises real Tier-4 dispatch (not a stub) and asserts no bare boolean escapes
- A production-ordering guard in the test fails if `workerRoleResolved` ever moves into the spawn block — the load-bearing signal is protected against regression

## Independent scrutiny

The design was reviewed by an independent validator before implementation. It caught **three defects**, the most important being that the original keying signal would have misclassified a non-lock-owning host under `worker_singleton_enforce: true`. The key was moved to worker-role resolution, and a flag (rather than a role-value check) was required because the `"degraded"` role value is both an initial default and a legitimate resolved state.

The acceptance reviewer then found that the MCP regression test stubbed `adv_status.execute`, bypassing the real dispatch path — so the test would have passed even if the actual MCP wiring broke the union. It was rewritten to exercise real Tier-4 dispatch.

## What was deliberately left alone

- **`registered_queues` and `search_attributes` remain bare.** They suffer the same scope-encoding problem, but fixing them is a separate, larger change. The design registered this explicitly rather than silently deferring; the contract scopes this change to the worker-liveness fields.
- **The orphan-queue adopter construction defect** (`bl-workerQueueReadBlackout`) is adjacent and related but materially larger; separately tracked.
- **Read-timeout and saturation work** owned by three existing changes.
- **`adv_doctor`'s healthy/unhealthy criteria** unchanged — the predicate preserves the prior boolean semantics for the verdict.

## Risks and follow-ups

No known risk to shipped behavior. A real session with a live worker still reports `worker_alive: {status: "available", value: true}` — the happy path is preserved and asserted.

Follow-ups recorded, none blocking:
- Apply the same scope-encoding treatment to `registered_queues` and `search_attributes`, which still report bare values from workerless processes
- Address the orphan-queue adopter construction defect tracked by `bl-workerQueueReadBlackout`
