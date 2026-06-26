# Acceptance

Reviewed at: 2026-06-26T05:40:22.912Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | PokeEdge-style repeated source history compresses into grouped cards instead of raw duplicate cards. | pass | Typed grouping in `attention.ts` compresses repeated source history; tests tr_mqui3npy_d8267b13 passed 18 dashboard tests/117 expects. |
| SC2 | success_criterion | Inactive deployment history no longer dominates `Unmatched source`. | pass | Inactive deployment history groups by kind/status/title/ref and renders as grouped cards; tr_mqui3npy_d8267b13 and tr_mqui3rvf_55641142 passed. |
| SC3 | success_criterion | Draft ADV changes no longer dominate `Inventory` by default. | pass | Draft inventory summarizes into a group when count exceeds 5; attention/server tests verify inventory group count and collapsedByDefault. |
| SC4 | success_criterion | Active/running work stays visible without user expansion. | pass | Active lane remains visible; UI rendering keeps active lane as ordinary lane and only group details use disclosures. tr_mqui3npy_d8267b13 passed. |
| SC5 | success_criterion | Users can still expand groups/details locally to inspect hidden items. | pass | Group items expose member details and UI renders `<details class="group-card">`; hidden items are available through local disclosure expansion. tr_mqui3npy_d8267b13 passed. |
| AC1 | acceptance_criterion | Given duplicate workflow/deployment source items exist, when the dashboard renders, then repeated items with the same kind/status/title/branch-or-ref are grouped into one visible card with a count and latest timestamp. | pass | attention.test verifies duplicate workflow/deployment grouping by kind/status/title/branch-or-ref with count and latest timestamp. tr_mqui3npy_d8267b13 passed. |
| AC2 | acceptance_criterion | Given `Attention` has repeated failures, when the dashboard loads, then failures remain visible but duplicates are grouped so the lane shows signal groups rather than raw event spam. | pass | attention/server tests verify repeated failures group into one signal group rather than raw spam. tr_mqui3npy_d8267b13 passed. |
| AC3 | acceptance_criterion | Given `Active work` has running items, when the dashboard loads, then active items remain immediately visible without requiring expansion. | pass | UI lane keys and active rendering preserved; grouped UI does not require active lane expansion. tr_mqui3npy_d8267b13 passed. |
| AC4 | acceptance_criterion | Given `Unmatched source` includes open PRs and inactive deployment history, when the dashboard loads, then open PRs are prioritized and inactive deployment history is summarized/collapsed by default. | pass | server test verifies unmatched lane order `[pull, group]`, putting open PRs before inactive deployment groups. tr_mqui3npy_d8267b13 passed. |
| AC5 | acceptance_criterion | Given `Inventory` contains many draft ADV changes, when the dashboard loads, then the lane shows an inventory summary and does not render a full draft card wall by default. | pass | attention/server tests verify many draft ADV changes become inventory group with count and collapsedByDefault rather than full draft wall. tr_mqui3npy_d8267b13 passed. |
| AC6 | acceptance_criterion | Given a grouped or collapsed card has hidden detail items, when the user expands it locally, then hidden items become visible without network mutation or server write. | pass | UI test verifies group rendering through `<details>/<summary>` and hiddenCount/member previews. tr_mqui3npy_d8267b13 passed. |
| AC7 | acceptance_criterion | Given source cards include URLs and metadata, when grouped/compact rendering is used, then safe URL allowlisting, HTML escaping, and no-secret behavior remain intact. | pass | UI tests cover safeUrl/escapeHtml in grouped path and no links inside summary; full bin suite passed tr_mqui3rvf_55641142. |
| AC8 | acceptance_criterion | Given dashboard tests run, when `bun test bin/` completes, then grouping, default compactness, expansion behavior, and read-only constraints are covered by tests. | pass | Full `bun test bin/` passed in tr_mqui3rvf_55641142: 163 tests, 489 expects. |
| C1 | constraint | Local-only dashboard at `127.0.0.1`. | respected | No host/listener behavior changed; dashboard remains local-only. Full bin suite tr_mqui3rvf_55641142 passed. |
| C2 | constraint | Read-only UI only: no rerun/merge/approve/deploy/archive/cancel actions. | respected | No forms or mutation controls added; UI no-mutation tests passed in tr_mqui3npy_d8267b13. |
| C3 | constraint | No token or secret display. | respected | No token/secret fields added; rendering still uses escape/sanitization paths and full suite passed. |
| C4 | constraint | Do not hide attention/failure groups behind a collapsed lane. | respected | Lane keys unchanged and pinned by tests: attention, active, unmatched, inventory. tr_mqui3npy_d8267b13 passed. |
| C5 | constraint | Keep existing lane keys: `attention`, `active`, `unmatched`, `inventory`. | respected | Grouping implemented in typed lane builder, not UI heuristics. Reviewer READY confirmed architecture. |
| C6 | constraint | Prefer deterministic grouping over UI heuristics. | respected | No cache/coalescing provider changes except deployment timestamp projection; full bin suite passed tr_mqui3rvf_55641142. |
| DONT1 | avoidance | No server-side preferences store. | respected | No server-side preferences store added; expansion uses native local `<details>`. |
| DONT2 | avoidance | No analytics/trends dashboard. | respected | No analytics/trends dashboard added. |
| DONT3 | avoidance | No GitHub or ADV mutation controls. | respected | No GitHub or ADV mutation controls added; no-mutation UI tests passed. |
| DONT4 | avoidance | No fuzzy linking changes. | respected | No fuzzy linking changes; grouping uses already-projected deterministic source identity only. |
| DONT5 | avoidance | No hiding failures entirely. | respected | Failures are grouped but still visible in attention; not hidden entirely. attention/server tests passed. |

