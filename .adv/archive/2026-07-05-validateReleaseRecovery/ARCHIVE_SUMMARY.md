# Archive: Validate release recovery

**Change ID:** validateReleaseRecovery
**Archived:** 2026-07-05T19:07:31.488Z
**Created:** 2026-07-05T18:18:01.282Z

## Tasks Completed

- ✅ Consolidate audited release-recovery trust predicate and source-review PR #193
  > Added `plugin/src/tools/recovery-audit.ts` with shared `hasGateRecoveryAudit` predicate for legacy compatibility evidence and current `recovery_audit.reason/evidence`. Updated `gate.ts` and `change/archive-gate.ts` to use it. Added `recovery-audit.test.ts`. RED failed on missing helper; GREEN passed after implementation.
- ✅ Run targeted release-recovery verification
  > Ran targeted release recovery suite through `bin/oc-test targeted -- src/tools/gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/recovery-audit.test.ts`; 3 files and 62 tests passed. Documented initial path-filter command failure as command-shape issue, not semantic failure.
- ✅ Build and deploy Advance plugin, then record reload boundary
  > Ran `pnpm run build` and `./scripts/deploy-local.sh --fix` successfully. During harden, rebased onto origin/trunk, reran targeted release-recovery tests (62 passed), fixed Prettier formatting, and verified `pnpm run check` passed. Runtime reload boundary remains: restart OpenCode sessions/plugin host to pick up deployed code.
- ✅ Validate live/fresh recovered-release behavior or document typed recovery path
  > Used typed ADV reads with `target_path: /home/jon/dev/pokeedge`. `adv_gate_status neutralizePricingDtos` returned all gates done, `release.status: done`, `incomplete: []`, `canArchive: true`, `nextGate: null`, `_recovery.reason: poisoned_history`. `adv_change_show` returned status/lifecycleState archived and context snapshot with release checked.
- ✅ Record process guardrail decision for issue #194
  > Recorded decision: normal Advance source fixes should start as tracked ADV changes before PR work; emergency hotfixes may merge first only when needed, but must create follow-up validation/deploy/cleanup issue/change like #194. Included validation/deploy/PokeEdge evidence in issue comment.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** After `pnpm run build` + `./scripts/deploy-local.sh --fix`, current OpenCode session still uses cached plugin code; live ADV tool validation requires restarting OpenCode/plugin host. Source tests can pass before live tool behavior changes.
- **[success]** For cross-project incident verification, typed read-only `target_path` ADV tools can confirm recovered release state without mutating target project: `adv_gate_status` on PokeEdge `neutralizePricingDtos` showed release done/incomplete []/archived context after recovery.
- **[convention]** Advance source hotfixes should normally start as tracked ADV changes before PR work. Emergency ad-hoc hotfixes are acceptable only with a follow-up issue/change that validates source behavior, rebuild/deploy/restart boundary, incident cleanup, and process decision.
