# Contract Traceability

**Change ID:** reframeDashboardStatus
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T17:35:37.210Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Primary visible cards now use `adv_change_status` model; tests tr_mqv74wne_95632b32 and tr_mqv7ff29_5df2600b passed. |
| SC2 | success_criterion | pass | review | Lane classification derives from latest linked CI/deployment state; attention/server tests verify needs_attention, running, ready_landed, backlog. |
| SC3 | success_criterion | pass | review | Test `centers lanes on ADV changes and suppresses stale same-identity CI failures` proves newer same workflow+branch success suppresses older failure; tr_mqv74wne_95632b32 passed. |
| SC4 | success_criterion | pass | review | Newest failing/running sources remain visible in needs_attention/running; tests tr_mqv74wne_95632b32 passed. |
| SC5 | success_criterion | pass | review | Unlinked source appears in secondary `unmatched_source`; tests tr_mqv74wne_95632b32 and tr_mqv79h3f_d3ed3f73 passed. |
| AC1 | acceptance_criterion | pass | test | Newer same workflow+branch success suppresses older failed run in tr_mqv74wne_95632b32. |
| AC2 | acceptance_criterion | pass | test | Newest same workflow+branch failure yields `needs_attention` and latest failing CI summary; tr_mqv74wne_95632b32 passed. |
| AC3 | acceptance_criterion | pass | test | Newest in_progress run yields `running`; tr_mqv74wne_95632b32 passed. |
| AC4 | acceptance_criterion | pass | test | Latest deployment inactive/success-like state yields `ready_landed`; tr_mqv74wne_95632b32 passed. |
| AC5 | acceptance_criterion | pass | test | Draft/no-source change goes to `backlog`; tr_mqv74wne_95632b32 passed. |
| AC6 | acceptance_criterion | pass | test | ADV change status cards expose title/id/gate plus latest PR/CI/deployment and source details; UI tests tr_mqv7dt3u_d9ea75a9 passed. |
| AC7 | acceptance_criterion | pass | test | Unlinked source remains in secondary `unmatched_source`; model/server tests passed tr_mqv74wne_95632b32/tr_mqv79h3f_d3ed3f73. |
| AC8 | acceptance_criterion | pass | test | Degraded sources remain visible and no false green is inferred; model tests and existing degraded server tests passed in tr_mqv7ff29_5df2600b. |
| AC9 | acceptance_criterion | pass | test | UI tests preserve safeUrl, escapeHtml, no forms/mutation controls; tr_mqv7dt3u_d9ea75a9 passed. |
| AC10 | acceptance_criterion | pass | test | Targeted dashboard tests tr_mqv7ff29_5df2600b passed 20 tests/119 expects; full bin suite tr_mqv7g1mj_6c94a733 passed 165 tests/491 expects. |
| C1 | constraint | respected | static_check | No dashboard host/listener behavior changed; server tests for loopback default passed in tr_mqv79h3f_d3ed3f73 and full tr_mqv7g1mj_6c94a733. |
| C2 | constraint | respected | static_check | No mutation controls/forms rendered; UI no-mutation test passed tr_mqv7dt3u_d9ea75a9. |
| C3 | constraint | respected | static_check | No token/secret display; existing sanitization/degraded tests passed full suite tr_mqv7g1mj_6c94a733. |
| C4 | constraint | respected | static_check | GitHub auth code unchanged; dashboard auth fallback remains GITHUB_TOKEN then gh auth token. |
| C5 | constraint | respected | static_check | Source linking remains structural in correlation.ts branch/SHA/ops keys; no fuzzy title matching added. |
| C6 | constraint | respected | static_check | Missing timestamp does not suppress valid failure; degraded/missing data does not false green. tr_mqv74wne_95632b32 passed. |
| DONT1 | avoidance | respected | review | No GitHub mutation controls added; UI no-mutation tests passed. |
| DONT2 | avoidance | respected | review | No ADV mutation controls added; UI no-mutation tests passed. |
| DONT3 | avoidance | respected | review | No server-side preference store added. |
| DONT4 | avoidance | respected | review | No hosted dashboard behavior added; local server behavior unchanged. |
| DONT5 | avoidance | respected | review | Missing/ambiguous data does not produce false green; tests cover missing timestamp and degraded source behavior. |
| DONT6 | avoidance | respected | review | Primary raw event wall removed; primary cards are ADV change status cards and raw unmatched source is secondary. Tests passed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e4fef5d1e8a2 | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC7, AC8 | AC1, AC2, AC3, AC4, AC5, AC7, AC8 | C4, C5, C6, DONT5, DONT6 |  |
| tk-a20745f27ee3 | SC1, SC2, SC3, SC4, AC2, AC6, AC7, AC8, AC10 | AC2, AC6, AC7, AC8, AC10 | C1, C3, C4, C5, C6, DONT5, DONT6 |  |
| tk-af093a0e646c | SC1, SC3, SC4, AC2, AC3, AC4, AC5, AC6, AC7, AC9 | AC2, AC3, AC4, AC5, AC6, AC7, AC9 | C1, C2, C3, C6, DONT1, DONT2, DONT3, DONT4 |  |
| tk-c8342793d838 | SC1, SC2, SC3, SC4, SC5, AC10 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
