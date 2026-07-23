# Contract Traceability

**Change ID:** fixArchiveReleaseGateRead
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T20:26:58.467Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | RED tr_mrxy56xv → GREEN tr_mrxy5rgl (10 tests): QUERY_TIMEOUT_MS env-configurable via ADV_TEMPORAL_QUERY_TIMEOUT_MS, finite-positive validation, default raised 5s→15s |
| AC2 | acceptance_criterion | pass | test | gate.ts release-gate caller invalidates cache after fireSignalAndRefresh confirms done; createMockStore invalidate spy added; no-breakage (125 tests, tr_mrxydwys) |
| AC3 | acceptance_criterion | pass | test | RED tr_mrxy7c7z → GREEN tr_mrxy87k0: archive alreadyDone branch calls store.changes.invalidate before returning ok |
| AC4 | acceptance_criterion | not_applicable | test | Gap 3 hypothesis disproven by independent validator: loadChange and saveRecoveredGateCompletion use identical store.paths.changes path — no archive-store-vs-live-disk disconnect. Real archive-blocking cause was Gaps 1+2 (query timeout + cache poisoning), now fixed. No additional fix needed. |
| AC5 | acceptance_criterion | pass | test | tr_mrxyhs3b: two-path forge-guard regression — non-shipped+forged reason rejected (strict match); shipped+done(no audit, non-matching evidence) accepted via shipped bypass. RELEASE_GATE_RECOVERY_REASONS allowlist unchanged. |
| AC6 | acceptance_criterion | pass | test | pnpm run check green (tr_mrxyfrvr: schemas/typecheck/lint/format/manifests/test-isolation/lockfile); 153/154 tests pass — 1 failure pre-existing (retry-wrapper unhandled error, proven identical on trunk, unrelated to this change) |
| C1 | constraint | respected | static_check | store-backed read remains authority (strengthened: now observes done via raised timeout + cache invalidation); no caller-trusted bypass |
| C2 | constraint | respected | static_check | recovery writer (saveRecoveredGateCompletion) authority unchanged — completed/poisoned-workflow only; not broadened |
| C3 | constraint | respected | static_check | RELEASE_GATE_RECOVERY_REASONS allowlist unchanged — no new entries added |
| C4 | constraint | respected | static_check | git-finalize / Phase 9 evidence path untouched |
| C5 | constraint | respected | static_check | invalidate is cache-drop only (store.changes.invalidate, #305 primitive) — no readback, no disk write on the invalidate path |
| DONT1 | avoidance | respected | review | no caller-trusted flag or evidence-match bypass introduced |
| DONT2 | avoidance | respected | review | archive store not made mutable from recovery/arbitrary paths — only convergence writes it |
| DONT3 | avoidance | respected | review | no polling loops or unbounded waits — env-configurable timeout is bounded (finite-positive) |
| DONT4 | avoidance | respected | review | no unrelated store paths touched (wisdom, epics, deltas) — scope is archive release-gate read convergence |
| DONT5 | avoidance | respected | review | minimal read-convergence patch — not broadened into the disk-authoritative refactor (makeReadsDiskAuthoritative's scope) |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d4f701454b01 | AC2, AC3 | AC2, AC3 | C5 |  |
| tk-a417d64115d8 |  | AC1 | C1 |  |
| tk-50874b5fa649 |  | AC4, AC5, AC6 | C2, C3 |  |
