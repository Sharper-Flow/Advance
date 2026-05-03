# Archive: Add purpose-built adv-researcher subagent for /adv-research command

**Change ID:** addPurposeBuiltAdvResearcherSu
**Archived:** 2026-02-01T05:58:31.655Z
**Created:** 2026-02-01T00:20:40.578Z

## Tasks Completed

- ✅ Create .opencode/agents/adv-researcher.md with optimized settings (model, temperature 0.15, hidden, tool restrictions, research protocol prompt)
- ✅ Update .opencode/command/adv-research.md Phase 3 to specify subagent_type: "adv-researcher"
- ✅ Document agent configuration and override options in ADV_INSTRUCTIONS.md
- ⏭️ Verify adv-researcher agent invocation (test /adv-research with sample query, confirm output format)
- ✅ Validate research topics: model ID format, fallback behavior, tool wildcards (before implementation)
- ⏭️ Test fallback path: verify /adv-research works when adv-researcher agent is absent

## Specs Modified

