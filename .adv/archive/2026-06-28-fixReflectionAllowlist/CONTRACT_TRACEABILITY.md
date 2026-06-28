# Contract Traceability

**Change ID:** fixReflectionAllowlist
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-06-28T02:54:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `.opencode/agents/adv.md` includes `adv_reflection_list: true` under Reflection tools; checkpoint 829e94c2855f54250cacfb0ed7aabec854c69c27. |
| AC2 | acceptance_criterion | pass | test | `pnpm run build` passed from `plugin/` after the allowlist fix. |
| AC3 | acceptance_criterion | pass | test | `./scripts/deploy-local.sh --fix` completed successfully after build. |
| AC4 | acceptance_criterion | pass | test | `./scripts/deploy-local.sh --check` passed: tool drift allowlist matches plugin registry (71 tools). |
| AC5 | acceptance_criterion | pass | test | `adv status --json` returned `live=true`, `stale=false`. |
| AC6 | acceptance_criterion | pass | test | After push/fetch, `git rev-list --left-right --count origin/trunk...HEAD` reported `0 0`. |
| C1 | constraint | respected | static_check | Only source change was `.opencode/agents/adv.md` one-line allowlist addition. |
| C2 | constraint | respected | static_check | Implementation happened in `change/fixReflectionAllowlist` worktree; final trunk update was fast-forward merge and push. |
| C3 | constraint | respected | static_check | Build, deploy, deploy-check, CLI live check, and git sync all passed before completion. |
| OOS1 | out_of_scope | respected | not_applicable | No changes to `adv_reflection_list` implementation or reflection tool behavior. |
| OOS2 | out_of_scope | respected | not_applicable | No broader active-change cleanup performed. |
| OOS3 | out_of_scope | respected | not_applicable | No unrelated duplicate changes closed or archived. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4d8eda4b99d8 |  |  |  | Small tracked fix predates contract minting; task directly addresses deploy-local drift check. |
