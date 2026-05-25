# makeArchiveMergeTrunk

## Intent

Make the release gate structurally enforce the trunk-merge contract declared by `rq-releaseFinalization01`. The fix moves `/adv-archive` Phase 9 from prose-only guidance into runtime enforcement so tool-driven archive/release flows cannot mark a change shipped while its change branch remains unmerged or, in PR mode, unpublished.

## Scope

- Add shared git finalization helpers for default branch detection, main checkout invariant checks, change-branch reachability, archive artifact commit, direct merge/push, PR-mode branch push, and credential-redacted git output.
- Enforce release-gate completion in `adv_gate_complete`: direct mode requires change branch reachability from the default branch; PR mode requires pushed-branch handoff evidence.
- Integrate `adv_change_archive` with Phase 9 finalization before archive retirement and issue closure.
- Add `archive_mode` and `auto_push` project config fields.
- Update `/adv-archive`, specs, generated spec docs, setup/docs, and tests.

## Success Criteria

1. `adv_gate_complete gateId: "release"` rejects direct-mode completion when `change/{id}` is not reachable from the default branch.
2. PR mode explicitly opts out of local default-branch merge and requires the change branch to be pushed/made available for PR workflow handoff.
3. `adv_change_archive` validates a trusted change worktree before writing in-repo archive artifacts.
4. Archive finalization runs before archived-state transition and issue closure; blocked finalization leaves the change active and retryable.
5. Archive artifacts are committed on the change branch before merge/push finalization.
6. Dirty main checkout and merge failures hard-block with remediation; no stash or branch switching.
7. Docs/specs reflect the runtime contract.
8. `pnpm run check`, `pnpm test`, and `pnpm run build` pass.

## Non-Goals

- Auto-resolving merge conflicts.
- Production deployment.
- Rewriting the archive bundle format.
- Auto-creating GitHub PRs beyond publishing/handoff evidence.
