# Design

## Architecture Overview

Extend the existing OpenCode session-debt module from a single debt class (blank assistant ghosts) into a typed multi-class scanner:

1. Keep blank-assistant detection and deletion behavior intact.
2. Add stale tool-part detection beside it, using read-only SQL over `part`, `message`, and `session`.
3. Classify non-terminal tool parts into live/in-flight, idle-active, task-waiting, and orphan-repairable buckets.
4. Extend the doctor apply path to repair tool parts in place after backup, while still deleting only classified blank assistant ghosts.
5. Extend status formatter/recommendations and `rq-opencodeDebt01` specs with additive fields.

No runtime OpenCode watchdog, process kill, provider-message normalization, or upstream OpenCode source mutation is included.

## Key Decisions

### D1 — Tool parts are repaired in place, not deleted

Repair stale orphan tool parts with an `UPDATE part SET data = ..., time_updated = ...`, not parent cascade deletion.

Rationale:
- OpenCode `PartTable` cascades only if a parent `message` is deleted; that loses timeline and sibling context.
- External OpenCode issues recommend terminal error recovery, not blind deletion.
- User approved preserving timeline.
- Updating `time_updated` keeps SQLite ordering/consumers aware of the repair.

### D2 — Repair payload targets OpenCode runtime `MessageV2.ToolPart` row shape

For current OpenCode `message-v2` rows, a repaired tool part becomes terminal with:
- `state.status: "error"`
- preserved `state.input`
- `state.error: "Interrupted"` or equivalent plain string
- `state.metadata.interrupted: true` merged with existing metadata
- `state.time.start` preserved or synthesized from existing row/tool timestamps
- `state.time.end = nowMs`

Do not add arbitrary fields under `state`. Preserve top-level part fields such as `type`, `tool`, `callID`, and existing top-level `metadata`.

Rationale:
- The doctor targets the runtime SQLite `MessageV2.ToolPart` row shape stored in `opencode.db`, not the narrower public `@opencode-ai/core/session-message` typed export.
- OpenCode runtime recovery uses `metadata.interrupted === true` as the orphaned-interrupted sentinel and writes terminal error states with `error` string and `time: { start, end }`.
- Current local DB examples use `tool`, `callID`, `state`, and state-local `time.start`; implementation must preserve existing shape and add compatible fields.

### D3 — Classification is deterministic and conservative

Tool-part repairability requires all of:
- `part.data.type = 'tool'`
- `state.status IN ('running','pending')`
- age at or above stale threshold using tool time fields when available (`state.time.start`, `time.ran`, `time.start`, `time.created`, then row timestamps)
- parent/session liveness proves orphaned or stale beyond threshold
- for `tool = 'task'`, child session evidence is absent or stale enough to prove no active child wait

Rationale:
- Agreement requires deterministic classification over heuristic cleanup.
- OpenCode watchdog proposals call out leaf-level filtering so task tools waiting on child sessions are not force-failed.

### D4 — Parent assistant completion is conditional

After repairing tool parts for a parent message:
- If every child part is terminal or non-tool structural/text, update parent assistant completion/finish with explicit interrupted/aborted semantics.
- If any child part remains `pending`/`running`, leave parent assistant unchanged.

Rationale:
- Prevents UI/session from remaining stuck once all children are repaired.
- Avoids falsely completing partial parents.

### D5 — Status output remains compact and additive

`adv_status` should add stale tool-part counts/recommendation while preserving existing blank assistant fields. Formatter output stays bounded: counts plus sample counts, not full row dumps.

Rationale:
- Existing status consumers rely on current fields.
- User approved bounded samples for first implementation target.

### D6 — Write connections use SQLite busy timeout

Doctor write connections set `PRAGMA busy_timeout = 5000` before mutations.

Rationale:
- OpenCode uses SQLite WAL and busy-timeout style connection pragmas.
- A doctor running near live OpenCode writes should wait briefly rather than fail immediately with `SQLITE_BUSY`.

### D7 — Backup remains DB/WAL/SHM copy for this change

Keep the agreement-required backup behavior: copy DB, WAL, and SHM sidecars before mutation. Do not switch to `VACUUM INTO` in this change.

Rationale:
- Agreement explicitly requires DB/WAL/SHM backups.
- `VACUUM INTO` may be a stronger future backup primitive, but changing backup artifact shape would require renegotiating AC2.

## ADR Drafts

None. Decisions are important but local to an existing utility and reversible through the spec/test-backed implementation.

## Implementation Strategy

### 1. Extend types and classifier in `plugin/src/utils/opencode-session-debt.ts`

Add interfaces:
- `ToolPartRow`
- `ClassifiedToolPartRow`
- `ToolPartLiveness = 'live_in_flight' | 'idle_active_session' | 'task_waiting' | 'orphan_tool_part' | 'unknown'`
- `OpenCodeToolPartDebtClassification`

Add SQL:
- `TOOL_PART_ROWS_SQL`: selects non-terminal tool parts with part/message/session timestamps, tool name, call ID, status, parent finish/completion, state time fields, and task child session IDs from JSON if present.
- Optional child-session activity query for task child liveness.

Add pure helpers:
- `normalizeToolPartRow`
- `classifyToolPartRows`
- `getRepairableToolPartIds`
- `createToolPartLivenessResolver`
- `isToolPartTerminal(status)`
- `getToolPartAgeBaseMs(row)`

Scanner output remains backward-compatible by keeping current blank-assistant fields and adding tool-part fields.

### 2. Extend doctor CLI in `scripts/opencode-session-doctor.ts`

Dry-run:
- Load blank assistant rows and tool part rows read-only.
- Print existing blank classifications plus new tool-part classifications.
- Include bounded samples for repairable stale tool parts.

Apply:
- Keep current `--apply --backup-dir` guard.
- Backup DB/WAL/SHM before any mutation.
- Set `PRAGMA busy_timeout = 5000` on write connections.
- Delete only `getDeletableBlankAssistantIds` rows.
- Update only `getRepairableToolPartIds` rows in place.
- Re-check/update parent message only after child terminal-state check.
- Output mutation counts separately: `deleted_blank_assistant_messages`, `repaired_tool_parts`, `completed_parent_messages`.

### 3. Extend status output

In `plugin/src/tools/status.ts`:
- Recommend doctor when blank ghosts or repairable stale tool parts exist.
- Pass additive `staleToolPartCount`, `repairableToolPartCount`, and `liveToolPartCount` style fields to formatter.

In `plugin/src/utils/tool-formatters.ts`:
- Render compact section, e.g. `10 orphan ghost blank assistant row(s), 4 stale tool part(s), 1 live/in-flight`.
- Keep unavailable/unchecked paths unchanged.

### 4. Update spec law

Extend `docs/specs/advance-meta.md` and `.adv/specs/advance-meta/spec.json` under `rq-opencodeDebt01` with scenarios:
- stale tool-part read-only detection
- live/task-waiting exclusion
- backup-gated schema-valid repair
- partial parent safety

This spec amendment is mandatory in execution, not optional cleanup.

### 5. Tests

Add/extend tests for:
- stale `running` and `pending` tool parts classified as repairable only with orphan/stale evidence
- live/in-flight exclusion
- task tool with active child session excluded
- malformed rows ignored/degraded safely
- dry-run includes tool-part classifications
- apply refuses without backup
- write connection sets busy timeout
- apply updates only classified rows and bumps `part.time_updated`
- repaired JSON preserves context and uses schema-compatible terminal error shape
- partial parent remains open
- all-terminal parent is completed with interrupted/aborted semantics
- status formatter and recommendations include stale tool-part debt

## LBP Analysis

Best long-term approach is structural repair of persisted state, not ad-hoc SQL deletion. It aligns with OpenCode-specific research:
- startup recovery proposals mark orphaned non-terminal tools as errored
- runtime watchdog proposals call for leaf-level/task filtering
- provider integrity issues show interrupted tools need terminal error/synthetic result semantics
- downstream recovery filters only `pending`/`running` tool parts and avoids resuming unfinished turns

This design keeps ADV as an out-of-process doctor utility while respecting OpenCode's data model.

## Affected Components

- `plugin/src/utils/opencode-session-debt.ts`
- `plugin/src/utils/opencode-session-debt.test.ts`
- `scripts/opencode-session-doctor.ts`
- `plugin/src/tools/status.ts`
- `plugin/src/tools/status.test.ts`
- `plugin/src/utils/tool-formatters.ts`
- `plugin/src/utils/tool-formatters.test.ts`
- `docs/specs/advance-meta.md`
- `.adv/specs/advance-meta/spec.json`

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Repairing active tool part | Threshold + session/message liveness + task child liveness tests |
| Breaking OpenCode deserialization | Preserve row shape; only write message-v2 runtime row-compatible terminal state; test mutation shape |
| Parent assistant falsely completed | Re-query all child parts; update parent only if all terminal |
| Status output too noisy | Counts + bounded samples only |
| Existing blank assistant behavior regresses | Keep current APIs/fields and add regression tests |
| Real DB mutation during tests | Use temp SQLite fixtures only |
| Concurrent OpenCode DB writer | Backup before write + `PRAGMA busy_timeout = 5000` |

## Design Leverage Scout

Candidates considered: 5.

Auto-adopted:
- Lock runtime row `state.error` as string.
- Require `state.time.start`/`state.time.end` for terminal error rows.
- Set `PRAGMA busy_timeout = 5000` on doctor write connections.
- Bump `part.time_updated` when repairing rows.

Surfaced/deferred:
- `VACUUM INTO` backup was not adopted because AC2 requires DB/WAL/SHM backups. Keep as future improvement only if agreement is amended.

## Validator Result

Validator: VALIDATED with cautions.

Findings:
- Correctness: repair shape matches OpenCode runtime interrupted ToolPart writes; in-place update and conditional parent completion are sound.
- Simplicity: design is a minimum-surface extension of the existing pure classifier/doctor path.
- Spec-law caution: `rq-opencodeDebt01` currently scopes blank assistant rows only; spec amendment must ship in this change.
- Alternative review: cascade-delete and `VACUUM INTO` backup were evaluated and correctly deferred/rejected for current agreement.
- Correctness caution resolved in this revision: D2 now explicitly targets runtime `MessageV2.ToolPart` SQLite row shape, not the narrower public typed export.

Recommendation: proceed to planning.