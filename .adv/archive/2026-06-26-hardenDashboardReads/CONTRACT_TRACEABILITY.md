# Contract Traceability

**Change ID:** hardenDashboardReads
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T19:56:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | bun test bin/lib/dashboard bin/lib/live-status.test.ts passed (68 tests); static search found no loadLiveStatus/getState under bin/lib/dashboard. |
| SC2 | success_criterion | pass | review | bin/lib/dashboard/ui.test.ts covered local detail links; server detail route tests passed in dashboard suite. |
| SC3 | success_criterion | pass | review | UI tests cover compact detail fields and deeper <details> rendering; dashboard suite passed. |
| SC4 | success_criterion | pass | review | UI tests cover Source health renderer with source/code/affected/remediation/last_success_at and absence of ADV failure phrasing. |
| SC5 | success_criterion | pass | review | Server/UI tests cover GET-only routes, loopback defaults, cache/coalescing, escaping/safe URLs, no mutation controls, no token/raw state links. |
| AC1 | acceptance_criterion | pass | test | bin/lib/dashboard/adv.test.ts asserts routine state does not call loadOpsChanges; static search no getState/loadLiveStatus under bin/lib/dashboard. |
| AC2 | acceptance_criterion | pass | test | bin/lib/live-status.test.ts asserts AdvWorktreeBranches and AdvWorktreePaths decode all non-blank values from Visibility attrs. |
| AC3 | acceptance_criterion | pass | test | bin/lib/dashboard/adv.test.ts asserts base card remains visible, no degraded ops enrichment card, ops/head_shas omitted/empty without fan-out. |
| AC4 | acceptance_criterion | pass | test | bin/lib/dashboard/server.test.ts and ui.test.ts cover local detail route/page and compact + expandable detail rendering without mutation controls. |
| AC5 | acceptance_criterion | pass | test | bin/lib/dashboard/server.test.ts covers bounded detailReader timeout returning ADV_DETAIL_READ_TIMEOUT with compact detail still visible and command present. |
| AC6 | acceptance_criterion | pass | test | bin/lib/dashboard/ui.test.ts covers source-health fields and not presenting degradation as ADV change failure. |
| AC7 | acceptance_criterion | pass | test | UI/server tests assert safeUrl/escape behavior, no token text, no change.json/agreement.md raw links. |
| AC8 | acceptance_criterion | pass | test | bin/lib/dashboard/server.test.ts rejects POST to /api/change with 405 allow GET; existing server tests cover GET-only state routes. |
| AC9 | acceptance_criterion | pass | test | Final verification: dashboard suite 68 pass; cli-bridge spec-law 19 pass; schemas:check pass; reviewer verdict READY. |
| C1 | constraint | respected | static_check | normalizeDashboardServerOptions still defaults to 127.0.0.1 and requires explicit non-loopback opt-in; server tests pass. |
| C2 | constraint | respected | static_check | UI tests assert no mutation controls/form/POST control text; server rejects non-GET mutation attempts. |
| C3 | constraint | respected | static_check | sanitizeDashboardState remains in use; tests assert token-like strings absent from state/detail output. |
| C4 | constraint | respected | static_check | Detail command uses adv_change_show; UI tests assert no change.json/agreement.md raw state links. |
| C5 | constraint | respected | static_check | No GitHub auth code/model changes in reviewed diff; reviewer verdict READY. |
| C6 | constraint | respected | static_check | Server tests cover project/source read containment and detail timeout degradation; dashboard suite passed. |
| C7 | constraint | respected | static_check | Static search under bin/lib/dashboard found no loadLiveStatus/getState; routine reader removed default ops fan-out. |
| C8 | constraint | respected | static_check | live-status Visibility summary tests and dashboard routine no-ops-call tests passed. |
| C9 | constraint | respected | static_check | Existing createDashboardStateProvider cache/coalescing tests still pass in dashboard suite. |
| DONT1 | avoidance | respected | review | Reviewed diff adds read-only GET UI/routes only; no signals/updates/task/archive/rerun/merge/deploy controls. |
| DONT2 | avoidance | respected | review | No routine dashboard getState/loadLiveStatus fan-out references found; reviewer confirmed. |
| DONT3 | avoidance | respected | review | Tests assert token/raw ADV state path strings absent; sanitizeDashboardState used for detail response. |
| DONT4 | avoidance | respected | review | Routine reader uses loadLiveSummaries Visibility path and tests assert no ops/query call. |
| DONT5 | avoidance | respected | review | UI tests assert source-health phrasing and absence of ADV change failure wording for degraded sources. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b56c22828fd1 | SC1, SC5, C7, C8 | AC1, AC3, AC8, AC9 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-dd41082e9e6a | SC1, AC1, AC2, AC3, C7, C8 | AC1, AC2, AC3 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-89f1416b45fb | SC2, SC3, AC4, AC5, AC8, C1, C2, C4, C6, C9 | AC4, AC5, AC8 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-d028f5ee489b | SC2, SC3, SC4, SC5, AC4, AC6, AC7, AC8, C1, C2, C3, C4, C5 | AC4, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-e5f6374dad34 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, SC1, SC2, SC3, SC4, SC5 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
