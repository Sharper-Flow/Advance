# Fix gate auto worktree

## Intent

Fix production worktree wiring regressions that cause ADV mutation tools to think they are running from the main checkout even when the requested operation is scoped to an ADV worktree. Gate completion for auto-managed changes must use the active target store/workdir for isolation checks and auto-manage deps.

Also remove legacy standalone worktree tool aliases so the runtime exposes one canonical ADV worktree tool family only: `adv_worktree_create`, `adv_worktree_resume`, `adv_worktree_delete`, `adv_worktree_cleanup`, and `adv_worktree_triage`.

## Scope

- Gate/tool isolation path: `plugin/src/tools/gate.ts`, `plugin/src/tools/task.ts`, `plugin/src/tools/target-project.ts`
- Registry/alias cleanup: `plugin/src/tool-registry.ts`, `plugin/src/utils/tool-title.ts`, `.opencode/agents/*`, `.opencode/command/adv-apply.md`, `.opencode/command/adv-archive.md`, `skills/adv-worktree/SKILL.md`
- Spec alignment: `.adv/specs/worktree-warp-mode/spec.json`
- Regression tests: `plugin/src/tools/gate.test.ts`, `plugin/src/tools/task.test.ts`, `plugin/src/tool-registry.test.ts`, asset tests
- Directly blocking full-suite fix: isolate pending-delete test state in `plugin/src/tools/worktree/index-delete.test.ts`

## Discovery Findings

### Discovery Checklist

| Step | Result | Reason |
|---|---:|---|
| Skills considered | PASS | `lgrep` policy applied for local code discovery; no new domain skill needed for a focused ADV tooling bug. |
| Prior research extension | PASS | No prior research pack required; issue is local production wiring and registry exposure. Existing worktree specs are governing artifacts. |
| Conflict scan | PASS | `adv_change_validate` passes with expected pre-prep warnings (`NO_TASKS`, `NO_DELTAS`). Active related work exists around worktree/archive/gate cleanup, but none owns this exact target-path isolation + alias cleanup regression. |
| Edge cases | PASS | Covers target_path worktree context, auto-managed runtime deps, proposal exemption, worktree-origin mutation, alias non-registration, and test state leakage. |
| Design question depth | PASS | Single technical direction: derive mutation cwd from active target store when target_path is used; remove legacy aliases from registry. |
| Draft spec deltas | PASS | Existing `worktree-lifecycle` covers mutation isolation; `worktree-warp-mode` is updated to make alias removal explicit. |
| Related pattern scan | PASS | `task.ts` had the same `process.cwd()` target_path risk and is patched with the shared helper. Registry/tests/agent allowlists carried old aliases and are cleaned. |
| LBP check | PASS | Long-term best practice is one canonical tool namespace plus structural workdir selection, not duplicate compatibility aliases or agent-only workdir assumptions. |

### Current State

- `rq-worktreeMutationGuard01` requires non-proposal gate completion from main checkout to block structurally and, for auto-managed changes, attempt `advWorktreeResume` and surface `expectedWorktreePath`.
- The live symptom was `adv_gate_complete(... target_path: worktree)` still checking `process.cwd()` from the host OpenCode session, not the target store root.
- `worktree-auto-manage.ts` intentionally keeps a defensive `resumeRuntime missing` branch for callers that fail to wire the runtime bundle.
- Legacy aliases (`worktree_create`, `worktree_delete`, `worktree_cleanup`) were still registered alongside canonical `adv_worktree_*` tools.

### Edge Cases

1. Auto-managed change, main checkout, non-proposal gate: attempts resume/materialization and returns `WorktreeIsolationViolation` with `expectedWorktreePath`.
2. Same path with missing runtime deps: remains a defensive `WorktreeAutoCreateFailure` helper branch, but production gate execution should not hit it.
3. `target_path` points at the active ADV worktree: isolation check uses `activeStore.paths.root`, not `process.cwd()`.
4. Proposal gate completion: remains exempt so changes can be created before worktree setup.
5. Gate completion from an ADV worktree remains allowed.
6. Legacy alias names are not present in `createToolMap` or degraded tool names.
7. Full-suite pending-delete tests use per-fixture synthetic project IDs so external test state does not leak across runs.

### Draft Spec Deltas

`worktree-warp-mode` / `rq-warpModeContract06` now states that legacy standalone aliases must not be registered by the ADV tool registry.

## Success Criteria

- [ ] `adv_gate_complete` production path wires auto-managed worktree resume runtime deps for non-proposal gates.
- [ ] `target_path` gate/task mutations use the active target store root for worktree isolation instead of host `process.cwd()`.
- [ ] Main-checkout completion for an auto-managed change attempts resume/materialization and returns `WorktreeIsolationViolation` with `expectedWorktreePath`, not `resumeRuntime missing`.
- [ ] Proposal gate remains exempt.
- [ ] Gate completion from an ADV worktree remains allowed.
- [ ] Production-path regression test covers `adv_gate_complete.execute`, not only helper-level seams.
- [ ] Legacy worktree aliases (`worktree_create`, `worktree_delete`, `worktree_cleanup`) are not registered or allowed by ADV agents.
- [ ] Targeted tests, `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.
