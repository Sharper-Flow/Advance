# Contract Traceability

**Change ID:** fixMorphWorktreeAuthorization
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-24T21:40:00Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | 3 agent files (adv-engineer.md:108, adv-designer.md:122, adv-reviewer.md:116) rewritten; false 'ADV authorizes this pair' sentence removed; honest edit/write routing + fallback. Reviewer verdict READY. commit 561d981c, merged PR #317 (50e3df8). |
| AC2 | acceptance_criterion | pass | test | adv-engineer-assets.test.ts truth guard: RED tr_mrzfi5x2 (fail) -> GREEN tr_mrzfizit (pass); full assets suite 26/26 tr_mrzfju64. |
| AC3 | acceptance_criterion | pass | test | rg 'ADV authorizes this pair' (excl .adv/archive, node_modules) returns only the test's own not.toContain assertion string at test:204; all directive/source files clean. |
| AC4 | acceptance_criterion | pass | test | git diff on plugin/src/utils/morph-worktree-authorization.ts and plugin/src/index.ts (morph-wrapping block 677-695) is EMPTY; ADV validator untouched. |
| C1 | constraint | respected | static_check | Only ~/dev/advance files touched (3 agent md + 1 test); no morph source edits. |
| C2 | constraint | respected | static_check | Directive + test only; no runtime code changed. |
| C3 | constraint | respected | static_check | authorizeMorphWorktree + ADV_MORPH_WORKTREE_CAPABILITY unchanged (empty diff). |
| C4 | constraint | respected | static_check | Part A is the honest interim; Part B is the structural completion. Design validated; symbol-survival confirmed for OpenCode 1.18.4. |
| C5 | constraint | respected | static_check | Part B scoped as a separate cross-project change in ~/dev/opencode-morph-fast-apply (path-loaded dev source, ADV-enabled). |
| DONT1 | avoidance | respected | review | No remaining claim that morph_edit authorizes external worktree roots (grep clean). |
| DONT2 | avoidance | respected | review | No SDK-level workdir param added to write/edit/morph_edit; change is directive + test only. |
| DONT3 | avoidance | respected | review | No re-implementation of morph execute in ADV. |
| DONT4 | avoidance | respected | review | morph_edit not removed from any tool surface. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-36a647aacef0 | AC1 |  | C1, C2, C3, DONT1, DONT4 |  |
| tk-fb3eb92f5db2 | AC2 |  | C1, C2, DONT1 |  |
| tk-d13bd556ca31 | AC3 | AC4 | C1, C3 |  |
