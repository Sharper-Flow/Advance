# Contract Traceability

**Change ID:** simplifyDashboardView
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T05:40:22.912Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Typed grouping in `attention.ts` compresses repeated source history; tests tr_mqui3npy_d8267b13 passed 18 dashboard tests/117 expects. |
| SC2 | success_criterion | pass | review | Inactive deployment history groups by kind/status/title/ref and renders as grouped cards; tr_mqui3npy_d8267b13 and tr_mqui3rvf_55641142 passed. |
| SC3 | success_criterion | pass | review | Draft inventory summarizes into a group when count exceeds 5; attention/server tests verify inventory group count and collapsedByDefault. |
| SC4 | success_criterion | pass | review | Active lane remains visible; UI rendering keeps active lane as ordinary lane and only group details use disclosures. tr_mqui3npy_d8267b13 passed. |
| SC5 | success_criterion | pass | review | Group items expose member details and UI renders `<details class="group-card">`; hidden items are available through local disclosure expansion. tr_mqui3npy_d8267b13 passed. |
| AC1 | acceptance_criterion | pass | test | attention.test verifies duplicate workflow/deployment grouping by kind/status/title/branch-or-ref with count and latest timestamp. tr_mqui3npy_d8267b13 passed. |
| AC2 | acceptance_criterion | pass | test | attention/server tests verify repeated failures group into one signal group rather than raw spam. tr_mqui3npy_d8267b13 passed. |
| AC3 | acceptance_criterion | pass | test | UI lane keys and active rendering preserved; grouped UI does not require active lane expansion. tr_mqui3npy_d8267b13 passed. |
| AC4 | acceptance_criterion | pass | test | server test verifies unmatched lane order `[pull, group]`, putting open PRs before inactive deployment groups. tr_mqui3npy_d8267b13 passed. |
| AC5 | acceptance_criterion | pass | test | attention/server tests verify many draft ADV changes become inventory group with count and collapsedByDefault rather than full draft wall. tr_mqui3npy_d8267b13 passed. |
| AC6 | acceptance_criterion | pass | test | UI test verifies group rendering through `<details>/<summary>` and hiddenCount/member previews. tr_mqui3npy_d8267b13 passed. |
| AC7 | acceptance_criterion | pass | test | UI tests cover safeUrl/escapeHtml in grouped path and no links inside summary; full bin suite passed tr_mqui3rvf_55641142. |
| AC8 | acceptance_criterion | pass | test | Full `bun test bin/` passed in tr_mqui3rvf_55641142: 163 tests, 489 expects. |
| C1 | constraint | respected | static_check | No host/listener behavior changed; dashboard remains local-only. Full bin suite tr_mqui3rvf_55641142 passed. |
| C2 | constraint | respected | static_check | No forms or mutation controls added; UI no-mutation tests passed in tr_mqui3npy_d8267b13. |
| C3 | constraint | respected | static_check | No token/secret fields added; rendering still uses escape/sanitization paths and full suite passed. |
| C4 | constraint | respected | static_check | Lane keys unchanged and pinned by tests: attention, active, unmatched, inventory. tr_mqui3npy_d8267b13 passed. |
| C5 | constraint | respected | static_check | Grouping implemented in typed lane builder, not UI heuristics. Reviewer READY confirmed architecture. |
| C6 | constraint | respected | static_check | No cache/coalescing provider changes except deployment timestamp projection; full bin suite passed tr_mqui3rvf_55641142. |
| DONT1 | avoidance | respected | review | No server-side preferences store added; expansion uses native local `<details>`. |
| DONT2 | avoidance | respected | review | No analytics/trends dashboard added. |
| DONT3 | avoidance | respected | review | No GitHub or ADV mutation controls added; no-mutation UI tests passed. |
| DONT4 | avoidance | respected | review | No fuzzy linking changes; grouping uses already-projected deterministic source identity only. |
| DONT5 | avoidance | respected | review | Failures are grouped but still visible in attention; not hidden entirely. attention/server tests passed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1b2f7d960ff3 | SC1, SC2, SC3, SC5, AC1, AC2, AC4, AC5 | AC1, AC2, AC4, AC5 | C4, C5, C6, DONT4, DONT5 |  |
| tk-9b35ae665efb | SC1, SC3, SC4, AC2, AC3, AC6, AC7 | AC2, AC3, AC6, AC7 | C1, C2, C3, C5, DONT1, DONT2, DONT3 |  |
| tk-003230313726 | SC1, SC2, SC3, SC4, SC5, AC8 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
