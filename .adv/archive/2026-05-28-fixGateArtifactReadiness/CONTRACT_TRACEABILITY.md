# Contract Traceability

**Change ID:** fixGateArtifactReadiness
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-28T22:28:34.187Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts no-disk agreement discovery regression passed; workflows.ts patched path uses stateBackedArtifactEvidence for proposal/discovery/design; reviewer READY. |
| AC2 | acceptance_criterion | pass | test | gate-readiness.test.ts missing state document test passed; stateBackedArtifactEvidence returns ARTIFACT_MISSING blocker. |
| AC3 | acceptance_criterion | pass | test | gate-readiness.test.ts undersized state document test passed; stateBackedArtifactEvidence returns ARTIFACT_UNDERSIZED blocker. |
| AC4 | acceptance_criterion | pass | test | gate-readiness.test.ts evidence-with-metadata and no-metadata-hash tests passed; content_hash populated only from state.artifacts metadata and omitted when absent. |
| AC5 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts completes discovery from workflow-state agreement without disk agreement file; targeted/full tests pass. |
| AC6 | acceptance_criterion | pass | test | gate-readiness.test.ts missing/undersized state document tests pass; full pnpm test pass. |
| AC7 | acceptance_criterion | pass | test | store-temporal changes and no-disk/invariant tests passed; no changes to store-temporal/changes.ts reintroduced disk writes; reviewer READY. |
| AC8 | acceptance_criterion | pass | test | Acceptance branch left intact; existing acceptance projection/executive-summary tests and full pnpm test pass; reviewer READY. |
| AC9 | acceptance_criterion | pass | test | docs/temporal-recovery.md adds stuck proposal/discovery/design gates recovery section with deploy/restart/re-enter/no manual disk steps. |
| AC10 | acceptance_criterion | pass | test | Final verification passed: targeted tests, full pnpm test, pnpm run check, pnpm run build, full pnpm test re-run after formatting. |
| C1 | constraint | respected | static_check | store-temporal/changes.ts untouched; no legacy artifact-content disk writes reintroduced. |
| C2 | constraint | respected | static_check | Helper lives in temporal/gate-readiness.ts; workflow-bundle-boundary.test.ts passed; no node/storage/tool/fs imports added to workflow path. |
| C3 | constraint | respected | static_check | STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH guards command-sequence change; replay-determinism tests passed. |
| C4 | constraint | respected | static_check | Recovery docs specify deploy/restart/re-enter retry and explicitly forbid manual artifact markdown writes. |
| C5 | constraint | respected | static_check | Touched scope limited to gate-readiness/workflows/tests/recovery docs and agenda bookkeeping; no PokeEdge app code or unrelated worktree cleanup. |
| DONT1 | avoidance | respected | review | Patched proposal/discovery/design path no longer uses disk as canonical; no-disk agreement regression passes. |
| DONT2 | avoidance | respected | review | Missing/undersized state documents still block via stateBackedArtifactEvidence tests. |
| DONT3 | avoidance | respected | review | No new metadata content storage introduced; helper uses existing state.documents and state.artifacts only. |
| DONT4 | avoidance | respected | review | Readiness logic remains workflow-owned in temporal/gate-readiness.ts and workflows.ts, not tool-layer. |
| DONT5 | avoidance | respected | review | inspectArtifactActivity remains in workflows.ts for acceptance/legacy branch and in tools/gate.ts recovery paths. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Artifact update APIs and archive bundle materialization not rewritten. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Project-level state migration not touched. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No PokeEdge/PokeEdge-web app repository changes. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No manual stuck-change state editing outside ADV tools. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9e7e10e51fd5 |  |  | C5 | Environment setup; no logic-bearing code. |
| tk-a626aad4a434 |  | AC1, AC2, AC3, AC4, AC5, AC6 | C3 |  |
| tk-29f14c3cf352 | AC1, AC2, AC3, AC4 | AC2, AC3, AC4 | C2, C5, DONT2, DONT3, DONT4 |  |
| tk-bf79cd6aab57 | AC1, AC5, AC8 | AC1, AC5, AC8 | C1, C2, C3, DONT1, DONT4, DONT5 |  |
| tk-a2de4f9dcc61 | AC9 | AC9 | C4, C5, DONT1 | Documentation-only recovery guidance; verified by review. |
| tk-1d818d174eb5 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC10 | C1, C2, C3, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-c6b290fe835a | AC9 |  | C4, C5 | ADV agenda bookkeeping; implementation verification covered elsewhere. |
