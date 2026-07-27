# Contract Traceability

**Change ID:** addDurableAdvAdvanceMcp
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-07-27T23:39:51.520Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Live --check (worktree script against ~/.config/opencode/opencode.jsonc) emits '✓ mcp: adv-advance registered (Tier-4 read surface)'; TDD red phase (tr_ms3vc3al) proves predicate fails on stripped fixture. |
| SC2 | success_criterion | pass | review | Patch in fix_config() operates on $tmp_json accumulator; JSONC fail-loud branch at L1218 (unchanged) emits patches_summary line including '+ add mcp.adv-advance' and restore hint. Dry-run path also covered. |
| SC3 | success_criterion | pass | review | fix_config() patch (L1169-1178) runs on $tmp_json which is the in-memory patch accumulator; for plain JSON it writes through the existing atomic-write branch; for JSONC the fail-loud branch fires unchanged. |
| SC4 | success_criterion | pass | review | shellcheck 0.10.0 run; no new warnings on edited regions (L175-179 constants, L845-853 check, L1169-1178 patch). All flagged lines pre-existing on untouched code. |
| AC1 | acceptance_criterion | pass | test | Constants ADV_MCP_SERVER_NAME='adv-advance' and ADV_MCP_SERVER_URL='http://localhost:6298/mcp' inserted at L178-179 with explanatory comment citing Tier-4 read surface + DDC1 port rationale. |
| AC2 | acceptance_criterion | pass | test | check_config() block at L845-854 emits ✓ on match and ✗ with expected URL on mismatch; bumps config_issues on failure. Verified against live config (✓) and stripped fixture (✗). |
| AC3 | acceptance_criterion | pass | test | fix_config() block at L1169-1178 inserts entry when missing, before the JSONC fail-loud branch (L1235 unchanged). Appends '+ add mcp.adv-advance (Tier-4 read surface, ...)' to patches_summary. |
| AC4 | acceptance_criterion | pass | test | fix_config() JSONC fail-loud branch (L1235-onwards) is unchanged; new patch rides the same $tmp_json accumulator and patches_summary variable; jq never rewrites live JSONC. |
| AC5 | acceptance_criterion | pass | test | shellcheck 0.10.0 reports 0 warnings on L175-179, L845-854, L1169-1178. Pre-existing warnings on untouched lines remain unchanged. |
| AC6 | acceptance_criterion | pass | test | diff --stat shows 1 file changed, 29 insertions, 0 deletions (scripts/deploy-local.sh only). No other files touched; live opencode.jsonc not modified by this change. |
| C1 | constraint | respected | static_check | New check/patch blocks mirror the plugin-array check (L837) and patch (L1160) patterns exactly: same jq --arg quoting, same patches_summary append style, same config_issues bump. |
| C2 | constraint | respected | static_check | No spec deltas added (verified via adv_change_show deltas empty). Deploy-script operational improvement only. |
| C3 | constraint | respected | static_check | Live opencode.jsonc not mutated; only scripts/deploy-local.sh edited. Live --check reads but does not write. |
| C4 | constraint | respected | static_check | No changes to vision config or MCP server artifacts; only the opencode.jsonc mcp registration is touched (as data, not as code). |
| C5 | constraint | respected | static_check | JSONC fail-loud branch at L1235 unchanged; jq rewrites only $tmp_json accumulator. Live JSONC writes remain forbidden. |
| DONT1 | avoidance | respected | review | No JSONC-aware rewriter added. Existing fail-loud policy preserved verbatim. |
| DONT2 | avoidance | respected | review | Only ADV_MCP_SERVER_NAME='adv-advance' registered; no other servers touched. |
| DONT3 | avoidance | respected | review | Existing plugin/instructions/legacy-key checks and patches unchanged. diff shows pure additions only (29 insertions, 0 deletions). |
| OOS1 | out_of_scope | not_applicable | not_applicable | Bridge deprecation path not defined; registerAdvAdvanceMcpServer remains TEMPORARY_BRIDGE classification in Concord inventory. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Only scripts/deploy-local.sh edited. No other script, doc, or config file touched. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No live config or vision config mutation. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-bcb9faf85b0c | SC1, SC2, SC3, SC4 | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5 |  |
