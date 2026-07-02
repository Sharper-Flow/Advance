# Contract Traceability

**Change ID:** fixReconnaissanceRisks
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T20:24:18.247Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | worktreeSetupFailedSignal persists cross-session setup_failed with reason. RED→GREEN in index-create.test.ts; spec rq-wl-setupReadiness01 tightened with new scenario .3. Verified at commit 345cf76051f3. |
| SC2 | success_criterion | pass | review | plugin/src/shared/cli-projection.ts zero-import shared module. bin/lib re-exports. cli-gate-order-parity.test.ts asserts structural equality with plugin GATE_DEFS-derived GATE_ORDER; cli-projection-import-safety.test.ts Bun smoke. Verified at commit 737dab1ffee. |
| SC3 | success_criterion | pass | review | tk-57f7f74f98a8 retired addSession/removeSession/getSession/registerSession/unregisterSession/getSessionRecord dead reuse paths in worktree/index.ts and plugin/src/index.ts. state-session-lifecycle.test.ts adds retired-contract assertions. Verified at commit 3c6beff62d7. |
| SC4 | success_criterion | pass | review | tk-04d973fb7b3d (status 2077→786, 4 new modules) and tk-86ff2357e525 (change 6183→3838, 4 new modules). Full Vitest suite 4419 passed; 5 pre-existing base-branch failures verified bit-identical to base 1818d9d (zero regressions). Verified at commits b74d24f307e + 28bbbedb4cc. |
| SC5 | success_criterion | pass | review | store-disk.ts: silent wisdom catch replaced with bounded logger.warn (200-char truncation + path meta); Math.random IDs replaced with monotonic Date.now+seq helper. store-disk.test.ts (NEW) covers both. Verified at commit c8b3af455. |
| SC6 | success_criterion | pass | review | tk-402adcd9e2a2 reconciled 9 overlapping agenda items: ag-3hjQOLnK + ag-y2ambs_C + ag-8PsBFRPF + ag-fR-3HtIv + ag-4m0dfDad absorbed; ag-VH206pZN + ag-3R8zLZVl + ag-FOcJp39X + ag-Q3Zwr4LU cross-linked with completion notes referencing fixReconnaissanceRisks. |
| AC1 | acceptance_criterion | pass | test | tk-7d028c421a6a: index-create.test.ts asserts cross-session advWorktreeResume returns SETUP_FAILED with recorded reason after simulated setup_failed signal persists. Warrant spec:rq-wl-resumeTool01 honored (spec body + scenario .2 mandates SETUP_FAILED on resume; behavior matches). 70 tests passed across 4 worktree/signal/boundary files. |
| AC2 | acceptance_criterion | pass | test | tk-7d028c421a6a: state-record-probe.test.ts asserts getWorktreeRecord returns status="setup_failed" + setupFailureReason after the new signal is applied. Warrant spec:rq-wl-setupReadiness01 honored (spec body tightened + scenario .3 added in tk-8ab52bd86601). |
| AC3 | acceptance_criterion | pass | test | tk-7d028c421a6a: updateWorktreeRecord function and all 3 call sites removed (state.ts:23 deletions). File-verified: rg updateWorktreeRecord plugin/src excl. tests → NO_PRODUCTION_REFERENCES. Replaced with worktreeSetupFailedSignal at the failure sites. |
| AC4 | acceptance_criterion | pass | test | tk-57f7f74f98a8: index.ts:1233 addSession success-path and ag-3hjQOLnK dead reuse path removed. state-session-lifecycle.test.ts extended with retired-contract tests for addSession/removeSession/getSession/getSessionRecord/listSessions. 21 lifecycle + 13 session + 213 worktree tests pass. |
| AC5 | acceptance_criterion | pass | test | tk-d71adcdae0d3: cli-gate-order-parity.test.ts structural equality + source-level re-export check. Drift test fails when plugin/CLI gate orders diverge. |
| AC6 | acceptance_criterion | pass | test | tk-d71adcdae0d3: bin/lib/cli-projection-import-safety.test.ts — Bun smoke test dynamically imports shared module + statically forbids Temporal/storage/zod/node:* imports. bun bin/adv --version runs. 38 bun tests pass. |
| AC7 | acceptance_criterion | pass | test | tk-04d973fb7b3d + tk-86ff2357e525 + tk-85b3df2cadf0: status 2077→786, change 6183→3838. Full Vitest 4419 passed (5 pre-existing base-branch failures bit-identical to base). pnpm run check fully green. Behavior preserved per full suite oracle. |
| AC8 | acceptance_criterion | pass | test | tk-8e94e60b7467: store-disk.test.ts asserts warning fires on unreadable project wisdom + IDs match monotonic format. 9 storage tests pass; typecheck + check pass. |
| AC9 | acceptance_criterion | pass | test | tk-85b3df2cadf0: pnpm run check fully green (schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check). Full Vitest: 4419 passed; 5 pre-existing base-branch failures verified bit-identical (git diff base HEAD -- <5 test files> empty). RED→GREEN across Slice A. |
| AC10 | acceptance_criterion | pass | test | tk-85b3df2cadf0 + tk-402adcd9e2a2: each of the 5 reconnaissance findings ends fixed-with-evidence (commits 345cf76051f3, 3c6beff62d7, 737dab1ffee, c8b3af455, b74d24f307e, 28bbbedb4cc) OR explicitly reconciled to an agenda item (9 agenda items reconciled: 5 absorbed, 4 cross-linked). |
| C1 | constraint | respected | static_check | worktree-lifecycle spec delta landed (tk-8ab52bd86601). Specs remain laws; implementation honors updated rq-wl-setupReadiness01. worktree-lifecycle v1.7.0+. |
| C2 | constraint | respected | static_check | worktreeSetupFailedSignal is a defineSignal; no defineUpdate added to change-workflow surface. workflow-bundle-boundary.test.ts continues to pass. Decomposition used pure move + re-export (no architectural change to surface). |
| C3 | constraint | respected | static_check | All implementation runs from ADV-managed worktree change/fixReconnaissanceRisks (paths in engine spawn prompts and tool calls). |
| C4 | constraint | respected | static_check | Decomposition is pure move + re-export; full Vitest suite (4419 passed) + pnpm run check (green) prove behavior preservation. No gate-model or archive-flow semantic changes. |
| C5 | constraint | respected | static_check | Runtime is Bun (bin/adv); tests run on Node/Vitest from plugin/. pnpm run check passes; bin/oc-test targeted/full available. |
| C6 | constraint | respected | static_check | plugin/src/shared/cli-projection.ts has zero imports beyond plain TS. cli-projection-import-safety.test.ts statically forbids Temporal/storage/zod/node:* imports. bun bin/adv --version runs. |
| DONT1 | avoidance | respected | review | Session-registry retirement (tk-57f7f74f98a8) removed heuristic dependency; durable workflow record is the authority for getWorktreeRecord reads. |
| DONT2 | avoidance | respected | review | worktreeSetupFailedSignal persists via Temporal signal (not disk projection). fireWorktreeSignal degrades gracefully when Temporal unavailable but never throws over the original setup error (DDC5). |
| DONT3 | avoidance | respected | review | plugin/src/shared/cli-projection.ts is a read-only zero-import shared module. No new CLI mutation authority. |
| DONT4 | avoidance | respected | review | tk-8e94e60b7467: replaced silent catch {} with bounded logger.warn (200-char truncation + path meta). Bounded diagnostic surfaced. |
| DONT5 | avoidance | respected | review | Decomposition + cleanup scoped to owned surfaces (worktree/index.ts, status.ts, change.ts, store-disk.ts, bin/lib/{types,changes}.ts, shared/cli-projection.ts). No unrelated repo-wide refactor. 3 cross-linked follow-ups tracked: bin/lib/dashboard/attention.ts GATE_ORDER, archive/delta.ts sort fallback, explicit regression tests. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d71adcdae0d3 | SC2, AC5, AC6 |  | C6 |  |
| tk-8e94e60b7467 | SC5, AC8 |  | DONT4 |  |
| tk-7d028c421a6a | AC1, AC2, AC3, SC1 |  | C1, C2, C3 |  |
| tk-57f7f74f98a8 | AC4, SC3 |  | DONT1, DONT5 |  |
| tk-8ab52bd86601 | SC1, SC6 |  | C1, C2 |  |
| tk-04d973fb7b3d | SC4, AC7 |  | DONT5, C2, C4 |  |
| tk-86ff2357e525 | SC4, AC7 |  | DONT5, C2, C4 |  |
| tk-85b3df2cadf0 |  | AC9, AC10 | C5 |  |
| tk-402adcd9e2a2 | AC10, SC6 |  | DONT5 |  |
