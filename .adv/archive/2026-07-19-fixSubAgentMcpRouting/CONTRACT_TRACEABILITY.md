# Contract Traceability

**Change ID:** fixSubAgentMcpRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-19T20:10:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | tk-346e103e1012 verification matrix 8/8 cells PASS. explore/general via overlay contract (verified ADV_SYNC block has canonical line); build/plan via global always-on ~/.config/opencode/instructions/lgrep-tools.md instruction loaded into every OpenCode agent. Live runtime evidence fixture (plugin/src/__fixtures__/mcp-runtime-live-evidence.json) provides transcript-level mode-switching proof for adv + adv-researcher in both modes; contract is agent-agnostic, transfers to all 4 user-owned agents. |
| SC2 | success_criterion | pass | review | New test 'overlay-only sources each carry the canonical contract exactly once' (plugin/src/tool-name-assets.test.ts:318-348) iterates .opencode/overlays/*.overlay.md, filters to overlay-only sources, asserts each contains canonical MCP_ACTIVE_SURFACE_CONTRACT exactly once. RED-GREEN-VERIFY evidenced in tk-04ac4d218892. 14/14 tests pass. |
| SC3 | success_criterion | pass | review | tk-346e103e1012 verification matrix covers both modes. C6/DONT3 respected (grep across 4 user base files confirmed no env-var conditionals). mcp-runtime-matrix.test.ts structurally covers both modes including direct-primary case. |
| AC1 | acceptance_criterion | pass | test | .opencode/overlays/explore.overlay.md exists (9 lines, verified via read); line 8 contains canonical MCP_ACTIVE_SURFACE_CONTRACT text byte-identical to general.overlay.md and prompt-corpus.ts:30-34. Covered by new tool-name-assets.test.ts test. |
| AC2 | acceptance_criterion | pass | test | git diff dd2c1b8b confirms scripts/deploy-local.sh:1608 apply_overlay_block "explore" "$GLOBAL_AGENTS/explore.md" added; alphabetical order with build/general/plan preserved. |
| AC3 | acceptance_criterion | pass | test | tk-b0bc8a964818 verified post-deploy ~/.config/opencode/agents/explore.md: ADV_SYNC:START/END markers (1 pair), contract line 1 occurrence, frontmatter preserved (lines 1-31). Post-commit hook auto-deployed; re-running deploy-local.sh --fix confirms idempotent ('overlay already current: explore'). |
| AC4 | acceptance_criterion | pass | test | tk-3aca03a1e520 rewrote 4 user base files (explore/general/build/plan) removing direct-callable routing prose. Spot-check grep during review: no remaining top-level lgrep_*/context7_*/exa_*/searchcode_* routing instructions in body (only frontmatter permission grants and intentional mode-clarification examples). Known caveat: build/plan body references 'ADV_SYNC block for routing guidance' but their ADV_SYNC overlay lacks canonical contract per AD8/OOS5 — functionally covered by global lgrep-tools.md always-on instruction. |
| AC5 | acceptance_criterion | pass | test | git diff dd2c1b8b plugin/src/tool-name-assets.test.ts: new test 'overlay-only sources each carry the canonical contract exactly once' (32 lines) iterates .opencode/overlays/*.overlay.md, filters to overlay-only sources via existsSync check on .opencode/agents/{name}.md, asserts countContractOccurrences === 1. Existing 14 tests remain green; full mode-neutral MCP prompt contract suite 14/14 pass. |
| AC6 | acceptance_criterion | pass | test | tk-04ac4d218892 verification: pnpm run check all green (71.5s) — schemas, typecheck, isolation, lint, format. CI PR #250 6/6 green (Gitleaks, OSV, Semgrep, Trivy, Test 24.x). |
| AC7 | acceptance_criterion | pass | test | tk-346e103e1012 re-ran bin/oc-test targeted -- src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts from both trunk dd2c1b8b and worktree e1502260: 25/25 PASS (14/14 tool-name-assets + 11/11 mcp-runtime-matrix). |
| C1 | constraint | respected | static_check | Constraint acknowledged. User base file edits are direct filesystem writes (~/.config/opencode/agents/*.md); OpenCode restart needed for changes to take effect is operational concern outside this change's deliverable scope. |
| C2 | constraint | respected | static_check | Stage 1 advance-repo edits done in worktree change/fixSubAgentMcpRouting (commits 4211f35b, e1502260). PR squash-merged from worktree. Trunk at /home/jon/dev/advance stayed on trunk throughout (verified via git branch --show-current). |
| C3 | constraint | respected | static_check | explore.overlay.md uses canonical MCP_ACTIVE_SURFACE_CONTRACT verbatim from prompt-corpus.ts:30-34. Preserves bracket form tools.context7[\"resolve-library-id\"] and dot form tools.lgrep.search_semantic. Matches prior-art updateCodemodeMcpContracts pattern. |
| C4 | constraint | respected | static_check | tk-b0bc8a964818 used scripts/deploy-local.sh --fix as canonical publish mechanism. No manual file shuffling or cp -r workarounds. |
| C5 | constraint | respected | static_check | git diff dd2c1b8b shows no new imports/dependencies. No changes to OpenCode runtime or CodeMode behavior. ~/.config/opencode/instructions/lgrep-tools.md untouched. |
| C6 | constraint | respected | static_check | mcp-runtime-matrix.test.ts direct-primary case passes (1 of 11 tests). tk-346e103e1012 matrix covers both CodeMode-on and CodeMode-off cells. |
| C7 | constraint | respected | static_check | New test explicitly filters to overlay-only sources (excludes adv/build/plan via existsSync check on .opencode/agents/{name}.md). Exactly-once asserted for explore+general only. adv/build/plan overlay files unchanged — no risk of 2-occurrence regression. Existing exactly-once invariant tests for adv/build/general/plan remain green. |
| DONT1 | avoidance | respected | review | explore.overlay.md uses canonical contract verbatim. Preserves bracket form for punctuated names and dot form for identifier-safe names. No normalization introduced. |
| DONT2 | avoidance | respected | review | User base file frontmatter unchanged across all 4 files (verified tk-3aca03a1e520 preserved frontmatter; spot-check during review confirmed permission: block intact). Only body routing prose changed. |
| DONT3 | avoidance | respected | review | Grep across 4 user base files confirmed no OPENCODE_EXPERIMENTAL_CODE_MODE or OC_DISABLE_CODE_MODE conditionals. Routing prose is mode-neutral — agents discover surface at runtime. |
| DONT4 | avoidance | respected | review | git diff dd2c1b8b shows no changes to .opencode/agents/{adv,adv-*,build,plan}.md. Only explore.overlay.md added, deploy-local.sh and tool-name-assets.test.ts changed. |
| DONT5 | avoidance | respected | review | build.overlay.md and plan.overlay.md unchanged (read confirmed contract count = 0). Source body in .opencode/agents/build.md and plan.md unchanged. No 2-occurrence regression risk. |
| DONT6 | avoidance | respected | review | Extended existing plugin/src/tool-name-assets.test.ts (P04 locality). No new test file created. |
| DONT7 | avoidance | respected | review | Used SHARED_OVERLAY_ONLY model. 2-arg apply_overlay_block form (no bootstrap_source per AD1) since ~/.config/opencode/agents/explore.md already exists. User content outside ADV_SYNC block preserved (AC3 verified frontmatter lines 1-31 intact). |
| DONT8 | avoidance | respected | review | Design AD4 explicit: 'Does NOT modify the existing applicable-prompts list (line 212-225) since explore has no advance-source agent file to model in effectiveAgentPrompts().' pnpm run check passes (typecheck covers effectiveAgentPrompts modeling). |
| DONT9 | avoidance | not_applicable | review | OOS1: ADV-owned agent prompt files (adv.md, adv-researcher.md, adv-engineer.md, etc.) out of scope. git diff confirms no changes to these files. |
| DONT10 | avoidance | not_applicable | review | OOS2: OpenCode CodeMode behavior out of scope. No CodeMode runtime changes. |
| DONT11 | avoidance | not_applicable | review | OOS3: lgrep-tools.md out of scope. File untouched (validator confirmed already correct). |
| DONT12 | avoidance | not_applicable | review | OOS4: MCP servers (lgrep, context7, exa, searchcode) out of scope. No MCP server changes. |
| DONT13 | avoidance | not_applicable | review | OOS5: build/plan contract centralization out of scope (AD8 preserved asymmetry). build/plan overlay and source body unchanged. Documented as future cleanup candidate; functionally harmless because routing contract reaches build/plan via global lgrep-tools.md always-on instruction. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-04ac4d218892 | AC1, AC2, AC5 | AC1, AC2, AC5, AC6 | C2, C3, C4, C7, DONT1, DONT5, DONT6, DONT7, DONT8, DONT13 |  |
| tk-6e0313f35195 |  | SC1, SC3, AC7 | C6, DONT3 |  |
| tk-55875ab46075 | C2 |  | C1, C2 |  |
| tk-9d9603910add | AC3 | AC3 | C1, C4 |  |
| tk-fb9f8fd26a01 | AC4 | AC4 | DONT1, DONT2, DONT3, DONT5, DONT7, DONT13 |  |
| tk-b0bc8a964818 | AC3 | AC3 | C1, C4 |  |
| tk-3aca03a1e520 | AC4 | AC4 | DONT1, DONT2, DONT3, DONT5, DONT7, DONT13 |  |
| tk-346e103e1012 |  | SC1, SC3, AC7 | C6, DONT3 |  |
