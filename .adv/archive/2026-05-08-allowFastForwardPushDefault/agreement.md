## Agreement

### Objectives

1. Plain `git push` from default branch (fast-forward) is allowed by the guard
2. Force-push variants from default branch remain blocked
3. Refspec push (lease-equivalent) from default branch remains blocked

### Acceptance Criteria

- AC1: `evaluateDecision` allows plain `git push` from default branch
- AC2: `git push --force` from default branch → BLOCK
- AC3: `git push -f` from default branch → BLOCK
- AC4: `git push --force-with-lease` from default branch → BLOCK
- AC5: `git push origin trunk:other-ref` (refspec) from default branch → BLOCK
- AC6: Push from non-default branch behavior unchanged
- AC7: All existing tests pass; ≥5 new tests cover variants

### Constraints

- Files: `plugin/src/tools/git-guard.ts`, `plugin/src/tools/git-guard.test.ts` only
- Push detection via command-string parsing (no git invocation)
- Maintain backwards compatibility with existing decision matrix

### Out of Scope

- Force-push approval flow (separate change)
- Pre-push hook detection
- Changes to non-push subcommand handling