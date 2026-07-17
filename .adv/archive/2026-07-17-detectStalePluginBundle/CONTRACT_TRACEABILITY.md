# Contract Traceability

**Change ID:** detectStalePluginBundle
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-17T00:55:42.802Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY: generation equality is the staleness authority; files.index SHA/mtime diagnostic-only (engineer decision record, 12 manifest tests, AC5 mtime-preserving test). |
| SC2 | success_criterion | pass | review | Typed PLUGIN_BUNDLE_STALE with both generations + OpenCode restart remedy; detection is non-throwing and does not interrupt plugin initialization (reviewer suite: plugin-bundle-manifest, system-block, status tests). |
| SC3 | success_criterion | pass | review | Missing/empty/malformed/unsupported-schema/unreadable manifest yields bounded unknown state without throwing (AC4 tests in plugin-bundle-manifest.test.ts, reviewer-verified). |
| AC1 | acceptance_criterion | pass | test | pnpm run build writes dist/plugin-bundle-manifest.json schema v1 (generation, index.js SHA-256, ISO built_at); reviewer added no-leftover-temp-manifest coverage in deploy-local-plugin-manifest.test.ts — 295 scoped tests pass. |
| AC2 | acceptance_criterion | pass | test | Fresh-build loaded==deployed generation reports current (plugin-bundle-manifest.test.ts, 12/12; tr checkpoint 8c10a42c). |
| AC3 | acceptance_criterion | pass | test | Mismatched generations report typed PLUGIN_BUNDLE_STALE with both generations and restart recommendation (plugin-bundle-manifest.test.ts + tool-formatters/system-block tests in reviewer run). |
| AC4 | acceptance_criterion | pass | test | All malformed-manifest variants produce bounded unknown without throw (plugin-bundle-manifest.test.ts, reviewer-verified pass). |
| AC5 | acceptance_criterion | pass | test | mtime-preserving deployment with changed generation still reports stale — generation equality authoritative (plugin-bundle-manifest.test.ts). |
| AC6 | acceptance_criterion | pass | test | adv_status view:health returns loaded generation, deployed generation, freshness state, recovery action (status.test.ts + plugin-runtime-info.test.ts in reviewer scoped run). |
| AC7 | acceptance_criterion | pass | test | Exactly one [ADV:PLUGIN_BUNDLE_STALE] section on confirmed replacement; none for current/unknown (system-block.test.ts, reviewer-verified). |
| AC8 | acceptance_criterion | pass | test | Deploy refuses when required plugin manifest missing (deploy-local.test.ts + deploy-local-plugin-manifest.test.ts; reviewer hardened atomic same-dir temp+rename publication). |
| AC9 | acceptance_criterion | pass | test | Docs assert no hot reload, restart remedy, advisory mtime provenance, one-restart bootstrap limitation (docs task checkpoint evidence + reviewer corpus checks). |
| C1 | constraint | respected | static_check | pnpm run check green; generation equality is sole authority in plugin-bundle-manifest.ts, timestamps diagnostic-only (engineer decision + reviewer static review). |
| C2 | constraint | respected | static_check | Manifest writes atomic (same-directory temp copy + rename, reviewer remediation in deploy-local.sh) and schema-validated; pnpm run check green. |
| C3 | constraint | respected | static_check | Staleness detection wrapped non-throwing, no runtime code mutation; initialization path unchanged (reviewer static review + 295 scoped tests). |
| DONT1 | avoidance | respected | review | No hot reload implemented; docs explicitly state no hot reload (reviewer READY, 0 findings). |
| DONT2 | avoidance | respected | review | Process-start/mtime comparison not used as stale authority anywhere; AC5 test pins this. |
| DONT3 | avoidance | respected | review | Session-health/message-history warning state untouched; system-block section is additive (system-block.test.ts). |
| OOS1 | out_of_scope | not_applicable | not_applicable | OpenCode platform hot reload out of scope; not touched. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Worker bundle generation behavior out of scope; worker-bundle-manifest.ts unaffected (reviewer related-scan). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-36eb89003552 | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2 |  |
| tk-deb236c40515 | AC3, AC4, AC6, AC7 |  | C1, C3, DONT3 |  |
| tk-456db27571bf | AC8, AC9 | AC1, AC5 | C2 |  |
