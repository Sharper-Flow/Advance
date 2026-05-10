GitHub issue: https://github.com/Sharper-Flow/Advance/issues/56

`adv_status` can show first-call bootstrap nondeterminism (`TMPRL1100`) due to race against scoped ADV instruction loading. This creates flaky health/status behavior at session start.