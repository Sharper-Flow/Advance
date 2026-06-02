# Contract Traceability

**Change ID:** rewriteStatusCli
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-02T16:53:48Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY report: no ADV MCP fanout instructions in default command. Asset tests passed; command is CLI bridge only. |
| SC2 | success_criterion | pass | review | `adv status --no-color` passed and printed table rows with TASKS, GATES, LAST ACTIVITY plus footer `11 active · 164 archived · 2 closed`. |
| SC3 | success_criterion | pass | review | Docs/manifest route health diagnostics to explicit opt-in `adv_status view:"health"`; adv_status MCP tool unchanged. |
| SC4 | success_criterion | pass | review | `bin/oc-test targeted -- src/adv-status-cli-assets.test.ts src/manifest-doc-drift.test.ts` passed: 2 files, 20 tests. |
| AC1 | acceptance_criterion | pass | test | Asset test passed asserting `.opencode/command/adv-status.md` contains shell-output injection `!`adv status --no-color``. |
| AC2 | acceptance_criterion | pass | test | Asset test and reviewer static check passed: command contains none of `adv_status`, `adv_change_list`, `adv_change_show`, `adv_gate_status`, `adv_spec`. |
| AC3 | acceptance_criterion | pass | test | `adv status --no-color` smoke passed with table plus counts footer only; no health sections or recommendations in observed output. |
| AC4 | acceptance_criterion | pass | test | Command body is shell-output bridge with verbatim/no-analysis guidance and no fallback instructions; reviewer report found no fallback path. |
| AC5 | acceptance_criterion | pass | test | Static diff check: `git diff --name-only 66e113ac476a902a51fc68fd0b117b1bb72ffa6c HEAD -- bin/adv` returned no files; CLI implementation untouched. |
| AC6 | acceptance_criterion | pass | test | `plugin/src/adv-status-cli-assets.test.ts` added and targeted run passed: 20 tests across asset and manifest drift suites. |
| AC7 | acceptance_criterion | pass | test | `manifest-doc-drift.test.ts` passed after synced wording in command frontmatter, manifest, README, ADV_INSTRUCTIONS, and ADV agent routing. |
| C1 | constraint | respected | static_check | OpenCode command remains a prompt-template shell-output injection; docs-validated one model turn acknowledged in design and command tells model to return output verbatim. |
| C2 | constraint | respected | static_check | Command invocation is exactly `adv status --no-color`; asset tests passed. |
| C3 | constraint | respected | static_check | Command uses installed `adv`, not repo-local `bin/adv`; no fallback instructions present. |
| C4 | constraint | respected | static_check | Command contains no direct ADV state file read guidance and no ADV MCP state-tool instructions; state access remains inside CLI. |
| C5 | constraint | respected | static_check | Docs/manifest/agent wording point health diagnostics to explicit opt-in `adv_status view:"health"`; reviewer READY report confirms separation. |
| DONT1 | avoidance | respected | review | Reviewer READY report and command inspection found no fallback from CLI failure to ADV MCP tools. |
| DONT2 | avoidance | respected | review | Asset tests reject heavy-section/recommendation/fanout tokens; `adv status --no-color` output smoke showed table plus counts only. |
| DONT3 | avoidance | respected | review | `bin/adv` unchanged in branch diff; no new CLI modes implemented. |
| DONT4 | avoidance | respected | review | Diff scope limited to `/adv-status` command, synced docs/manifest/agent wording, status asset tests, and advance-meta spec; reduceWorkflowNoise untouched. |
| DONT5 | avoidance | respected | review | `pnpm run schemas:check` passed; `adv_change_validate strict` previously passed with only NO_DELTAS warning; reviewer found no correctness degradation. |
| OOS1 | out_of_scope | respected | not_applicable | Review diff scope found no broad workflow-noise cleanup across other workflows. |
| OOS2 | out_of_scope | respected | not_applicable | `adv_status` MCP tool unchanged; change edits slash command/docs/spec only. |
| OOS3 | out_of_scope | respected | not_applicable | No native OpenCode plugin-command support added; existing command-template mechanism used. |
| OOS4 | out_of_scope | respected | not_applicable | No Temporal workflow, ADV state storage, or ranked backlog implementation files changed. |
| OOS5 | out_of_scope | respected | not_applicable | `bin/adv` untouched; no CLI diagnostic or JSON flags added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-48e5fb208e7c | SC4 | AC1, AC2, AC4, AC6, AC7 | C2, C4, DONT1, DONT2, DONT3 |  |
| tk-a3ffd63f464c | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC7 | AC1, AC2, AC3, AC4, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS2, OOS3, OOS5 |  |
| tk-c24c55d9a78f | SC4, AC6, AC7 | AC6, AC7 | C4, C5, DONT1, DONT2, DONT5, OOS1, OOS2, OOS4 |  |
| tk-3a7ee7672a0f |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
