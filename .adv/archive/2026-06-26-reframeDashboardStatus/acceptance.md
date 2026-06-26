# Acceptance

Reviewed at: 2026-06-26T17:35:37.210Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Primary visible cards are ADV changes, not raw `workflow_run`/`deployment`/`pull` event cards. | pass | Primary visible cards now use `adv_change_status` model; tests tr_mqv74wne_95632b32 and tr_mqv7ff29_5df2600b passed. |
| SC2 | success_criterion | A change’s column reflects latest linked CI/deployment status. | pass | Lane classification derives from latest linked CI/deployment state; attention/server tests verify needs_attention, running, ready_landed, backlog. |
| SC3 | success_criterion | Older failed runs no longer create false attention after a newer same workflow+branch run succeeds. | pass | Test `centers lanes on ADV changes and suppresses stale same-identity CI failures` proves newer same workflow+branch success suppresses older failure; tr_mqv74wne_95632b32 passed. |
| SC4 | success_criterion | Current failures and running work remain visible. | pass | Newest failing/running sources remain visible in needs_attention/running; tests tr_mqv74wne_95632b32 passed. |
| SC5 | success_criterion | Unmatched source work remains inspectable, but secondary. | pass | Unlinked source appears in secondary `unmatched_source`; tests tr_mqv74wne_95632b32 and tr_mqv79h3f_d3ed3f73 passed. |
| AC1 | acceptance_criterion | Given multiple workflow runs exist for the same workflow and branch, when a newer run succeeds, then older failed runs do not place the change in `Needs attention`. | pass | Newer same workflow+branch success suppresses older failed run in tr_mqv74wne_95632b32. |
| AC2 | acceptance_criterion | Given multiple workflow runs exist for the same workflow and branch, when the newest run is failing, then the linked change appears in `Needs attention` with a link to that latest failing run. | pass | Newest same workflow+branch failure yields `needs_attention` and latest failing CI summary; tr_mqv74wne_95632b32 passed. |
| AC3 | acceptance_criterion | Given the newest workflow run for a linked change is queued, pending, in_progress, or running, when the dashboard renders, then the change appears in `Running`. | pass | Newest in_progress run yields `running`; tr_mqv74wne_95632b32 passed. |
| AC4 | acceptance_criterion | Given the newest workflow/deployment state for a linked change is success or landed, when the dashboard renders, then the change appears in `Ready / landed`. | pass | Latest deployment inactive/success-like state yields `ready_landed`; tr_mqv74wne_95632b32 passed. |
| AC5 | acceptance_criterion | Given an ADV change has no correlated source activity and is draft/non-active, when the dashboard renders, then it appears in `Backlog / inventory`, not `Needs attention`. | pass | Draft/no-source change goes to `backlog`; tr_mqv74wne_95632b32 passed. |
| AC6 | acceptance_criterion | Given an ADV change has correlated source activity, when the dashboard renders, then the change card shows the change title/id/gate plus latest PR, CI, and deployment links/details where present. | pass | ADV change status cards expose title/id/gate plus latest PR/CI/deployment and source details; UI tests tr_mqv7dt3u_d9ea75a9 passed. |
| AC7 | acceptance_criterion | Given a source item cannot be linked to any ADV change, when the dashboard renders, then it appears in a secondary unmatched source section and does not determine primary columns. | pass | Unlinked source remains in secondary `unmatched_source`; model/server tests passed tr_mqv74wne_95632b32/tr_mqv79h3f_d3ed3f73. |
| AC8 | acceptance_criterion | Given GitHub or ADV reads fail, when the dashboard renders, then degraded source cards remain visible and no false green/latest status is inferred. | pass | Degraded sources remain visible and no false green is inferred; model tests and existing degraded server tests passed in tr_mqv7ff29_5df2600b. |
| AC9 | acceptance_criterion | Given source links/metadata render on change-centered cards, when the dashboard loads, then safe URL allowlisting, HTML escaping, no-secret behavior, and no mutation controls remain intact. | pass | UI tests preserve safeUrl, escapeHtml, no forms/mutation controls; tr_mqv7dt3u_d9ea75a9 passed. |
| AC10 | acceptance_criterion | Given dashboard tests run, when `bun test bin/` completes, then latest-run precedence, change-centered columns, unmatched secondary section, degraded fallback, and read-only constraints are covered by tests. | pass | Targeted dashboard tests tr_mqv7ff29_5df2600b passed 20 tests/119 expects; full bin suite tr_mqv7g1mj_6c94a733 passed 165 tests/491 expects. |
| C1 | constraint | Keep dashboard local-only at `127.0.0.1`. | respected | No dashboard host/listener behavior changed; server tests for loopback default passed in tr_mqv79h3f_d3ed3f73 and full tr_mqv7g1mj_6c94a733. |
| C2 | constraint | Read-only UI only: no rerun/merge/approve/deploy/archive/cancel controls. | respected | No mutation controls/forms rendered; UI no-mutation test passed tr_mqv7dt3u_d9ea75a9. |
| C3 | constraint | No token/secret display. | respected | No token/secret display; existing sanitization/degraded tests passed full suite tr_mqv7g1mj_6c94a733. |
| C4 | constraint | GitHub auth model unchanged: `GITHUB_TOKEN` first, then bounded `gh auth token` fallback. | respected | GitHub auth code unchanged; dashboard auth fallback remains GITHUB_TOKEN then gh auth token. |
| C5 | constraint | No fuzzy title-based correctness; source-to-change linking must remain structural (branch/SHA/known keys). | respected | Source linking remains structural in correlation.ts branch/SHA/ops keys; no fuzzy title matching added. |
| C6 | constraint | If latest derivation cannot prove a superseding newer source state, preserve visibility as unknown/unmatched/attention as appropriate rather than hiding risk. | respected | Missing timestamp does not suppress valid failure; degraded/missing data does not false green. tr_mqv74wne_95632b32 passed. |
| DONT1 | avoidance | No GitHub mutation controls. | respected | No GitHub mutation controls added; UI no-mutation tests passed. |
| DONT2 | avoidance | No ADV mutation controls. | respected | No ADV mutation controls added; UI no-mutation tests passed. |
| DONT3 | avoidance | No server-side preference store. | respected | No server-side preference store added. |
| DONT4 | avoidance | No hosted dashboard behavior. | respected | No hosted dashboard behavior added; local server behavior unchanged. |
| DONT5 | avoidance | No false green from missing/ambiguous data. | respected | Missing/ambiguous data does not produce false green; tests cover missing timestamp and degraded source behavior. |
| DONT6 | avoidance | No primary raw event wall. | respected | Primary raw event wall removed; primary cards are ADV change status cards and raw unmatched source is secondary. Tests passed. |

