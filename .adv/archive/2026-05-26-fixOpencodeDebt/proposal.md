## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |
| Source change | fixOpencodeHangs |

# Fix opencode debt

## Problem
OpenCode sessions can become unrecoverable when crashed or interrupted tool executions leave SQLite `part` rows stuck in `running` or `pending` states. Existing Advance doctor tooling only classifies zero-part blank assistant ghosts, so stale tool parts remain invisible and unrepairable.

## Why
Advance's OpenCode session doctor currently repairs blank assistant ghosts but cannot detect or repair stale `running`/`pending` tool parts, leaving frequent OpenCode hangs unrecoverable without ad-hoc SQL.

## What Changes
- Extend OpenCode session debt detection to classify stale tool parts.
- Extend the session doctor dry-run/apply path with backup-gated repair for classified stale orphan tool parts.
- Extend `adv_status` output, docs, specs, and tests for the broader session-debt model.
- Preserve existing blank assistant ghost behavior while adding tool-part repair as a separate classified debt type.

## Scope

### In Scope
- Read-only detection of stale blank assistant ghosts and stale `running`/`pending` tool parts.
- Dry-run reporting with bounded samples containing session, tool, parent, status, age, and context details.
- Explicit apply mode guarded by populated backup directory before any database mutation.
- In-place repair of classified stale orphan tool parts by marking them terminal `error` with interrupted metadata and terminal timestamp.
- Parent assistant completion only when all child parts are terminal; partial parents remain open.
- Status formatting, recommendations, documentation, spec deltas, and tests.

### Out of Scope
- Direct mutation of real OpenCode DB outside explicit apply mode.
- Force-killing active OpenCode sessions or processes.
- Broad SQLite maintenance such as vacuum, compaction, schema migration, or blind deletes.
- Upstream OpenCode source mutation.
- Direct edits to `~/.local/bin` artifacts.
- Runtime watchdog implementation inside OpenCode.
- Provider-pipeline message normalization fixes outside ADV doctor repair.

### Must Not
- Must not delete tool parts blindly.
- Must not mark live/in-flight tool parts terminal.
- Must not mutate without writing a backup first.
- Must not complete a parent assistant while any child part remains non-terminal.
- Must not add non-schema fields to OpenCode `state` payloads.
- Must not rely on heuristic cleanup as the authority for repairability; classification must be deterministic and evidence-backed.

## Success Criteria
1. Dry-run reports stale blank assistant ghosts and stale `running`/`pending` tool parts with bounded session/message/part/tool/status/age/context samples.
2. Apply mode refuses without explicit apply and backup directory, and writes DB/WAL/SHM backups before mutation.
3. Apply repairs only classified stale orphan tool parts in place: `state.status:'error'`, schema-valid error payload, `metadata.interrupted:true`, terminal timestamp.
4. Live/in-flight and idle-active tool parts remain unchanged.
5. Blank assistant ghost repair remains limited to classified orphan ghosts.
6. Parent assistant is completed only when all child parts are terminal; partial parents remain open.
7. Status output, docs/specs, and tests cover detection, exclusions, backup requirement, mutation shape, and partial parent behavior.

## Affected Code
- `plugin/src/utils/opencode-session-debt.ts` — classification and scan model.
- `scripts/opencode-session-doctor.ts` — dry-run/apply repair CLI.
- `plugin/src/tools/status.ts` and `plugin/src/utils/tool-formatters.ts` — status payload and output.
- `plugin/src/tools/status.test.ts`, `plugin/src/utils/opencode-session-debt.test.ts`, `plugin/src/utils/tool-formatters.test.ts` — coverage.
- `docs/specs/advance-meta.md` / `.adv/specs/advance-meta/spec.json` — spec law.

## Related Repositories
- Current repo only: `advance`.
- Source context: toolbox change `fixOpencodeHangs` identified the user-facing hang/recovery pain.

## Constraints
- Never modify `~/.local/bin` directly.
- Never mutate a real OpenCode DB without explicit apply mode and backup.
- Deterministic classification over heuristic cleanup.
- Preserve current ghost-row repair safety boundaries.
- Keep repair payload compatible with OpenCode tool-state schema.

## Impact
- Operators get visible stale tool-part diagnostics in `adv_status` and doctor dry-run.
- Repair flow becomes safer and repeatable instead of ad-hoc SQL.
- Active OpenCode work remains protected by stale threshold and liveness classification.

## Context
Current implementation detects assistant messages with `finish = null` and zero parts, then classifies them as live, idle active-session, or orphan ghost. Tool parts stuck in non-terminal states are not modeled, displayed, or repairable. This leaves a recovery gap for interrupted tool executions.

## Discovery Findings

### Current State
- `plugin/src/utils/opencode-session-debt.ts` models blank assistant rows only.
- `scripts/opencode-session-doctor.ts` dry-runs by default, requires `--apply --backup-dir`, backs up DB/WAL/SHM, then deletes classified blank assistant messages.
- `plugin/src/tools/status.ts` recommends the doctor only when `orphan_ghost` blank rows exist.
- Real dry-run on `/home/jon/.local/share/opencode/opencode.db` reported 88 total blank assistant rows and 10 orphan ghost samples.
- Real read-only DB inspection showed `part` rows with JSON `type:'tool'`, `state.status:'running'|'pending'`, `tool`, `callID`, and stale candidates older than threshold.

### External OpenCode Research Findings
- `anomalyco/opencode#19023` describes the exact backend root cause: server restart/crash leaves assistant messages incomplete and tool parts permanently `running`; proposed recovery sets non-terminal tools to `error` and completes orphaned assistant messages.
- `anomalyco/opencode#20099` recommends a runtime watchdog, configurable tool/task/idle timeouts, and leaf-level filtering so task tools waiting on child sessions are not force-failed prematurely.
- `anomalyco/opencode#21326` and `#16749` highlight message-history integrity: interrupted tools must produce synthetic error results / terminal error states, and pending `tool-error` races can leave corrupt `pending` parts.
- `anomalyco/opencode#17680` notes backend recovery should persist an explicit aborted error for interrupted assistant messages, not merely mark completion with empty error.
- OpenCode schema evidence: `ToolState` is `pending|running|completed|error`; `ToolStateError` has `status`, `input`, `content`, `structured`, `error`; `AssistantTool.time` has `created`, `ran`, `completed`, `pruned`; `PartTable` cascades only if parent message is deleted.
- Downstream `oh-my-openagent#4106` recovered interrupted idle tool turns by filtering only `pending`/`running` tool parts, using valid call IDs, injecting synthetic error tool results, and blocking prompts/forks into unfinished turns.

### Adopted Research Implications
- Keep in-place update as default repair; do not cascade-delete parent messages.
- Add leaf-level/task-tool safety to classification: task tools waiting on child sessions need stricter non-repairable classification unless orphan evidence is strong.
- Repair payload must be schema-valid: no arbitrary top-level `state.interrupted`; interruption marker belongs in metadata or error payload.
- Complete parent assistant only with explicit aborted/interrupted error semantics when all child parts are terminal.
- Prefer bounded samples for ADV status/doctor now; defer full runtime watchdog and provider message-normalization fixes.

### Edge Cases
- Live current tool call: non-terminal but session recently updated; classify as live/in-flight, never repair.
- Stale active session: non-terminal part older than threshold but parent session activity remains recent enough; classify non-repairable.
- Task/subagent leaf safety: do not force-error task tools that may be waiting on child sessions unless orphan evidence proves they cannot complete.
- Missing session row: likely orphan; repairable only after age threshold and parent/message checks.
- Partial parent: one stale non-terminal tool part plus completed sibling parts; update only stale part and complete parent only when all children terminal.
- Backup failure: apply exits before mutation when no DB/WAL/SHM backup file is copied.
- Schema drift: repaired JSON must conform to OpenCode `ToolStateError` shape.

### Open Design Questions
1. Leaf-level task-tool classification details.
   - Trust model: agent-resolved from OpenCode/downstream evidence.
   - Blast radius: premature repair could break legitimately waiting task/subagent sessions.
   - Alternatives: stricter task exclusion by default (recommended) or generic repair for all tools.
2. Parent assistant repair shape.
   - Trust model: agent-resolved with schema validation.
   - Blast radius: incomplete parent could keep UI stuck; invalid error shape could break OpenCode deserialization.
   - Alternatives: set completion plus aborted/interrupted error only when all children terminal (recommended) or leave parent untouched always.
3. Runtime watchdog.
   - Trust model: out of scope for ADV doctor.
   - Blast radius: active cancellation policy and process control; not appropriate for this repair utility.
   - Alternatives: agenda/follow-up after doctor repair.

### Draft Spec Deltas
- `rq-opencodeDebt01.5` Tool-part debt reported read-only.
  - Given: OpenCode DB contains tool parts with `state.status` `running` or `pending` older than threshold.
  - When: `adv_status` or doctor dry-run runs.
  - Then: output reports bounded stale tool-part samples with session/message/part/tool/status/age details and mutates nothing.
- `rq-opencodeDebt01.6` Live and task-waiting tool parts excluded.
  - Given: non-terminal tool parts belong to sessions with recent activity or task tools plausibly waiting on child sessions.
  - When: classification runs.
  - Then: rows classify as live/in-flight or idle-active, not repairable, unless orphan evidence is strong.
- `rq-opencodeDebt01.7` Tool-part repair is backup-gated and schema-valid.
  - Given: repairable orphan tool parts exist.
  - When: apply mode runs with backup dir.
  - Then: DB/WAL/SHM backups are written before mutation, repair updates part JSON to terminal `error` with interrupted metadata/error payload and completion timestamp, and does not blindly delete parts.
- `rq-opencodeDebt01.8` Parent completion is safe.
  - Given: parent assistant has child parts.
  - When: tool-part repair runs.
  - Then: parent assistant is completed with explicit interrupted/aborted semantics only if all child parts are terminal; partial parents remain open.

### Related Pattern Scan
- Direct pattern: blank assistant debt classifier, liveness resolver, backup-gated doctor apply.
- Similar status debt surfacing: `adv_status` recommendations and formatter sections.
- Upstream/downstream recovery patterns consistently prefer terminal error/synthetic result over blind deletion.

### LBP Check
Recommended direction matches OpenCode-specific best practice: deterministic read-only classification plus schema-valid in-place repair. External issues reinforce startup recovery, terminal error conversion for non-terminal tool parts, leaf-level task filtering, and explicit interrupted/aborted semantics.

### Discovery Opportunity Scout
- Auto-adopt: parent-message + session liveness join for tool parts.
- Auto-adopt: leaf-level task-tool caution from OpenCode watchdog proposal.
- Design-around: place `interrupted:true` in metadata/error payload, not arbitrary state fields.
- Design-around: derive age from tool-part time fields when present, with row timestamps as fallback.
- Follow-up: runtime watchdog and dry-run aggregation.

### AMBIGUITY ANALYSIS
Coverage: B:C F:C S:C M:C
- No blocking ambiguity findings after external research. Leaf-level task-tool caution is now an explicit design constraint.

### Recommended Objectives
1. Extend `rq-opencodeDebt01` and implementation model from blank assistant debt to blank assistant + stale tool-part debt.
2. Preserve existing blank assistant deletion behavior while adding schema-valid in-place repair for tool parts.
3. Require explicit apply mode and populated backup for all destructive or mutating repair paths.
4. Exclude live/in-flight, idle-active, and plausibly task-waiting rows through deterministic session/message liveness classification.
5. Complete parent assistant only when all child parts are terminal and with explicit interrupted/aborted semantics.
6. Add tests for detection, exclusions, backup refusal, schema-valid mutation, partial parent behavior, task-tool safety, and status output.
