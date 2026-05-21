# Problem Statement — Add terminal cleanup reaper

Terminal-mode ADV worktrees can remain on disk after their owning change is archived or closed. The existing cleanup behavior was fragmented: manual cleanup retried queued pending deletes, `session.deleted` was best-effort, and startup did not have a bounded store-aware cleanup path. This left terminal worktrees dependent on users remembering to run cleanup, while duplicate loops risked diverging from the structural safety checks in `advWorktreeDelete`.

The desired behavior is eventual cleanup through shared lifecycle triggers, with startup bounded to known pending deletes and all actual deletion attempts still passing through durable terminal-state, merged-branch, clean-worktree, and live-CWD gates.
