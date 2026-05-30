# Executive Summary — completeStateBackedGate

## Outcome
The ADV acceptance gate's non-recovery completion path is now fully state-backed, completing the Temporal-canonical migration begun by `removePositionalArtifactApi` and `fixGateArtifactReadiness`. Acceptance now derives its executive-summary proof from workflow state (`state.documents.executiveSummary` + `state.artifacts.executiveSummary.{path,contentHash}`) instead of inspecting a disk file that the Temporal-only store no longer writes. This unblocks acceptance for every change created after the disk-write removal.

## What was built
- **State-backed acceptance branch** (`workflows.ts`): new `STATE_BACKED_ACCEPTANCE_PROOF_PATCH` marker wraps a branch that reads proof from state via the new deterministic `stateBackedAcceptanceProof()` helper (`gate-readiness.ts`) — no `inspectArtifactActivity` disk read. The legacy `ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH` disk-inspect branch is retained solely for replay of pre-migration histories, evaluated after the new marker so old histories fall through deterministically.
- **Archive-bundle materialization (AC7)**: at acceptance the workflow writes `executive-summary.md` and `acceptance.md` to the active change dir via `writeArtifactActivity` (proxy kind union extended with `executiveSummary`), so the readdir-based `createInRepoArchive` includes them in the bundle.
- **readAgreement Temporal-first (AC8)**: `contract.ts` `readAgreement` now delegates to `readArtifact(store, id, "agreement")` (Temporal → disk → archive), eliminating the lone disk-first reader outlier. No import cycle.
- **updateArtifacts cache invalidation (AC9)**: `store-temporal/changes.ts` `updateArtifacts` now calls `invalidateChange(changeId)` after the content-signal fan-out — the confirmed root cause of the stale-contract read-after-write symptom (re-mint required after `adv_change_update`).

## What was verified
- **Tests**: TDD red→green across all 3 fix surfaces (10 tasks). New no-disk acceptance integration test, AC8 Temporal-fresh-over-stale-disk test, AC9 cache-invalidation test, AC3 patch-ordering guard, AC4/AC7 archive-bundle tests. Existing acceptance pattern tests migrated to the state-backed model. Full suite `pnpm test --maxWorkers=4` exit 0; `pnpm run check` exit 0; `pnpm run build` exit 0 (worker bundle compiled clean).
- **Scope (C4)**: `git diff` confirms recovery path (`gate.ts`, `_recovery-writers.ts`) and `inspectArtifactActivity` (`activities.ts`) have zero diff. 9 files touched total.
- **Replay safety (AC3/C3)**: patch-marker ordering invariant guarded by test; workflow-bundle-boundary + determinism guards pass.

## Remaining concerns
None blocking. The legacy `ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH` branch can be removed via `wf.deprecatePatch` once pre-migration acceptance histories are archived/closed and replay fixtures no longer cover the disk-inspect path (documented deprecation plan in workflows.ts).