# Executive Summary

## Outcome

ADV now has a structural recovery transaction architecture instead of independent whole-object fallback writers. Healthy mutations remain Temporal-authoritative. Completed, missing, or poisoned workflow recovery uses a per-change conditional projection commit that locks, reads the latest state, checks revision, applies field-local mutation, increments revision, persists atomically, reads back, and verifies the intended postcondition before reporting success.

## Why It Matters

The triggering incident showed two recovery tools could each report success while one silently overwrote the other's state. It also showed long-lived workflows crossing unversioned worker builds can become nondeterministic. This change closes the projection lost-update path, centralizes mutation/recovery authority, and makes worker evolution fail closed until safe multi-version operations exist.

## Delivered

- Storage-owned `commitChangeProjection` with per-change lock, projection revision, conditional commit, bounded audit, and verified readback.
- Typed `ChangeMutationCoordinator` preserving Temporal signal + receipt + refresh on healthy workflows.
- Typed recovered_verified / recovered_unverified / stale_revision / operator_required outcomes.
- Central SDK/ADV error normalization, including TMPRL1100 and `workflow not found for ID`.
- Review-matrix + verification-disposition incident pair migrated; 100 concurrent iterations retain both fields.
- Gate, task, report, design concern, artifact, status/archive, and Temporal dual-write projection migrated or mechanically inventoried.
- Static raw `saveChange` exception inventory prevents unenumerated active-projection bypasses.
- Temporal dual-write now merges authoritative workflow fields into the locked latest projection rather than replacing it with a captured whole snapshot.
- Worker evolution guard, candidate built-bundle replay, typed Worker Deployment readiness, and honest immutable-history negative fixture at event 479.
- Two staged `advance-workflow` laws for conditional verified recovery and replay-safe worker evolution.

## Verification

- Projection transaction: 14/14, including 100/100 disjoint concurrency and typed conflicts.
- Coordinator/readiness: 29/29.
- Incident pair/coordinator: 61/61, including 100 concurrent recoveries.
- Migrated families/raw-write inventory: 321/321.
- Worker/replay focused suite: 67/67.
- Conformance remediation: 98/98.
- Post-review Temporal projection merge: 78/78.
- `pnpm run check`: green.
- Full plugin suite: green (`tr_ms18n5x3_0fab3ced`).
- Current worker build: green (`tr_ms17wiaq_190ee149`).
- Candidate replay: green (`tr_ms17x0c6_f9ec67ed`).
- Independent acceptance reviewer: READY after remediating one captured-snapshot overwrite blocker.

## Remaining Release Work

- Rebase onto current trunk; one known conflict exists in `plugin/src/temporal/gate-readiness.ts` and must be resolved deliberately.
- Rebuild worker and replay-test the final source SHA after rebase; record worker-bundle provenance.
- Push PR, run CI, merge, deploy from merged trunk, restart OpenCode, and verify recovery behavior on the deployed bundle.

## Risks

- Worker Deployments intentionally remain disabled. Current singleton self-roll topology cannot retain pinned old workers through drainage.
- Existing active unversioned workflows still depend on patch/replay compatibility until managed multi-version worker lifecycle is implemented in a future change.
- Orphan session queues remain a separate operational concern tracked by existing adoption work; this change does not redesign queue ownership.