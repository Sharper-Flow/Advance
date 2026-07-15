# Acceptance

Reviewed at: 2026-07-15T17:44:00.504Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Every tested Advance agent uses only invocation surfaces actually exposed in its session. | pass | Acceptance reviewer READY; corpus and runtime-matrix coverage verify exposed-surface-only invocation guidance. |
| SC2 | success_criterion | CodeMode and direct-schema sessions both complete representative MCP operations. | pass | Runtime matrix committed evidence covers CodeMode primary/spawned and direct-primary rows; targeted matrix suite passed 24/24. |
| SC3 | success_criterion | Sessions without external MCP tools report unavailability without false exposure claims. | pass | Required codemode-no-mcp matrix row has committed pass evidence; matrix suite passed 24/24. |
| SC4 | success_criterion | OpenCode remains sole authority for generated CodeMode catalog syntax. | pass | Reviewer found no duplicated generated catalog signatures; exact invocation tests pass. |
| SC5 | success_criterion | Required Advance, OpenCode, and toolbox changes ship with linked evidence and no unresolved parity drift. | pass | Peer merge-tree clean; toolbox tracked change has archived projection; no unresolved parity drift. |
| AC1 | acceptance_criterion | A CodeMode-enabled primary Advance agent and a CodeMode-enabled spawned Advance research agent each complete a representative MCP lookup when external MCP is available. | pass | Committed runtime matrix covers codemode-primary and codemode-spawned-researcher; coverage check found all 5 mandatory rows passing. |
| AC2 | acceptance_criterion | A CodeMode-disabled Advance agent completes the same representative MCP lookup through the directly exposed schema. | pass | Committed direct-primary matrix row and linked toolbox disabled live probe prove direct schema route. |
| AC3 | acceptance_criterion | A CodeMode-enabled session with all external MCP servers disabled exposes no executable MCP catalog and reports the representative lookup unavailable without attempting a nonexistent callable. | pass | Committed codemode-no-mcp row proves unavailable external MCP is handled without false catalog exposure. |
| AC4 | acceptance_criterion | Representative identifier-safe and punctuated MCP names are invoked exactly as exposed by the active schema or catalog. | pass | Committed exact-path-forms row and targeted matrix suite verify identifier-safe and punctuated forms. |
| AC5 | acceptance_criterion | Active Advance guidance contains no unconditional claim that external MCP tools use one invocation mode. | pass | tool-name-assets plus runtime-matrix targeted suite passed 24/24; no one-mode invocation claims remain. |
| AC6 | acceptance_criterion | Against frozen pre-change effective assembled-prompt fixtures, Advance-authored mode guidance adds at most 400 UTF-8 bytes, appears at most once per effective prompt, and does not duplicate OpenCode-generated catalog signatures. Tokenizer-specific counts may be recorded only as advisory evidence. | pass | Baseline migrated to trunk a5898ce5; merged maximum delta 334 bytes under 400-byte budget; exactly-once corpus checks pass. |
| AC7 | acceptance_criterion | Canonical prompts, overlays, recursively deployed skill/reference assets, generated/deployed assets, and coverage tests remain synchronized and their targeted parity tests pass; YAML frontmatter is parsed separately from prompt-body prose. | pass | Corpus parity/frontmatter tests pass; full suite passed 357 files and 5283 tests. |
| AC8 | acceptance_criterion | `OC_DISABLE_CODE_MODE=1` disables CodeMode even when the parent environment already exports `OPENCODE_EXPERIMENTAL_CODE_MODE=true`. | pass | Archived toolbox fixCodemodeDisableOverride recorded focused precedence 6/6 and disabled direct-schema live probe. |
| AC9 | acceptance_criterion | Integration with `consolidateAdvToolSurface2` has no unresolved prompt-asset conflict and combined targeted tests pass. | pass | git merge-tree clean with trunk peer archive; merged contract checks 23/23 and peer guards 428/428 passed. |
| AC10 | acceptance_criterion | Every required cross-repository edit has separate tracked change, verification, and release evidence. | pass | Advance checkpoints e35bb003/d3cb0f4e plus archived toolbox change fixCodemodeDisableOverride provide separate tracked evidence. |
| C1 | constraint | Investigation and representative tests precede broad prompt edits. | respected | Discovery/design and initial red→green corpus task preceded broad prompt migration. |
| C2 | constraint | OpenCode remains authoritative for exact generated CodeMode catalog syntax. | respected | Prompts instruct catalog discovery without copying OpenCode-generated callable signatures. |
| C3 | constraint | Correctness follows actually exposed capabilities, not environment-flag inference alone. | respected | Runtime matrix validates actual exposed routes; no environment-flag-only correctness inference. |
| C4 | constraint | CodeMode and direct-schema operation are equal compatibility requirements. | respected | Matrix includes CodeMode and direct-schema mandatory rows; targeted suite passed 24/24. |
| C5 | constraint | Built-in and Advance plugin tools are not classified as external MCP tools. | respected | External MCP contract tests distinguish MCP catalog surfaces from built-in and Advance tools. |
| C6 | constraint | Cross-repository changes require direct evidence and separate tracked work. | respected | Separate toolbox change fixCodemodeDisableOverride archived with its own execution and acceptance evidence. |
| C7 | constraint | Canonical source owns deployed output; live deployed artifacts are never edited as independent sources. | respected | Fixture and prompt sources changed in canonical worktree; deployed artifacts were not edited directly. |
| DONT1 | avoidance | Do not assume CodeMode is always enabled or that `execute` is always exposed. | respected | Mode-neutral guidance and runtime rows cover absent execute/direct surfaces. |
| DONT2 | avoidance | Do not duplicate OpenCode’s generated MCP catalog or signature block in Advance prompts. | respected | Corpus review found no OpenCode-generated catalog/signature duplication. |
| DONT3 | avoidance | Do not perform a broad concrete-name rewrite before design selects the least-coupled correct mechanism. | respected | Design-selected capability wording and structural corpus test preceded concrete spelling replacement. |
| DONT4 | avoidance | Do not edit archived ADV bundles. | respected | No archived ADV bundle changed in this branch diff. |
| DONT5 | avoidance | Do not make untracked cross-repository edits. | respected | Required toolbox work is represented by separately tracked archived change, not untracked edits. |
| DONT6 | avoidance | Do not silently absorb prompt-asset conflicts with `consolidateAdvToolSurface2`. | respected | Peer semantic byte-budget collision was surfaced, fixed by deliberate baseline migration, and merged-tree validated. |
| OOS1 | out_of_scope | General MCP inventory reduction unrelated to invocation correctness. | not_applicable | General MCP inventory reduction intentionally excluded by agreement. |
| OOS2 | out_of_scope | Redesigning Advance plugin tool registration. | not_applicable | Advance plugin tool-registration redesign intentionally excluded by agreement. |
| OOS3 | out_of_scope | Unrelated OpenCode or toolbox improvements. | not_applicable | Unrelated OpenCode/toolbox improvements intentionally excluded by agreement. |
| OOS4 | out_of_scope | Editing historical archive evidence. | not_applicable | Historical archive evidence was read-only and not changed. |

