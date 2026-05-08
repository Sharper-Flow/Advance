## Problem

`plugin/src/tools/git-guard.ts` blocks all `git push` operations from default branch (lines 486-494). This contradicts `adv-archive.md` Phase 9 Step 5 which explicitly performs `git -C "$MAIN" push origin {default-branch}` after a clean fast-forward merge.

## Proposed Solution

Detect push intent and only block destructive variants:

| Push variant | Decision |
|---|---|
| `git push` (plain, fast-forward) | ALLOW from default branch |
| `git push --force` / `-f` | BLOCK from default branch |
| `git push --force-with-lease` | BLOCK without explicit RECOVERY annotation |
| `git push origin <ref>:<other-ref>` (refspec) | BLOCK (lease-equivalent intent) |

### Implementation

1. Add `extractPushFlags(command: string): { force: boolean, forceWithLease: boolean, hasRefspec: boolean }` helper
2. In `evaluateDecision`, replace the unconditional push block with:
   - Force / force-with-lease / refspec push from default branch → BLOCK with reason
   - Plain push from default branch → ALLOW (canonical archive path)
3. Add tests covering all 4 variants

## Success Criteria

- Plain `git push origin trunk` from clean default branch → ALLOW
- `git push --force origin trunk` from default branch → still BLOCK
- `git push --force-with-lease origin trunk` from default branch → still BLOCK
- `git push origin trunk:other-ref` from default branch → BLOCK
- All existing tests pass; new tests cover push variants

## Out of Scope

- Push from non-default branches (already handled)
- Force-push approval flow (requires user question — separate change)
- Pre-push hook detection (handled in adv-archive Phase 9 Step 5.5)