# Design: structuredTaskOutputAs

## Architecture Decision: Extraction at Tool Layer
Extraction runs in the tool layer before firing `taskCompletedSignal`. Rationale: CPU-bound string processing avoids Temporal sandbox concerns; signal payload carries pre-validated result; workflow handler stays simple.

## Signal Paths (3 integration points)

1. **`adv_task_update` status='done'** (task.ts:358-375) — extract from `implementation_summary + notes`
2. **`adv_task_completed`** (task.ts:631-644) — extract from `verification + summary` — PRIMARY completion tool
3. **`adv_task_checkpoint` complete mode** (checkpoint.ts:365) — extract from `verification` text

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `plugin/src/types/task-output.ts` | NEW | Schema, constants, error class |
| `plugin/src/types/tasks.ts` | MODIFY | Add `structured_output` field |
| `plugin/src/types/signals.ts` | MODIFY | Add `structured_output` to signal payload |
| `plugin/src/utils/extract-structured-output.ts` | NEW | Tag extraction utility |
| `plugin/src/tools/task.ts` | MODIFY | Wire into `adv_task_update` AND `adv_task_completed` |
| `plugin/src/tools/checkpoint.ts` | MODIFY | Wire into `fireTaskCompletedFromCheckpoint` |
| `plugin/src/temporal/change-state.ts` | MODIFY | Assign `payload.structured_output` to task |
| Test files (4) | NEW/MODIFY | Extraction unit tests + integration tests |

## Schema Design

### `types/task-output.ts` (NEW)
```typescript
import { z } from "zod";

export const STRUCTURED_OUTPUT_MAX_BYTES = 10 * 1024; // 10KB

export const FileChangeSchema = z.object({
  path: z.string(),
  linesAdded: z.number().int().nonnegative().optional(),
  linesRemoved: z.number().int().nonnegative().optional(),
});

export const DecisionSchema = z.object({
  decision: z.string(),
  why: z.string(),
});

export const TaskStructuredOutputSchema = z.object({
  filesChanged: z.array(FileChangeSchema).default([]),
  testsAdded: z.number().int().nonnegative().default(0),
  testsModified: z.number().int().nonnegative().default(0),
  decisions: z.array(DecisionSchema).default([]),
  followUps: z.array(z.string()).default([]),
}).passthrough();

export type TaskStructuredOutput = z.infer<typeof TaskStructuredOutputSchema>;
```

### `types/tasks.ts` (MODIFY) — add field
```typescript
structured_output: TaskStructuredOutputSchema.optional(),
```

### `types/signals.ts` (MODIFY) — add field
```typescript
structured_output: TaskStructuredOutputSchema.optional(),
```

## Extraction Utility

### `utils/extract-structured-output.ts` (NEW)
```typescript
// NOT importable from temporal/ — tool-layer only (workflow-bundle-boundary.test.ts enforces)

export function extractStructuredOutput(text: string): TaskStructuredOutput | null {
  // 1. Regex match last <adv-output>...</adv-output>
  const regex = /<adv-output>([\s\S]*?)<\/adv-output>/g;
  let lastMatch: string | null = null;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match[1];
  }
  if (!lastMatch) return null;

  // 2. Strip markdown fences
  const stripped = lastMatch
    .replace(/^\s*```(?:json)?\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();

  if (!stripped) return null;

  // 3. Size check
  if (stripped.length > STRUCTURED_OUTPUT_MAX_BYTES) {
    // log warning
    return null;
  }

  // 4. JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // log warning
    return null;
  }

  // 5. Schema validate (passthrough)
  try {
    return TaskStructuredOutputSchema.parse(parsed);
  } catch {
    // log warning with error detail
    return null;
  }
}
```

## Integration Points

### `task.ts` — adv_task_update status='done' (~line 358)
```typescript
const combinedText = [args.implementation_summary, args.notes].filter(Boolean).join('\n');
const structuredOutput = extractStructuredOutput(combinedText);
// Add to signal payload: ...(structuredOutput && { structured_output: structuredOutput })
```

### `task.ts` — adv_task_completed (~line 631)
```typescript
const combinedText = `${args.verification}\n${args.summary}`;
const structuredOutput = extractStructuredOutput(combinedText);
// Add to signal payload: ...(structuredOutput && { structured_output: structuredOutput })
```

### `checkpoint.ts` — fireTaskCompletedFromCheckpoint (~line 365)
```typescript
const structuredOutput = extractStructuredOutput(verification);
// Add to signal payload: ...(structuredOutput && { structured_output: structuredOutput })
```

### `change-state.ts` — applyTaskCompletedToState (~line 273)
```typescript
if (payload.structured_output) {
  task.structured_output = payload.structured_output;
}
```

## Data Flow
```
Agent emits <adv-output> in implementation_summary/notes/verification/summary
    │
    ▼
Tool layer (task.ts / checkpoint.ts) calls extractStructuredOutput()
    │ → regex match last <adv-output>...</adv-output>
    │ → strip fences
    │ → JSON.parse
    │ → size check (10KB)
    │ → TaskStructuredOutputSchema.parse() (passthrough)
    │ → failure: log warning, return null
    │
    ▼ taskCompletedSignal fires with { ..., structured_output? }
    │
    ▼ applyTaskCompletedToState assigns payload.structured_output to task
    │
    ▼ task.structured_output persisted in workflow state
    │
    ▼ adv_task_show / adv_change_show expose structured_output
```

## Validation Results
- Import graph: no circular imports (types/ never imports from utils/)
- Workflow bundle: safe (extraction utility NOT reachable from temporal/)
- Signal backward compat: safe (optional field, old events → undefined → no-op)
- Regex: no ReDoS risk (lazy *? with fixed-width delimiters, O(n))
- Schema pattern: matches existing complex-object fields (ErrorRecoverySchema, CancellationSchema, etc.)

## Test Plan
- **NEW:** `extract-structured-output.test.ts` — 12 unit test cases
- **MODIFY:** `task.test.ts` — structured output in task_update done + task_completed
- **MODIFY:** `checkpoint.test.ts` — structured output in checkpoint complete mode
- **MODIFY:** `workflows.signal-handlers.test.ts` — signal handler stores structured_output
