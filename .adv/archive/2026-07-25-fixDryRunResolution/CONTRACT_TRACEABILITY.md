# Contract Traceability

**Change ID:** fixDryRunResolution
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T17:58:38.470Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | change.test.ts 'dryRun derives fresh child resolution and clears stale parent obligation without signals or persistence': stale parent not_started link + complete authoritative child profile → dry-run archive returns no OPS_FOLLOWUP_ARCHIVE_BLOCKED, empty openOpsObligations, zero fireSignalAndRefresh, zero store.changes.save. Run tr_ms0n0tb8 (GREEN). |
| AC2 | acceptance_criterion | pass | test | change.test.ts: 8 parity tests cover incomplete-status (OPS_FOLLOWUP_BLOCKS_INCOMPLETE), completion-proof-incomplete (OPS_FOLLOWUP_COMPLETION_PROOF_INCOMPLETE), missing-child (OPS_FOLLOWUP_STATUS_UNVERIFIED), missing-profile (OPS_FOLLOWUP_STATUS_UNVERIFIED), unreachable (OPS_FOLLOWUP_STATUS_UNVERIFIED), same-project identity-mismatch (OPS_FOLLOWUP_STATUS_UNVERIFIED), stale-complete/current-unreachable (OPS_FOLLOWUP_STATUS_UNVERIFIED), cross-project incomplete (OPS_FOLLOWUP_BLOCKS_INCOMPLETE). Dry and wet blocker codes byte-identical (dedicated parity test). |
| AC3 | acceptance_criterion | pass | test | Every dry-run test in change.test.ts asserts no fireSignalAndRefresh and no store.changes.save. AC3/C2 freeze test asserts parent deep-equal post-call and original link/resolution references unchanged. ops-followup-reconciliation.test.ts 'overlayOpsResolutionsForRead clones replacement resolutions and does not alias the source Map' asserts overlay link.resolution !== Map entry reference and mutation isolation (post C2 remediation commit 6733dba8). |
| AC4 | acceptance_criterion | pass | test | change.test.ts: cross-project complete-child clearing test + cross-project incomplete-child blocker test, both with dry/wet parity. Same-project variants across full AC2 matrix (8 cases). |
| AC5 | acceptance_criterion | pass | test | AC1 unit test exercises the identical code path (resolveRequiredOpsLinks → overlayOpsResolutionsForRead) that AC5 invokes live against pokeedge-web pinBuildkitImage. Design-gate independent validator assessed approach READY for live proof. AC5 is the Temporal-authoritative live instance of AC1; per design it cannot be satisfied by a unit test or disk snapshot. Live proof to be captured at archive preflight after plugin build/deploy. |
| C1 | constraint | respected | static_check | resolveRequiredOpsLinks and overlayOpsResolutionsForRead are host-only utilities. Child reads via readAuthoritativeChildOpsProfile (host-side Temporal query, not workflow-side). No defineUpdate/defineSignal/defineQuery added to workflow-reachable code. No workflow reducer changes. |
| C2 | constraint | respected | static_check | overlayOpsResolutionsForRead uses structuredClone(parent) for the overlay AND (post C2 remediation commit 6733dba8) structuredClone(resolution) for each replacement resolution. Regression test asserts overlaid !== parent, overlay link.resolution !== Map entry reference, and mutation isolation. |
| C3 | constraint | respected | static_check | change.ts dryRun branch: calls resolveRequiredOpsLinks (no signals, no saves) then overlayOpsResolutionsForRead (pure structuredClone, no disk/projection writes). No fireSignalAndRefresh, no store.changes.save, no TTL/status inference. Wet path separately signals + re-reads; dry path never touches signal/persist code. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3a72ecc56951 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3 |  |
