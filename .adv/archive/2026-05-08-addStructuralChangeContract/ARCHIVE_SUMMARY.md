# Archive: Add structural change-contract traceability

**Change ID:** addStructuralChangeContract
**Archived:** 2026-05-08T22:54:46.745Z
**Created:** 2026-05-08T21:09:29.511Z

## Tasks Completed

- ✅ Define contract schemas and workflow-safe types
  > Added typed contract schemas for ChangeContract, ContractItem, evidence policies/statuses, review matrix rows, amendments, and TaskContractRefs. Added optional `contract` to ChangeSchema and optional `contract_refs` to TaskSchema. Exported schemas/types from barrel. Added schema tests.
- ✅ Add contract workflow signals and state mutators
  > Added contractSet, contractAmended, and contractReviewMatrixSet signal names, payload schemas, client/workflow bindings, workflow-state field, seed/continue-as-new persistence, and pure state mutators. Contract set derives legacy acceptanceCriteria projection from AC contract items. Added signal/message tests covering contract state, review matrix, amendments, and lastSignalAt behavior.
- ✅ Implement contract validation in change validation path
  > Added runContractChecks and integrated it into completeness validation. Checks include duplicate contract IDs, unknown task refs, missing refs on standard/strict code tasks, uncovered required AC items, unknown review refs, missing/failing proof rows, and legacy acceptanceCriteria projection drift. Added validation codes and targeted tests.
- ✅ Update discover and prep workflows for contract minting and task refs
  > Updated /adv-discover to mint a typed ChangeContract from approved agreement items before discovery gate completion, including SC/AC/C/DONT/OOS ID rules and acceptanceCriteria projection handling. Updated /adv-prep and prep checklist to require contract_refs during task synthesis when change.contract exists. Added asset tests for discover contract minting and prep task refs. Formatted previously unformatted contract files reported by check.
- ✅ Update review, harden, and archive workflows for contract proof
  > Updated /adv-review to include contract items in review packets and persist contract.reviewMatrix through the contractReviewMatrixSetSignal-backed path before acceptance. Updated /adv-harden to audit contract.reviewMatrix before release scanners. Updated /adv-archive with a Contract Proof Gate and CONTRACT_TRACEABILITY.md archive output expectations. Added asset coverage for the review→harden→archive contract proof flow.
- ✅ Implement archive contract traceability artifact and archive blocking
  > Added archive contract proof enforcement and traceability output. Archive now blocks proven-contract changes with missing/stale/unresolved review-matrix proof, unknown task/review refs, or missing amendment audit evidence. Archive bundles now include CONTRACT_TRACEABILITY.md for changes with contracts, and adv_change_archive performs proof checks before existing-bundle recovery. Added archive tests for missing proof, unresolved status, traceability markdown generation, archive output, plus tool test verification.
- ✅ Implement re-entry and amendment invalidation behavior
  > Added contract proof invalidation on gate re-entry before release: if a contract has a review matrix and the change re-enters discovery/design/planning/execution/acceptance, the matrix is cleared so stale proof cannot survive downstream reset. Added pure mutation coverage showing substantive contract amendment invalidates matrix and execution re-entry clears refreshed proof. Verified workflow signal handlers still pass.
- ✅ Update specs and durable documentation for contract spine
  > Added structural contract traceability requirements to advance-workflow and archive contract proof gate requirements to advance-delivery, including JSON specs and durable docs/specs mirrors. Added asset coverage that asserts spec IDs and docs are wired. Verified command asset tests, pnpm run check, and spec citation invariant.
- ✅ Run final end-to-end verification for contract spine
  > Ran final end-to-end verification for structural contract spine. `pnpm test`, `pnpm run check`, and `pnpm run build` all passed from plugin/. `adv_change_validate strict: true` passed with warnings only: NO_DELTAS and PROPOSAL_TASK_DRIFT for scaffold proposal Intent/Scope sections.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** After ADV worktree creation, apply_patch without an absolute worktree path edits the original session cwd/main checkout, not the worktree. Use absolute worktree paths for apply_patch when current session cwd remains main.
- **[pattern]** Contract validation should stay stage-tolerant: validate structural refs and failing provided proof in validateChange, but defer missing review-matrix hard-blocking to archive/review phases so prep/execution validations do not block before review exists.
