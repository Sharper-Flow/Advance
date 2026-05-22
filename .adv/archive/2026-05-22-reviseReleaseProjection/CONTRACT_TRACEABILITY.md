# Contract Traceability

**Change ID:** reviseReleaseProjection
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T16:12:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tk-41a8436cbe2f: RED regression `blocks archive success when store-backed release proof remains pending` failed before fix and passed after `verifyReleaseGateDurableForArchive`; targeted archive tests passed. |
| AC2 | acceptance_criterion | pass | test | tk-41a8436cbe2f: `verifyReleaseGateDurableForArchive` requires release done and Phase 9 evidence; blocked output cites rq-releaseProjectionDurability01. Targeted archive tests passed. |
| AC3 | acceptance_criterion | pass | test | tk-f94124fc58a6: focused recovery tests passed: `reconciles release gate`, `repairs release projection`, `recovers release projection`, `blocks no-worktree`. |
| AC4 | acceptance_criterion | pass | test | tk-41a8436cbe2f and tk-f94124fc58a6: tests cover finalization blocked and no-worktree missing push evidence; release signal is not sent without Phase 9 proof. |
| AC5 | acceptance_criterion | pass | test | tk-4a86a5e82210: side-effect/idempotency focused tests passed; proof failure returns before `store.changes.save`, cleanup, and linked issue closure. |
| AC6 | acceptance_criterion | pass | test | tk-51308b70e1aa: added `rq-releaseProjectionDurability01` to `.adv/specs/advance-workflow/spec.json` and docs mirror; asset test `advance-workflow spec encodes release projection durability` passed. |
| AC7 | acceptance_criterion | pass | test | tk-41a8436cbe2f: added regression for success-with-release-pending; final targeted tests `adv-autonomy-quality-assets` + `change.archive-phase9` passed (41 tests). |
| AC8 | acceptance_criterion | pass | test | tk-2227a1a9c532: targeted tests passed, user-authorized unrelated failure tests passed, `pnpm run check` passed, `pnpm run build` passed, full `pnpm test` passed, `adv_change_validate strict:true` passed with NO_DELTAS warning only. |
| AC9 | acceptance_criterion | pass | test | tk-51308b70e1aa and tk-4a86a5e82210: spec/docs and archive path preserve seven gates; archive order is Phase 9 -> release durable proof -> retirement/cleanup/issue closure. Focused tests passed. |
| C1 | constraint | respected | static_check | `completeReleaseGateAfterFinalization` only accepts finalization status `shipped` or `pr_pushed`; no-worktree repair re-verifies Phase 9 evidence before release repair. |
| C2 | constraint | respected | static_check | Regression blocks archive success when store-backed release proof remains pending; full/targeted tests passed. |
| C3 | constraint | respected | static_check | Recovery tests verify existing-bundle/no-worktree and completed-workflow paths without manual worktree recreation. |
| C4 | constraint | respected | static_check | Side-effect ordering test verifies proof failure returns before archive save/closure path; finalization blockers and cleanup safety unchanged. Full tests passed. |
| C5 | constraint | respected | static_check | Reviewer inspected production diff and found no `defineUpdate` additions; workflow boundary verification passed. |
| C6 | constraint | respected | static_check | No new gate or manual release command added; design/spec/implementation keep seven gates and internal archive substeps. |
| C7 | constraint | respected | static_check | Correctness enforced by spec requirement, typed helper result, store-backed read, deterministic blocked output, and regression tests. Full tests passed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Not replaced; existing archive workflow retained and strengthened internally. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Release evidence requirements unchanged except durable proof before success. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Non-release gate sequencing unchanged. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Task-completion semantics unchanged. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No manual ADV state-file edits or Temporal DB surgery used. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-51308b70e1aa | AC6, AC9 | AC6 | C1, C2, C4, C5, C6, C7 |  |
| tk-41a8436cbe2f | AC1, AC2, AC4, AC7 | AC1, AC2, AC4, AC7 | C1, C2, C4, C5, C7 |  |
| tk-f94124fc58a6 | AC3 | AC3, AC4 | C1, C2, C3, C4, C5, C7 |  |
| tk-4a86a5e82210 | AC5, AC9 | AC5, AC9 | C2, C4, C5, C6, C7 |  |
| tk-2227a1a9c532 |  | AC8 | C1, C2, C4, C5, C6, C7 |  |
