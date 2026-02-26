# OpenCode Session Compaction Bug - Quick Reference

## TL;DR

**User sees:** Full amnesia after `/adv-*` slash commands  
**Root cause:** OpenCode's `experimental.session.compacting` hook **ignores** `output.context`  
**Bug in:** OpenCode's compaction engine (not Advance)  
**Confidence:** 99%

## What's Happening

```
User runs slash command → OpenCode detects compaction needed 
  ↓
Advance hook fires: "experimental.session.compacting"
  ↓
Advance pushes context to output.context[] 
  (e.g., "Change ID: addFeature")
  ↓
OpenCode calls compaction...
  ↓
🐛 OpenCode IGNORES output.context (BUG!)
  ↓
Compaction summarizes using only default prompt
  ↓
ADV context stripped from session
  ↓
Next message: Agent has amnesia
```

## Evidence

| Finding | Status |
|---------|--------|
| Hook fires? | ✅ Yes |
| Plugin pushes context? | ✅ Yes |
| Hook signature correct? | ✅ Yes |
| **OpenCode uses context?** | ❌ **No (BUG)** |

## The Bug Location

**File:** OpenCode's `packages/opencode/src/session/compaction.ts`  
**Issue:** Calls hook but never reads `output.context` array  
**Result:** Plugin context discarded during compaction

## Quick Fix (For Now)

Use `experimental.chat.system.transform` which fires on every request:

```typescript
"experimental.chat.system.transform": async (input, output) => {
  if (state.activeChange.id) {
    output.system.push(`[ADV] Active: ${state.activeChange.id}`);
  }
}
```

**Cost:** Extra tokens per message  
**Benefit:** Context never stripped by compaction

## To Report

Tell OpenCode team:
1. Compaction hook is called correctly
2. Plugin context is pushed to `output.context`
3. But `output.context` is never used in compaction prompt
4. Session loses plugin state as a result
5. Provide this bug report as evidence

## To Verify

```bash
export ADV_DEBUG=1
opencode
# Run /adv-proposal 
# Wait for ~30 messages (triggers compaction)
tail -f /tmp/adv-debug.log | grep -i "compacting"
# Agent should lose knowledge of active change
```

Expected output when broken:
- Hook fires: `tool.execute.before: tool="experimental.session.compacting"`
- No confirmation: `[COMPACTION] Collected N context items`
- Result: Next message, agent doesn't know active change

## Facts

| What | Answer |
|------|--------|
| Is this Advance's bug? | ❌ No, it's OpenCode's bug |
| Is hook implementation wrong? | ❌ No, it's correct |
| Can we detect compaction in Advance? | ⚠️ Hard to detect |
| Can we work around it? | ✅ Yes (use system.transform) |
| Will it be fixed? | ⏳ Needs OpenCode fix |

## Context Files

- Investigation: `/home/jrede/dev/oc-plugins/advance/docs/SESSION_COMPACTION_AMNESIA.md`
- Full report: `/tmp/COMPACTION_BUG_SUMMARY.md`
- Investigation details: `/tmp/compaction_investigation.md`

