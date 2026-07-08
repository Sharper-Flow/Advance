# Acceptance

Reviewed at: 2026-07-08T19:53:18.403Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given an epic workflow started with `searchAttributesEnabled:false`, when `searchAttributesRefreshed` is signaled with active status, then `AdvEpicStatus` is upserted from structural workflow state despite the legacy input flag. | pass | GREEN tr_mrchex44_ad91b4df and verify tr_mrcho4ne_4640f2ce: workflows.search-attrs test includes legacy `searchAttributesEnabled:false` Epic refresh and passed; reviewer verdict READY. |
| AC2 | acceptance_criterion | Given `adv_epic_repair_membership mode:"refresh_search_attributes"` runs against legacy epics, then returned result distinguishes confirmed refresh/write evidence from skipped, unreachable, or unverified signal-delivery outcomes. | pass | GREEN tr_mrchif7k_54fe0e33 and verify tr_mrcho4ne_4640f2ce: store-temporal/epics.test proves confirmed refresh after describe proof and unverified reporting; reviewer verdict READY. |
| AC3 | acceptance_criterion | Given the change workflow has the same immutable-gate pattern, then either equivalent repair behavior is implemented or source/tests document why it is not affected. | pass | Verify tr_mrchncyl_a6720ccf and tr_mrcho4ne_4640f2ce: list-change-workflows.test passed and asserts default open listing uses AdvLifecycleState and not AdvChangeStatus; reviewer verdict READY. |
| AC4 | acceptance_criterion | Given the implementation is complete, targeted tests for epic search-attribute refresh/repair reporting pass through `bin/oc-test targeted -- ...` or `adv_run_test` evidence. | pass | Verify tr_mrcho4ne_4640f2ce: 142 targeted tests passed; tr_mrchop9i_2ec85564: `pnpm run check` passed. |
| C1 | constraint | Preserve Temporal workflow determinism and workflow-bundle import boundaries. | respected | `pnpm run check` tr_mrchop9i_2ec85564 passed typecheck/lint; reviewer confirmed workflow-bundle-safe deterministic changes. |
| C2 | constraint | Keep repair behavior structural; no heuristic success inference for correctness. | respected | repairIndex uses workflow describe point-value proof before incrementing confirmed `refreshed`; unverified signal delivery is separate. |
| C3 | constraint | Do not require operators to restart/recreate legacy workflows. | respected | Forced repair signal upserts current Epic status on the existing running workflow; no restart/recreate path introduced. |
| C4 | constraint | Do not use eventual list-query visibility as the only synchronous success proof. | respected | Synchronous confirmation uses `handle.describe()` point-value proof; list-query propagation is not the sole success proof. |

