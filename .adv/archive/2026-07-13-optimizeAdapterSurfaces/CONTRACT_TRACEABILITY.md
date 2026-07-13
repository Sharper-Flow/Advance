# Contract Traceability

**Change ID:** optimizeAdapterSurfaces
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-13T00:08:01.531Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Live `bin/adv slop-scan plugin/src/tools/change.ts --json` exited 0 with eslint/knip/jscpd/ast-grep all `run` and no SLOP_SCAN_DEGRADED; independent review READY. |
| AC2 | acceptance_criterion | pass | test | Committed plugin dev dependencies/configuration verified by review; detector suite 42 passing and no global install used. |
| AC3 | acceptance_criterion | pass | test | Root sgconfig.yml, bounded slop-rules/no-debugger.yml, and ast-grep adapter/rule-discovery tests pass. |
| AC4 | acceptance_criterion | pass | test | Knip 6 issues[] parser and jscpd JSON parsing are covered by adapter tests; commands run with pnpm exec at plugin package root. |
| AC5 | acceptance_criterion | pass | test | Design records whole-file change.ts complexity findings as pre-existing debt; task scope did not split/refactor change.ts. |
| AC6 | acceptance_criterion | pass | test | Recorded evidence: bin/oc-test full, pnpm run check, detector suite, and live slop scan all passed; independent reviewer reran focused detector and adapter/concurrency checks. |
| C1 | constraint | respected | static_check | Independent review found no regression in existing target-path/recovery/gate-order behavior; targeted adapter/concurrency tests passed. |
| C2 | constraint | respected | static_check | Dependencies are declared in plugin/package.json and lockfile; committed configs/rules are used through pnpm exec. |
| C3 | constraint | respected | static_check | Required detector failures remain degraded; live scan evidence confirms restored coverage rather than severity suppression. |
| C4 | constraint | respected | static_check | Rule pack is bounded to sgconfig.yml plus slop-rules/no-debugger.yml; no generic lint platform or broad migration added. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No broad change.ts complexity refactor or split was performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Only the minimum no-debugger ast-grep rule was added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No new user workflow, schema-boundary redesign, status/list performance work, or unrelated cleanup. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-253c52dc3ebc |  |  |  | Completed target-path characterization predates the detector-coverage re-entry; no current detector-contract item directly represents this preserved regression coverage. |
| tk-46c2bd98b7a6 |  |  |  | Completed target-path close/bulk-close characterization predates the detector-coverage re-entry; no current detector-contract item directly represents this preserved regression coverage. |
| tk-f76e8fce46f9 |  |  |  | Completed recovery characterization predates the detector-coverage re-entry; no current detector-contract item directly represents this preserved regression coverage. |
| tk-7fe504de5ae6 |  |  |  | Completed compatibility verification predates the detector-coverage re-entry; current detector-contract verification is owned by the later detector restoration task and hardening evidence. |
| tk-00a59233abd5 |  |  |  | Completed concurrent gate-order characterization predates the detector-coverage re-entry; no current detector-contract item directly represents this preserved regression coverage. |
| tk-00044c84bed7 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4 |  |
