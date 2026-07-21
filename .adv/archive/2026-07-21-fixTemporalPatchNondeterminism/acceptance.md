# Acceptance

Reviewed at: 2026-07-21T20:04:28Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Six real-history fixtures registered and sanitized. | pass | Six named production histories have schema-validated classification, metadata, and sanitized committed fixtures; replay classification suite passed 21/21. |
| SC2 | success_criterion | Targeted replay suite passes every self-healed fixture and structurally validates every immutable classification. | pass | Replay corpus validates terminal classifications, audits all six sanitized histories before replay, and passes 21/21 targeted tests. |
| SC3 | success_criterion | A command-boundary drift regression demonstrably fails against an incompatible worker variant. | pass | Command-boundary recording/drift workflow regression crosses Activity/timer order and verifies incompatible replay rejection; included in green full suite. |
| SC4 | success_criterion | Every production `Worker.create` path is guarded by one shared manifest verifier. | pass | Shared WorkerArtifactPolicy verifier guards production Worker.create paths in worker, in-process worker, dynamic registration, and plugin initialization; structural tests pass. |
| SC5 | success_criterion | Build and deployment checks verify temporal artifacts and manifest-last publication. | pass | Temporal artifact hashes are verified before manifest-last publication; deploy-local manifest and worker-refresh tests pass in full suite. |
| SC6 | success_criterion | Full repository checks pass. | pass | Independent verifier ran bin/oc-test full: 453/453 files passed, 6778 tests passed, 1 expected failure, 12 todo, zero unexpected failures. |
| C1 | constraint | No workflow-state deletion or recreation. | respected | Reviewer inspected branch diff: no workflow-state deletion, recreation, termination, or recovery mutation was introduced or executed. |
| C2 | constraint | No `changeWorkflow` signature change. | respected | Reviewer inspected branch diff and typecheck: changeWorkflow entry signature is unchanged. |
| C3 | constraint | No duplicate worker-manifest format or competing freshness subsystem. | respected | Implementation extends canonical dist/temporal/bundle-manifest.json verification; no competing manifest format or freshness subsystem added. |
| C4 | constraint | Captured fixtures contain no user-authored proposal, agreement, task, evidence, or secret payloads. | respected | CI now calls auditSanitizedHistory for every committed production history; nested proposal/agreement/task/evidence/subagent-report and secret-bearing payload tests pass. |
| C5 | constraint | Production startup fails closed; development fallback remains usable and explicit. | respected | Typed production_verified mode fails closed on missing/mismatched artifacts; explicit development_source mode remains covered by tests. |
| C6 | constraint | Work runs in the ADV-managed change worktree. | respected | All implementation, review, checkpoints, and verification ran in the ADV-managed change/fixTemporalPatchNondeterminism worktree. |
| DONT1 | avoidance | Do not infer root cause from patch-marker position alone. | respected | Root cause and terminal outcomes derive from captured replay command evidence; patch-marker position alone was explicitly rejected. |
| DONT2 | avoidance | Do not use `deprecatePatch` as a generic relocation mechanism. | respected | No generic deprecatePatch relocation was added; review confirmed no speculative workflow marker mutation. |
| DONT3 | avoidance | Do not remove markers without retained-history evidence. | respected | No retained workflow patch marker was removed. |
| DONT4 | avoidance | Do not create synthetic-only proof while real affected histories remain untested. | respected | All six affected real Temporal histories are committed, classified, sanitized, audited, and exercised; synthetic regression is supplemental only. |
| DONT5 | avoidance | Do not absorb disk-authoritative reads, archive durability, or workflow recovery into this change. | respected | Change records typed recovery handoff only; it does not add disk-authoritative reads, archive durability behavior, or workflow recovery execution. |

