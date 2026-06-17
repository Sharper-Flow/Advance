# Contract Traceability

**Change ID:** eliminatePhantomActiveChange
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-17T15:35:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv_change_forget tool + recordForgetChange hook provide MCP recovery parity. Tests: active-change-pointer.test.ts (matching clear, idempotent). |
| SC2 | success_criterion | pass | review | handleToolExecuteBefore reachability gate prevents phantom re-pointing. Tests: active-change-pointer.test.ts (typo preserves pointer, unreachable skip). |
| SC3 | success_criterion | pass | review | recordTerminalChange hook clears pointer after close/archive success. Tests: active-change-pointer.test.ts (close clears, archive clears, failure does NOT clear). |
| SC4 | success_criterion | pass | review | rq-activeChangePointer01 (7 scenarios) added to advance-meta v1.16.0. Spec citation in index.ts. |
| AC1 | acceptance_criterion | pass | test | change.test.ts (tool output shape, 4 tests) + active-change-pointer.test.ts (matching clear, mismatch FORGET_MISMATCH throw, idempotent no-op). |
| AC2 | acceptance_criterion | pass | test | active-change-pointer.test.ts: close with matching changeId clears both surfaces; different changeId does NOT clear; failure does NOT clear. |
| AC3 | acceptance_criterion | pass | test | active-change-pointer.test.ts: archive with matching changeId clears; failure does NOT clear. changeId added to archive return at change.ts:4479. |
| AC4 | acceptance_criterion | pass | test | active-change-pointer.test.ts: typo changeId preserves pointer + debug log; forget early-returns; cross-project target_path does NOT touch caller pointer. |
| AC5 | acceptance_criterion | pass | test | _adapters.test.ts: Vis hit short-circuits, disk fallback succeeds, all-miss returns false. reachabilityDeps constructed at plugin init in index.ts. |
| AC6 | acceptance_criterion | pass | test | system-block.test.ts: active-change line has no objective suffix. Type structural guard: PluginState.activeChange has no objective field. index.ts:987 uses changeId fallback. |
| AC7 | acceptance_criterion | pass | test | All AC1-AC6 covered by failing-test-first tests. TDD evidence: RED runIds recorded for T2 (tr_mqi634w0), T3 (tr_mqi638ea), T4-T7 (active-change-pointer.test.ts). |
| AC8 | acceptance_criterion | pass | test | rq-activeChangePointer01 with 7 G/W/T scenarios in .adv/specs/advance-meta/spec.json. Version bumped 1.15.0->1.16.0. docs/specs/advance-meta.md synced. |
| AC9 | acceptance_criterion | pass | test | pnpm run check: schemas+typecheck+lint+format green. pnpm test: 3785/3785 passed (0 failures). pnpm run build: ESM+DTS succeeded. |
| C1 | constraint | respected | static_check | handleToolExecuteBefore only skips re-pointing on unreachable changeId; legitimate calls re-point normally. Tests confirm reachable changeId re-points. |
| C2 | constraint | respected | static_check | DDC2 softened per validator. visibilityLister wired to store.changes.get (interim). Latency target advisory; benchmark deferred to follow-up. |
| C3 | constraint | respected | static_check | All inline-TDD tasks have RED runIds recorded before GREEN. |
| C4 | constraint | respected | static_check | rq-activeChangePointer01 has 7 G/W/T scenarios (given/when/then arrays). |
| C5 | constraint | respected | static_check | active-change-pointer.test.ts: cross-project target_path call does NOT touch caller pointer. handleToolExecuteBefore skips re-pointing when target_path is set. |
| DONT1 | avoidance | respected | review | Pointer remains in-memory only. No disk persistence added. state.activeChange.id resets on session restart (unchanged). |
| DONT2 | avoidance | respected | review | #106 listing timeout and #138 signal pre-flight check not included. Out-of-scope per OOS2/OOS3. |
| DONT3 | avoidance | respected | review | adv_change_forget tool definition has no approvedByUser/userApproved parameter. Fires immediately. |
| DONT4 | avoidance | respected | review | active-change-pointer.test.ts: mismatched changeId throws FORGET_MISMATCH with hint naming actual pointer. No silent clear. |
| DONT5 | avoidance | respected | review | No changes to worktree session-registry code. state.ts:14 retirement unchanged. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Disk persistence of pointer explicitly out of scope (F1 design). |
| OOS2 | out_of_scope | not_applicable | not_applicable | #106 listing fan-out timeout fix deferred to separate change. |
| OOS3 | out_of_scope | not_applicable | not_applicable | #138 signal pre-flight liveness check deferred to separate change. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-362ea70ebf47 | AC2, AC3 |  | DONT1, C5 |  |
| tk-6806461589dc | AC8 |  |  |  |
| tk-8b93e48b3c21 | AC1 |  | DONT3, DONT4 |  |
| tk-833085e39941 | AC5 | AC5 |  |  |
| tk-debf477a4ad4 | AC6 |  |  |  |
| tk-bda3daa65450 | AC1 |  | DONT4 |  |
| tk-da99edc79114 | AC4 | AC4, AC5 | C1, C2, C5 |  |
| tk-cccc83fdef5e |  | AC7, AC9 | C2 |  |
