# Contract Traceability

**Change ID:** fixSlopScanResolverTimeouts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T00:20:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Unit suite tr_mrtwj42l_90bfdc93 covers single-root resolution and multi-root ambiguity; reviewer report fixSlopScanResolverTimeouts|change:review:acceptance|adv-reviewer|1 confirms root scan lists acp-mux/plugin and contains no ERR_PNPM_NO_PKG_MANIFEST. |
| AC2 | acceptance_criterion | pass | test | bin/lib/slop-scan/scan.test.ts single nested package regression passed in tr_mrtwj42l_90bfdc93 and full bin run tr_mrtwkh95_53a14fb5. |
| AC3 | acceptance_criterion | pass | test | bin/lib/slop-scan/scan.test.ts multi-package ambiguity regression passed in tr_mrtwj42l_90bfdc93; root E2E reviewer evidence lists acp-mux and plugin. |
| AC4 | acceptance_criterion | pass | test | Existing and added walk-up preservation tests passed in tr_mrtwj42l_90bfdc93 and tr_mrtwkh95_53a14fb5. |
| AC5 | acceptance_criterion | pass | test | config default and project override are 30000; config regression passed in tr_mrtwj42l_90bfdc93 and full bin run tr_mrtwkh95_53a14fb5. |
| AC6 | acceptance_criterion | pass | test | E2E run tr_mrtwjsl8_2e1a5d54: bin/adv slop-scan plugin --json returned failure=null and every important detector, including ESLint, state=run. |
| C1 | constraint | respected | static_check | Reviewer READY report confirms no schema changes; trunk...HEAD touches scan/config/runner implementations, tests, and project.json only. |
| C2 | constraint | respected | static_check | Reviewer READY report confirms coverage state enum unchanged; existing states reused. |
| C3 | constraint | respected | static_check | No per-detector timeout override added; existing ast_timeout_ms default and project override changed to 30000. |
| C4 | constraint | respected | static_check | No install/bootstrap logic added; pnpm exec invocation remains dependency-declared. |
| C5 | constraint | respected | static_check | findNestedPackageRoots reads only immediate repoRoot children; no recursive package-root discovery. |
| C6 | constraint | respected | static_check | findNestedPackageRoots skips SKIP_DIRS and requires directoryContainsSource before accepting a candidate. |
| C7 | constraint | respected | static_check | Multiple candidates return kind=ambiguous and build a SLOP_SCAN_DEGRADED report; ambiguity test passed. |
| DONT1 | avoidance | respected | review | Independent reviewer READY: resolver refuses multi-root ambiguity instead of picking first candidate. |
| DONT2 | avoidance | respected | review | Independent reviewer READY: package discovery remains one level; source-presence traversal does not discover nested package roots. |
| DONT3 | avoidance | respected | review | Independent reviewer READY: buildEslintCommand/buildKnipCommand/buildAstGrepCommand/buildJscpdCommand pnpm exec patterns unchanged. |
| DONT4 | avoidance | respected | review | Independent reviewer READY: bin/adv argument parsing untouched. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-16dbe66c9d0f | AC1, AC4 |  | C5, C6, C7, DONT1, DONT2, DONT4 |  |
| tk-8f0c4750963d | AC5 |  | C3 |  |
| tk-66fd8d1f7503 |  | AC1, AC2, AC3, AC4, AC5, AC6 |  |  |
