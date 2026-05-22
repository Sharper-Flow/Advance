# Design

## Architecture Overview

Use the Temporal target store as the source of truth for target-scoped mutation context. When a mutation tool is called with `target_path`, the tool already routes state access through a target `Store`; worktree isolation must use that store's root as the effective cwd instead of the OpenCode host process cwd.

Expose one ADV worktree tool family only. The canonical public names are `adv_worktree_create`, `adv_worktree_resume`, `adv_worktree_delete`, `adv_worktree_cleanup`, and `adv_worktree_triage`.

## Key Decisions

1. **Target-aware cwd helper** — add `resolveTargetAwareMutationCwd({ store, target_path })` in `target-project.ts`.
   - `target_path` present → `store.paths.root`
   - no `target_path` → `process.cwd()`
2. **Patch guarded mutation call sites** — use the helper in `adv_gate_complete`, `adv_task_update`, and `adv_task_add` before calling isolation helpers.
3. **Preserve auto-manage runtime deps** — keep `buildWorktreeAutoManageDeps(activeStore)` at production call sites so resume/materialization has the target store runtime bundle.
4. **Remove duplicate worktree aliases** — delete `worktree_create`, `worktree_delete`, and `worktree_cleanup` registration and degraded-tool entries; remove allowlist/instruction references.
5. **Spec alignment** — update `rq-warpModeContract06` to state legacy aliases must not be registered.
6. **Full-suite stability** — fix pending-delete test state leakage by deriving fixture-specific synthetic project IDs instead of using constant `test-id`.

## Implementation Strategy

1. Add the target-aware cwd helper.
2. Wire helper into gate/task guarded mutation paths.
3. Add production-path regression for `adv_gate_complete.execute(... target_path)` proving:
   - target store root is passed as cwd
   - auto-manage deps are built from target store
   - gate signal fires through target store
4. Add task target_path regression proving target root is used for git session detection.
5. Remove alias registration and update tool registry tests.
6. Update ADV agent allowlists, command instructions, and worktree skill to canonical names.
7. Run targeted tests, static checks, build, and full suite.

## LBP Analysis

This is the long-term path because it makes correctness structural: the active store determines mutation context, and the registry exposes one canonical namespace. No agent heuristics, symlinks, env overrides, or compatibility aliases are needed.

## Affected Components

- `plugin/src/tools/target-project.ts`
- `plugin/src/tools/gate.ts`
- `plugin/src/tools/task.ts`
- `plugin/src/tool-registry.ts`
- `plugin/src/utils/tool-title.ts`
- `.opencode/agents/*`
- `.opencode/command/adv-apply.md`
- `.opencode/command/adv-archive.md`
- `skills/adv-worktree/SKILL.md`
- `.adv/specs/worktree-warp-mode/spec.json`

## Risks / Mitigations

- **Risk:** current OpenCode session still has cached old tool registry. **Mitigation:** build + deploy-local completed; restart OpenCode sessions to load new host tool code.
- **Risk:** removing aliases surprises callers. **Mitigation:** ADV instructions and allowlists now point at canonical `adv_worktree_*`; registry tests prove aliases are absent.
- **Risk:** target_path mutation could accidentally bypass guard. **Mitigation:** tests assert target root is used and state mutation still routes through target store.

## Design Leverage Scout

Skipped — focused production wiring/registry cleanup; opportunity surface is limited and no external alternative is relevant.

## Validator Result

VALIDATED — independent adv-researcher validator found no conflicts.

Findings:
- Correctness: `resolveTargetAwareMutationCwd` routes isolation to the target store root when `target_path` is present; `buildWorktreeAutoManageDeps(activeStore)` is built from the resolved target store. Production tests assert the target store root and target runtime are used.
- Simplicity: one helper plus three call-site patches is the minimal structural fix; coupling the guard to Store would be more invasive.
- Spec-law compliance: satisfies `rq-worktreeMutationGuard01`, `rq-wl-resumeTool01`, and updated `rq-warpModeContract06`; no spec conflicts detected.
- Alternatives: session-level cwd override/env hacks and compatibility aliases were rejected as inferior and contrary to constraints.

Recommendation: proceed to execution.