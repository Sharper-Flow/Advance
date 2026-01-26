# Add runtime enforcement hooks for todo continuation and wisdom accumulation

## Why

Research of oh-my-opencode revealed two key gaps in ADV:

1. **No-skip policy is documentation-only** - Our `/adv-ralph` command documents anti-skip behavior but doesn't enforce it at runtime. Oh-my-opencode uses a "Todo Continuation Enforcer" hook that actually prevents agents from stopping with incomplete tasks.

2. **No cross-task learning** - Each task starts fresh without context from previous tasks. Oh-my-opencode accumulates "wisdom" (patterns, conventions, gotchas) and injects it into subsequent task context.

These features can be implemented entirely within the existing ADV plugin architecture using `tool.execute.after` hooks, without requiring any OpenCode SDK changes.

## What Changes

### Feature 1: Todo Continuation Hook

When `adv_task_update` marks a task as "done", the `tool.execute.after` hook will:
1. Query the change for remaining incomplete tasks
2. If tasks remain, inject a `[ADV:TODO_CONTINUATION]` reminder into the response
3. Remind agent: "Continue to the next task. Do NOT stop or defer."

This is a **soft reminder** approach - it injects context rather than blocking the operation.

### Feature 2: Wisdom Accumulation

Add a `wisdom` field to the Change schema that stores learnings:

```typescript
WisdomEntry {
  id: string           // ws-{nanoid(6)}
  type: "pattern" | "success" | "failure" | "gotcha" | "convention"
  content: string
  source_task?: string // Task that generated this
  recorded_at: string  // ISO8601
}
```

New tools:
- `adv_wisdom_add` - Record a learning
- `adv_wisdom_list` - List accumulated wisdom

Hook integration:
- On task start (`in_progress`): Inject existing wisdom as `[ADV:ACCUMULATED_WISDOM]`
- On task complete (`done`): Prompt agent to consider recording learnings

## Success Criteria

1. [ ] When a task is marked "done" and other tasks remain incomplete, a `[ADV:TODO_CONTINUATION]` reminder is injected into the tool response
2. [ ] The reminder includes a list of remaining tasks with their IDs and titles
3. [ ] `adv_wisdom_add` tool creates wisdom entries stored in change.json
4. [ ] `adv_wisdom_list` tool returns all wisdom entries for a change
5. [ ] When a task transitions to "in_progress", existing wisdom is injected as `[ADV:ACCUMULATED_WISDOM]` context
6. [ ] When a task completes, the response includes a suggestion to record learnings
7. [ ] Existing changes without wisdom field continue to work (backwards compatible)
8. [ ] All new code has passing tests

## Affected Code

| File | Change |
|------|--------|
| `plugin/src/types.ts` | Add `WisdomEntry` schema, extend `ChangeSchema` |
| `plugin/src/tools/wisdom.ts` | **New file**: wisdom tools |
| `plugin/src/tools/index.ts` | Export wisdom tools |
| `plugin/src/index.ts` | Register wisdom tools, extend `tool.execute.after` hook |
| `plugin/src/storage/store.ts` | Add wisdom operations to store interface |

## Constraints

- MUST: Work without OpenCode SDK changes
- MUST: Be backwards compatible with existing changes
- MUST NOT: Block task completion (soft reminder only)
- SHOULD: Use existing hook infrastructure
- SHOULD: Follow existing patterns for tool/storage implementation

## Impact

- Affected specs: None (ADV plugin internals)
- Breaking changes: No
- New dependencies: None (uses existing `nanoid`)

## Context

- Brainstorm: ./temp/brainstorm-adv-runtime-enhancements.md
- Key decisions carried forward:
  - Soft reminder for todo continuation (not hard block)
  - Wisdom stored per-change in change.json
  - Semi-auto capture (prompt agent to record, not auto-extract)
  - No background agent support (requires SDK changes)

## Research Validation

**Date:** 2026-01-26  
**Full Report:** ./RESEARCH_REPORT.md

### Validated Decisions

| Decision | Status | Notes |
|----------|--------|-------|
| Zod `.optional()` for schema | VALIDATED | Idiomatic backwards-compatible extension |
| Embedded wisdom in change.json | VALIDATED | One-to-few relationship, matches `tasks[]` pattern |
| Soft reminder pattern | VALIDATED | Academic research confirms soft+escalation outperforms hard blocks |

### Architecture Change Required

**Issue:** Original plan used `tool.execute.after` for context injection  
**Finding:** SDK provides `experimental.chat.system.transform` specifically for this purpose  
**Action:** Use purpose-built hook instead of observation hook

```typescript
// BEFORE (risky - mutating observation hook output)
"tool.execute.after": async (input, output) => {
  output.output += "\n[ADV:TODO_CONTINUATION]..."; // May corrupt JSON
}

// AFTER (correct - purpose-built context injection)
"experimental.chat.system.transform": async (input, output) => {
  output.system.push("## Active Tasks\n...");
  output.system.push("## Accumulated Wisdom\n...");
}
```

**Benefits:**
- No risk of corrupting structured tool responses
- Context injected into all LLM interactions
- Matches existing `experimental.session.compacting` pattern
