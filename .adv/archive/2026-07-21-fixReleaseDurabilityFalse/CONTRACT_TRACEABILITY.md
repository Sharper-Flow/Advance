# Contract Traceability

**Change ID:** fixReleaseDurabilityFalse
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T23:49:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | change.archive-phase9.test.ts 'archives a shipped change whose done release gate lacks matching Phase 9 evidence' → success:true. Removes the status_repair fallback for shipped changes. Green tr_mrvaz2er. |
| SC2 | success_criterion | pass | review | AC2 unit test 'non-matching evidence + NOT shipped still fails'; safety analysis: finalization.status==='shipped' returned only on confirmed reachability/merge (git-finalize.ts 1739/2363/3034/3054). Unshipped → guard holds. |
| AC1 | acceptance_criterion | pass | test | change.archive-phase9.test.ts AC4 'manual free-text gate evidence + finalizationShipped accepts the durable proof' → ok:true (was RED pre-fix, tr_mrvavah1). |
| AC2 | acceptance_criterion | pass | test | AC2 'non-matching evidence + NOT shipped still fails' → ok:false with 'lacks matching Phase 9 evidence'. Guard preserved at verify level. |
| AC3 | acceptance_criterion | pass | test | AC3 'matching structured evidence accepts even when finalizationShipped is false' → ok:true. Archive-completed-gate path unchanged (backward compatible). |
| AC4 | acceptance_criterion | pass | test | Red→green evidenced: AC4 + squash-supersession regression failed pre-fix (tr_mrvavah1), pass post-fix (tr_mrvaz2er). Reproduces the manual-completion + admin/squash false-negative. |
| AC5 | acceptance_criterion | pass | test | pnpm run check green (typecheck confirms 3 call-site wiring). 41/41 change.archive-phase9 + 155/155 archive-gate+change tests pass. |
| C1 | constraint | respected | static_check | Acceptance tied to finalizationShipped (authoritative shipped evidence), not gate.status alone. AC2 proves unshipped still blocked. Safety analysis in design confirms shipped ⟹ reachable. |
| C2 | constraint | respected | static_check | finalizationShipped optional (default false → strict evidence match preserved); AC3 confirms archive-completed-gate path unchanged. Existing disk-recovery test unaffected. |
| C3 | constraint | respected | static_check | No new recovery tool or recovery mode added; removes a status_repair trigger. Only verify logic + 3 call-site wiring changed. |
| DONT1 | avoidance | respected | review | Acceptance requires finalizationShipped===true (from finalization.status==='shipped'), never gate.status==='done' alone. AC2 guard test confirms. |
| DONT2 | avoidance | respected | review | No operator-facing change; manual free-text gate completion is accepted as-is (AC4). Operators need not write structured evidence. |
| DONT3 | avoidance | respected | review | loadAuditedDiskReleaseGate (release!=done branch) unchanged — poisoned-history/disk-projection recovery path preserved with its hasGateRecoveryAudit + evidence-match requirement. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5b1c4b51a8a1 | SC1, SC2, AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
