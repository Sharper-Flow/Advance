# Archive: Fix git mutation guard canonical archive push block

**Change ID:** fixGitMutationGuardCanonical
**Archived:** 2026-05-09T21:31:42.267Z
**Created:** 2026-05-09T07:54:03.857Z

## Tasks Completed

- ✅ Add failing allow/deny regression tests for canonical archive mutation on default branch versus unrelated default-branch git mutation.
  > Added trunk-write-firewall unit regression and integration hook regression for `git -C <repo> push origin main` from default-branch checkout. Existing destructive write deny tests remain in place.
- ✅ Implement narrow auditable archive-operation allow path in git mutation guard while preserving unrelated default-branch mutation blocking.
  > Preserved current trunk-write-firewall implementation. The safe fix is regression coverage, not reintroducing a git-command classifier or broad archive allowlist.
- ✅ Run focused git guard/archive tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified

