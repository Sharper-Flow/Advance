# Acceptance

Reviewed at: 2026-07-21T00:20:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** — `bin/adv slop-scan --json` invoked at the ADV repo root (default path `.`) returns a report whose `coverage.detectors[]` no longer contains `eslint`/`knip`/`ast-grep`/`jscpd` in `failed` state with `ERR_PNPM_NO_PKG_MANIFEST`. They enter `run` state (findings or no-findings) or — for the multiple-package case — fail with the ambiguity message. | pass | Unit suite tr_mrtwj42l_90bfdc93 covers single-root resolution and multi-root ambiguity; reviewer report fixSlopScanResolverTimeouts|change:review:acceptance|adv-reviewer|1 confirms root scan lists acp-mux/plugin and contains no ERR_PNPM_NO_PKG_MANIFEST. |
| AC2 | acceptance_criterion | **AC2** — A regression test in `bin/lib/slop-scan/scan.test.ts` proves the resolver descends into a single nested package subdir when `requestedPath` resolves to repoRoot. | pass | bin/lib/slop-scan/scan.test.ts single nested package regression passed in tr_mrtwj42l_90bfdc93 and full bin run tr_mrtwkh95_53a14fb5. |
| AC3 | acceptance_criterion | **AC3** — A regression test proves the resolver fails with an actionable error (listing candidate subdirs) when multiple nested package roots exist at repoRoot. | pass | bin/lib/slop-scan/scan.test.ts multi-package ambiguity regression passed in tr_mrtwj42l_90bfdc93; root E2E reviewer evidence lists acp-mux and plugin. |
| AC4 | acceptance_criterion | **AC4** — Existing walk-up behavior is preserved: a `requestedPath` inside a package subdir (e.g. `plugin/src/a.ts`) still resolves to that package's root. Existing test `scan.test.ts:104` continues to pass unchanged. | pass | Existing and added walk-up preservation tests passed in tr_mrtwj42l_90bfdc93 and tr_mrtwkh95_53a14fb5. |
| AC5 | acceptance_criterion | **AC5** — `DEFAULT_SLOP_SCAN_CONFIG.ast_timeout_ms` raised to `30000`; the config test asserting the default value is updated to match. | pass | config default and project override are 30000; config regression passed in tr_mrtwj42l_90bfdc93 and full bin run tr_mrtwkh95_53a14fb5. |
| AC6 | acceptance_criterion | **AC6** — `bin/adv slop-scan plugin --json` from the worktree no longer reports ESLint as `timed_out`. | pass | E2E run tr_mrtwjsl8_2e1a5d54: bin/adv slop-scan plugin --json returned failure=null and every important detector, including ESLint, state=run. |
| C1 | constraint | No `slop_scan_report.v1` schema change. | respected | Reviewer READY report confirms no schema changes; trunk...HEAD touches scan/config/runner implementations, tests, and project.json only. |
| C2 | constraint | No `coverage.detectors[].state` enum change. | respected | Reviewer READY report confirms coverage state enum unchanged; existing states reused. |
| C3 | constraint | No per-detector timeout overrides (out of scope; future feature). | respected | No per-detector timeout override added; existing ast_timeout_ms default and project override changed to 30000. |
| C4 | constraint | No auto-install path for missing detectors (intentional non-goal). | respected | No install/bootstrap logic added; pnpm exec invocation remains dependency-declared. |
| C5 | constraint | Walk-down is restricted to ONE level of immediate subdirs; do not recurse. | respected | findNestedPackageRoots reads only immediate repoRoot children; no recursive package-root discovery. |
| C6 | constraint | Filter candidates by `SKIP_DIRS` and require source files in the candidate dir. | respected | findNestedPackageRoots skips SKIP_DIRS and requires directoryContainsSource before accepting a candidate. |
| C7 | constraint | When ambiguous, refuse — do not guess between candidates. | respected | Multiple candidates return kind=ambiguous and build a SLOP_SCAN_DEGRADED report; ambiguity test passed. |
| DONT1 | avoidance | Do not silently pick the first package root when multiple exist; that produces wrong-package findings. | respected | Independent reviewer READY: resolver refuses multi-root ambiguity instead of picking first candidate. |
| DONT2 | avoidance | Do not recurse deeply into the tree looking for packages; performance and ambiguity both suffer. | respected | Independent reviewer READY: package discovery remains one level; source-presence traversal does not discover nested package roots. |
| DONT3 | avoidance | Do not change the existing `pnpm exec` invocation pattern — only the `cwd` it runs from. | respected | Independent reviewer READY: buildEslintCommand/buildKnipCommand/buildAstGrepCommand/buildJscpdCommand pnpm exec patterns unchanged. |
| DONT4 | avoidance | Do not touch `bin/adv` CLI arg parsing — the fix lives in `scan.ts` `nearestPackageRoot`. | respected | Independent reviewer READY: bin/adv argument parsing untouched. |
| OOS1 | out_of_scope | Per-detector timeout multipliers. | missing |  |
| OOS2 | out_of_scope | Auto-install/bootstrap of missing detectors. | missing |  |
| OOS3 | out_of_scope | Schema/coverage-state enum changes. | missing |  |
| OOS4 | out_of_scope | Changes to `acp-mux/` (archived reference material). | missing |  |

