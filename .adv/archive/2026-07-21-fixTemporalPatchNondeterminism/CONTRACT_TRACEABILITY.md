# Contract Traceability

**Change ID:** fixTemporalPatchNondeterminism
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T20:04:28Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Six named production histories have schema-validated classification, metadata, and sanitized committed fixtures; replay classification suite passed 21/21. |
| SC2 | success_criterion | pass | review | Replay corpus validates terminal classifications, audits all six sanitized histories before replay, and passes 21/21 targeted tests. |
| SC3 | success_criterion | pass | review | Command-boundary recording/drift workflow regression crosses Activity/timer order and verifies incompatible replay rejection; included in green full suite. |
| SC4 | success_criterion | pass | review | Shared WorkerArtifactPolicy verifier guards production Worker.create paths in worker, in-process worker, dynamic registration, and plugin initialization; structural tests pass. |
| SC5 | success_criterion | pass | review | Temporal artifact hashes are verified before manifest-last publication; deploy-local manifest and worker-refresh tests pass in full suite. |
| SC6 | success_criterion | pass | review | Independent verifier ran bin/oc-test full: 453/453 files passed, 6778 tests passed, 1 expected failure, 12 todo, zero unexpected failures. |
| C1 | constraint | respected | static_check | Reviewer inspected branch diff: no workflow-state deletion, recreation, termination, or recovery mutation was introduced or executed. |
| C2 | constraint | respected | static_check | Reviewer inspected branch diff and typecheck: changeWorkflow entry signature is unchanged. |
| C3 | constraint | respected | static_check | Implementation extends canonical dist/temporal/bundle-manifest.json verification; no competing manifest format or freshness subsystem added. |
| C4 | constraint | respected | static_check | CI now calls auditSanitizedHistory for every committed production history; nested proposal/agreement/task/evidence/subagent-report and secret-bearing payload tests pass. |
| C5 | constraint | respected | static_check | Typed production_verified mode fails closed on missing/mismatched artifacts; explicit development_source mode remains covered by tests. |
| C6 | constraint | respected | static_check | All implementation, review, checkpoints, and verification ran in the ADV-managed change/fixTemporalPatchNondeterminism worktree. |
| DONT1 | avoidance | respected | review | Root cause and terminal outcomes derive from captured replay command evidence; patch-marker position alone was explicitly rejected. |
| DONT2 | avoidance | respected | review | No generic deprecatePatch relocation was added; review confirmed no speculative workflow marker mutation. |
| DONT3 | avoidance | respected | review | No retained workflow patch marker was removed. |
| DONT4 | avoidance | respected | review | All six affected real Temporal histories are committed, classified, sanitized, audited, and exercised; synthetic regression is supplemental only. |
| DONT5 | avoidance | respected | review | Change records typed recovery handoff only; it does not add disk-authoritative reads, archive durability behavior, or workflow recovery execution. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-08c8652ba945 | SC1, SC2 | SC1, SC2 | C1, C4, C6, DONT1, DONT4, DONT5 |  |
| tk-cfcdf9a91953 | SC1, SC2 | SC1, SC2 | C1, C4, DONT1, DONT4, DONT5 |  |
| tk-728444920e47 | SC3 | SC3 | C1, C2, C6, DONT1, DONT2, DONT3, DONT5 |  |
| tk-e9077befa06a | SC4 | SC4 | C2, C6, DONT4, DONT5 |  |
| tk-2dbb8952ea67 | SC5 | SC5 | C3, C5, C6, DONT5 |  |
| tk-86086a4015dc | SC5 | SC5 | C3, C5, C6, DONT5 |  |
| tk-2474a075ca33 | SC6 | SC1, SC2, SC3, SC4, SC5, SC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-c97480a502f8 |  | SC6 | C6, DONT5 |  |
| tk-2b0b78b242ee |  | SC6 | C6, DONT5 |  |
| tk-2661bb012efc |  | SC6 | C6, DONT5 |  |
| tk-648c14529038 |  | SC6 | C4, C6, DONT5 |  |
