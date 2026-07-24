## Executive Summary

### What changed
Fixed two archive-flow reliability defects that could permanently wedge changes in a half-converged state (`status: archived` but `lifecycleState: open`, release projection `pending`).

1. **Bounded archive-gate query** (AC1/AC2): The pre-signal release-gate query in `completeReleaseGateAfterFinalization` now has a 3s deadline via `runTemporalRead` + `AbortController`, with a `describe()` pre-check that detects terminated workflows. Previously, this query hung indefinitely on orphaned/terminated workflows, blocking the entire archive at the 15s tool timeout before reaching the disk-recovery path.

2. **Atomic convergence signal** (AC3/AC5): New `archiveConvergedSignal` (`wf.patched("archive-converged-v1")`) applies release-gate completion + Phase 9 done + archive request in a single Workflow Task, eliminating the death-window where separate signals could leave split state. Full rollback on failure ensures no half-converged state can persist.

3. **Dead-workflow recovery writer** (AC4/AC6): `saveRecoveredArchiveConvergence()` writes all converged fields in a single `saveChange` call for changes whose workflow died before convergence. Requires shipped proof (merge commit + valid archive bundle) — forge-guard preserved.

### Why it matters
Without these fixes, any workflow death during the archive convergence window left a change permanently stuck — no tool could repair the `archived-but-unconverged` state. The bounded query also prevents 15-minute archive hangs on orphaned workflows (experienced firsthand during the `fixArchiveMissingWorkflow` retirement).

### Verification
- 170+ tests pass across archive-gate, archive-phase9, archive-convergence, change-state, and replay-determinism suites
- Split-state invariant test proves `status: archived` always carries `release: done` + `phase9_status: done`
- `pnpm run check` green (schemas, typecheck, manifests, lint, format)
- PR #318 merged to trunk (`578bd7aa`)
