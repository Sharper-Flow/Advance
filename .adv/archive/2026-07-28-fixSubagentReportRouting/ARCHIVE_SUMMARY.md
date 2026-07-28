# Archive: Fix subagent report routing

**Change ID:** fixSubagentReportRouting
**Archived:** 2026-07-28T06:52:07.152Z
**Created:** 2026-07-27T23:32:53.043Z

## Tasks Completed

- ✅ Build the CI guard that binds sub-agent prompt bodies to AGENT_TOOL_POLICY.
  > Task checkpoint completed
- ✅ Capture the AC7 red-run evidence: run the Task 1 guard against pre-rewrite prompt bodies and pin the failure output.
  > Task checkpoint completed
- ✅ Rewrite sub-agent prompt bodies to route non-Tier-1 ADV tools through `adv_tool_invoke`, and rescope the retry amplifier.
  > Task checkpoint completed
- ✅ Verify that all invariants the agreement marks as unmodified are in fact unmodified, and that existing test suites pass.
  > Task checkpoint completed

## Specs Modified

