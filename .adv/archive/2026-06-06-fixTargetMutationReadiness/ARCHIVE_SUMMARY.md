# Archive: Fix target mutation readiness

**Change ID:** fixTargetMutationReadiness
**Archived:** 2026-06-06T23:23:11.273Z
**Created:** 2026-06-06T22:35:19.043Z

## Tasks Completed

- ✅ Add advance-workflow spec law for target mutation readiness
  > Added `rq-targetMutationReadiness01`, `rq-targetMutationReadiness02`, and `rq-targetMutationReadiness03` scenarios to `advance-workflow` spec under cross-project coordination. Mirrored the target mutation readiness law in `docs/specs/advance-workflow.md` and updated doc header to current spec version/date. Verified spec JSON parses successfully.
- ✅ Implement target mutation readiness helper with boundary tests
  > Added `ensureTargetMutationQueueReady` at the temporal-required target store boundary. The helper preserves local queue registration, falls back to fresh server-poller probing through `probeTaskQueuePollers`, classifies readiness with `classifyQueueServiceability`, and fails closed with queue/blockers/action when unproven. Updated `withTargetPathStore` to fetch the Temporal bundle before readiness and avoid terminal client-only `no registered worker` failure. Added target-project tests for fresh server poller success and unproven poller fail-closed behavior. Verification: targeted tests and typecheck pass.
- ✅ Verify cross-project create no-partial-link behavior after readiness passes
  > Strengthened `change-cross-project-create.test.ts` to prove the target create failure case runs through the temporal-required target store path, attempts target create with cross-project origin metadata, avoids target `get`, surfaces the Temporal workflow-start failure, and does not write the source `cross_project_links` entry. Targeted test passed.
- ✅ Run final verification for target mutation readiness
  > Final verification completed. Reviewer additionally expanded fail-closed readiness coverage in `target-project.test.ts` to cover absent, stale, and unavailable poller evidence; reviewer-reported `pnpm --dir plugin run check` and targeted tests passed. Change remains within agreed scope.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `docs/specs/advance-workflow.md` can lag `.adv/specs/advance-workflow/spec.json`; when adding spec-law scenarios, mirror the relevant section manually and update the doc header version/date if the mirror is stale.
- **[gotcha]** Advance's repo-local `bin/oc-test` wrapper is at the repository root; running `bin/oc-test ...` from `plugin/` fails with exit 127. Use repo root as workdir for wrapper-based tests, even when test paths are under `plugin/src`.
- **[success]** `adv_change_create target_path` source-link write is already ordered after `targetStore.changes.create`; tests can prove no-partial-link behavior by making target create throw and asserting `sourceStore.changes.save` is not called.
- **[gotcha]** Acceptance coverage for target mutation readiness should exercise stale, absent, and unavailable server poller statuses at the target-store boundary, not only in lower-level queue serviceability helpers.
