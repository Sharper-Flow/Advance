# Archive Briefing Digest

**Change ID:** fixAcceptanceMatrixRecovery
**Title:** Fix acceptance matrix recovery
**Status:** archived
**Generated:** 2026-08-01T17:49:21.264Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

No Epic membership

## Durable Facts

Showing 49 of 49 durable facts.

- **[archive_only_evidence]** decisions: Added optional recovery_audit to ContractReviewMatrixSchema — Provides a disk-only typed marker so acceptance reconciliation can identify matrices that need re-delivery without leaking recovery metadata into workflow state
- **[archive_only_evidence]** decisions: Introduced saveRecoveredContractReviewMatrix recovery writer — Follows the same pattern as disposition recovery writers; stamps recovery_audit on the disk projection while storing a clean (marker-free) signal payload for re-delivery
- **[archive_only_evidence]** decisions: Extended acceptance reconciliation to handle contract_review_matrix family — Re-delivers recovered matrices via contractReviewMatrixSetSignal, strips recovery_audit from the payload, compares reviewedAt+rows only, and clears the marker after confirmation
- **[archive_only_evidence]** decisions: Added recoveryMutateLatestProjection to MutationIntent — Allows the healthy Temporal signal path to write a clean matrix while the signal-error recovery path writes the matrix with a recovery_audit marker, using one coordinator call
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/_recovery-writers.test.ts src/tools/contract.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/types/contract.test.ts src/types/recovery-audit-roundtrip.test.ts (0) — 6/6 test files pass, 97/97 tests pass
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check (0) — Generated JSON schemas are in sync
- **[archive_only_evidence]** verification: cd plugin && pnpm run format:check (0) — Prettier formatting is clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9l3r5d_cac5ecd4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9k8xbl_9f778c48
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9l6161_ddf32d48
- **[archive_only_evidence]** decisions: Replaced per-call dynamic import of tool-registry with a module-level dynamic import promise — The per-call import inside buildWarrantLookup caused tool-registry to start loading inside the 5s Vitest test window for the first contract test; under load the first import exceeded 5s and produced timeouts (and downstream TDZ errors when the import promise was abandoned). Kicking off the promise at module load resolves the registry during test import (outside the per-test timeout) while preserving the dynamic-import cycle break with tool-registry.ts.
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/_recovery-writers.test.ts src/tools/contract.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/types/contract.test.ts src/types/recovery-audit-roundtrip.test.ts (0) — 6/6 test files pass, 97/97 tests pass
- **[archive_only_evidence]** verification: cd plugin && pnpm run typecheck (0) — tsc --noEmit passes
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check (0) — Generated JSON schemas are in sync
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/tools/contract.test.ts (0) — contract.test.ts 20/20 tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msak2l8d_eaa4aba1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msajy45e_f8b5558d
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msajw2ny_d4d7904d
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msak1ysr_7401db24
- **[report_follow_up]** follow_ups: adv_change_show timed out repeatedly on artifact includes (adv_doctor reports worker/server healthy) — agreement/design/problemStatement artifacts could not be read this attempt; validate the written design.md/agreement.md ACs against these source findings once the read path recovers.
- **[report_follow_up]** follow_ups: Confirm how the disposition recovery_audit marker is stamped during the ORIGINAL disposition recovery write (the mechanism the matrix writer must mirror) — likely in the disposition tool's mutateLatestProjection or a recovery-aware projection wrapper; trace it to copy the exact stamp contract.
- **[report_follow_up]** follow_ups: Verify reviewMatrixPostcondition (contract.ts:259) currently compares full-matrix equality; ensure it is adjusted to exclude recovery_audit when that field is added.
- **[research_citation]** sources: gate.ts acceptance reconciliation path: For gateId==='acceptance', reconcileRecoveredAcceptanceRemediation runs BEFORE gateCompletedSignal (1948); a blocked reconciliation returns the error WITHOUT firing gateCompletedSignal (fail-closed, 1929-1939). Confirms design ordering. (plugin/src/tools/gate.ts:1918-1960)
- **[research_citation]** sources: acceptance-reconciliation.ts core seam: reconcileRecoveredAcceptanceRemediation collects recovery_audit-marked dispositions, re-delivers each via its family signal through coordinateChangeMutation, verifies postcondition, then clears markers via commitChangeProjection with exact-match protection (109-136). Design extends this same seam to the matrix family. (plugin/src/tools/acceptance-reconciliation.ts:275-356)
- **[research_citation]** sources: coordinator recovered_verified semantics: recovered_verified = disk projection committed + disk-readback verified while workflow was completed/missing/poisoned (did NOT receive the signal). Payload is stashed in commit audit 'so the mutation can be re-delivered to a reachable workflow' (90-93). This is the real gap: a later reachable workflow lacks the recovered matrix. (plugin/src/tools/change-mutation-coordinator.ts:88-93,525-593)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design extends the already-proven, source-resident acceptance-reconciliation seam (reconcileRecoveredAcceptanceRemediation) to a third family (contract review matrix), reusing coordinateChangeMutation + commitChangeProjection + exact-match marker clearing. Ordering (reconcile before gateCompletedSignal) and fail-closed behavior are already structurally wired in gate.ts:1923-1960, so no new control-flow is introduced. The reducer (applyContractReviewMatrixSetToState) is idempotent (last-write-wins + receipt), so re-delivering a recovered matrix to a reachable workflow is safe and replay-tolerant. recovered_verified is correctly understood as disk-confirmed/workflow-unconfirmed (coordinator:525-593), so the gap the design closes is real: a reachable workflow that lacks the recovered matrix would otherwise block acceptance readiness per rq-readinessMutationReceipt01. Deviation from reference pattern: MINOR and confined to (1) adding the optional recovery_audit field to ContractReviewMatrixSchema (currently absent) and stamping it family-specifically in the recovery writer, and (2) one signal-payload cleanliness concern (below).
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the two in-scope remediation files before acceptance proceeds.
- **[unresolved_action]** required_main_agent_actions: Do not revisit broader workflow redesign or unrelated acceptance behavior.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Do not eagerly start the cycle-breaking tool-registry dynamic import in contract.ts: behavioral-only and dry-run contract minting need no warrant lookup, and concurrent focused suites can exceed Vitest's 5s test timeout. Build it only when an agreement contains a declared [warrant: ...] tag.
- **[archive_only_evidence]** changes_made: plugin/src/tools/contract.ts: Removed eager module-level tool-registry import. Contract mint now builds live warrant lookup only when agreement declares a warrant, eliminating healthy and dry-run mint timeouts while retaining structural validation for declared warrants.
- **[archive_only_evidence]** changes_made: plugin/src/validator/contract-mint.ts: Updated warrant-lookup contract documentation to describe conditional production injection for declared warrant tags.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/contract.test.ts, bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/_recovery-writers.test.ts src/tools/contract.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/types/contract.test.ts src/types/recovery-audit-roundtrip.test.ts, bin/oc-test targeted -- src/tool-registry.surface.test.ts src/validator/contract-mint.test.ts src/validator/warrant.test.ts src/ac-warrant-guard-assets.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin run format:check, pnpm --dir plugin run schemas:check results=pass — Contract test 20/20; recovery-focused suite 6 files, 97/97; warrant-focused suite 4 files, 59/59. Typecheck, Prettier, and schema synchronization pass. Inspected checkpoint a7f8b636 and durable verification tr_msak5ugw_61e53e84 (5 focused files, 79 passed). Earlier combined recovery test exposed 3 contract-mint timeouts; scoped remediation was applied and all reruns passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/contract.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/_recovery-writers.test.ts src/tools/contract.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/types/contract.test.ts src/types/recovery-audit-roundtrip.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tool-registry.surface.test.ts src/validator/contract-mint.test.ts src/validator/warrant.test.ts src/ac-warrant-guard-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run format:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- **[unresolved_action]** required_main_agent_actions: Checkpoint the scoped reviewer remediation before final release/archive processing.
- **[unresolved_action]** required_main_agent_actions: Run normal archive/release freshness, reachability, and merge evidence checks; this review does not replace Phase 9 proof.
- **[unresolved_action]** required_main_agent_actions: Optionally schedule the two complexity reductions as a focused maintenance follow-up; they are not release blockers.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Recovery-marker clearing must compare the full recovered contract review matrix, including its audit identity, before stripping metadata. Clearing any current matrix can erase a newer disk-only recovery that has not been re-delivered to Temporal.
- **[archive_only_evidence]** changes_made: plugin/src/tools/acceptance-reconciliation.ts: Prevented reconciliation from removing a newer contract-review-matrix recovery marker: clear only the exact matrix that was successfully re-delivered.
- **[archive_only_evidence]** changes_made: plugin/src/tools/acceptance-reconciliation.test.ts: Added coverage for a newer recovered matrix arriving during an older marker-clear attempt; it must remain marked and block acceptance.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts, pnpm run check, bin/adv slop-scan plugin/src/tools/acceptance-reconciliation.ts --json results=pass — Targeted reconciliation suite: 1 file, 12 tests passed. pnpm run check passed schemas, TypeScript, generated manifests, frontmatter, test-isolation, lockfile policy, lint (3 pre-existing warnings only), and Prettier. Slop scan found no CRITICAL/HIGH findings; two MEDIUM complexity suggestions in the touched reconciliation module and unrelated low-confidence repo-wide Knip candidates.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/acceptance-reconciliation.ts --json

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9l3r5d_cac5ecd4
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9k8xbl_9f778c48
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9l6161_ddf32d48
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msak2l8d_eaa4aba1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msajy45e_f8b5558d
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msajw2ny_d4d7904d
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msak1ysr_7401db24
- Review and checkpoint the two in-scope remediation files before acceptance proceeds.
- Do not revisit broader workflow redesign or unrelated acceptance behavior.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/contract.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts src/tools/_recovery-writers.test.ts src/tools/contract.test.ts src/tools/gate.acceptance-reconciliation.test.ts src/types/contract.test.ts src/types/recovery-audit-roundtrip.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tool-registry.surface.test.ts src/validator/contract-mint.test.ts src/validator/warrant.test.ts src/ac-warrant-guard-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run format:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- Checkpoint the scoped reviewer remediation before final release/archive processing.
- Run normal archive/release freshness, reachability, and merge evidence checks; this review does not replace Phase 9 proof.
- Optionally schedule the two complexity reductions as a focused maintenance follow-up; they are not release blockers.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/acceptance-reconciliation.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/acceptance-reconciliation.ts --json
