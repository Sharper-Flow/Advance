# Archive: Start cross-project change workflows

**Change ID:** startCrossProjectChange
**Archived:** 2026-06-06T21:22:31.043Z
**Created:** 2026-06-06T19:46:15.241Z

## Tasks Completed

- ✅ Seed cross-project origin through Temporal workflow state
  > Added cross_project_origin to ChangeCreateInitialMetadata, disk create initial metadata, Temporal create seedState, ChangeWorkflowState seed contract, workflow initialization and continue-as-new seed, changeSeedStateFromChange(), and mapTemporalChangeStateToChange(). Added targeted regression tests proving createChangeOps seeds cross_project_origin at workflow start and changeSeedStateFromChange carries it during reseed.
- ✅ Route cross-project create through target Temporal store
  > Routed adv_change_create target_path through withTargetPathStore using stateRequirement:"temporal-required" instead of createLegacyStore. Added target_confirmed/confirmationEvidence to adv_change_create schema and preflight blank normalization. Cross-project target create now passes cross_project_origin in initialMetadata before target workflow start, does not call target changes.get after create, surfaces _projectContext, and writes source cross_project_links using the target context projectId only after target create succeeds. Target Temporal create failures return an error without source link write.
- ✅ Prove active disk-only reconciliation through list/read reseed
  > Added store-temporal index tests proving direct read re-seeds an active disk-only change via ensureChangeWorkflowStarted and that list() discovers disk IDs, re-seeds active disk-only records, excludes archived/closed records from default active list, and does not start workflows for terminal disk records. Added a missing-workflow successful-reseed fixture that simulates WorkflowNotFound before start and hydrated workflow state after start.
- ✅ Update spec law and generated tool contract surfaces
  > Updated advance-workflow spec law rq-crossProjectCoordination01 to require target_path adv_change_create to route through target Temporal-backed store, seed cross_project_origin before workflow start, avoid source-process target getState queries, fail without active disk-only target orphan on workflow-start failure, and reconcile active disk-only target records through list/read while not recreating archived/closed records. Public JSON schemas had no drift under schemas:check after the tool schema update.
- ✅ Run final verification and cross-project visibility proof
  > Final verification plus acceptance-review remediation complete. Reviewer found and fixed a traceability gap: cross_project_links/external_dependencies now survive Temporal state, seed, continue-as-new, read mapping, and coordination update signal paths. Post-remediation verification: pnpm run check passed; targeted suite including workflow signal handlers and bundle boundary passed (184 tests).

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Temporal workflow-state metadata additions must be threaded through all structural surfaces together: ChangeCreateInitialMetadata, disk create scaffold metadata, ChangeWorkflowInput.seedState Pick list, ChangeWorkflowState, createChangeOps seedState, workflow initialization, continue-as-new seed, changeSeedStateFromChange(), and mapTemporalChangeStateToChange(). Updating only disk/overlay makes new target changes invisible or loses metadata on reseed/continue-as-new.
- **[pattern]** Cross-project target mutations should route through withTargetPathStore({ stateRequirement: "temporal-required" }) and use the returned target store/context for all target writes and target project IDs. For creates, pass provenance through initialMetadata before workflow start and avoid post-create target get/save patches, which can reintroduce target workflow queries and disk-only state.
- **[success]** The existing listResolvedChanges + getTemporalChange path already provides active disk-only reconciliation: list unions disk IDs, per-ID get handles WorkflowNotFound through reseedChangeFromDisk, terminal archived/closed records short-circuit to disk projection, and successful active reseed returns hydrated workflow state. Bounded tests can prove this without adding a startup scanner.
- **[gotcha]** Repository check-test-isolation flags any test calling adv_change_create unless the source includes createTempDir/tmpdir/os.tmpdir/XDG_DATA_HOME. Even fully mocked target_path tests need an explicit isolation marker, e.g. tmpdir()-derived fake roots, or pnpm run check fails before lint/format.
