# Contract Traceability

**Change ID:** remediateSlopScanFindings
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-02T17:25:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Layer-1 aggregate-size precheck bug fixed (changes.ts unwrap) + AC2 RED→GREEN regression; full suite 3469/3469 green. |
| SC2 | success_criterion | pass | review | Heuristic gate-block (AC4) softened to warning + recovery classification (AC5) tightened with canonical locked test; no heuristic solely owns a correctness boundary. |
| SC3 | success_criterion | pass | review | AC6: 3 as-unknown-as casts removed, fields typed on ChangeSchema; typecheck + schemas:check green. |
| SC4 | success_criterion | pass | review | AC7 recovery dedup + AC8 gate split + AC9 status extraction; behavior-preserving, gate/contract/status suites green; reviewer READY. |
| SC5 | success_criterion | pass | review | AC10-12 resolved; pnpm install + pnpm run check + build green. |
| AC1 | acceptance_criterion | pass | test | store-temporal/changes.ts updateArtifacts unwraps snapshot.success && snapshot.data before reading .documents. |
| AC2 | acceptance_criterion | pass | test | changes.test.ts 'aggregate-size precheck counts existing documents (AC2)' failed RED (resolved instead of rejecting), passes GREEN after unwrap. |
| AC3 | acceptance_criterion | pass | test | artifact-payload-signal-invariant.test.ts:86 fixture corrected to {success:true,data:{documents:{}}}. |
| AC4 | acceptance_criterion | pass | test | prep-readiness.ts heuristic inversion now severity 'warning'; prep-readiness.test.ts covers strict/advisory/off + missing-intent still blocks; spec rq-PR003tdd.1 amended (valid JSON). |
| AC5 | acceptance_criterion | pass | test | recovery-classification.ts exact-name-set + mid-string message regexes; recovery-classification.test.ts near-miss returns false; locked changes.test.ts:25-70 phrasings still pass. |
| AC6 | acceptance_criterion | pass | test | SignalRejection/SignalPayloadDigest Zod schemas + 3 optional ChangeSchema fields; casts removed; changes.signal-fields.test.ts green; schemas:generate updated change.schema.json; workflow-bundle-boundary green. |
| AC7 | acceptance_criterion | pass | test | classifyCompletedOrPoisonedRecovery combinator; 4 symmetric gate/contract sites delegate; completed-only sites unchanged (no broadening per D5); change.ts lazy/dynamic-import sites intentionally preserved (documented). Reviewer fixed call-site gating to keep || short-circuit; gate/contract/recovery-probe suites green (64 tests). |
| AC8 | acceptance_criterion | pass | test | resolveAcceptanceRecoveryArtifactEvidence extracted; completeGateViaRecovery entrypoint signature unchanged; no-review-matrix path returns fallback unchanged; gate suites green. |
| AC9 | acceptance_criterion | pass | test | Named-function extraction (user-approved over literal registry): computeAutoManagedCensus, deriveOpencodeDebtCounts (unit-tested), buildTemporalHealthFallback, pushQueueServiceabilityRecommendations; handler complexity ~80→54; ordering/dependency/side-effects preserved; status.test.ts green. |
| AC10 | acceptance_criterion | pass | test | package.json @opencode-ai/plugin pinned latest→^1.15.7; lockfile resolves 1.15.7. |
| AC11 | acceptance_criterion | pass | test | Direct postcss devDep removed; security floor relocated to pnpm-workspace.yaml override postcss>=8.5.10; still resolves 8.5.10 transitively. |
| AC12 | acceptance_criterion | pass | test | .pnpmrc.yaml allowBuild reduced to ['esbuild']; better-sqlite3 removed (absent from tree). |
| AC13 | acceptance_criterion | pass | test | pnpm run check green (schemas/typecheck/test-isolation/lockfile-policy/lint/format); bin/oc-test full = 257 files / 3469 tests / 0 failures; build success. |
| C1 | constraint | respected | static_check | git log A→B→D→C: commits 6d362ae(A), 44cff8e/180af55/f62ccda(B), 7384e6a(D), 7aaea02/d97fc72/785676d(C); behavior-changing/hardening committed before refactors. |
| C2 | constraint | respected | static_check | Workstream C refactors verified behavior-preserving against existing gate/contract/status suites; full suite 3469/3469. |
| C3 | constraint | respected | static_check | All implementation ran in change/remediateSlopScanFindings worktree (worktree_auto_managed). |
| C4 | constraint | respected | static_check | pnpm run schemas:generate run after schema change; schemas:check green; change.schema.json committed. |
| DONT1 | avoidance | respected | review | tools/change.ts NOT split into a directory; only catch-block recovery logic touched. |
| DONT2 | avoidance | respected | review | isWorkflowCompletedError keeps mid-string message recognition (not name-only); canonical test enumerates phrasings + near-miss negative. |
| DONT3 | avoidance | respected | review | No slop-scan re-run or scope broadening; scope limited to the 10 validated findings. |
| DONT4 | avoidance | respected | review | Layer-2 signal-handler size guard (change-state.size-guard) untouched; only Layer-1 unwrap fixed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | change.ts directory restructure intentionally not attempted. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Phase 2 scanner re-run intentionally not performed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-76304d835f91 | AC1, AC3, SC1 | AC2 | DONT4, DONT1 |  |
| tk-3f2779f01241 | AC4, SC2 | AC4 | DONT1 |  |
| tk-122c898e0b68 | AC5, SC2 | AC5 | DONT2, DONT1 |  |
| tk-781814f13de6 | AC6, SC3 |  | C4, DONT1 |  |
| tk-04c4f239ecf1 | AC10, AC11, AC12, SC5 |  | DONT1 |  |
| tk-4782c43b5d75 | AC7, SC4 |  | C2, DONT1, DONT2 |  |
| tk-ba2819ed4314 | AC9, SC4 |  | C2, C1, DONT1 |  |
| tk-4c7ba1fbba48 | AC8, SC4 |  | C2, DONT1 |  |
| tk-2d68bb96f0df |  | AC13 | C2, C4, DONT1 |  |
