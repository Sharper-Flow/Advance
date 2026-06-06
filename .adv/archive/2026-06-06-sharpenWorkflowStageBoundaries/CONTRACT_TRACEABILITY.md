# Contract Traceability

**Change ID:** sharpenWorkflowStageBoundaries
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-05T23:23:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review READY; specs/commands/docs now separate Proposal=User Outcomes, Discovery=AC/SC, Design=design-derived criteria, Prep=task mapping. Stale wording scan passed. |
| SC2 | success_criterion | pass | review | Proposal spec/command/storage/snapshot changed from Success Criteria to User Outcomes; clarify readiness no longer blocks missing proposal success criteria. |
| SC3 | success_criterion | pass | review | Agreement/design adopted ISO/IEC/IEEE 29148 implementation-free wording and dual-track Definition-of-Ready framing; adv-researcher validation PASS. |
| SC4 | success_criterion | pass | review | bin/oc-test smoke passed; bin/oc-test full passed; acceptance review READY; contract review matrix persisted through typed tool. |
| AC1 | acceptance_criterion | pass | test | clarify-readiness tests updated: proposal without testable success criteria no longer emits CLARIFY_MISSING_SUCCESS_CRITERIA; targeted validator tests passed. |
| AC2 | acceptance_criterion | pass | test | adv-proposal spec/command/scaffold/snapshot tests pass; proposal owns implementation-free User Outcomes and defers engineering AC/SC to discovery. |
| AC3 | acceptance_criterion | pass | test | Discovery agreement still minted 25 ChangeContract items (SC*, AC*, C*, DONT*, OOS*) from agreement.md; contract present in adv_change_show. |
| AC4 | acceptance_criterion | pass | test | adv-discover spec/command updated for advisory implementation-free criteria scan; asset tests pass; no hard-blocking gate path added. |
| AC5 | acceptance_criterion | pass | test | adv-design spec/command updated for Design-Derived Criteria, no-new-user-facing-AC rule, and routine adv_change_reenter from discovery; asset tests pass. |
| AC6 | acceptance_criterion | pass | test | checkMissingSuccessCriteria and CLARIFY_MISSING_SUCCESS_CRITERIA removed from plugin/src; planning-gate criteria enforcement anchored to agreement/contract; validator tests pass. |
| AC7 | acceptance_criterion | pass | test | bin/oc-test smoke passed; bin/oc-test full passed; targeted affected tests passed (manifest, snapshot, storage, clarify-readiness, command assets). |
| AC8 | acceptance_criterion | pass | test | Review matrix rows set for all 25 contract items; preview URL not_applicable because agreement visual_surface:false and no visual-output files/tasks were implemented. |
| C1 | constraint | respected | static_check | adv_change_validate strict passed; NO_DELTAS warning accepted because spec-law edits were applied directly in repo specs; spec mirrors/docs updated. |
| C2 | constraint | respected | static_check | All tasks completed via ADV task checkpoints; gates advanced through ADV tools; worktree isolation used for mutations. |
| C3 | constraint | respected | static_check | No clarify_enforcement default change made; retirement limited to proposal success-criteria check; sibling clarify checks remain. |
| C4 | constraint | respected | static_check | ChangeContract schema/evidence policies untouched; AC*/SC* minting still present; typed review matrix set through adv_contract_review_matrix_set. |
| DONT1 | avoidance | respected | review | Proposal terminology changed to User Outcomes; discovery remains AC/SC owner; docs and manifest aligned. |
| DONT2 | avoidance | respected | review | Discovery implementation-free guard documented as advisory; no hard-blocking code path introduced. |
| DONT3 | avoidance | respected | review | /adv-task fast-track redesign not implemented; follow-up ag-JpHqmo1c retained. |
| DONT4 | avoidance | respected | review | No backward-compat migration shim added; new model applies uniformly by removing the proposal-level check. |
| DONT5 | avoidance | respected | review | No code/config change to clarify_enforcement default found in touched files or review evidence. |
| OOS1 | out_of_scope | not_applicable | not_applicable | This change did not alter execution, acceptance, or release gate responsibilities beyond review-time evidence artifacts required by the workflow. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No ChangeContract AC* schema or evidence-policy redesign performed; existing contract machinery used. |
| OOS3 | out_of_scope | not_applicable | not_applicable | /adv-task fast-track redesign excluded; follow-up ag-JpHqmo1c tracks it. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No migration for in-flight changes carrying proposal success criteria was added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4ac9e6e24635 | AC2 |  | DONT1 |  |
| tk-22654e7a7284 | AC3, AC4, AC5, AC6 |  |  |  |
| tk-8066fc3ac7a9 | AC1, AC6 |  | C4, DONT2 |  |
| tk-e5902391c572 | AC2 |  | C4 |  |
| tk-5c8542973655 | AC2, AC3, AC4 |  |  |  |
| tk-f9f2b153abe2 | AC5 |  | DONT2 |  |
| tk-cb49a6c039b6 | AC1 |  |  |  |
| tk-81191f652ea3 |  | AC7, AC8 |  |  |
