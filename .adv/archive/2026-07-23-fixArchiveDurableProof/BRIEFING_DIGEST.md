# Archive Briefing Digest

**Change ID:** fixArchiveDurableProof
**Title:** Fix archive durable-proof projection staleness
**Status:** archived
**Generated:** 2026-07-23T19:09:42.046Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #305

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 11 of 11 durable facts.

- **[archive_only_evidence]** decisions: Added store.changes.invalidate as a cache-drop-only method, distinct from refresh — refresh issues a readback query via dualWriteAfterMutation that can race with the workflow signal handler and re-poison changeCache with a stale pre-signal 'pending' snapshot. invalidate drops the cache entry only, so the next store.gates.get misses cache and queries fresh.
- **[archive_only_evidence]** decisions: Swapped refresh→invalidate on the confirmed-done branch of completeReleaseGateAfterFinalization — The poll has already authoritatively confirmed release=done; a readback is unnecessary and is the source of the #305 residual race.
- **[archive_only_evidence]** decisions: Updated the fixPhase9StatusSignal ordering test to assert invalidate (not refresh) is called after the poll observes done — The fix replaces refresh with invalidate on this branch; the existing test's invariant (cache-mutating call happens only after done is observed) still holds, but the method name changed.
- **[archive_only_evidence]** decisions: Added invalidate to all Store['changes'] test stubs (archive-gate.test.ts, change.archive-phase9.test.ts) — The Store interface now requires invalidate; stubs must satisfy the contract so TypeScript/runtime callers do not fail.
- **[archive_only_evidence]** decisions: Added AC4 forge-guard regression test for a non-shipped change with a forged recovery_audit reason — Rev 2 does not touch the proof/disk-fallback/allowlist; this test guards that the existing strict evidence-match guard still rejects forged audits on non-shipped changes.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts -t "#305 residual cache-poisoning race" (1) — RED phase: test failed as expected with cache-poisoning assertion (durableProof.ok false, did not observe release done)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts -t "#305 residual cache-poisoning race" (0) — GREEN phase: same test passes after implementing store.changes.invalidate and refresh→invalidate swap
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts (0) — VERIFY phase: 62 tests pass across archive-gate and change.archive-phase9 suites; forge-guard regression (AC4) added and passing
- **[archive_only_evidence]** verification: pnpm run check (0) — Typecheck, lint, format, schemas, manifests, test-isolation, and lockfile policy all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrxt4ssd_4e3f89df
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mrxt74cp_e5732b23

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrxt4ssd_4e3f89df
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mrxt74cp_e5732b23
