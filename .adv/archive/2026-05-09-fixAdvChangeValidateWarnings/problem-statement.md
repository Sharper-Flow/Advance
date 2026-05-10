GitHub issue: https://github.com/Sharper-Flow/Advance/issues/63

`adv_change_validate` returns `passed:false` when only warnings are present in strict mode. This can incorrectly block workflows and conflate advisory warnings with hard validation failures.