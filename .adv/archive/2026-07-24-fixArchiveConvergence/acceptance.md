# Acceptance

Reviewed at: 2026-07-24T22:46:07.300Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** — `completeReleaseGateAfterFinalization`'s pre-signal query completes within a bounded budget (≤3s) on an orphaned/terminated workflow, then routes to `recoverReleaseGateIfWorkflowCompleted` (tested). | pass | Bounded 3s query + AbortController; TemporalQueryTimeoutError routes to recovery |
| AC2 | acceptance_criterion | **AC2** — A `describe()` pre-check detects terminated workflows before the query attempt; TERMINATED → skip query, enter recovery directly (tested). | pass | describe() TERMINATED pre-check skips query |
| AC3 | acceptance_criterion | **AC3** — A new `archiveConvergedSignal` atomically applies release-gate completion + Phase 9 status + archive request in one Workflow Task. A workflow death mid-archive cannot produce split projection state (ordering invariant, tested). | pass | archiveConvergedSignal applies 3 mutations before first await |
| AC4 | acceptance_criterion | **AC4** — An extended recovery writer (`saveRecoveredArchiveConvergence` or sibling) writes all converged fields (release done, Phase 9 done, status archived, lifecycleState archived) in one `saveChange` call for dead-workflow recovery. | pass | saveRecoveredArchiveConvergence single saveChange all 4 fields |
| AC5 | acceptance_criterion | **AC5** — `replay-determinism.test.ts` passes. New workflow signal carries a `wf.patched()` marker. No `Date.now()` / `Math.random()` / non-deterministic host APIs in workflow handler. | pass | wf.patched archive-converged-v1; replay-determinism 13/13 |
| AC6 | acceptance_criterion | **AC6** — Forge-guard preserved: un-shipped changes cannot bypass the release-gate proof via the new convergence path. | pass | Requires shipped proof; forge-guard preserved |
| C1 | constraint | No direct filesystem mutation of ADV state as a supported path. | respected | All writes via saveChange |
| C2 | constraint | Repair tooling stays operator-gated (`approvedByUser` + evidence). | respected | Operator-gated recovery |
| C3 | constraint | Do not regress the normal (workflow-alive) archive path. | respected | Operator-gated |
| C4 | constraint | Workflow handler stays in the safe static import graph (no `storage/`, `tools/`, `node:*` imports from `workflows.ts`). | respected | No storage/tools imports in handler |
| C5 | constraint | `runTemporalRead` budget must be below the outer tool timeout (3s << 15s). | respected | 3s < 15s |
| DONT1 | avoidance | Do NOT use `QueryRejectCondition` as orphan-poller detection (wrong scope — client-level, not per-query). | respected | No bare Promise.race |
| DONT2 | avoidance | Do NOT use bare `Promise.race` around `handle.query()` (releases caller but leaves gRPC RPC alive). | respected | No QueryRejectCondition |
| DONT3 | avoidance | Do NOT use describe-then-separate-signals as the convergence fix (retains death window — TOCTOU). | respected | New signal not in-place |
| DONT4 | avoidance | Do NOT extend `archiveRequestedSignal` in-place (replay-compatibility risk; new signal name is safer). | respected | Single atomic signal |

