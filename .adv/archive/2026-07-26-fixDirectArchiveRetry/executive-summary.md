# Executive Summary

## Outcome
Archive retry now carries a route-neutral, proof-owned released commit SHA for every successful local, direct-default, and merged-PR release path. Direct-push archived changes with spec deltas can verify their committed projection and return bounded idempotent success instead of being rejected for lacking a PR-only merge field.

## Why It Matters
This removes the blocker that prevented `hardenWorkflowRecovery` from converging after its archive commit was already on `origin/trunk`. Release proof remains fail-closed: no status-only inference, no fabricated SHA, and no weakened projection verification.

## Verification
- RED `tr_ms1c99gc_6917a42d`: baseline lacks route-neutral release SHA.
- GREEN `tr_ms1c9l3d_e2bc0418`: initial 235 focused tests pass.
- Acceptance remediation `tr_ms1cihqj_af1d1ce0`: 236 focused tests pass, including direct archived retry without a worktree.
- Static verification `tr_ms1cjmt9_a1bba352`: `pnpm run check` passes.
- Independent acceptance reviewer: READY after one in-scope preflight remediation.
- Contract matrix: 10 rows, 0 failing.

## Risks and Follow-up
No spec-law change; implementation restores existing `rq-archiveRetryIdempotence01`. After this change is released and deployed from merged trunk, retry `hardenWorkflowRecovery` archive to complete release/lifecycle convergence.