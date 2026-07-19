# Contract Traceability

**Change ID:** softenBuildPlanAdvSyncCross
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-19T23:27:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | tk-19b76df53b08 verification: grep confirms 0 remaining 'ADV_SYNC block' references in scope. |
| SC2 | success_criterion | pass | review | Retained mode-neutral preference prose; no env-var conditionals introduced. |
| AC1 | acceptance_criterion | pass | test | build.md:161 'See the ADV_SYNC block...' clause dropped; replaced with bare preference prose. |
| AC2 | acceptance_criterion | pass | test | plan.md:158 'See the ADV_SYNC block...' clause dropped; retained fallback rule. |
| AC3 | acceptance_criterion | pass | test | plan.md:162 softened to 'discover them via your active tool surface:' (preserves table introduction). |
| AC4 | acceptance_criterion | pass | test | Section count unchanged (build: 16, plan: 19). ADV_SYNC markers preserved. Frontmatter grep clean. |
| C1 | constraint | respected | static_check | No advance-repo source file changes. Worktree checkpoint status:clean, sha 58bbf734. |
| C2 | constraint | respected | static_check | No spec deltas. Pure prompt prose change. |
| C3 | constraint | respected | static_check | Edits applied directly to ~/.config/opencode/agents/build.md and plan.md via edit tool. Files not in any git repo. |
| C4 | constraint | respected | static_check | Routing behavior unchanged. Functional routing supplied by global lgrep-tools.md always-on instruction. |
| DONT1 | avoidance | respected | review | No advance-repo source file edits; no overlay file edits; no test changes. Architectural centralization (option a) not attempted. |
| DONT2 | avoidance | respected | review | Frontmatter grep clean; permission grants in build.md and plan.md unchanged. |
| DONT3 | avoidance | respected | review | ADV_SYNC block markers and content preserved (build.md:60/70, plan.md:37/48). |
| DONT4 | avoidance | respected | review | Only the 3 cross-reference clauses edited. Other body sections untouched per scope. |
| DONT5 | avoidance | respected | review | lgrep-tools.md global instruction untouched. |
| DONT6 | avoidance | respected | review | explore.md and general.md user files untouched. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-19b76df53b08 | AC1, AC2, AC3 | SC1, SC2, AC4 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
