# Acceptance

Reviewed at: 2026-05-22T16:12:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_archive phase9:"run"` cannot return `success: true` while a post-return `adv_gate_status`-equivalent read would show `release: pending`. | pass | tk-41a8436cbe2f: RED regression `blocks archive success when store-backed release proof remains pending` failed before fix and passed after `verifyReleaseGateDurableForArchive`; targeted archive tests passed. |
| AC2 | acceptance_criterion | Archive success requires durable `gates.release.status === "done"` with Phase 9 evidence, or returns a blocked/recoverable result before claiming success. | pass | tk-41a8436cbe2f: `verifyReleaseGateDurableForArchive` requires release done and Phase 9 evidence; blocked output cites rq-releaseProjectionDurability01. Targeted archive tests passed. |
| AC3 | acceptance_criterion | Existing-bundle/completed-workflow/cleaned-worktree retry reconciles stale release metadata without manual worktree recreation. | pass | tk-f94124fc58a6: focused recovery tests passed: `reconciles release gate`, `repairs release projection`, `recovers release projection`, `blocks no-worktree`. |
| AC4 | acceptance_criterion | Missing merge/reachability/push evidence still blocks release completion. | pass | tk-41a8436cbe2f and tk-f94124fc58a6: tests cover finalization blocked and no-worktree missing push evidence; release signal is not sent without Phase 9 proof. |
| AC5 | acceptance_criterion | Healthy archive remains idempotent: no double merge, double push, double issue close, or unsafe cleanup. | pass | tk-4a86a5e82210: side-effect/idempotency focused tests passed; proof failure returns before `store.changes.save`, cleanup, and linked issue closure. |
| AC6 | acceptance_criterion | `advance-workflow` gains a spec requirement for release projection durability. | pass | tk-51308b70e1aa: added `rq-releaseProjectionDurability01` to `.adv/specs/advance-workflow/spec.json` and docs mirror; asset test `advance-workflow spec encodes release projection durability` passed. |
| AC7 | acceptance_criterion | Regression tests cover success-with-release-pending and post-archive gate-status-equivalent reads. | pass | tk-41a8436cbe2f: added regression for success-with-release-pending; final targeted tests `adv-autonomy-quality-assets` + `change.archive-phase9` passed (41 tests). |
| AC8 | acceptance_criterion | Targeted tests, `pnpm run check`, `pnpm run build`, full `pnpm test`, and strict ADV validation pass. | pass | tk-2227a1a9c532: targeted tests passed, user-authorized unrelated failure tests passed, `pnpm run check` passed, `pnpm run build` passed, full `pnpm test` passed, `adv_change_validate strict:true` passed with NO_DELTAS warning only. |
| AC9 | acceptance_criterion | Archive keeps seven gates; release/finalize/archive are ordered internal archive substeps: archive sign-off -> Phase 9 finalize -> release-gate durable projection proof -> archive retirement/cleanup/issue closure. | pass | tk-51308b70e1aa and tk-4a86a5e82210: spec/docs and archive path preserve seven gates; archive order is Phase 9 -> release durable proof -> retirement/cleanup/issue closure. Focused tests passed. |
| C1 | constraint | Must not mark `release` complete without structural Phase 9 evidence. | respected | `completeReleaseGateAfterFinalization` only accepts finalization status `shipped` or `pr_pushed`; no-worktree repair re-verifies Phase 9 evidence before release repair. |
| C2 | constraint | Must not return archive success with known stale release-gate projection. | respected | Regression blocks archive success when store-backed release proof remains pending; full/targeted tests passed. |
| C3 | constraint | Must not rely on manual worktree rematerialization for normal recovery. | respected | Recovery tests verify existing-bundle/no-worktree and completed-workflow paths without manual worktree recreation. |
| C4 | constraint | Must not weaken linked-issue closure, worktree cleanup, or default-branch push safeguards. | respected | Side-effect ordering test verifies proof failure returns before archive save/closure path; finalization blockers and cleanup safety unchanged. Full tests passed. |
| C5 | constraint | Must not reintroduce `defineUpdate` on change workflows. | respected | Reviewer inspected production diff and found no `defineUpdate` additions; workflow boundary verification passed. |
| C6 | constraint | Must not add an eighth gate or require a separate manual release command for this fix. | respected | No new gate or manual release command added; design/spec/implementation keep seven gates and internal archive substeps. |
| C7 | constraint | Must keep correctness structural: tests, typed state/projection checks, and deterministic blocked/recovery paths own correctness; heuristic or chat conventions do not. | respected | Correctness enforced by spec requirement, typed helper result, store-backed read, deterministic blocked output, and regression tests. Full tests passed. |
| OOS1 | out_of_scope | Replacing the archive workflow. | not_applicable | Not replaced; existing archive workflow retained and strengthened internally. |
| OOS2 | out_of_scope | Changing release evidence requirements beyond requiring durable proof before success. | not_applicable | Release evidence requirements unchanged except durable proof before success. |
| OOS3 | out_of_scope | Changing non-release gate sequencing. | not_applicable | Non-release gate sequencing unchanged. |
| OOS4 | out_of_scope | Changing task-completion semantics. | not_applicable | Task-completion semantics unchanged. |
| OOS5 | out_of_scope | Manual ADV state-file edits or Temporal DB surgery. | not_applicable | No manual ADV state-file edits or Temporal DB surgery used. |

