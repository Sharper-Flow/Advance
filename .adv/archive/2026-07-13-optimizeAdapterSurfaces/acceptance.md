# Acceptance

Reviewed at: 2026-07-13T00:08:01.531Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `bin/adv slop-scan plugin/src/tools/change.ts --json` completes without `SLOP_SCAN_DEGRADED` caused by missing or undeclared required Knip, jscpd, or ast-grep tooling. | pass | Live `bin/adv slop-scan plugin/src/tools/change.ts --json` exited 0 with eslint/knip/jscpd/ast-grep all `run` and no SLOP_SCAN_DEGRADED; independent review READY. |
| AC2 | acceptance_criterion | Required detectors use repository-declared, reproducible dependencies/configuration; no global installation is required. | pass | Committed plugin dev dependencies/configuration verified by review; detector suite 42 passing and no global install used. |
| AC3 | acceptance_criterion | ast-grep has committed `sgconfig.yml` and a bounded rule directory containing at least one tested TypeScript structural rule aligned with existing slop-scan policy. | pass | Root sgconfig.yml, bounded slop-rules/no-debugger.yml, and ast-grep adapter/rule-discovery tests pass. |
| AC4 | acceptance_criterion | Knip and jscpd have committed project configuration and adapter tests proving their commands resolve through local package tooling and their JSON output is parsed. | pass | Knip 6 issues[] parser and jscpd JSON parsing are covered by adapter tests; commands run with pnpm exec at plugin package root. |
| AC5 | acceptance_criterion | Existing `change.ts` complexity hotspots not overlapping this change’s hunks are documented as pre-existing debt; no broad `change.ts` split is required. | pass | Design records whole-file change.ts complexity findings as pre-existing debt; task scope did not split/refactor change.ts. |
| AC6 | acceptance_criterion | Full `bin/oc-test full`, `pnpm run check`, detector tests, and the live slop scan pass before re-running harden. | pass | Recorded evidence: bin/oc-test full, pnpm run check, detector suite, and live slop scan all passed; independent reviewer reran focused detector and adapter/concurrency checks. |
| C1 | constraint | Preserve existing specs, adapter safety, Temporal signal/query semantics, and gate-order invariants. | respected | Independent review found no regression in existing target-path/recovery/gate-order behavior; targeted adapter/concurrency tests passed. |
| C2 | constraint | Use repo-local dev dependencies and committed config/rules; do not rely on globally installed binaries. | respected | Dependencies are declared in plugin/package.json and lockfile; committed configs/rules are used through pnpm exec. |
| C3 | constraint | Preserve required-detector semantics; do not downgrade detector importance or suppress degraded coverage. | respected | Required detector failures remain degraded; live scan evidence confirms restored coverage rather than severity suppression. |
| C4 | constraint | Keep ast-grep rules bounded to existing structural/slop policy. No generic lint platform or broad rule migration. | respected | Rule pack is bounded to sgconfig.yml plus slop-rules/no-debugger.yml; no generic lint platform or broad migration added. |
| OOS1 | out_of_scope | Full `change.ts` complexity refactor/split for pre-existing hotspots outside changed hunks. | not_applicable | No broad change.ts complexity refactor or split was performed. |
| OOS2 | out_of_scope | Broad AST rule-pack migration beyond the minimum rules needed to establish reproducible required ast-grep coverage. | not_applicable | Only the minimum no-debugger ast-grep rule was added. |
| OOS3 | out_of_scope | New user-facing workflows, schema-boundary redesign, status/list performance work, and unrelated cleanup. | not_applicable | No new user workflow, schema-boundary redesign, status/list performance work, or unrelated cleanup. |

