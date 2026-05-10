# Archive: Fix archive recovery when external bundle already exists

**Change ID:** fixArchiveRecoveryWhenExternal
**Archived:** 2026-05-09T21:31:15.725Z
**Created:** 2026-05-09T02:46:27.436Z

## Tasks Completed

- ✅ Add failing regression coverage for external-bundle-present recovery creating/reconciling missing in-repo archive.
  > Added regression coverage for recovery when an external archive bundle already exists but in-repo archive is missing. Initial attempt exposed test setup import issue; corrected red/green path and added reconcileInRepoArchive coverage. Test now passes after implementation.
- ✅ Implement idempotent archive recovery ordering so in-repo archive reconciliation is not skipped.
  > Implemented idempotent archive recovery ordering. Added reconcileInRepoArchive helper that returns an existing in-repo archive bundle if present or creates one if missing. Updated adv_change_archive existing-external-bundle recovery path to call reconciliation before synthesizing archive success, preserving state-transition recovery while ensuring in-repo archive is not skipped.
- ✅ Run focused archive recovery tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Archive retry recovery must reconcile both planes: if external archive bundle already exists, still ensure in-repo archive bundle exists before synthesizing archive success/status transition. Treat in-repo reconciliation as idempotent create-if-missing, return-existing-if-present.
