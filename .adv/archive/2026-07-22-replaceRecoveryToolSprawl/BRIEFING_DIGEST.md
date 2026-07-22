# Archive Briefing Digest

**Change ID:** replaceRecoveryToolSprawl
**Title:** Replace recovery tool sprawl
**Status:** archived
**Generated:** 2026-07-22T23:12:57.385Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #255

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

Epic: hardenTemporalReliability · Replace recovery tool sprawl (order 9)

## Durable Facts

Showing 34 of 34 durable facts.

- **[archive_only_evidence]** decisions: Rewired signal-error catch fallback to classifyMutationRecoveryDecision instead of classifyCompletedOrPoisonedRecovery + manual args — Matches gate.ts exemplar and D4/AC5: public recovery args are removed, so machine evidence must classify both probe-first and signal-error paths
- **[archive_only_evidence]** decisions: Removed the entire manual shouldTakeRecoveryBranch probe-first path — The auto classifyMutationRecoveryDecision({ handle }) probe already covers poisoned/completed workflows; the manual operator-supplied branch was the public surface being retired
- **[archive_only_evidence]** decisions: Converted generic signal-failure tests to assert operator_required/query_failed instead of the original error text — The new classifier treats unclassified signal errors as query_failed and returns a typed operator-required error, which is the D4-correct behavior
- **[archive_only_evidence]** decisions: Left preflight FIELD_POLICIES unchanged for adv_design_concern_disposition and did not add adv_verification_evidence_disposition — No recoveryEvidence/recoveryReason/recoveryMode entries were present for either tool; preflight tests pass and the tool schemas no longer accept those fields
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean in plugin/
- **[archive_only_evidence]** verification: pnpm run lint (0) — eslint src/ clean in plugin/
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/design-concern.test.ts src/tools/verification-evidence.test.ts src/utils/tool-arg-preflight.test.ts (0) — 3 test files, 111 tests passed (10 design-concern + 11 verification-evidence + 90 preflight)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all green in plugin/
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck-tk-0528be678596
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: lint-tk-0528be678596
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: targeted-tests-tk-0528be678596
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: full-check-tk-0528be678596
- **[report_follow_up]** follow_ups: Branch-wide `pnpm run check` still fails because `src/tools/change.ts` and `src/tools/change.test.ts` have pre-existing Prettier formatting issues; these files were not modified by this task and are out of scope.
- **[archive_only_evidence]** decisions: Removed RecoveryModeSchema/RecoveryEvidenceSchema public args from adv_task_update, adv_task_add, and adv_task_cancel — Design D4/AC5 retires operator-supplied recovery args on routine task mutations
- **[archive_only_evidence]** decisions: Rewired recovery to classifyMutationRecoveryDecision({ handle }) probe-first and classifyMutationRecoveryDecision({ signalError, handle }) in catch blocks — Matches gate.ts exemplar and centralizes machine-evidence classification
- **[archive_only_evidence]** decisions: Kept internal saveRecoveredTaskAdd/saveRecoveredTaskMutation writers — Disk-projection recovery path remains, now triggered by classifier decision rather than public args
- **[archive_only_evidence]** decisions: Updated hints to reference adv_doctor instead of removed recoveryMode/recoveryEvidence — Avoids referencing deleted public surface
- **[archive_only_evidence]** decisions: Converted tests to internal-classification scenarios (describe() poison markers or completed-workflow signal error) — Preserves recovery coverage without exercising removed args
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean
- **[archive_only_evidence]** verification: pnpm run lint (0) — eslint src/ clean
- **[archive_only_evidence]** verification: pnpm run schemas:check && pnpm run generate:manifests:check (0) — Tracked JSON schemas and agent manifests match generated output
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/task.test.ts src/tools/task.worktree-isolation.test.ts src/utils/tool-arg-preflight.test.ts (0) — All 169 tests pass across 3 files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: lint-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: schemas-manifests-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-001
- **[research_citation]** sources: Approved agreement and design: Approved contract requires direct safe convergence, deterministic timeout resolution, bounded audited repair, removal of superseded APIs, replay law, and archive authority; design D1-D7 proposes implementation. (adv://change/replaceRecoveryToolSprawl)
- **[research_citation]** sources: Current Epic implementation: Current member status trusts stored membership_status and instructs callers to run repair; child projection failure returns adv_epic_repair_membership guidance. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/epic.ts#L251-L294)
- **[research_citation]** sources: Current mutation receipt implementation: Current receipts contain id, signalName, and recordedAt; reducer stores them atomically with mutation but uses a bounded FIFO. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/contracts.ts#L616-L622)
- **[research_citation]** sources.omitted: 12 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core three-layer shape is sound and simpler than public repair routing: owner-authoritative intent, direct convergence, bounded residual reconciliation, and explicit destructive/conflict refusal align with the approved contract and Temporal's durable-execution model. Current source confirms the exact operator-ceremony defects D1/D4/D5 remove. However, D2 is internally inconsistent: operationKey includes canonical payload hash while also requiring same operationKey with a different requestHash to produce OPERATION_PAYLOAD_CONFLICT. That conflict branch is unreachable by construction. D2 also promises a hard 256-record cap while retaining all unresolved records, but defines neither backpressure nor an overflow rule; more than 256 unresolved records cannot satisfy both invariants. These defects affect duplicate-prevention and timeout correctness, so design cannot pass unchanged. Spec-law implications: modify or replace rq-epicMembershipRepair01 and rq-epicSearchAttributeRepair01 with owner-authoritative direct convergence and conflict refusal; replace removed-tool references in rq-activeChangePointer01, rq-toolOwnership01, rq-searchAttrHealth01, and related generated docs; preserve rq-workflowVersioning01 and archive-only global-spec authority; add positive laws for doctor policy and residual reconciler bounds rather than only deleting old names.
- **[unresolved_action]** validation.blockers: D2 must separate stable logical operation identity from payload hash. Define operationKey from stable business identity only; store requestHash beside it; compare hash before every mutation. As written, including requestHash in operationKey makes same-key/different-hash conflict detection unreachable.
- **[unresolved_action]** validation.blockers: D2's hard cap of 256 records conflicts with retaining every unresolved operation when unresolved count can exceed 256. Silent eviction would re-open duplicate application after timeout or Continue-As-New; unbounded retention would violate the bounded-state criterion.
- **[epic_terminal_note]** epic.membership: hardenTemporalReliability · Replace recovery tool sprawl (order 9)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| C9 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: typecheck-tk-0528be678596
- verification_missing: No durable adv_run_test evidence found for run_id: lint-tk-0528be678596
- verification_missing: No durable adv_run_test evidence found for run_id: targeted-tests-tk-0528be678596
- verification_missing: No durable adv_run_test evidence found for run_id: full-check-tk-0528be678596
- verification_missing: No durable adv_run_test evidence found for run_id: typecheck-001
- verification_missing: No durable adv_run_test evidence found for run_id: lint-001
- verification_missing: No durable adv_run_test evidence found for run_id: schemas-manifests-001
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-001
- D2 must separate stable logical operation identity from payload hash. Define operationKey from stable business identity only; store requestHash beside it; compare hash before every mutation. As written, including requestHash in operationKey makes same-key/different-hash conflict detection unreachable.
- D2's hard cap of 256 records conflicts with retaining every unresolved operation when unresolved count can exceed 256. Silent eviction would re-open duplicate application after timeout or Continue-As-New; unbounded retention would violate the bounded-state criterion.
