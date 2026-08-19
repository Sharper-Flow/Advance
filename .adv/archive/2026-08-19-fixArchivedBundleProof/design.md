# Design — Align recovery route and proof authority

## Architecture

```text
existing bundle found
  → load active projection structurally
     ├─ corrupt/oversized/unreadable → fail closed
     ├─ data === null               → reconcileArchivedBundleRetry
     └─ active projection exists    → current archive path

current archive path race fallback
  → completeReleaseGateAfterFinalization
  → if recoveryMutation
       verify bundlePath = archiveResult.archivePath
       return reconciliation success without active retire/cleanup
  → otherwise prove active projection and continue current transition
```

## Decisions

### D1 — Clean absence routes before lifecycle heuristics

At the existing-bundle no-op gate, load the active projection. A successful `data === null` read is structural evidence that no active record survives. Route directly to `reconcileArchivedBundleRetry` even when the legacy bundle has open, absent, or stale `lifecycleState`. Typed read failures remain blockers.

### D2 — Recovery mutation and proof share authority

When `ArchiveReleaseGateResult.recoveryMutation === true`, call `verifyReleaseGateDurableForArchive` with `bundlePath: archiveResult.archivePath`. Active-backed results keep current proof inputs.

### D3 — Recovery never falls through to active retirement

After a bundle-backed proof, return reconciliation success before `coordinateChangeMutation(... archive_transition)`, issue closure, worktree cleanup, branch cleanup, or active-directory removal. This also closes the race where active state disappears after the initial structural probe.

### D4 — Bundle lifecycle converges

`completeArchivedBundleRelease` sets `lifecycleState: archived` in the same recovery transaction as release and Phase 9 completion. No active state is recreated.

### D5 — Bundle proof verifies identity

`verifyReleaseGateDurableForArchive` rejects a bundle projection whose internal `change.id` differs from the requested `changeId`, before accepting release evidence.

## Test Strategy

1. RED integration fixture: existing bundle, no active projection, lifecycle open/absent, release pending; current command repairs state then fails proof or active retire.
2. GREEN: handler routes to reconciliation and returns success; bundle has release, Phase 9, and terminal lifecycle state.
3. Race fallback: `recoveryMutation=true` selects bundle proof and skips active retire/cleanup.
4. Exact replay: no extra projection revision or side effects.
5. Active-path regression: proof remains active-backed when recovery mutation is absent.
6. Foreign-ID, corrupt, and mismatched bundle regressions remain fail-closed.

## Spec-Law Impact

No change. Existing `rq-releaseProjectionDurability01.3` and `rq-archiveTerminalDurability01.1` already mandate bundle-backed recovery, readback, terminal convergence, and no active recreation.

## Validation

Independent validator verdict: **CONFIRMED_WITH_CAUTION**, high confidence. The original conditional proof fix was necessary but insufficient because the handler would next attempt active-only retirement. This design incorporates all required cautions: clean-absence early routing, bundle identity verification, lifecycle convergence, real handler-level regression coverage, and a race fallback that cannot reach active cleanup.