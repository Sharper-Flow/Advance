# Agreement

## Objectives

1. Git census is authoritative for worktree discovery and identity; ADV registry is advisory metadata.
2. Deletion uses typed plan/apply with drift rejection under a repository lock.
3. One cancellable deadline covers target resolution through reconciliation.
4. Existing dirty, in-use, CWD, integration, archive, and lock safety remains fail closed.
5. Deletion is idempotent and handles `change/*`, `release/*`, and ad-hoc branches uniformly.
6. The repaired tool removes both retained release worktrees without manual Git commands.

## Acceptance Criteria

### AC1 — Git-census planning
A clean linked worktree absent from ADV registry returns `planned` with exact repo, path, branch, HEAD, cleanliness, process-use state, integration proof, expiry, and deterministic token. Identical canonical payloads produce identical tokens; changed facts change the token.

### AC2 — Uniform branch handling
`change/*`, `release/*`, and ad-hoc fixtures use one planner. Registry absence alone never returns `branch_not_in_registry`. Dirty, in-use, locked, prunable/corrupt, detached, unmerged, and current-CWD states return distinct typed refusals.

### AC3 — Drift-safe apply
Apply re-reads plan facts under a repository lock. Any change to HEAD, path, branch, cleanliness, process-use, lock state, integration proof, expiry, or repository identity returns `drifted`; Git removal is not called.

### AC4 — End-to-end deadline
An injected hang at target resolution, store access, census, status, integration proof, hooks, workspace cleanup, Git removal, or reconciliation returns typed `deadline_exceeded` before the 10-second host ceiling with stage and elapsed-budget evidence.

### AC5 — No post-timeout mutation
Timeout fixtures prove all child and grandchild processes terminated before response, no later Git removal occurs, and no registry/pending-delete mutation appears after waiting beyond the former inner timeout.

### AC6 — Lock correctness
Concurrent applies serialize through one liveness-aware repository lock. One may delete; competitors return `busy` or `already_absent`. Dead-owner locks are reclaimed; live-owner locks are never stolen.

### AC7 — Atomic safe deletion
A valid unexpired plan removes a clean unused integrated worktree and reconciles metadata. Repeated apply returns `already_absent`. Main worktree and unintegrated branches are never removed.

### AC8 — Git half-state recovery
Planner parses NUL porcelain including locked/prunable. Apply returns typed repair guidance for unresolved administrative corruption and never filesystem-deletes a worktree directory.

### AC9 — Contract parity
Public schemas, generated schemas, manifests, command packets, and tests agree on plan/apply inputs and typed outputs. Existing calls have an explicit compatibility adapter or deterministic migration guidance.

### AC10 — Operational proof
After merge, green CI, release, deployment, and restart, the fixed tool plans and removes `release/fixPostRemovalRelease` and `release/fixPostRemovalRelease-v1203`, with exact evidence and no manual removal.

## Constraints

- Host ceiling remains 10 seconds; internal deadline reserves response margin.
- Correctness is structural: schemas, parser, state machine, lock, deadline, cancellation, and tests.
- Git owns worktree facts; ADV owns change lifecycle and approval.
- Process-tree termination must be proven or apply fails closed.
- Every subprocess receives only remaining budget.
- Apply retains irreversible cleanup approval requirements.

## Avoidances

- No longer timeout as primary fix.
- No non-cancelling destructive `Promise.race`.
- No background deletion or post-response mutation.
- No registry-membership prerequisite.
- No manual/filesystem deletion fallback.
- No heuristic deletion authority.
- No weakened safety checks.

## Evidence

Source RCA, live reproduction, official Git/Node documentation, repository `detach.ts`/census patterns, strict validation, and independent researcher assessment support this agreement.