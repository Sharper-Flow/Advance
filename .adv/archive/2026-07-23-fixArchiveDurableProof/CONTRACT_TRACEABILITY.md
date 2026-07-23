# Contract Traceability

**Change ID:** fixArchiveDurableProof
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T19:09:06.763Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | #305 cache-poisoning repro (archive-gate.test.ts): refresh readback returns stale pending after poll saw done; verifyReleaseGateDurableForArchive observes release=done post-fix. Run tr_mrxtk3k2_9c1b3ec2. |
| AC2 | acceptance_criterion | pass | test | Corrected rev-2 criterion: verifyReleaseGateDurableForArchive observes release=done via store-backed read (getTemporalChange fresh query after cache invalidation), rq-releaseProjectionDurability01.1. Asserted by the #305 repro (source:store). No recovery write, no caller-trusted state. Run tr_mrxtk3k2. |
| AC3 | acceptance_criterion | pass | test | refresh->invalidate swap eliminates voidPersist on the confirmed-done branch (no readback, no disk write); repro models the cache-poisoning race and asserts done. Run tr_mrxtk3k2. |
| AC4 | acceptance_criterion | pass | test | Forge-guard regression: non-shipped change with forged/unrecognized recovery_audit rejected. Proof/disk-fallback/recovery-writer/allowlist unchanged. Run tr_mrxtk3k2. |
| AC5 | acceptance_criterion | pass | test | Cache-drop only (store.changes.invalidate -> invalidateChange); no git writes, no workflow start, no new signals beyond gateCompletedSignal. Diff ec0e9136..HEAD confirms. |
| SC1 | success_criterion | pass | review | archive-gate.test.ts green incl #305 repro + AC4 forge-guard (15 tests, run tr_mrxtk3k2). |
| SC2 | success_criterion | pass | review | completeReleaseGateAfterFinalization confirmed-done branch calls invalidate before ok; proof reads release=done on store-backed path (source:store). |
| SC3 | success_criterion | pass | review | T3 ambiguous-signal + fixPhase9StatusSignal (updated to assert invalidate after poll) tests green. Run tr_mrxtk3k2. |
| SC4 | success_criterion | pass | review | change.archive-phase9.test.ts green (47 tests, run tr_mrxtl2fi) — no Store-interface regression from the new invalidate. |
| C1 | constraint | respected | static_check | Independent-check preserved: verifyReleaseGateDurableForArchive/loadAuditedDiskReleaseGate unchanged; no caller-trusted gate. rq-releaseProjectionDurability01.1 satisfied via fresh query. |
| C2 | constraint | respected | static_check | RELEASE_GATE_RECOVERY_REASONS allowlist unchanged; no new provenance reason. |
| C3 | constraint | respected | static_check | No git/workflow mutation; cache-drop only. |
| C4 | constraint | respected | static_check | bin/oc-test targeted used (avoids #304 replay loop). |
| C5 | constraint | respected | static_check | Reuses existing internal invalidateChange via thin public store.changes.invalidate. Recovery writer deliberately not reused (spec-forbidden on running workflows). |
| DONT1 | avoidance | respected | review | Proof not weakened; no caller-trusted gate without recovery_audit. Proof/disk-fallback unchanged. |
| DONT2 | avoidance | respected | review | No sleep/retry loop; deterministic single cache-drop. |
| DONT3 | avoidance | respected | review | Allowlist not widened; no new recovery reason. |
| DONT4 | avoidance | respected | review | refresh not removed globally; only swapped to invalidate on the confirmed-done branch. Cache freshness preserved. Other refresh callers untouched (reviewer-confirmed). |
| DONT5 | avoidance | respected | review | No git writes, workflow starts, or new signals beyond gateCompletedSignal. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a4009c8fe612 |  | AC1, AC2, AC3 | C4 |  |
| tk-1240df801d90 |  | AC4, SC1, SC3, SC4 | C4 |  |
| tk-eb32ec12476f | AC1 | AC5 | C1, C3, C5 |  |
