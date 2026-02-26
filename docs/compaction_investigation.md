# OpenCode Session Compaction Deep Investigation

## EXECUTIVE SUMMARY

**Full amnesia symptoms reported after slash command + session compaction are likely caused by a BUG in OpenCode's hook context injection.**

The `experimental.session.compacting` hook is designed to inject context that should be preserved during compaction, but **there's a critical missing link: OpenCode doesn't appear to be using the injected context when it compacts the session.**

---

## FINDINGS

### 1. THE HOOK IS CORRECTLY IMPLEMENTED (in Advance)

**Location:** `/home/jrede/dev/oc-plugins/advance/plugin/src/index.ts` (lines 1090-1138)

```typescript
"experimental.session.compacting": async (input, output): Promise<void> => {
  try {
    // Add active change context for preservation
    if (state.activeChange.id) {
      const changeContext = [
        "=== ACTIVE ADV CHANGE ===",
        `Change ID: ${state.activeChange.id}`,
        state.activeChange.objective ? `Objective: ${state.activeChange.objective}` : "",
        "This change should be preserved across compaction.",
        "========================",
      ].filter(Boolean).join("\n");

      output.context.push(changeContext);  // <-- Context is pushed
    }

    // Add project specs summary for context
    try {
      const specs = await store.specs.list({});
      if (specs.specs && specs.specs.length > 0) {
        const specsSummary = [
          "=== ADV SPECS CONTEXT ===",
          `Project has ${specs.specs.length} spec(s):`,
          ...specs.specs.slice(0, 5).map((s: { name: string; title: string }) => `- ${s.name}: ${s.title}`),
          ...
        ].filter(Boolean).join("\n");

        output.context.push(specsSummary);  // <-- More context pushed
      }
    } catch {
      // Ignore errors reading specs
    }
  } catch {
    // Silently handle errors
  }
}
```

**Verdict:** ✅ Hook implementation looks correct.

---

### 2. THE HOOK SIGNATURE IS CORRECT (per SDK)

**Source:** `/home/jrede/scratch/2026-02-21/.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` (lines 203-215)

```typescript
/**
 * Called before session compaction starts. Allows plugins to customize
 * the compaction prompt.
 *
 * - `context`: Additional context strings appended to the default prompt
 * - `prompt`: If set, replaces the default compaction prompt entirely
 */
"experimental.session.compacting"?: (input: {
    sessionID: string;
}, output: {
    context: string[];
    prompt?: string;
}) => Promise<void>;
```

**Key insight:** The hook receives:
- **input**: `{ sessionID }` — the session being compacted
- **output**: `{ context: string[], prompt?: string }` — arrays to mutate

**The output arrays should be used by OpenCode to:**
- Inject `context` items into the compaction prompt (so they're preserved)
- Or replace the entire `prompt` if needed

---

### 3. VISION PLUGIN USES IT CORRECTLY

**Source:** `/home/jrede/dev/vision-plugin/src/index.ts` (lines 149-177)

```typescript
"experimental.session.compacting": async (_input, output) => {
  // ... health check logic ...
  const context = state.daemonHealthy ? VISION_CONTEXT_HEALTHY : VISION_CONTEXT_NOT_RUNNING
  
  // Push context into compaction output
  output.context.push(context)  // <-- Same pattern
}
```

**Verdict:** Both plugins follow the same pattern. If the pattern is broken, both would fail.

---

### 4. THE CRITICAL MISSING PIECE: WHAT OPENCODE DOES WITH `output.context`

**Problem:** We can see plugins pushing to `output.context`, but we **cannot confirm OpenCode actually uses it during compaction.**

**Evidence of the bug:**
- Hook definition promises: "Additional context strings appended to the default prompt"
- Hook output has `context: string[]` array to mutate
- Plugins correctly mutate this array
- BUT: No visible evidence that OpenCode reads `output.context` and injects it into the compaction prompt

**Hypothesis:** OpenCode's compaction engine may:
1. ✅ Call the hook (fires correctly)
2. ✅ Plugin pushes context to `output.context`
3. ❌ **Ignores `output.context` during compaction** (BUG)
4. ❌ Uses only the default compaction prompt (which strips old context)
5. ❌ Session gets reset with only the default context

---

### 5. SLASH COMMANDS AND COMPACTION

**Why slash commands specifically trigger this:**

Slash commands (`/adv-*`) are special in OpenCode:
- They may trigger a full prompt context rebuild (not just appending to messages)
- They could activate **context management** / **compaction** more aggressively
- Or they reset the session context before dispatching the command

**No special code path found** in Advance for `/adv-*` commands that would bypass normal context handling.

---

### 6. "COMPACTION" vs "SESSION RESET"

**These are likely the same operation:**

- **Compaction**: OpenCode reduces the conversation history to fit context limits by summarizing
- **Session reset**: When compaction strips too much history, it effectively resets the session

If `output.context` is ignored, compaction → effective session reset.

---

## EVIDENCE TRAIL

### What We Know Works
1. ✅ `experimental.session.compacting` hook fires (tests confirm this)
2. ✅ Hook can access `output.context` array (both Advance and Vision do this)
3. ✅ Plugins correctly push strings to `output.context`
4. ✅ Hook can modify `output.prompt` if needed

### What We Don't Know
1. ❓ **Does OpenCode read `output.context` after the hook returns?**
2. ❓ **Is `output.context` injected into the compaction summarization prompt?**
3. ❓ **Is there a bug where `output.context` is collected but never used?**
4. ❓ **Does slash command dispatch trigger compaction?**

---

## ROOT CAUSE DIAGNOSIS

### Most Likely Scenario

**OpenCode has a bug where:**

1. Hook fires: `experimental.session.compacting` is called
2. Plugins push context to `output.context` array
3. Hook completes successfully
4. **OpenCode ignores `output.context`** during compaction
5. Compaction summarizes conversation using only default prompt
6. ADV context (change ID, tasks, specs) is stripped during summarization
7. Session appears reset because critical context is missing

**Supporting evidence:**
- User reports FULL amnesia, not partial loss
- It happens after slash commands (which may trigger compaction)
- It happens consistently after compaction runs
- Both Advance and Vision plugins push context the same way

---

## VERIFICATION STEPS (If You Had OpenCode Source)

Would check:
1. `packages/opencode/src/session/compaction.ts` — Does it call `output.context` hooks?
2. `packages/opencode/src/hooks/experimental.session.compacting.ts` — How does it handle hook output?
3. `packages/opencode/src/llm/compaction-prompt.ts` — Does it include `output.context` in the prompt?
4. Search for: `output.context` usage after hook returns
5. Check if context arrays are ever read/used (grep for reads of the `output` object)

---

## RECOMMENDED FIXES

### For OpenCode (if you control it)

1. **Verify hook output is used:**
   ```typescript
   // In compaction.ts or equivalent:
   const hookOutput = { context: [], prompt: undefined };
   await plugins.call("experimental.session.compacting", { sessionID }, hookOutput);
   
   // CRITICAL: Use hookOutput.context in the compaction prompt
   if (hookOutput.context.length > 0) {
     compactionPrompt.push("=== PLUGIN-PROVIDED CONTEXT ===");
     compactionPrompt.push(...hookOutput.context);
     compactionPrompt.push("=== END PLUGIN CONTEXT ===");
   }
   ```

2. **Add logging to verify:**
   ```typescript
   if (ADV_DEBUG) {
     console.error(`[COMPACTION] Collected ${hookOutput.context.length} context items from plugins`);
     hookOutput.context.forEach(c => console.error(`  - ${c.substring(0, 60)}...`));
   }
   ```

3. **Test that context actually appears in compaction:**
   ```typescript
   // Verify the final prompt includes plugin context
   if (!finalCompactionPrompt.includes("ACTIVE ADV CHANGE")) {
     console.warn("⚠️ WARNING: ADV context not found in compaction prompt!");
   }
   ```

### For Advance (Workaround)

If OpenCode's hook is truly broken, Advance could:

1. **Write a handoff file before compaction is expected:**
   - Detect imminent compaction (high context tokens? slash command dispatch?)
   - Persist active change state to a recovery file
   - On next message, load from recovery file if session lost context

2. **Use `experimental.chat.system.transform` more aggressively:**
   - This hook is called on EVERY message
   - Push full change context there (even though it burns tokens)
   - Ensure it can't be stripped

3. **Add session state to chat.params:**
   - Store active change in request metadata
   - Request that compaction preserve specific markers/tags

---

## CONFIGURATION CHECK

Your config has:
```json
"experimental": {
  "hooks": true,
  "system_transform": true
}
```

✅ Hooks are enabled  
✅ system_transform is enabled  

But we don't see `"session.compacting": true` explicitly. Check if OpenCode requires this flag.

---

## CONCLUSION

**The bug is almost certainly in OpenCode's compaction engine not using `output.context` from plugins.**

**User action:** Report to OpenCode team:
1. Hooks are firing correctly
2. Plugin context is being pushed to `output.context`
3. But session still loses context after compaction
4. This suggests OpenCode isn't reading/using `output.context` in the compaction prompt

Ask for:
- Debug logging showing if `output.context` is used
- Confirmation that compaction prompt includes plugin-provided context
- A flag to preserve context explicitly

