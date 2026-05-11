# Structured Task Output as Queryable Metadata

## Motivation

Agent task completion captures useful facts as prose, then loses the structure. `/adv-review`, `/adv-archive`, and `/adv-reflect` then have to re-parse the prose with an LLM to extract what was already known at task-completion time.

Borrowed from Sandcastle's `Output.object({ tag, schema })` pattern, but reframed for ADV's actual consumer: the next phase of the same change.

## The Core Idea

When the agent completes a task, alongside the prose `implementation_summary`, it MAY emit a tagged JSON block:

```
<adv-output>
{
  "filesChanged": [
    { "path": "plugin/src/tools/task.ts", "linesAdded": 24, "linesRemoved": 8 }
  ],
  "testsAdded": 3,
  "decisions": [
    { "decision": "Use task.metadata.structured_output field", "why": "minimal schema change" }
  ],
  "followUps": []
}
</adv-output>
```

`adv_task_update` (or `adv_task_checkpoint`) scans `implementation_summary` for the last `<adv-output>...</adv-output>`, validates against a configured schema, and stores the parsed result in `task.structured_output`.

## What's In Scope

### 1. Schema Definition

A Zod schema in `plugin/src/types/task-output.ts` defining the shape ADV expects. Starts narrow:

```typescript
TaskStructuredOutputSchema = z.object({
  filesChanged: z.array(z.object({
    path: z.string(),
    linesAdded: z.number().int().nonnegative().optional(),
    linesRemoved: z.number().int().nonnegative().optional(),
  })).default([]),
  testsAdded: z.number().int().nonnegative().default(0),
  testsModified: z.number().int().nonnegative().default(0),
  decisions: z.array(z.object({
    decision: z.string(),
    why: z.string(),
  })).default([]),
  followUps: z.array(z.string()).default([]),
})
```

All fields optional with defaults — agent emits what it knows.

### 2. Extraction Logic

`plugin/src/utils/extract-structured-output.ts`:
- Scan input string for last occurrence of `<adv-output>...</adv-output>`
- Strip optional markdown fences (` ```json ` etc.)
- JSON-parse
- Validate against `TaskStructuredOutputSchema`
- On failure: throw `StructuredOutputError` with `taskId`, `rawMatched`, `cause`

### 3. Storage

Extend `TaskSchema` in `plugin/src/types/tasks.ts` with optional `structured_output` field. Stored as parsed object, not string.

**Note:** `TaskSchema.metadata` is `z.record(z.string(), z.string())` — string-only values. Cannot use metadata for parsed objects. New top-level field required.

### 4. Integration Points

- `adv_task_update` with `status: 'done'` — scan `implementation_summary` and `notes` for `<adv-output>`. Extract if present, store on task. Non-blocking — extraction failure logs warning, task still marked done. Tasks without `<adv-output>` work unchanged.
- `adv_task_checkpoint` — same scan, applied to verification text.
- `taskCompletedSignal` — extend payload with optional `structured_output` field so storage is atomic with task completion.

### 5. Consumer Updates (v1 scope TBD)

- `/adv-review` — aggregate `structured_output` across tasks before LLM review. Use facts where possible, prose where structured data is missing.
- `/adv-archive` — include structured aggregates in archive bundle.
- `/adv-reflect` — use structured data for efficiency/quality dimensions instead of inferring from prose.

## What's Explicitly Out of Scope

- Programmatic API surface (typed returns, handles, advRun) — closed as `programmaticApiSurface`
- Standard Schema interface — internal-only, Zod is fine
- Required structured output — emission is optional; missing block is normal
- Querying structured output via new MCP tool — comes later if/when usage justifies it
- Aggregating across multiple changes — task-level only

## Architecture

```
plugin/src/
  types/
    task-output.ts          # TaskStructuredOutputSchema (new)
    tasks.ts                # add task.structured_output field (modified)
    signals.ts              # extend TaskCompletedSignalPayloadSchema (modified)
  utils/
    extract-structured-output.ts  # tag scan, parse, validate (new)
  tools/
    task.ts                 # adv_task_update extraction hook (modified)
    checkpoint.ts           # adv_task_checkpoint extraction hook (modified)
  temporal/
    change-state.ts         # handle structured_output in taskCompletedSignal handler (modified)
```

## Constraints

- Optional emission — most tasks won't bother, that's fine
- Backward compatible — existing tasks and existing tests unchanged
- Non-blocking extraction — failure logs warning, doesn't block task completion
- Recovery context on extraction errors
- `TaskSchema.passthrough()` provides forward compat for existing tasks

## Failure Modes

| Scenario | Behavior |
|---|---|
| No `<adv-output>` in task summary | Skip extraction, no metadata stored, task completes normally |
| `<adv-output>` with invalid JSON | Log warning, no metadata stored, task completes normally |
| `<adv-output>` JSON fails schema validation | Log warning with error detail, no metadata stored, task completes normally |
| Multiple `<adv-output>` blocks | Take last occurrence (matches Sandcastle convention) |
| `<adv-output>` block inside code fence | Detect and unwrap fence before parsing |

## Discovery Findings

### Current State Analysis
- `TaskSchema.metadata` is `z.record(z.string(), z.string())` — string-only, cannot store parsed objects
- `taskCompletedSignal` payload has `{taskId, verification, summary, filesTouched, checkpointSha, completedAt}` — no structured output
- Archive reads `implementation_summary` as prose line (`archive.ts:652-653`)
- No tag-extraction patterns exist in codebase — greenfield
- `parseToolOutput<T>()` exists internally in 2 spots — proves typed parsing need
- Related: `docs/change-contract-traceability-prep.md` (contract spine) — complementary but distinct scope

### Related Pattern Scan
- `parseToolOutput<T>()` in `src/index.ts:33`, `__tests__/setup.ts:255` — same class of extraction
- `taskCompletedSignal.verification` — analogous opaque string pattern
- `task.metadata.tdd_intent` — similar agent-driven metadata, but string-only

### Edge Cases (8 identified)
EC1: tag in code comments (last-occurrence mitigates)
EC2: truncated summary cutting tag (not a risk — truncation is tool-output level)
EC3: multiple tags (take last)
EC4: fences inside tag content (strip before parse)
EC5: invalid JSON (warn, skip)
EC6: valid JSON fails schema (warn, skip)
EC7: very large output (needs size policy)
EC8: tag in notes but not implementation_summary (scan both)

## Out of Scope

- Programmatic / library API surface
- Standalone execution outside OpenCode
- Reusable handles
- New MCP tools for querying structured output
- Aggregation across multiple changes
- Required emission / blocking validation
