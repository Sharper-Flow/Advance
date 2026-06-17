# Archive: Add adv_change_forget to agent allowlists

**Change ID:** addAdvChangeForgetAgent
**Archived:** 2026-06-17T22:03:47.059Z
**Created:** 2026-06-17T21:55:00.699Z

## Tasks Completed

- ✅ Add `adv_change_forget: true` to both agent allowlists
  > Added adv_change_forget: true to .opencode/agents/adv.md (after adv_change_status_repair) and .opencode/agents/adv-atc.md (after adv_change_reenter). deploy --check now reports ✓ tool drift for both agents (56 tools, zero drift both directions). pnpm run check green. No code/schema/instruction-prose changes — two allowlist lines only.

## Specs Modified

