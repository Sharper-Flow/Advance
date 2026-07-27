# Acceptance

Reviewed at: 2026-07-27T23:39:51.520Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | `bash scripts/deploy-local.sh --check` reports `✓  mcp: adv-advance registered` | pass | Live --check (worktree script against ~/.config/opencode/opencode.jsonc) emits '✓ mcp: adv-advance registered (Tier-4 read surface)'; TDD red phase (tr_ms3vc3al) proves predicate fails on stripped fixture. |
| SC2 | success_criterion | `bash scripts/deploy-local.sh --fix --dry-run` against a missing entry emits | pass | Patch in fix_config() operates on $tmp_json accumulator; JSONC fail-loud branch at L1218 (unchanged) emits patches_summary line including '+ add mcp.adv-advance' and restore hint. Dry-run path also covered. |
| SC3 | success_criterion | Plain-JSON configs (rare) get auto-patched with the standard entry. | pass | fix_config() patch (L1169-1178) runs on $tmp_json which is the in-memory patch accumulator; for plain JSON it writes through the existing atomic-write branch; for JSONC the fail-loud branch fires unchanged. |
| SC4 | success_criterion | `shellcheck` clean on the edited regions. | pass | shellcheck 0.10.0 run; no new warnings on edited regions (L175-179 constants, L845-853 check, L1169-1178 patch). All flagged lines pre-existing on untouched code. |
| AC1 | acceptance_criterion | Two new constants `ADV_MCP_SERVER_NAME` and `ADV_MCP_SERVER_URL` defined | pass | Constants ADV_MCP_SERVER_NAME='adv-advance' and ADV_MCP_SERVER_URL='http://localhost:6298/mcp' inserted at L178-179 with explanatory comment citing Tier-4 read surface + DDC1 port rationale. |
| AC2 | acceptance_criterion | `check_config()` emits a `✓` line when `.mcp.adv-advance.url` matches | pass | check_config() block at L845-854 emits ✓ on match and ✗ with expected URL on mismatch; bumps config_issues on failure. Verified against live config (✓) and stripped fixture (✗). |
| AC3 | acceptance_criterion | `fix_config()` includes a patch step that inserts the entry when missing, | pass | fix_config() block at L1169-1178 inserts entry when missing, before the JSONC fail-loud branch (L1235 unchanged). Appends '+ add mcp.adv-advance (Tier-4 read surface, ...)' to patches_summary. |
| AC4 | acceptance_criterion | JSONC fail-loud path is unchanged — operator gets a manual-edit restore | pass | fix_config() JSONC fail-loud branch (L1235-onwards) is unchanged; new patch rides the same $tmp_json accumulator and patches_summary variable; jq never rewrites live JSONC. |
| AC5 | acceptance_criterion | `shellcheck scripts/deploy-local.sh` reports no new warnings on edited | pass | shellcheck 0.10.0 reports 0 warnings on L175-179, L845-854, L1169-1178. Pre-existing warnings on untouched lines remain unchanged. |
| AC6 | acceptance_criterion | Live opencode.jsonc (which already has the entry) is NOT mutated by this | pass | diff --stat shows 1 file changed, 29 insertions, 0 deletions (scripts/deploy-local.sh only). No other files touched; live opencode.jsonc not modified by this change. |
| C1 | constraint | Follow the existing `plugin` array check/patch pattern exactly (lines 831 and | respected | New check/patch blocks mirror the plugin-array check (L837) and patch (L1160) patterns exactly: same jq --arg quoting, same patches_summary append style, same config_issues bump. |
| C2 | constraint | No new spec deltas; this is a deploy-script operational improvement. | respected | No spec deltas added (verified via adv_change_show deltas empty). Deploy-script operational improvement only. |
| C3 | constraint | No mutation of the live opencode.jsonc. | respected | Live opencode.jsonc not mutated; only scripts/deploy-local.sh edited. Live --check reads but does not write. |
| C4 | constraint | No vision config or MCP server artifact changes. | respected | No changes to vision config or MCP server artifacts; only the opencode.jsonc mcp registration is touched (as data, not as code). |
| C5 | constraint | Preserve the JSONC fail-loud policy — jq-driven rewrites of live JSONC stay | respected | JSONC fail-loud branch at L1235 unchanged; jq rewrites only $tmp_json accumulator. Live JSONC writes remain forbidden. |
| DONT1 | avoidance | Do not add a separate JSONC-aware rewriter (existing policy is fail-loud). | respected | No JSONC-aware rewriter added. Existing fail-loud policy preserved verbatim. |
| DONT2 | avoidance | Do not register other MCP servers (context7/exa/etc.) — those are not | respected | Only ADV_MCP_SERVER_NAME='adv-advance' registered; no other servers touched. |
| DONT3 | avoidance | Do not remove or rewrite existing checks/patches. | respected | Existing plugin/instructions/legacy-key checks and patches unchanged. diff shows pure additions only (29 insertions, 0 deletions). |
| OOS1 | out_of_scope | Defining a deprecation path for the bridge (still TEMPORARY_BRIDGE). | not_applicable | Bridge deprecation path not defined; registerAdvAdvanceMcpServer remains TEMPORARY_BRIDGE classification in Concord inventory. |
| OOS2 | out_of_scope | Editing any other script, doc, or config file. | not_applicable | Only scripts/deploy-local.sh edited. No other script, doc, or config file touched. |
| OOS3 | out_of_scope | Mutating the live config or any vision config. | not_applicable | No live config or vision config mutation. |

