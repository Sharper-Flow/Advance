# Archive: Fix tool arg safety

**Change ID:** fixToolArgSafety
**Archived:** 2026-05-22T16:08:09.030Z
**Created:** 2026-05-22T05:59:27.861Z

## Tasks Completed

- ✅ Codify tool argument safety and origin linkage spec law
  > Updated .adv/specs/advance-workflow/spec.json with structural blank artifact/linkage argument requirements covering adv_change_update, adv_change_create, storage-boundary blank write rejection, offending-field errors, and omission semantics. Updated .adv/specs/backlog-coordination/spec.json with origin linkage matrix and creation-time Temporal seed-state requirements for roadmap/triage/discovery/adhoc/omitted origins and AdvBacklogIssueNumber search attributes.
- ✅ Reject blank artifact updates at preflight, execute, and storage layers
  > Added preflight rejection for every provided blank adv_change_update artifact field, including mixed valid+blank payloads. Added tool execute-layer blank artifact guard before change lookup/storage writes. Added storage-boundary no-partial-write guard in updateChangeArtifacts. Added regression tests for preflight, direct tool execution, omitted-field compatibility, and storage partial-write prevention.
- ✅ Reject blank create artifacts and enforce origin linkage matrix
  > Added adv_change_create preflight and execute-layer validation for blank provided narrative artifact fields and blank origin_source_artifact. Enforced origin matrix: roadmap requires issue and rejects source artifact; triage accepts optional issue/source; discovery rejects issue and accepts source; adhoc/omitted origin reject linkage fields. Updated origin tests and claim compatibility tests remained green.
- ✅ Seed creation metadata into authoritative Temporal workflow state
  > Extended Store.changes.create with optional initialMetadata. Disk store stamps origin/fast_follow_of/scope_repos into the Change before save. Temporal store passes create options through, starts workflow from the stamped change, and overlays origin/scope metadata. adv_change_create builds initialMetadata for origin/fast-follow/scope and no longer late-saves origin after workflow start. Updated ChangeOrigin comments to match roadmap/triage/discovery/adhoc matrix.
- ✅ Run contract-wide regression and compatibility verification
  > Ran targeted regression for tool preflight, change create/update, storage artifact writes, origin matrix, claim compatibility, Temporal seed state, and search attributes. Fixed check failures by removing invalid scope_repos from workflow seedState and running Prettier on modified files. Confirmed pnpm run check, pnpm test, and adv_change_validate strict all pass.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For auto-managed worktree changes, target-path task reads can show the authoritative task graph while main-checkout adv_change_validate may report stale NO_TASKS/CONTRACT_AC_UNCOVERED. Resume/apply from the change worktree target_path for state-sensitive operations.
