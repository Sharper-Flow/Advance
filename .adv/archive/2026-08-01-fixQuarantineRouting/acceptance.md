# Acceptance

Reviewed at: 2026-08-01T21:54:12.208Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Invoke-only dry-run quarantine of a corrupt projection resolves the canonical project identity and returns a typed diagnosis/target path rather than `Could not resolve project identity from store`. | pass | Durable tr_msawlk53_3d7a40d1 passed 15/15; acceptance reviewer READY confirms Git-root identity and external-state separation. |
| AC2 | acceptance_criterion | Approved quarantine moves only the named corrupt projection outside the active conflict-scan path and records recovery evidence. | pass | Quarantine suite and acceptance review verify approved atomic quarantine and audit behavior. |
| AC3 | acceptance_criterion | Healthy and missing projections remain refused without mutation. | pass | 15/15 quarantine tests preserve healthy/missing refusals. |
| AC4 | acceptance_criterion | Quarantine still rejects unapproved execution and missing approval evidence. | pass | 15/15 quarantine tests preserve unapproved and missing-evidence refusals. |
| AC5 | acceptance_criterion | Archive remains fail-closed when conflict inventory cannot be evaluated after quarantine handling. | pass | Acceptance reviewer READY confirms no archive force or fail-open behavior was introduced. |
| AC6 | acceptance_criterion | Automated tests cover the state-path/Git-root separation and routed operator invocation. | pass | New committed regression uses distinct Git-root and non-Git external-state fixture; targeted suite passed in tr_msawlk53_3d7a40d1. |
| C1 | constraint | No archive force/bypass. | respected | Source diff contains no archive force/bypass path. |
| C2 | constraint | No direct state-file repair or Temporal history rewrite. | respected | Source diff contains no direct state repair or Temporal history rewrite. |
| C3 | constraint | Keep quarantine path containment and audit rollback guarantees intact. | respected | Existing quarantine tests pass; acceptance review confirms containment and audit rollback preserved. |

