# Archive: remove positional artifact API

**Change ID:** removePositionalArtifactApi
**Archived:** 2026-05-28T14:21:15.244Z
**Created:** 2026-05-28T04:29:38.212Z

## Tasks Completed

- ✅ T1: Add canonical ArtifactKind + ArtifactPayload + size cap constants
  > Task checkpoint completed
- ✅ T2: Unify ArtifactKind across temporal/contracts.ts, temporal/activities.ts, types/gates.ts
  > Task checkpoint completed
- ✅ T3: Extend ChangeWorkflowState.documents to 6 fields
  > Task checkpoint completed
- ✅ T5: Options-object Store interface (additive overload alongside positional)
  > Task checkpoint completed
- ✅ T4: Add executiveSummaryUpdatedSignal + acceptanceUpdatedSignal (defs, reducers, handlers, seedState, continueAsNew)
  > Task checkpoint completed
- ✅ T6: Options-object disk store implementation
  > Task checkpoint completed
- ✅ T7: Options-object temporal store with signal fan-out + Layer 1 size validation
  > Task checkpoint completed
- ✅ T8: Layer 2 state-mutation rejection in 6 signal handlers (KD-8)
  > Task checkpoint completed
- ✅ T9: Implement readArtifact + readArtifacts (Temporal-first, batched, archive-bundle fallback)
  > Task checkpoint completed
- ✅ T10: Migrate 15 read callsites to readArtifact/readArtifacts; delete legacy fallback helpers
  > Task checkpoint completed
- ✅ T11: Workflow-start hydration with partial-write robustness (KD-5)
  > Task checkpoint completed
- ✅ T12: Migrate gate.ts acceptance writes to store.changes.updateArtifacts
  > Task checkpoint completed
- ✅ T13: Implement materializeBundleArtifactsActivity (KD-13)
  > Task checkpoint completed
- ✅ T14: Crash-recovery semantics test + docs/temporal-recovery.md update
  > Task checkpoint completed
- ✅ T15: Remove legacy.changes artifact-content disk writes from temporal store production path
  > Task checkpoint completed
- ✅ T16: Cross-session smoke test (AC2) + consumer-alignment tests (AC7)
  > Task checkpoint completed
- ✅ T17: Migrate production write callsites + recovery-writers to options-object API
  > Task checkpoint completed
- ✅ T18: Migrate ~30 test fixture sites to options-object API
  > Task checkpoint completed
- ✅ T19: AC6 signal invariant test + replay safety test
  > Task checkpoint completed
- ✅ T20: Grep sweep + delete positional signatures (AC3 atomic removal)
  > Task checkpoint completed
- ✅ T21: Full lifecycle integration test (AC12)
  > Task checkpoint completed
- ✅ T22: Final build + check + invariant lock verification
  > Task checkpoint completed

## Specs Modified

