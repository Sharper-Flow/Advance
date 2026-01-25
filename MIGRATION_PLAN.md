# Advance Plugin SDK Migration Plan

## Objective

Migrate the Advance plugin from a custom stub interface to the official `@opencode-ai/plugin` SDK, implementing both **tools** (MCP tools for spec/change/task management) and **event hooks** (terminal status, TDD tracking, session compaction).

## Background

### Current State (Broken)
The plugin uses a custom interface that doesn't match the SDK:
- Returns `{ name, version, tools, onSessionStart, onSessionEnd }`
- SDK expects `{ tool, event, "tool.execute.before", ... }` (Hooks interface)

### Target State
Full SDK compliance with:
- `tool`: 28 MCP tools for spec-driven development
- `event`: Session status tracking, terminal UI updates
- `tool.execute.before`/`after`: TDD phase detection, sub-agent tracking
- `experimental.session.compacting`: Contract/change preservation

## Architecture Decision

### Pattern: Hybrid Plugin (Tools + Events)
Combine Goost's event-based status tracking with Advance's MCP tools.

**Rationale:**
1. Tools provide the core functionality (spec/change/task management)
2. Events provide UX enhancements (terminal status, TDD tracking)
3. This matches how production OpenCode plugins work

### Directory Structure
```
plugin/
├── src/
│   ├── index.ts              # Plugin entry - SDK interface
│   ├── index.test.ts         # Integration tests (NEW)
│   ├── tools/                # Tool definitions (unchanged)
│   │   ├── spec.ts
│   │   ├── change.ts
│   │   ├── task.ts
│   │   ├── status.ts
│   │   ├── agenda.ts
│   │   └── project.ts
│   ├── storage/              # Data layer (unchanged)
│   ├── events/               # Event handlers (enhanced)
│   │   ├── index.ts
│   │   ├── status.ts         # Terminal status
│   │   ├── terminal.ts       # OSC escape sequences
│   │   └── handlers.ts       # Event handler functions (NEW)
│   └── types.ts              # Shared types
├── package.json
└── tsconfig.json
```

## SDK Interface Reference

### Hooks Interface (from @opencode-ai/plugin)
```typescript
interface Hooks {
  // MCP Tools
  tool?: { [key: string]: ToolDefinition };
  
  // Event handling
  event?: (input: { event: Event }) => Promise<void>;
  
  // Tool lifecycle
  "tool.execute.before"?: (input, output) => Promise<void>;
  "tool.execute.after"?: (input, output) => Promise<void>;
  
  // Permission handling
  "permission.ask"?: (input, output) => Promise<void>;
  
  // Session compaction
  "experimental.session.compacting"?: (input, output) => Promise<void>;
}
```

### Tool Definition (from @opencode-ai/plugin)
```typescript
function tool<Args extends z.ZodRawShape>(input: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
}): ToolDefinition;

// tool.schema === z (Zod library)
```

## Implementation Steps

### Phase 1: Setup (5 min)
1. Rename `plugin/` to `plugin-old/`
2. Create new `plugin/` directory
3. Copy package.json, tsconfig.json, vitest.config.ts
4. Copy src/ (excluding index.ts)

### Phase 2: RED - Write Failing Tests (20 min)
Create `src/index.test.ts`:

```typescript
describe("Advance Plugin SDK Integration", () => {
  // Test 1: Plugin exports valid async function
  test("exports AdvancePlugin as default", () => {
    expect(typeof AdvancePlugin).toBe("function");
  });

  // Test 2: Returns Hooks object with tool key
  test("returns Hooks with tool object", async () => {
    const hooks = await AdvancePlugin(mockInput);
    expect(hooks).toHaveProperty("tool");
    expect(typeof hooks.tool).toBe("object");
  });

  // Test 3: Returns Hooks object with event key
  test("returns Hooks with event function", async () => {
    const hooks = await AdvancePlugin(mockInput);
    expect(hooks).toHaveProperty("event");
    expect(typeof hooks.event).toBe("function");
  });

  // Test 4: All 28 tools are registered
  test("registers all 28 tools", async () => {
    const hooks = await AdvancePlugin(mockInput);
    const toolNames = Object.keys(hooks.tool!);
    expect(toolNames).toHaveLength(28);
    expect(toolNames).toContain("adv_spec_list");
    expect(toolNames).toContain("adv_agenda_compact");
  });

  // Test 5: Tool has correct structure
  test("tools have description, args, execute", async () => {
    const hooks = await AdvancePlugin(mockInput);
    const specList = hooks.tool!.adv_spec_list;
    expect(specList).toHaveProperty("description");
    expect(specList).toHaveProperty("args");
    expect(specList).toHaveProperty("execute");
  });

  // Test 6: Tool execution works
  test("adv_spec_list executes and returns JSON", async () => {
    const hooks = await AdvancePlugin(mockInput);
    const result = await hooks.tool!.adv_spec_list.execute({}, mockContext);
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("specs");
  });

  // Test 7: Event hook handles session.status
  test("event hook processes session.status", async () => {
    const hooks = await AdvancePlugin(mockInput);
    await expect(
      hooks.event!({ event: { type: "session.status", properties: { status: "busy" } } })
    ).resolves.not.toThrow();
  });

  // Test 8: tool.execute.before hook exists
  test("has tool.execute.before hook", async () => {
    const hooks = await AdvancePlugin(mockInput);
    expect(hooks["tool.execute.before"]).toBeDefined();
  });

  // Test 9: tool.execute.after hook exists
  test("has tool.execute.after hook", async () => {
    const hooks = await AdvancePlugin(mockInput);
    expect(hooks["tool.execute.after"]).toBeDefined();
  });

  // Test 10: experimental.session.compacting hook exists
  test("has experimental.session.compacting hook", async () => {
    const hooks = await AdvancePlugin(mockInput);
    expect(hooks["experimental.session.compacting"]).toBeDefined();
  });
});
```

### Phase 3: GREEN - Implement index.ts (40 min)

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";
import { createStore } from "./storage/store";
import { specTools, changeTools, taskTools, statusTools, agendaTools, projectTools } from "./tools";
import { createEventHandlers } from "./events/handlers";
import { initializeStatus, getProjectName, cleanupTerminal } from "./events";

export const AdvancePlugin: Plugin = async ({ directory }) => {
  // Initialize store
  const store = await createStore(directory);
  await store.init();
  await store.sync();

  // Initialize terminal status
  const projectName = getProjectName(directory);
  initializeStatus(projectName);

  // Create event handlers with shared state
  const { eventHandler, toolBeforeHandler, toolAfterHandler, compactingHandler } = 
    createEventHandlers({ store, projectName });

  // Register cleanup
  process.on("exit", cleanupTerminal);
  process.on("SIGINT", () => { cleanupTerminal(); process.exit(0); });
  process.on("SIGTERM", () => { cleanupTerminal(); process.exit(0); });

  return {
    // MCP Tools
    tool: {
      adv_spec_list: tool({
        description: specTools.adv_spec_list.description,
        args: {
          capability: tool.schema.string().optional().describe("Filter by capability"),
          tag: tool.schema.string().optional().describe("Filter by tag"),
        },
        execute: async (args) => specTools.adv_spec_list.execute(args, store),
      }),
      // ... all 28 tools
    },

    // Event hooks
    event: eventHandler,
    "tool.execute.before": toolBeforeHandler,
    "tool.execute.after": toolAfterHandler,
    "experimental.session.compacting": compactingHandler,
  };
};

export default AdvancePlugin;
```

### Phase 4: Tool Mapping (Reference)

| Tool | Args | Special Handling |
|------|------|------------------|
| adv_spec_list | capability?: string, tag?: string | None |
| adv_spec_show | capability: string | None |
| adv_spec_search | query: string, limit?: number | number type |
| adv_change_list | status?: string, includeArchived?: boolean | boolean type |
| adv_change_show | changeId: string | None |
| adv_change_create | summary: string, capability?: string | None |
| adv_change_validate | changeId: string, strict?: boolean | boolean type |
| adv_change_archive | changeId: string, dryRun?: boolean | boolean type |
| adv_task_list | changeId: string, status?: enum | enum type |
| adv_task_ready | changeId: string | None |
| adv_task_update | taskId: string, status: enum, notes?: string | enum type |
| adv_task_add | changeId: string, content: string, blockedBy?: string[], section?: string | array type |
| adv_task_evidence | taskId: string, phase: enum, testFile?: string, command?: string, output?: string, exitCode?: number | enum + number |
| adv_task_tdd_phase | taskId: string, phase: enum | enum type |
| adv_task_skip_tdd | taskId: string, reason: string | None |
| adv_task_tdd_status | taskId: string | None |
| adv_status | (none) | None |
| adv_agenda_list | status?: enum, includeCompleted?: boolean | enum + boolean |
| adv_agenda_add | title: string, description?: string, priority?: enum, category?: string, blocked_by?: string | enum type |
| adv_agenda_start | itemId: string | None |
| adv_agenda_complete | itemId: string, notes?: string | None |
| adv_agenda_cancel | itemId: string, reason?: string | None |
| adv_agenda_prioritize | itemId: string, priority: enum | enum type |
| adv_agenda_next | (none) | None |
| adv_agenda_stats | (none) | None |
| adv_agenda_evidence | itemId: string, phase: enum, testFile?: string, command?: string, output?: string, exitCode?: number | enum + number |
| adv_agenda_compact | (none) | None |
| adv_project_context | (none) | None |

### Phase 5: Build & Test (10 min)
```bash
cd plugin
pnpm install
pnpm run build  # Must pass with no type errors
pnpm test       # All tests must pass
```

### Phase 6: Integration Test (5 min)
```bash
opencode  # Must launch without errors
# Run: /adv-status
```

### Phase 7: Cleanup (2 min)
```bash
rm -rf plugin-old
```

## Verification Checklist

### Build
- [ ] `pnpm run build` succeeds
- [ ] `dist/index.js` generated
- [ ] `dist/index.d.ts` generated
- [ ] No TypeScript errors

### Unit Tests
- [ ] All existing tests pass (288+)
- [ ] New integration tests pass (10+)

### Runtime
- [ ] OpenCode launches
- [ ] `/adv-status` works
- [ ] Tools execute correctly
- [ ] Terminal status updates
- [ ] TDD phase detection works

## Rollback

If migration fails:
```bash
rm -rf plugin
mv plugin-old plugin
```

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| 1 | 5 min | Setup |
| 2 | 20 min | Write tests (RED) |
| 3 | 40 min | Implement (GREEN) |
| 4 | - | Reference only |
| 5 | 10 min | Build & test |
| 6 | 5 min | Integration test |
| 7 | 2 min | Cleanup |
| **Total** | **~80 min** | |
