# Contract Traceability

**Change ID:** updateCodemodeMcpContracts
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-15T17:44:00.504Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance reviewer READY; corpus and runtime-matrix coverage verify exposed-surface-only invocation guidance. |
| SC2 | success_criterion | pass | review | Runtime matrix committed evidence covers CodeMode primary/spawned and direct-primary rows; targeted matrix suite passed 24/24. |
| SC3 | success_criterion | pass | review | Required codemode-no-mcp matrix row has committed pass evidence; matrix suite passed 24/24. |
| SC4 | success_criterion | pass | review | Reviewer found no duplicated generated catalog signatures; exact invocation tests pass. |
| SC5 | success_criterion | pass | review | Peer merge-tree clean; toolbox tracked change has archived projection; no unresolved parity drift. |
| AC1 | acceptance_criterion | pass | test | Committed runtime matrix covers codemode-primary and codemode-spawned-researcher; coverage check found all 5 mandatory rows passing. |
| AC2 | acceptance_criterion | pass | test | Committed direct-primary matrix row and linked toolbox disabled live probe prove direct schema route. |
| AC3 | acceptance_criterion | pass | test | Committed codemode-no-mcp row proves unavailable external MCP is handled without false catalog exposure. |
| AC4 | acceptance_criterion | pass | test | Committed exact-path-forms row and targeted matrix suite verify identifier-safe and punctuated forms. |
| AC5 | acceptance_criterion | pass | test | tool-name-assets plus runtime-matrix targeted suite passed 24/24; no one-mode invocation claims remain. |
| AC6 | acceptance_criterion | pass | test | Baseline migrated to trunk a5898ce5; merged maximum delta 334 bytes under 400-byte budget; exactly-once corpus checks pass. |
| AC7 | acceptance_criterion | pass | test | Corpus parity/frontmatter tests pass; full suite passed 357 files and 5283 tests. |
| AC8 | acceptance_criterion | pass | test | Archived toolbox fixCodemodeDisableOverride recorded focused precedence 6/6 and disabled direct-schema live probe. |
| AC9 | acceptance_criterion | pass | test | git merge-tree clean with trunk peer archive; merged contract checks 23/23 and peer guards 428/428 passed. |
| AC10 | acceptance_criterion | pass | test | Advance checkpoints e35bb003/d3cb0f4e plus archived toolbox change fixCodemodeDisableOverride provide separate tracked evidence. |
| C1 | constraint | respected | static_check | Discovery/design and initial red→green corpus task preceded broad prompt migration. |
| C2 | constraint | respected | static_check | Prompts instruct catalog discovery without copying OpenCode-generated callable signatures. |
| C3 | constraint | respected | static_check | Runtime matrix validates actual exposed routes; no environment-flag-only correctness inference. |
| C4 | constraint | respected | static_check | Matrix includes CodeMode and direct-schema mandatory rows; targeted suite passed 24/24. |
| C5 | constraint | respected | static_check | External MCP contract tests distinguish MCP catalog surfaces from built-in and Advance tools. |
| C6 | constraint | respected | static_check | Separate toolbox change fixCodemodeDisableOverride archived with its own execution and acceptance evidence. |
| C7 | constraint | respected | static_check | Fixture and prompt sources changed in canonical worktree; deployed artifacts were not edited directly. |
| DONT1 | avoidance | respected | review | Mode-neutral guidance and runtime rows cover absent execute/direct surfaces. |
| DONT2 | avoidance | respected | review | Corpus review found no OpenCode-generated catalog/signature duplication. |
| DONT3 | avoidance | respected | review | Design-selected capability wording and structural corpus test preceded concrete spelling replacement. |
| DONT4 | avoidance | respected | review | No archived ADV bundle changed in this branch diff. |
| DONT5 | avoidance | respected | review | Required toolbox work is represented by separately tracked archived change, not untracked edits. |
| DONT6 | avoidance | respected | review | Peer semantic byte-budget collision was surfaced, fixed by deliberate baseline migration, and merged-tree validated. |
| OOS1 | out_of_scope | not_applicable | not_applicable | General MCP inventory reduction intentionally excluded by agreement. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Advance plugin tool-registration redesign intentionally excluded by agreement. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Unrelated OpenCode/toolbox improvements intentionally excluded by agreement. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Historical archive evidence was read-only and not changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f8ef0c8aef3b | SC1, SC3, SC4, AC5, AC6, AC7 |  | C1, C2, C3, C5, C7, DONT1, DONT2, DONT3, DONT4 |  |
| tk-28cdd4fde0c4 | SC1, SC2, SC3, AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C2, C3, C4, C5, DONT1, DONT2 |  |
| tk-7bd956c74bf5 | SC5 | AC8, AC10 | C6, C7, DONT5 |  |
| tk-edda3d10b529 |  | SC1, SC2, SC3, SC4, SC5, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4 |  |
