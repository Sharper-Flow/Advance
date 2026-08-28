# Executive summary

## Outcome

This change restores the release checks that protect Advance updates. Post-release archive updates now write only to the canonical surviving record. The change also removes reviewed dead code, patches the affected nanoid 3.x dependency, and adds a guarded owner for dead-code baseline provenance.

## Why it matters

A successful release no longer dirties its own tracked archive files after finalization. Release validation can distinguish an approved provenance update from an unsafe baseline change. Historical dirty worktrees remain retained under the existing safety policy.

## Verification

- The local CI-equivalent checks passed: dependency installation, dead-code ratchet, SDK parity, schemas, types, lint, formatting, unit tests, Bun CLI tests, and plugin build.
- The final Bun CLI run passed 436 tests with 3,941 assertions.
- The full unit test project passed after all hardening fixes.
- The dead-code baseline keeps all 1,129 reviewed fingerprints.
- Independent review found one directory-synchronization conflict. The user selected strict restore-and-block behavior. The repair restores exact prior bytes and passed focused failure tests.
- Independent review then returned APPROVED with no remaining blocker or scope drift.
- Hardening removed one unused session compatibility helper and simplified rollback state, fingerprint ordering, and Git subprocess naming.
- Three hardening scanners returned READY. Targeted re-scan confirmed every fixed finding is resolved.
- Dry-run merge compatibility passed. No child pull request exists, and the parent branch contains the child checkpoints.

## Remaining release evidence

GitHub CI, Security Gates Pilot, the dependent Build job, pull-request merge, and default-branch reachability remain release-stage checks. The older dirty worktrees for `fixPostMergeArchiveCleanup` and `fixDeadInternalCallGuards` remain retained and must not be force-removed.

## Approval consequence

Acceptance confirms that the delivered behavior satisfies the approved agreement. Archive sign-off authorizes the parent pull request, remote release checks, and merge flow.

## Release Readiness Summary

- **Status:** READY.
- **Test coverage:** PASS. Full unit tests, 436 Bun CLI tests, rollback failures, archive routes, and session cleanup paths pass.
- **Production readiness:** PASS. Canonical-only archive writes, strict provenance rollback, and the scoped nanoid floor have source and test evidence.
- **Documentation hygiene:** PASS. Typed specification changes match their generated projections. Removed names have no current source references.
- **Cleanup readiness:** PASS. No temporary or debug candidate requires deletion. Historical dirty worktrees remain safely retained.
- **Deployment readiness:** PASS. No environment variable, migration, external service, frontend, or infrastructure change exists.
- **Collision risk:** WARNING. The branch is current and merge-compatible. Two older dirty worktrees remain retained by design.
- **Open work:** GitHub checks, parent merge, default-branch proof, and child task closure remain archive-owned.

## Approval Consequence Context

1. delivered_value: delivered value — pass
   Evidence: Post-release archive updates now write only to the canonical record. Release validation is green locally, dead code is removed, nanoid 3.x is patched, and dead-code provenance keeps all 1,129 reviewed fingerprints.
   Source: executive-summary.md; agreement AC1-AC8

2. enabling_only_dependency: enabling-only/follow-up dependency — warning
   Evidence: The child provenance change is merged into the parent branch and has no pull request. Its final task stays open until the parent pull request merges.
   Source: child task tk-f4476d8f157a; tr_mtchwx2m_2e01768d

3. ops_readiness: ops readiness — pass
   Evidence: Local CI checks, full unit tests, 436 Bun CLI tests, build, hardening scans, focused rollback tests, and dry-run merge compatibility passed.
   Source: tr_mtcho3oo_e77f3535; tr_mtd2q7os_c4d25db1; tr_mtd2re37_b5c31d7b; tr_mtd2rs30_ce39a2ee

4. migration_data_impact: migration/data impact — n/a
   Evidence: No database, production data, schema migration, or external service change exists. The baseline change updates repository validation metadata only.
   Source: scanner-bundle:harden

5. frontend_preview_impact: frontend/preview impact — n/a
   Evidence: The change has no frontend or visual surface.
   Source: agreement and affected-file inventory

6. collision_release_risk: collision/release risk — warning
   Evidence: The branch is current and merge-compatible with origin/trunk. Two older dirty worktrees remain safely retained and must not be force-removed.
   Source: tr_mtd2rs30_ce39a2ee; adv_worktree_triage

7. open_follow_ups: open follow-ups — pending
   Evidence: GitHub CI, Security Gates Pilot, dependent Build, parent pull-request merge, default-branch reachability, and child task closure remain archive-owned checks.
   Source: agreement AC12; child task tk-f4476d8f157a

8. next_action: next action — pending
   Evidence: Obtain archive sign-off, then run the parent archive with phase 9 and a conventional fix pull-request title.
   Source: /adv-archive fixReleaseValidationFailures