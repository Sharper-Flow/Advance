# Contract Traceability

**Change ID:** gateMutationSuccessDisk
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T06:00:04.435Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | disk-persist.test.ts red→green (tr_mrx353cw→tr_mrx35op8) + spec-deltas propagation test (tr_mrx3gy54): a durability-critical mutation whose disk write fails now throws DiskProjectionPersistError instead of returning success:true with the mutation absent from disk. |
| AC2 | acceptance_criterion | pass | test | spec-deltas.test.ts asserts persistStateToDiskDurable called with the confirmed state on success; tasks.durability.test.ts (tr_mrx3nr05) asserts persistAndRefreshDurable(changeId, state). success ⇒ awaited+confirmed atomic disk write (saveChange→atomicWriteFile). |
| AC3 | acceptance_criterion | pass | test | SC4 guard (fireSignalWithMutationGuard/enforceMutationEligibilityForError, gates.ts:46-86) untouched; throws at signal dispatch before the disk write. 1344-test regression sweep (tr_mrx3oi3v) incl. SC4/mutation-safety suites green. |
| AC4 | acceptance_criterion | pass | test | Read path unmodified; reads remain disk-first with no Temporal dependency added. bounded-read-deadline + index disk-fallback suites green in tr_mrx3oi3v. Dogfooded live this session: disk read 40ms while the workflow was fully wedged. |
| AC5 | acceptance_criterion | pass | test | persistStateToDisk returns typed DiskPersistOutcome {kind:'failed',error}; assertDurablePersist throws typed DiskProjectionPersistError (disk-persist.test.ts). Durability-critical failures surfaced, not swallowed at debug. |
| AC6 | acceptance_criterion | pass | test | Durability-critical set (spec-deltas×6, gates×2, wisdom×1, tasks×4) awaits+throws via persistStateToDiskDurable/persistAndRefreshDurable; non-critical dualWriteAfterMutation uses explicit voidPersist. spec-deltas propagation + tasks.durability.test.ts + full store-temporal suite 223/223 (tr_mrx3hcjv). |
| AC7 | acceptance_criterion | pass | test | DiskProjectionPersistError encodes ambiguous no-blind-retry semantics ('may be durable in Temporal', 'do not blind-retry') — asserted in disk-persist.test.ts; propagated by callers (spec-deltas + tasks propagation tests). |
| C1 | constraint | respected | static_check | No Temporal dependency added to any read path; only the write path gained an awaited disk write. tsc clean + read-suite regression green (tr_mrx3oi3v). |
| C2 | constraint | respected | static_check | No reducer changes; change-state.ts append-only delta semantics untouched; archive remains sole global-spec writer. 1344-test sweep green. |
| C3 | constraint | respected | static_check | Non-critical dualWriteAfterMutation (changes.refresh/epic) stays fire-and-forget via explicit voidPersist; only the enumerated durability-critical set pays the awaited-disk gate (AC6 classification). |
| DONT1 | avoidance | respected | review | SC4 guard untouched; the durable variant EXTENDS no-false-success to the disk layer (throws on disk-fail), never weakens it. AC3 regression green. |
| DONT2 | avoidance | respected | review | No hard Temporal read dependency introduced; the concurrent reseed/stale-overwrite races are explicitly deferred to Epic entry 6, not papered over via read-path Temporal coupling. |
| DONT3 | avoidance | respected | review | No monotonic projectionRevision/CAS field added to the replay-sensitive reducer or CAN seed; change-state.ts + workflows.ts seed unmodified. Concurrency serialization deferred to entry 6 (design.md + wisdom ws-V_e5tl). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cd8b73029883 | AC1, AC2, AC5, AC7 |  | C1 |  |
| tk-5e4b41a7372e | AC6 |  | C1, C3 |  |
| tk-36e322d5bba4 |  | AC3, AC4, AC6, AC7 | C1, C2 |  |
