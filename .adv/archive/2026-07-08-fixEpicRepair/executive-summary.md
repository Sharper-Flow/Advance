# Executive Summary

Fixed GitHub issue #210: legacy running Epics that started before `AdvEpicStatus` repair support can now be recovered by `adv_epic_repair_membership mode:"refresh_search_attributes"`.

## Outcome
- `searchAttributesRefreshedSignal` now forces `AdvEpicStatus` upsert for legacy Epic workflows with `searchAttributesEnabled:false`.
- `repairIndex` no longer counts signal delivery as confirmed success. It verifies `AdvEpicStatus` through workflow describe proof before incrementing `refreshed`; missing proof is reported as `unverified`.
- `adv_epic_repair_membership` output now surfaces `unverified` count alongside `refreshed`, `skipped`, and `unreachable`.
- `advance-epics` spec law now includes `rq-epicSearchAttributeRepair01` covering legacy visibility backfill and honest reporting.
- The `AdvChangeStatus` concern was audited: default/open change visibility is documented and tested to use `AdvLifecycleState=open`, not `AdvChangeStatus`; terminal `AdvChangeStatus` gates are compatibility/read-model metadata rather than open-change authority.

## Verification
- Targeted suite passed: `bin/oc-test targeted -- src/temporal/workflows.search-attrs.test.ts src/storage/store-temporal/epics.test.ts src/tools/epic.test.ts src/temporal/list-change-workflows.test.ts` (`tr_mrcho4ne_4640f2ce`, 142 tests).
- `pnpm run check` passed (`tr_mrchop9i_2ec85564`).
- Independent review verdict: READY; no blockers.