# Problem Statement

## Why

Linked roadmap/triage issues represent upstream work items. When ADV successfully archives and pushes such a change, leaving the upstream issue open creates stale backlog state and manual cleanup. The normal workflow should close the linked issue automatically after release finalization, while preserving an explicit opt-out for unusual cases.

## Desired Outcome

Update ADV archive behavior contract so linked GitHub issues for roadmap/triage-origin changes close by default after push verification, with `--no-close-issue` as opt-out and non-fatal failure semantics preserved.

## Success Criteria

1. Roadmap/triage linked issues close by default after verified archive push.
2. `--no-close-issue` opt-out is documented.
3. `--close-issue` remains backward-compatible or is clearly deprecated.
4. Non-linked origins remain no-op.
5. GitHub close failures warn but do not roll back archive state.
6. Verification passes.