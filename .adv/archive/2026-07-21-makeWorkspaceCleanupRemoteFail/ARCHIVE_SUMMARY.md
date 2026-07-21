# Archive: Make workspace cleanup remote-fail advisory

**Change ID:** makeWorkspaceCleanupRemoteFail
**Archived:** 2026-07-21T00:45:24.220Z
**Created:** 2026-07-21T00:34:21.201Z

## Tasks Completed

- ✅ Update existing tests and add regression coverage in `plugin/src/tools/worktree/index-delete.test.ts` for the new advisory-warning behavior.
  > Task checkpoint completed
- ✅ Amend spec `rq-terminalCleanupSafety01` to document the authority split: local CWD scan is the safety authority; remote workspace-list API is advisory.
  > Task checkpoint completed
- ✅ Modify `cleanupOpenCodeWorkspaceForWorktree` in `plugin/src/tools/worktree/index.ts` (lines 1488-1500) so a remote workspace-list lookup failure (`{ok: false, reason}` from `findWorkspaceByDirectoryChecked`) becomes advisory rather than blocking.
  > Task checkpoint completed

## Specs Modified

