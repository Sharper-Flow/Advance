# Acceptance

Reviewed at: 2026-07-17T00:55:42.802Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Deployed-versus-loaded plugin identity uses immutable generation equality rather than filesystem timestamps. | pass | Reviewer READY: generation equality is the staleness authority; files.index SHA/mtime diagnostic-only (engineer decision record, 12 manifest tests, AC5 mtime-preserving test). |
| SC2 | success_criterion | Confirmed mismatch provides a typed restart remedy without interrupting plugin initialization. | pass | Typed PLUGIN_BUNDLE_STALE with both generations + OpenCode restart remedy; detection is non-throwing and does not interrupt plugin initialization (reviewer suite: plugin-bundle-manifest, system-block, status tests). |
| SC3 | success_criterion | Missing or invalid manifest is diagnosable but safe. | pass | Missing/empty/malformed/unsupported-schema/unreadable manifest yields bounded unknown state without throwing (AC4 tests in plugin-bundle-manifest.test.ts, reviewer-verified). |
| AC1 | acceptance_criterion | A production plugin build writes `dist/plugin-bundle-manifest.json` schema v1 containing a generation, SHA-256 for `index.js`, and ISO `built_at`, with no temporary manifest remaining. | pass | pnpm run build writes dist/plugin-bundle-manifest.json schema v1 (generation, index.js SHA-256, ISO built_at); reviewer added no-leftover-temp-manifest coverage in deploy-local-plugin-manifest.test.ts — 295 scoped tests pass. |
| AC2 | acceptance_criterion | A freshly built loaded plugin generation equals its deployed manifest generation and reports `current`. | pass | Fresh-build loaded==deployed generation reports current (plugin-bundle-manifest.test.ts, 12/12; tr checkpoint 8c10a42c). |
| AC3 | acceptance_criterion | Different loaded and deployed generations report typed `PLUGIN_BUNDLE_STALE`, include both generations, and recommend OpenCode restart. | pass | Mismatched generations report typed PLUGIN_BUNDLE_STALE with both generations and restart recommendation (plugin-bundle-manifest.test.ts + tool-formatters/system-block tests in reviewer run). |
| AC4 | acceptance_criterion | Missing, empty, malformed, unsupported-schema, or unreadable manifest reports bounded `unknown` state without throwing. | pass | All malformed-manifest variants produce bounded unknown without throw (plugin-bundle-manifest.test.ts, reviewer-verified pass). |
| AC5 | acceptance_criterion | A deployment that preserves `dist/index.js` mtime but changes manifest generation still reports stale. | pass | mtime-preserving deployment with changed generation still reports stale — generation equality authoritative (plugin-bundle-manifest.test.ts). |
| AC6 | acceptance_criterion | `adv_status view:"health"` returns loaded generation, deployed generation, freshness state, and recovery action. | pass | adv_status view:health returns loaded generation, deployed generation, freshness state, recovery action (status.test.ts + plugin-runtime-info.test.ts in reviewer scoped run). |
| AC7 | acceptance_criterion | The next system transform after confirmed manifest replacement emits exactly one `[ADV:PLUGIN_BUNDLE_STALE]` section in the existing system block; current and unknown states emit none. | pass | Exactly one [ADV:PLUGIN_BUNDLE_STALE] section on confirmed replacement; none for current/unknown (system-block.test.ts, reviewer-verified). |
| AC8 | acceptance_criterion | Deployment refuses stale build output when required plugin manifest is missing. | pass | Deploy refuses when required plugin manifest missing (deploy-local.test.ts + deploy-local-plugin-manifest.test.ts; reviewer hardened atomic same-dir temp+rename publication). |
| AC9 | acceptance_criterion | Documentation states no hot reload, restart remedy, advisory mtime provenance, and one-restart bootstrap limitation. | pass | Docs assert no hot reload, restart remedy, advisory mtime provenance, one-restart bootstrap limitation (docs task checkpoint evidence + reviewer corpus checks). |
| C1 | constraint | Generation equality is authoritative; timestamp data is diagnostic only. | respected | pnpm run check green; generation equality is sole authority in plugin-bundle-manifest.ts, timestamps diagnostic-only (engineer decision + reviewer static review). |
| C2 | constraint | Manifest writes are atomic and schema-validated. | respected | Manifest writes atomic (same-directory temp copy + rename, reviewer remediation in deploy-local.sh) and schema-validated; pnpm run check green. |
| C3 | constraint | Staleness detection must not crash initialization or mutate runtime code. | respected | Staleness detection wrapped non-throwing, no runtime code mutation; initialization path unchanged (reviewer static review + 295 scoped tests). |
| DONT1 | avoidance | Do not implement plugin hot reload. | respected | No hot reload implemented; docs explicitly state no hot reload (reviewer READY, 0 findings). |
| DONT2 | avoidance | Do not use process-start/mtime comparison as stale authority. | respected | Process-start/mtime comparison not used as stale authority anywhere; AC5 test pins this. |
| DONT3 | avoidance | Do not overwrite session-health/message-history warning state. | respected | Session-health/message-history warning state untouched; system-block section is additive (system-block.test.ts). |
| OOS1 | out_of_scope | OpenCode platform-level module hot reload. | not_applicable | OpenCode platform hot reload out of scope; not touched. |
| OOS2 | out_of_scope | Worker bundle generation behavior. | not_applicable | Worker bundle generation behavior out of scope; worker-bundle-manifest.ts unaffected (reviewer related-scan). |

