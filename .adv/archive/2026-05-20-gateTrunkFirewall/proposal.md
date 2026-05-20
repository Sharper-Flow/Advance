## Why

ADV currently blocks direct file writes in the trunk/default checkout through the trunk write firewall, even when a project has not opted into strict worktree isolation. This causes unnecessary friction for lightweight ADV usage, such as `~/toolbox`, where changes are small and the project has `worktree_guard_enforce: false`.

## What Changes

- Make trunk/default checkout write blocking opt-in through `features.worktree_guard_enforce`.
- Preserve current strict trunk write firewall behavior when `worktree_guard_enforce: true`.
- Preserve existing allowed paths and edge cases under enabled mode.
- Update specs, tests, and docs so the feature flag is the structural source of truth.

## Success Criteria

- With `features.worktree_guard_enforce` omitted or `false`, `write`, `edit`, `morph_edit`, and classified destructive `bash` writes to the default-branch checkout are allowed by the firewall.
- With `features.worktree_guard_enforce: true`, the existing default-branch trunk write blocks still occur for `write`, `edit`, `morph_edit`, and classified destructive `bash` writes.
- With `features.worktree_guard_enforce: true`, existing exceptions still pass: ADV worktree paths, outside-git paths, git recovery states, git commands, and explicit generated-artifact allowlist entries.
- `adv_status view:health` continues to show the effective `worktree_guard_enforce` value.
- Tests cover flag-off allowance, flag-on blocking, and existing exception behavior.
- The relevant spec requirement no longer mandates unconditional trunk write blocking when the project has not opted into worktree guard enforcement.

## Scope

### In Scope

- Tool-execution hook behavior in `plugin/src/index.ts` for the trunk write firewall.
- Firewall dependency/types changes in `plugin/src/tools/trunk-write-firewall.ts` if needed to pass effective feature policy structurally.
- Feature-flag/default handling needed to make `worktree_guard_enforce` the controlling policy.
- Unit/integration tests for trunk write firewall behavior.
- Spec updates for `advance-meta` / `rq-twf01` and any directly linked worktree isolation wording.
- Documentation updates where current text implies unconditional trunk/default checkout write blocking.

### Out of Scope

- Changing ADV archive merge, push, or release flow behavior.
- Changing ADV worktree create/resume/delete lifecycle semantics.
- Changing task/gate mutation isolation beyond alignment with the existing `worktree_guard_enforce` policy.
- Adding a separate new feature flag for trunk write firewall behavior.
- Broad redesign of project configuration or product-linked repo scope.

### Must Not

- Must not weaken strict protection for projects with `features.worktree_guard_enforce: true`.
- Must not block proposal-gate creation or read-only ADV tools from the main checkout.
- Must not classify or block git commands through the trunk write firewall.
- Must not rely on agent prose alone for the flag decision; the hook must use parsed/effective project configuration.
- Must not introduce symlink, shell alias, wrapper, or environment-variable workarounds for path/write policy.

## Discovery Findings

### Current State

- `plugin/src/index.ts:500-536` applies `checkTrunkWrite` / `checkTrunkWriteBash` unconditionally for file-write tools and bash.
- `plugin/src/tools/trunk-write-firewall.ts:152-192` blocks default-branch trunk checkout writes without consulting feature flags.
- `plugin/src/tools/status.ts:218-231` reports `worktree_guard_enforce` default `false`.
- `plugin/src/tools/gate.ts:62-76` and `plugin/src/tools/task.ts:75-120` already gate main-checkout task/gate mutation blocking behind `worktree_guard_enforce` default `false`.
- `ADV_INSTRUCTIONS.md:425-431` and `advance-meta/rq-twf01` currently describe unconditional trunk write blocking.

### Recommended Objectives

1. Make `worktree_guard_enforce` the structural switch for trunk write firewall enforcement.
2. Preserve all current strict-mode safety behavior when the flag is true.
3. Centralize or type effective feature-flag defaults enough to prevent status/hook drift.
4. Update specs/docs/tests so default false behavior and strict true behavior are both locked.
5. Document strict mode plainly without implying broad prior reliance on the old default.
6. Enable strict worktree enforcement for this Advance repo.

### AMBIGUITY ANALYSIS — no ambiguity findings. Coverage: B:C F:C S:C M:C

Trigger evaluation: clean; agreement approved.
