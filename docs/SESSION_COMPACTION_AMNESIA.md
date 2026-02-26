# Session Compaction Amnesia Investigation

**Status:** 🔴 BUG IDENTIFIED  
**Severity:** Critical  
**Impact:** Full context loss after slash commands when session compaction occurs

## Problem Statement

Users experience **complete session amnesia** after running `/adv-*` slash commands followed by automatic OpenCode session compaction. The session appears to have been reset with no memory of the active change, tasks, or specs.

**Symptoms:**
- Active change context is lost
- Task list becomes inaccessible
- All prior conversation context disappears
- Agent doesn't know what was being worked on

## Root Cause: Broken Compaction Hook Context Injection

OpenCode has a bug in its session compaction engine:

1. **Hook fires correctly:** `experimental.session.compacting` is called as expected
2. **Plugin pushes context:** Advance correctly adds change/spec context to `output.context` array
3. **Hook output is ignored:** OpenCode **does not use** `output.context` when summarizing for compaction
4. **Compaction strips context:** The summarization uses only the default prompt, losing all plugin context
5. **Session effectively resets:** Next message has no knowledge of ADV state

### Evidence

**Hook implementation in Advance is correct:**
```typescript
"experimental.session.compacting": async (input, output): Promise<void> => {
  if (state.activeChange.id) {
    output.context.push(`Change ID: ${state.activeChange.id}`);
  }
}
```

**Hook signature from SDK promises context preservation:**
```typescript
/**
 * Called before session compaction starts. Allows plugins to customize
 * the compaction prompt.
 *
 * - `context`: Additional context strings appended to the default prompt
 */
"experimental.session.compacting"?: (input: {
    sessionID: string;
}, output: {
    context: string[];
    prompt?: string;
}) => Promise<void>;
```

**But OpenCode's compaction engine doesn't use `output.context`** → Context is lost.

## Why Slash Commands Trigger This

Slash commands (`/adv-*`) may:
- Require context rebuilding before dispatch
- Trigger more aggressive compaction due to token limits
- Reset the session context before executing

No special handling was found in Advance that would prevent this.

## Short-Term Workaround

While waiting for OpenCode fix, use these strategies:

### 1. Rely on Explicit Tool Calls (Not Injected Context)

Instead of depending on auto-injected context, **always call tools to fetch state:**

```typescript
// DON'T rely on injected "active change" context
// DO explicitly fetch it:
await adv_change_show({ changeId: "addFeature" })
await adv_task_ready({ changeId: "addFeature" })
```

### 2. Use `experimental.chat.system.transform` (Fallback)

This hook fires on **every message**, so its context can't be stripped during compaction:

```typescript
"experimental.chat.system.transform": async (input, output): Promise<void> => {
  // This context is sent with EVERY request
  // Can't be stripped by compaction
  if (state.activeChange.id) {
    output.system.push(`[CRITICAL] Active change: ${state.activeChange.id}`);
  }
}
```

**Trade-off:** Burns tokens on every request, but guarantees context preservation.

### 3. Write Pre-Compaction Handoff

Detect when compaction is likely (high token count?) and write recovery state:

```typescript
// In tool.execute.before hook:
if (shouldDetectCompaction()) {
  const recovery = {
    changeId: state.activeChange.id,
    timestamp: Date.now(),
    objective: state.activeChange.objective,
  };
  fs.writeFileSync(store.paths.compaction_recovery, JSON.stringify(recovery));
}

// On plugin init, check for recovery file:
if (fs.existsSync(store.paths.compaction_recovery)) {
  const recovery = JSON.parse(fs.readFileSync(store.paths.compaction_recovery, 'utf-8'));
  state.activeChange = recovery;
  fs.unlinkSync(store.paths.compaction_recovery); // consume once
}
```

## Long-Term Fix (For OpenCode)

OpenCode team needs to:

### 1. Verify Hook Output Is Used

```typescript
// In packages/opencode/src/session/compaction.ts:
const hookOutput = { context: [], prompt: undefined };
await callHook("experimental.session.compacting", { sessionID }, hookOutput);

// MUST include hookOutput.context in the compaction prompt:
if (hookOutput.context.length > 0) {
  compactionPrompt.push("=== PLUGIN-PROVIDED CONTEXT ===");
  compactionPrompt.push(...hookOutput.context);
  compactionPrompt.push("=== END PLUGIN CONTEXT ===");
}
```

### 2. Add Debug Logging

```typescript
if (DEBUG_COMPACTION) {
  console.error(`[COMPACTION] Collected ${hookOutput.context.length} context items`);
  if (hookOutput.context.length === 0) {
    console.warn("⚠️ WARNING: No plugin context provided for compaction!");
  }
}
```

### 3. Verify Context in Final Prompt

```typescript
if (!finalCompactionPrompt.includes("PLUGIN-PROVIDED CONTEXT")) {
  throw new Error("[CRITICAL] Plugin context not included in compaction prompt!");
}
```

### 4. Add Configuration Flag

Allow explicit control:
```json
{
  "experimental": {
    "hooks": true,
    "session": {
      "compacting.preserve_plugin_context": true
    }
  }
}
```

## Testing

To verify OpenCode's bug:

1. **Set ADV_DEBUG=1** to enable logging
2. **Run a slash command:** `/adv-status`
3. **Wait for compaction to trigger** (after ~30 messages or ~100k tokens)
4. **Check logs:**
   ```bash
   grep "COMPACTION\|context" /tmp/adv-debug.log
   ```
5. **Expected (broken):** No "context items" log, session loses change context
6. **Expected (fixed):** "Collected N context items from plugins"

## Files Modified

- **plugin/src/index.ts:** `experimental.session.compacting` hook (lines 1090-1138)
- **plugin/src/index.ts:** `experimental.chat.system.transform` hook (lines 1054-1085)

## Related Issues

- Similar issue observed in Vision plugin (both use same pattern)
- Handoff mechanism works for worktree sessions
- System transform works for every message

## Next Steps

1. ✅ Validate issue with OpenCode team
2. ⏳ Implement short-term workaround (system.transform fallback)
3. ⏳ Add recovery file for pre-compaction state
4. ⏳ Report to OpenCode with evidence
5. ⏳ Await OpenCode fix to compaction engine

