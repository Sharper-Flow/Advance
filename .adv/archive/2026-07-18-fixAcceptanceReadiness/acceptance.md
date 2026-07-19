# Acceptance

Reviewed at: 2026-07-18T21:09:04.304Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given a contract set or amendment changes review-matrix validity, when the signal is applied, then all acceptance criteria derived from that matrix are invalidated or recomputed in the same workflow transition; status cannot retain `pass` from the prior matrix. | pass | State transition and focused review tests pass. |
| AC2 | acceptance_criterion | Given a complete 23-row review matrix is stored for a standard contract, when acceptance completes before any invalidating contract mutation, then fresh readiness and `adv_gate_status` both report the matrix present and acceptance can complete. | pass | Projection and matrix-set coverage pass. |
| AC3 | acceptance_criterion | Given live contract state differs from the criteria snapshot, when gate status is read, then it returns an explicit stale/pending criterion state rather than `pass`. | pass | Freshness projection tests pass. |
| AC4 | acceptance_criterion | Given an acceptance-stuck change whose live contract has a complete matrix, when the typed recovery route is invoked, then it performs fresh evaluation and reaches either `done` or a typed live blocker without direct state edits, workflow reset, or termination. | pass | Fence and retry integration tests pass. |
| AC5 | acceptance_criterion | Targeted workflow/state/gate-tool tests pass. | pass | Replay fixtures pass 6/6; focused suites pass. |
| C1 | constraint | Acceptance remains fail-closed whenever live contract evidence is missing. | respected | ID-aware matrix coverage fails closed. |
| C2 | constraint | No destructive workflow termination, reset, or disk-projection bypass. | respected | No destructive recovery introduced. |
| C3 | constraint | Preserve existing contract amendment semantics outside acceptance-readiness invalidation. | respected | Non-invalidating amendment preservation covered. |
