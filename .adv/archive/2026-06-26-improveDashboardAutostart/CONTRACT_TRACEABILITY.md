# Contract Traceability

**Change ID:** improveDashboardAutostart
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T01:52:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | CLI install dry-run and service unit tests passed; README documents open URL. `bun test bin/` run tr_mqu9uvzi_93294154 passed. |
| SC2 | success_criterion | pass | review | Config profile test tr_mqu9d3uc_a6103f20 verifies PokeEdge and PokeEdge Web paths/repos in default config. |
| SC3 | success_criterion | pass | review | Route/UI tests verify GET-only routes, no mutation controls; full bin test tr_mqu9uvzi_93294154 passed. |
| SC4 | success_criterion | pass | review | Cache/coalescing test tr_mqu9d40u_d6ce5feb verifies one refresh per interval and in-flight Promise reuse. |
| SC5 | success_criterion | pass | review | GitHub fallback/setup tests tr_mqu9d3vo_29b2db8c and UI setup-card test tr_mqu9oa0g_22d0d847 passed. |
| AC1 | acceptance_criterion | pass | test | Install dry-run/service unit tests tr_mqu9oxzv_64bda9f3; preview reachability tr_mqua4gap_96126434 returned page=200 api=200 on loopback preview. |
| AC2 | acceptance_criterion | pass | test | Service test tr_mqu9ox8b_377a0ba2 verifies Linger=no parsing and `loginctl enable-linger` remediation. |
| AC3 | acceptance_criterion | pass | test | Config profile test tr_mqu9d3uc_a6103f20 verifies `/home/jon/dev/pokeedge`, `/home/jon/dev/pokeedge-web`, `Sharper-Flow/PokeEdge`, `Sharper-Flow/PokeEdge-Web`. |
| AC4 | acceptance_criterion | pass | test | Dashboard CLI test tr_mqu9d4d5_f4404a80 verifies occupied 8765 exits 75 with clear diagnostic and no fallback. |
| AC5 | acceptance_criterion | pass | test | GitHub auth test tr_mqu9d3vo_29b2db8c verifies absent GITHUB_TOKEN falls back to fake `gh auth token` and uses bearer auth. |
| AC6 | acceptance_criterion | pass | test | GitHub/UI tests tr_mqu9d3vo_29b2db8c and tr_mqu9oa0g_22d0d847 verify setup metadata/card and no token/stderr leakage. |
| AC7 | acceptance_criterion | pass | test | Server test tr_mqu9d40u_d6ce5feb verifies cached and coalesced `/api/state` provider behavior within refresh interval. |
| AC8 | acceptance_criterion | pass | test | Server tests tr_mqu9d40u_d6ce5feb and full run tr_mqu9uvzi_93294154 verify per-project/source degradation persists while other projects render. |
| AC9 | acceptance_criterion | pass | test | Handler/UI tests tr_mqu9d40u_d6ce5feb and tr_mqu9oa0g_22d0d847 verify non-GET 405 and no mutation controls/forms. |
| C1 | constraint | respected | static_check | normalizeDashboardServerOptions defaults to 127.0.0.1 and rejects non-loopback without explicit opt-in; tests passed in tr_mqu9d40u_d6ce5feb. |
| C2 | constraint | respected | static_check | Route/UI tests verify GET-only API and no mutation controls; full bin suite tr_mqu9uvzi_93294154 passed. |
| C3 | constraint | respected | static_check | CLI/server defaults keep port 8765; README documents stable `http://127.0.0.1:8765/`; tests passed. |
| C4 | constraint | respected | static_check | Collision test tr_mqu9d4d5_f4404a80 verifies no silent fallback and exit 75 diagnostic. |
| C5 | constraint | respected | static_check | Service unit generation contains no browser-open command; README says no auto-open; tests assert unit does not contain `open `. |
| C6 | constraint | respected | static_check | Cache/coalescing test tr_mqu9d40u_d6ce5feb verifies refresh cadence reuse; config keeps refresh 30-60s validation. |
| C7 | constraint | respected | static_check | Sanitization, GitHub degraded metadata, and setup-card tests verify no tokens/stderr/secret strings exposed. |
| C8 | constraint | respected | static_check | Server degradation tests verify source/project failure isolation; tr_mqu9d40u_d6ce5feb passed. |
| DONT1 | avoidance | respected | review | Only local CLI, local config, and user systemd unit were added; no hosted backend or remote service code. |
| DONT2 | avoidance | respected | review | UI/handler tests verify no mutation controls and non-GET rejection. |
| DONT3 | avoidance | respected | review | Reviewer report `improveDashboardAutostart|change:review:acceptance|adv-reviewer|1` READY; inspected delivered files and found no BI/trend expansion. |
| DONT4 | avoidance | respected | review | Service unit ExecStart only runs `adv dashboard --config ...`; tests assert no `open ` command in unit. |
| DONT5 | avoidance | respected | review | Reviewer READY report and diff scope show no provider-specific deployment API integrations added. |
| DONT6 | avoidance | respected | review | GitHub/setup/sanitizer tests verify no token-like material, raw stderr, or secret fields are exposed. |
| DONT7 | avoidance | respected | review | Cache/coalescing and refresh validation tests pass; no high-frequency polling introduced. |
| OOS1 | out_of_scope | respected | not_applicable | Reviewer READY report; implementation is local CLI/user service only. |
| OOS2 | out_of_scope | respected | not_applicable | UI/handler tests verify no mutations. |
| OOS3 | out_of_scope | respected | not_applicable | Reviewer READY report and diff scope show no analytics/history feature. |
| OOS4 | out_of_scope | respected | not_applicable | Service unit has no browser-open command; README documents no auto-open. |
| OOS5 | out_of_scope | respected | not_applicable | Reviewer READY report and diff scope show no provider deployment API expansion. |
| OOS6 | out_of_scope | respected | not_applicable | Implementation used Advance worktree only; status check observed no PokeEdge worktree use/mutation by this change, though `/home/jon/dev/pokeedge` has pre-existing untracked files. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0bc2f4f9410c | AC3, SC2, C3 | AC3 | C7, OOS6 |  |
| tk-7804b61a1f83 | AC4, C4 | AC4 | C3, DONT7 |  |
| tk-4c6f443940b6 | AC1, AC3, SC1, SC2, C1 | AC1, AC3 | C5, C7, OOS6 |  |
| tk-c257b823b337 | AC1, AC2, AC4, SC1 | AC2, AC4 | C3, C4, C5 |  |
| tk-9dcd9f1741fa | AC7, AC8, SC4, C6 | AC7, AC8 | C8, DONT7 |  |
| tk-f1617f2683a9 | AC5, AC6, SC5 | AC5, AC6 | C7, DONT6 |  |
| tk-8c9fc79ef5be | AC6, AC8, AC9, SC3, SC5 | AC6, AC9 | C1, C2, C7, DONT2, DONT6 |  |
| tk-89f29d4b5303 | SC1, SC2, SC3, SC5 |  | C1, C2, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-0dca566f6011 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, SC1, SC2, SC3, SC4, SC5 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
