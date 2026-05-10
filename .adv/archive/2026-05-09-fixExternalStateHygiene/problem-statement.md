GitHub issue: https://github.com/Sharper-Flow/Advance/issues/60

`adv_status view: hygiene` reports stale external-state artifacts after the Temporal-only cutover. Most are low-risk leftovers, but 438 synthetic test worktree dirs in the real external root indicate a test-isolation regression. The detector also appears stale relative to the current in-repo archive policy.