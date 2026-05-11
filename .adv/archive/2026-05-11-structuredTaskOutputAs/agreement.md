# Agreement

## Objectives
1. Add typed `structured_output` field to `TaskSchema` for storing parsed task completion facts
2. Create extraction utility that scans `<adv-output>` tags from task completion text
3. Wire extraction into `adv_task_update` and `adv_task_checkpoint` — non-blocking
4. Extend `taskCompletedSignal` payload to carry structured output atomically
5. Define Zod schema for structured output shape with safe defaults

## Acceptance Criteria
1. `TaskSchema` has optional `structured_output` field accepting parsed objects (new top-level field, not in metadata)
2. `TaskStructuredOutputSchema` validates known fields (`filesChanged`, `testsAdded`, `testsModified`, `decisions`, `followUps`) with safe defaults; passthrough allows extra fields
3. Extraction utility detects last `<adv-output>` tag, strips markdown fences, parses JSON, validates schema
4. `adv_task_update` status='done' scans `implementation_summary` + `notes` for tags, extracts if found
5. `adv_task_checkpoint` scans verification text for tags, extracts if found
6. `taskCompletedSignal` payload extended with optional `structured_output` field — storage atomic with task completion
7. Structured output exceeding 10KB rejected with warning; no storage; task completes normally
8. Extraction failure (invalid JSON, schema validation failure) non-blocking — warning logged, task completes
9. Tasks without `<adv-output>` work unchanged — zero behavioral change
10. Existing tests pass without modification

## Constraints
- Backward compatible — existing tasks/tests unchanged
- Non-blocking — extraction failure logs warning, doesn't block task completion
- Optional — agent decides whether to emit `<adv-output>`
- `metadata` is `z.record(z.string(), z.string())` — string-only, new top-level field required
- Workflow-safe — no `defineUpdate`, signal/query only
- `.passthrough()` on TaskSchema handles forward compat
- v1 scope: extraction+storage only — no consumer wiring (review/archive/reflect deferred)
- Size limit: 10KB — reject with warning if exceeded
- Agent guidance: passive — no /adv-apply command doc changes

## Avoidances
- Programmatic API surface / typed handles (closed as `programmaticApiSurface`)
- Required emission / blocking validation
- New MCP query tool for structured output (deferred until usage justifies)
- Aggregation across multiple changes
- Standard Schema interface (Zod is fine)
- Consumer updates in v1 (review, archive, reflect wiring deferred)

## Decisions

### User Decisions
- **v1 scope:** extraction+storage only — consumer wiring (review/archive/reflect) deferred to follow-up change. Reason: smaller blast radius, validate extraction works before building consumers.
- **Size policy:** reject with warning at 10KB cap. Reason: prevents storage bloat; agent sees warning and can re-emit smaller block.
- **Agent guidance:** passive — no /adv-apply doc changes. Reason: feature exists for discovery; forcing emission would add prompt cost for uncertain benefit.

### Agent Decisions (LBP)
- **Schema strictness:** Zod passthrough — accept known fields, ignore extras. Rationale: agents may emit slightly different shapes; strict rejection counterproductive for optional feature.
- **Query surface:** `adv_task_show`/`adv_change_show` expose the field; no new `adv_task_list` filter for v1. Rationale: query demand unknown until usage data exists.
- **Tag precedence:** when both `implementation_summary` and `notes` contain `<adv-output>`, take last occurrence across concatenated text. Consistent with Sandcastle convention.
- **Storage location:** new top-level `structured_output` field on TaskSchema, not in metadata. Rationale: `metadata` is `z.record(z.string(), z.string())` — cannot store parsed objects.
- **Signal integration:** extend `taskCompletedSignal` payload with optional `structured_output` field. Rationale: atomic storage with task completion; no post-signal mutation needed.

## Deferred Questions
- None — all design questions resolved.

## Sign-Off
AC approved by user at discovery Phase 4.5.1.
