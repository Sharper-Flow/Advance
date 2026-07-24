# Contract Traceability

**Change ID:** fixChangeShowGateProjectionLag
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T23:33:36.435Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Non-release gate cache freshness red→green test in gate.test.ts; 63 gate tests passing. After planning gate completion, store.changes.get returns fresh gates. |
| AC2 | acceptance_criterion | pass | test | Snapshot ↔ top-level parity test in change.test.ts; after discovery gate completion, _contextSnapshot gate markers match top-level gates for every gate. |
| AC3 | acceptance_criterion | pass | test | Archived all-gates-done terminal classification test in worktree/index-delete.test.ts; worktree delete classifies archived change as terminal. |
| AC4 | acceptance_criterion | pass | test | Read path unchanged; gate-status-fail-closed tests green in 292-test regression sweep. Existing TemporalReadContext + disk fallback handles degradation. |
| AC5 | acceptance_criterion | pass | test | store.changes.invalidate is in gate-complete WRITE path only (gate.ts:1186, 1958). adv_change_show source unchanged — no signals or writes added to the read path. |
| AC6 | acceptance_criterion | pass | test | Poisoned-history/fail-closed tests green in regression sweep. No changes to read-failure classification. |
| SC1 | success_criterion | pass | review | Cache invalidated after every gate completion (both paths) — no stale stuck/pending projection possible. |
| SC2 | success_criterion | pass | review | AC3 test proves worktree delete succeeds for archived change without manual repair. |
| SC3 | success_criterion | pass | review | Root cause fixed at the signal-fire path; the re-poisoned cache that triggered adv-temporal-repair is eliminated. |
| DONT1 | avoidance | respected | review | Authoritative gate store, workflow signal mechanism (getGateStatusQuery), and gate reducers in change-state.ts unchanged. |
| DONT2 | avoidance | respected | review | Directive/phase-plan derivation pipeline unchanged. |
| DONT3 | avoidance | respected | review | temporal_query_fallback / poisoned-history disk-projection path unchanged. |
| DONT4 | avoidance | respected | review | No material read latency added; invalidate is in write path only, read path unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-dff3cb5d1a9a | AC1 | AC1 |  |  |
| tk-a4eeb779339a |  | AC2, AC3 |  |  |
| tk-2d52de486bfa |  | AC4, AC5, AC6 |  |  |
