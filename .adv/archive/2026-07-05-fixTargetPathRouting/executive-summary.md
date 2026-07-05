# Executive Summary

## Outcome

Cross-project `target_path` behavior was repaired for issue #192, and the release-blocking archive-finalization full-suite failure found during hardening was fixed. Target artifact readback now uses target Temporal workflow documents when artifact content is requested; target close/bulk-close route through target store/workflow identity; archive default-branch detection no longer lets global `init.defaultBranch` override repository-local branch reality.

## Verdict

APPROVED

## What Was Built

1. `adv_change_show target_path` artifact include paths now route through a target Temporal-backed store with `mutation:false`, while no-artifact target show keeps snapshot behavior.
2. `adv_change_close` now accepts target routing fields and uses target store for lookup, workflow handle identity, signal/cache refresh, recovery, cleanup, and `_projectContext` output.
3. `adv_change_bulk_close` now accepts target routing fields and uses target-store selection, workflow handles, signal/cache refresh, recovery, disk sweep, and `_projectContext` output.
4. `detectDefaultBranch` now reads repository-local `init.defaultBranch` via `git config --local --get`, preventing user-global config from making archive finalization misclassify trunk repos as main.
5. Added regression coverage for target-path routing and archive-finalization default-branch detection.

## What Was Verified

- Acceptance rereview: READY; 0 blocking findings.
- Target-path targeted tests: `bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts` passed 101 tests.
- Archive targeted tests: `bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts` passed 82 tests.
- Full suite: `bin/oc-test full` passed.
- Check/build: `pnpm run check` passed; `pnpm run build` passed.
- Static checks: cache-refresh grep clean; `git diff --check` clean; `adv_change_validate strict` passed with expected no-delta warning only.
- Preview URL: not_applicable — `visual_surface:false`; implementation touches ADV tool/archive logic and tests only.
- Contract matrix: 32/32 rows passed, respected, or not_applicable; 0 failed/violated/unknown rows.

## Remaining Concerns

None for acceptance. Live ADV behavior still requires normal plugin build/deploy/restart after merge because OpenCode caches deployed `dist` at session startup.

## Consequence Context

1. delivered value — passed: target-path issue #192 scope fixed and full-suite release blocker repaired.
2. enabling-only/follow-up dependency — n/a: no required follow-up dependency remains.
3. ops readiness — passed for release readiness evidence: full suite, check, and build passed; no production ops runbook required.
4. migration/data impact — n/a: no data migration or persisted state migration; active artifact source remains Temporal workflow documents.
5. frontend/preview impact — n/a: no visual surface; preview URL not_applicable with agreement evidence.
6. collision/release risk — low: changed files are scoped to `plugin/src/tools/change.ts`, `change.test.ts`, `archive-helpers/git-finalize.ts`, and `git-finalize.test.ts`; reviewers READY and full suite passed.
7. open follow-ups — n/a: agenda blocker `ag-C4dkgAr4` is resolved by this change's archive-finalization repair.
8. next action — user acceptance proceeds inline to harden/release-readiness confirmation for `fixTargetPathRouting`.