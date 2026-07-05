# Contract Traceability

**Change ID:** validateReleaseRecovery
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T18:52:38.680Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | PR #193 merged at aa5681d93b40296252f71ff9ac921c4601ea3b16; source review verified gate.ts/archive-gate.ts read/proof paths. Task tk-92364ab3c250 recorded PR #193 adequate baseline plus tracked helper hardening. |
| AC2 | acceptance_criterion | pass | test | `hasGateRecoveryAudit` shared helper recognizes `recovery_audit.reason` / `.evidence`; gate.ts and archive-gate.ts use it. RED/GREEN `pnpm test -- src/tools/recovery-audit.test.ts`; targeted suite passed 62 tests. |
| AC3 | acceptance_criterion | pass | test | archive-gate durable proof still requires release `status: done`, recovery audit, and matching Phase 9 evidence; `change.archive-phase9.test.ts` passed in targeted suite. |
| AC4 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/recovery-audit.test.ts` passed: 3 files, 62 tests. |
| AC5 | acceptance_criterion | pass | test | `pnpm run build` passed; `./scripts/deploy-local.sh --fix` passed and reported `Restart OpenCode sessions to pick up changes.` Worker dist rebuilt by build command. |
| AC6 | acceptance_criterion | pass | test | Typed ADV read validation against PokeEdge recovered archived change returned release.status done, incomplete [], canArchive true, nextGate null, `_recovery.reason: poisoned_history`, and archived lifecycle state. |
| AC7 | acceptance_criterion | pass | test | PokeEdge `neutralizePricingDtos` target_path read showed release done, all gates checked in context snapshot, and status/lifecycleState archived; no target mutation performed. |
| AC8 | acceptance_criterion | pass | test | Process guardrail decision recorded in GitHub issue #194 comment https://github.com/Sharper-Flow/Advance/issues/194#issuecomment-4887191783. |
| C1 | constraint | respected | static_check | ADV state reads/writes used typed ADV tools; no external ADV state files were read directly. |
| C2 | constraint | respected | static_check | Implementation ran in ADV worktree `/home/jon/.local/share/opencode/worktree/.../change/validateReleaseRecovery`; trunk checkout was not used for edits. |
| C3 | constraint | respected | static_check | PokeEdge validation used read-only typed target_path reads only; no PokeEdge mutation was performed. |
| C4 | constraint | respected | static_check | Correctness backed by shared helper, source review, RED/GREEN helper test, targeted 62-test suite, and build/deploy evidence. |
| C5 | constraint | respected | static_check | PR #193 was not accepted until source review, test hardening, targeted tests, build/deploy, and PokeEdge typed validation completed. |
| C6 | constraint | respected | static_check | Worktree was materialized from `origin/trunk` at PR #193 merge commit aa5681d9; source validation ran from that worktree. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No archive-finalization redesign performed; change limited to helper extraction and validation. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No new release lifecycle concept added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No CI/live polling loop added; verification used bounded commands and typed reads. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-92364ab3c250 | AC1, AC2, AC3 | AC1, AC2, AC3 | C1, C2, C4, C5, C6, OOS1, OOS2 |  |
| tk-f18be23ab7f6 |  | AC2, AC3, AC4 | C2, C4, C6 |  |
| tk-d6a451a3a18e |  | AC5 | C2, C4, C6 |  |
| tk-821295a2f7fe |  | AC6, AC7 | C1, C3, C4, C5 |  |
| tk-da32b2eaad6a |  | AC8 | C4, OOS1, OOS2, OOS3 |  |
