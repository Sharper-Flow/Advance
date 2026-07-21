# Contract Traceability

**Change ID:** makeWorkspaceCleanupRemoteFail
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T00:44:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tk-4aa6068e8954 preserves the {ok:true, workspace:null} early return at index.ts:1501; covered by existing test 'preserves walk-up behavior' in index-delete.test.ts and full suite tr_mrtxeg8b_c323a60d (239 pass). |
| AC2 | acceptance_criterion | pass | test | tk-4aa6068e8954 preserves the {ok:true, workspace:<handle>} -> deleteAdvWorkspace path; WORKSPACE_CLEANUP_FAILED still returned on workspace-delete failure. Existing test at index-delete.test.ts:440 (workspace cleanup failed) still passes in tr_mrtxeg8b_c323a60d. |
| AC3 | acceptance_criterion | pass | test | tk-4aa6068e8954 changed !lookup.ok branch (index.ts ~1488) to return {ok:true, warning}; tk-c4ed7637ef03 tests 'proceeds with a warning when workspace ownership is uncertain (list request fails)' and 'proceeds with a warning when the workspace list lookup throws' assert the new behavior. Targeted tr_mrtxk1j6_058d8953: 59 pass. |
| AC4 | acceptance_criterion | pass | test | isWorktreeInUse (in-use.ts) and its upstream check at index.ts:2237 are unchanged. in-use.test.ts passes in tr_mrtxcuxd_5eb23a55 (113 pass). |
| AC5 | acceptance_criterion | pass | test | OpenCodeWorkspaceCleanupResult union at index.ts:1467 retains both WORKSPACE_OWNERSHIP_UNCERTAIN and WORKSPACE_CLEANUP_FAILED members. Code is unreachable from !lookup.ok path but type-compatibility preserved. |
| AC6 | acceptance_criterion | pass | test | tk-f44f3d2543fe amended rq-terminalCleanupSafety01 body in both .adv/specs/worktree-lifecycle/spec.json and docs/specs/worktree-lifecycle.md; added scenario rq-terminalCleanupSafety01.3. schemas:check passed (tr_mrtxdsi7_779fd1c0); jq confirms scenario present and JSON valid. |
| AC7 | acceptance_criterion | pass | test | tk-c4ed7637ef03 added explicit regression test 'remote workspace registry unreachable is advisory and surfaces reason in warning'. Reviewer remediation added log.warn assertions to two existing tests proving the warning is logged. tr_mrtxk1j6_058d8953: 59 pass. |
| C1 | constraint | respected | static_check | No change to isWorktreeInUse or in-use.ts. |
| C2 | constraint | respected | static_check | Remote workspace-list call still runs via findWorkspaceByDirectoryChecked; reachable case preserves stale-entry cleanup. |
| C3 | constraint | respected | static_check | OpenCodeWorkspaceCleanupResult shape unchanged; both error codes remain valid union members. |
| C4 | constraint | respected | static_check | No new flag/env/toggle introduced. Fix is unconditional new default. |
| C5 | constraint | respected | static_check | WORKSPACE_CLEANUP_FAILED path unchanged in source. |
| DONT1 | avoidance | respected | review | Warning includes the upstream reason string; not swallowed. |
| DONT2 | avoidance | respected | review | deleteAdvWorkspace still called when lookup succeeds with workspace handle. |
| DONT3 | avoidance | respected | review | No retry/backoff/queue logic added. |
| DONT4 | avoidance | respected | review | findWorkspaceByDirectoryChecked signature and result shape unchanged. |
| DONT5 | avoidance | respected | review | warpFlagEnabled short-circuit at workspace-warp.ts:299 unchanged. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c4ed7637ef03 | AC3, AC5 | AC1, AC2, AC7 | C3, DONT1, DONT3 |  |
| tk-f44f3d2543fe | AC6 |  | C4 |  |
| tk-4aa6068e8954 | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, DONT2, DONT4, DONT5 |  |
