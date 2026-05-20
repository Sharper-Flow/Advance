# Agreement

## Objectives

1. Make `features.worktree_guard_enforce` the structural switch for trunk write firewall enforcement.
2. Preserve current strict trunk write firewall behavior when `worktree_guard_enforce: true`.
3. Allow lightweight/default projects to edit the default checkout normally when the flag is omitted or false.
4. Centralize or type effective feature-flag defaults enough to prevent status/hook drift.
5. Update specs, docs, and tests so opt-in firewall behavior is machine-checkable.
6. Enable strict worktree enforcement for the Advance repo itself.

## Acceptance Criteria

1. With `features.worktree_guard_enforce` omitted or `false`, default-checkout `write`, `edit`, `morph_edit`, and classified destructive `bash` writes are allowed by the trunk write firewall.
2. With `features.worktree_guard_enforce: true`, default-checkout file writes and classified destructive bash writes are blocked as they are today.
3. Strict mode preserves existing exceptions: ADV worktrees, outside-git paths, git recovery states, git commands, and generated-artifact allowlist entries.
4. `advance` repo config is updated to enable `features.worktree_guard_enforce: true`.
5. Specs/docs/tests reflect that trunk write firewall enforcement is opt-in through `worktree_guard_enforce`.
6. Documentation states how to enable strict mode without implying broad prior reliance on the old default.
7. Tests cover flag-off allowance, flag-on blocking, strict-mode exceptions, and the Advance repo config opt-in.

## Constraints

- Specs remain the source of law; update `rq-twf01` before relying on changed behavior.
- Correctness must be structural: parsed/effective feature config controls the hook.
- Strict-mode safety must remain regression-tested.
- Source changes to plugin hook behavior require tests now and rebuild/restart notes for live tool validation.
- The Advance repo should explicitly opt into strict mode through `project.json`.

## Avoidances

- Do not add a second feature flag for trunk write firewall behavior.
- Do not add a path/project allowlist for `~/toolbox`.
- Do not rely on agent prose alone for the flag decision.
- Do not classify or block git commands through the trunk write firewall.
- Do not introduce symlink, shell alias, wrapper, or environment-variable workarounds for path/write policy.
- Do not frame this as preserving behavior for broadly dependent projects; document explicit strict mode plainly.

## Decisions

### User Decisions

- Flag false means the trunk write firewall is fully off, including classified destructive bash (`rm`, `mv`, `cp`, `sed -i`, redirects, `tee`).
- Migration wording should not claim projects relied on the old always-on firewall; that would be a stretch.
- The Advance repo should enable strict worktree enforcement in its own config.
- User approved the acceptance criteria with reply `approve`.

### Agent Decisions (LBP)

- Use `worktree_guard_enforce` rather than introducing a second flag so task/gate isolation and file-write isolation share one explicit worktree-isolation policy.
- Preserve strict-mode fail-closed behavior when default branch cannot be verified.
- Prefer shared/typed effective feature defaults to avoid drift between `adv_status` and the hook path.
- Treat this as internal plugin policy; no external solution check is required.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply `approve` during discovery.