# Agreement

## Objectives

1. Preserve existing `rq-worktreeMutationGuard01` semantics for gate mutation safety.
2. Ensure `adv_gate_complete` production code supplies auto-manage resume runtime dependencies for auto-managed changes.
3. Ensure `target_path` gate/task mutations evaluate worktree isolation against the active target store root, not host `process.cwd()`.
4. Remove legacy standalone worktree aliases from ADV tool registration and ADV agent allowlists.
5. Add production-path regressions so `adv_gate_complete.execute` and target_path task creation cannot regress.
6. Keep proposal-gate exemption and worktree-origin mutation behavior intact.
7. Verify the fix with targeted tests, static checks, build, and full test suite.

## Acceptance Criteria

1. `adv_gate_complete` production path wires auto-managed worktree resume runtime deps for non-proposal gates.
2. Main-checkout completion for an auto-managed change attempts resume/materialization and returns `WorktreeIsolationViolation` with `expectedWorktreePath`, not `resumeRuntime missing`.
3. `target_path` gate completion uses the target store root as mutation cwd and sends the gate signal through the target store.
4. `adv_task_add` / guarded task mutations use the target store root as mutation cwd when `target_path` is provided.
5. Proposal gate remains exempt.
6. Gate completion from an ADV worktree remains allowed.
7. Production-path regression test covers `adv_gate_complete.execute`, not only helper-level seams.
8. Legacy aliases `worktree_create`, `worktree_delete`, and `worktree_cleanup` are not registered by `createToolMap`, are not present in `ADV_TOOL_NAMES`, and are removed from ADV orchestrator allowlists/instructions.
9. Verification requires targeted regression tests, `pnpm run check`, `pnpm run build`, and full `pnpm test`.
10. Any test failures found during required verification are fixed in this change.
11. Live OpenCode tool validation in the current session is not required before acceptance; release notes must state rebuild/deploy/restart caveat.

## Constraints

- Preserve `rq-worktreeMutationGuard01` and `worktree-lifecycle` spec semantics.
- Do not allow non-proposal gate mutations to proceed from the main checkout.
- Do not bypass the main-checkout guard with symlinks, env hacks, deployed-artifact hand edits, or manual file shuffling.
- Keep implementation scoped to gate/task auto-worktree production wiring, legacy alias removal, and directly blocking verification failures.
- Source verification runs from `plugin/`.

## Avoidances

- Do not change worktree lifecycle policy.
- Do not remove the defensive `resumeRuntime missing` diagnostic branch; it remains useful for callers that fail to wire deps.
- Do not keep duplicate visible worktree tool names for compatibility.
- Do not absorb unrelated roadmap items unless they block the agreed required verification.

## Decisions

### User Decisions

- Verification bar: user selected `Full suite too` — final verification must include full `pnpm test`.
- Unrelated failures: user selected `Fix all found` — failures found during required verification should be fixed in this change.
- Live validation: user selected `Source proof enough` — no fresh OpenCode live-tool validation before acceptance; caveat must be documented.
- Alias cleanup: user requested ensuring old worktree aliases are not still present.

### Agent Decisions (LBP)

- Add `resolveTargetAwareMutationCwd` in `target-project.ts` so target-aware mutation cwd selection is structural and shared.
- Patch both gate and task guarded mutation paths because both used `process.cwd()` directly.
- Remove legacy alias registration instead of keeping warning-only aliases.
- Update `worktree-warp-mode` spec to align with alias removal.
- Fix full-suite pending-delete leakage by using per-fixture synthetic project IDs in the affected test.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by prior user reply `approve`; alias cleanup added by explicit user instruction during implementation.