# Acceptance

Reviewed at: 2026-06-28T02:54:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_reflection_list` appears in the ADV runtime agent allowlist beside Reflection tools. | pass | `.opencode/agents/adv.md` includes `adv_reflection_list: true` under Reflection tools; checkpoint 829e94c2855f54250cacfb0ed7aabec854c69c27. |
| AC2 | acceptance_criterion | `pnpm run build` passes from `plugin/`. | pass | `pnpm run build` passed from `plugin/` after the allowlist fix. |
| AC3 | acceptance_criterion | `./scripts/deploy-local.sh --fix` completes successfully. | pass | `./scripts/deploy-local.sh --fix` completed successfully after build. |
| AC4 | acceptance_criterion | `./scripts/deploy-local.sh --check` reports allowlist/tool drift clean. | pass | `./scripts/deploy-local.sh --check` passed: tool drift allowlist matches plugin registry (71 tools). |
| AC5 | acceptance_criterion | `adv status --json` reports live state with `stale=false`. | pass | `adv status --json` returned `live=true`, `stale=false`. |
| AC6 | acceptance_criterion | Local `trunk` and `origin/trunk` are synchronized with `origin/trunk...HEAD = 0 0`. | pass | After push/fetch, `git rev-list --left-right --count origin/trunk...HEAD` reported `0 0`. |
| C1 | constraint | Only adjust the ADV allowlist; no unrelated tool or runtime behavior changes. | respected | Only source change was `.opencode/agents/adv.md` one-line allowlist addition. |
| C2 | constraint | Preserve trunk-worktree isolation until the final fast-forward/push step. | respected | Implementation happened in `change/fixReflectionAllowlist` worktree; final trunk update was fast-forward merge and push. |
| C3 | constraint | Do not bypass failed build/deploy verification. | respected | Build, deploy, deploy-check, CLI live check, and git sync all passed before completion. |
| OOS1 | out_of_scope | New reflection tool behavior. | respected | No changes to `adv_reflection_list` implementation or reflection tool behavior. |
| OOS2 | out_of_scope | Broader cleanup of active ADV changes. | respected | No broader active-change cleanup performed. |
| OOS3 | out_of_scope | Closing unrelated duplicate changes. | respected | No unrelated duplicate changes closed or archived. |

