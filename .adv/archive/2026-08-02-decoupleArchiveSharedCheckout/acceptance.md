# Acceptance

Reviewed at: 2026-08-01T23:20:20.992Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** A merged PR archives successfully with shared trunk dirty or behind. | pass | Dirty/stale trunk tests pass. |
| SC2 | success_criterion | **SC2:** Concurrent archives cannot capture, reset, or destroy unrelated work. | pass | Race/isolation suite passes. |
| SC3 | success_criterion | **SC3:** All archive routes preserve deterministic reachability outcomes. | pass | All route regressions pass. |
| AC1 | acceptance_criterion | **AC1:** Archive finalization never commits, resets, stashes, merges, pushes, or syncs shared trunk. | pass | No shared-main mutation tests pass. |
| AC2 | acceptance_criterion | **AC2:** Release proof is based on fresh remote default-branch evidence plus validated immutable change/tree evidence. | pass | Fresh canonical remote proof verified. |
| AC3 | acceptance_criterion | **AC3:** Direct-route integration occurs only in a tool-owned ephemeral worktree. | pass | Detached integration route verified. |
| AC4 | acceptance_criterion | **AC4:** Branch-present, squash/deleted, no-remote, retry, and poisoned/completed recovery routes remain fail-closed. | pass | No-remote now fails closed; recovery routes covered. |
| AC5 | acceptance_criterion | **AC5:** Concurrent archive integration is isolated and tested. | pass | Non-FF contention behavior covered. |
| AC6 | acceptance_criterion | **AC6:** Existing bundles/retries migrate compatibly without false release success. | pass | Legacy/retry compatibility tests pass. |
| AC7 | acceptance_criterion | **AC7:** Archive specs and generated schema/contracts reflect the new authority and isolation rules. | pass | Specs/docs/assets reviewed aligned. |
| C1 | constraint | Shared trunk is never a release mutation target. | respected | Shared trunk never release mutation target. |
| C2 | constraint | Remote reachability failures block release. | respected | Remote failures block release. |
| C3 | constraint | No destructive workaround may touch unrelated work. | respected | No unrelated destructive workaround. |
| DONT1 | avoidance | Do not weaken proof to disk-only historical claims. | respected | No disk-only proof. |
| DONT2 | avoidance | Do not require manual branch/worktree recreation. | respected | No manual reconstruction. |
| DONT3 | avoidance | Do not introduce a global archive lock as a substitute for isolation. | respected | No global lock. |

