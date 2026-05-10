GitHub issue: https://github.com/Sharper-Flow/Advance/issues/53

`adv_change_archive` recovery path skips `createInRepoArchive` when an external bundle already exists, leaving the in-repo archive missing or stale after recovery.