# Repair guard mismatch

## Why

ADV worktree isolation guard, remediation, and registry triage are inconsistent. Current `worktree-lifecycle` law blocks discovery gate completion from main checkout, while desired behavior needs isolation classified by working-tree impact. Non-code/non-git gate metadata transitions should not force a worktree; code/git-mutating gates and task execution mutations must remain structurally isolated. Current remediation also points agents at unsupported invocation surfaces, and worktree triage can produce invalid or false orphan guidance because registry reads still use retired/stubbed paths.

Discovery related-pattern scan found the same retired/stubbed registry read path in file-overlap, branch-integration, and merge-order consumers. User chose to include those same-pattern consumers so the registry repair is structurally consistent instead of triage-only.

## Problem Statement

ADV needs spec-aligned, structurally enforced worktree isolation with accurate remediation and trustworthy registry reads, without weakening isolation for code/git-mutating gates.

## Scope

### In Scope

- Update `worktree-lifecycle` spec law for guard semantics.
- Classify gate isolation by working-tree impact.
- Keep isolation for code/git-mutating gates and task execution mutations.
- Fix remediation text/schema mismatch.
- Fix triage recommended-fix output.
- Repair retired registry read paths in triage, file-overlap, branch-integration, and merge-order.
- Add regression tests.

### Out of Scope

- Changing OpenCode cwd/session model.
- Moving ADV state into the repo.
- General worktree cleanup deletion safety.
- Global bypass flags.
- Reworking branch merge policy beyond replacing the retired registry read source.

### Must Not

- Do not add `--ignore-isolation`.
- Do not relax isolation for code/git-mutating operations.
- Do not leave remediation pointing at unsupported flags or arguments.
- Do not reintroduce sidecar SQLite/JSONL as authoritative worktree registry state.

## Success Criteria

1. Discovery gate completion from main checkout is allowed when discovery completion does not mutate working tree or git.
2. Design metadata completion from main checkout is allowed when it does not mutate working tree or git.
3. Planning, execution, acceptance, and release remain blocked from main checkout when isolation is active or the change is auto-managed.
4. No `adv_gate_complete` remediation instructs agents to pass unsupported `workdir` arguments.
5. `adv_worktree_triage` no longer recommends `adv_worktree_create --adopt`.
6. Triage, file-overlap, branch-integration, and merge-order compare against authoritative Temporal per-change worktree records, not retired/stubbed registry paths.
7. Tests fail against current discovery-blocking / invalid-remediation / invalid-adopt / stubbed-registry behavior and pass after fix.
8. Specs and tests encode new gate classification.