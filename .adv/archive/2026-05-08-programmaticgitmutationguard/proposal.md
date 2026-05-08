# programmaticGitMutationGuard

## Intent

Prevent ADV agents from accidentally executing dangerous git mutations (commit, merge, rebase, push) from shared/main/dirty checkouts by introducing a programmatic guard in the `tool.execute.before` hook. The guard inspects raw bash commands, validates git state facts, and blocks unsafe mutations while preserving valid parallel worktree-based workflows.

## Problem

On a previous change (`measuregateworktime`), the agent ran raw `git add -A`, `git commit`, `git merge`, and `git push` from the dirty shared main checkout. This committed unrelated peer Sonar edits and pushed them to `origin/trunk`. Current safety is prompt-only — agents are *told* not to do this but there is no mechanical enforcement.

## Scope

### In Scope
- `plugin/src/index.ts`: `tool.execute.before` hook — add bash command inspection for git mutation patterns
- New module: `plugin/src/tools/git-guard.ts` — guard logic (configurable git mutation pattern matching, allowlist checks, context validation)
- New tests: `plugin/src/tools/git-guard.test.ts` — unit tests for guard logic
- Updated tests: `plugin/src/integration.test.ts` — hook-level integration test for bash interception
- Spec delta: `.adv/specs/advance-meta/` — must-not constraints for git mutation safety
- Documentation: `ADV_INSTRUCTIONS.md` — update enforcement layers section

### Out of Scope
- OpenCode snapshot-index contention (tracked at Sharper-Flow/Opencode-Advance#1)
- Guarding git operations inside Temporal workflows/activities (already in-process, not bash-mediated)
- Guarding `execFile("git", ...)` calls from ADV tool code (these go through Node child_process, not the bash tool — separate enforcement surface for future)
- Modifying existing `adv_task_checkpoint` internals (it already uses validated `runGit` with branch/HEAD checks)
- Cross-repo git safety (only ADV project repo is guarded)

## Success Criteria

- [ ] Raw bash git mutations blocked from shared main checkout without explicit scoped approval
- [ ] Guard verifies workdir/branch/HEAD facts before allowing mutations
- [ ] Read-only git commands remain allowed
- [ ] Separate worktree agents can commit independently without guard collision
- [ ] No ADV Temporal workflow/worker coordination changes
- [ ] Specs capture must-not constraints
