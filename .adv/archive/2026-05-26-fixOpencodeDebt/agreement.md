# Agreement

## Objectives
1. Extend session debt classification from blank assistant ghosts to stale OpenCode tool parts.
2. Add backup-gated doctor repair for classified stale orphan tool parts.
3. Update status output, docs, specs, and tests for the broader session-debt model.
4. Preserve operator safety: no live/in-flight repair, no blind deletes, no mutation without backup.

## Acceptance Criteria
- AC1: Dry-run reports stale blank assistant ghosts and stale `running`/`pending` tool parts with bounded session/message/part/tool/status/age/context samples.
- AC2: Apply mode refuses without explicit apply and backup directory, and writes DB/WAL/SHM backups before mutation.
- AC3: Apply repairs only classified stale orphan tool parts in place: `state.status:'error'`, schema-valid error payload, `metadata.interrupted:true`, terminal timestamp.
- AC4: Live/in-flight, idle-active, and plausibly task-waiting tool parts remain unchanged unless orphan evidence is strong.
- AC5: Blank assistant ghost repair remains limited to classified orphan ghosts.
- AC6: Parent assistant is completed only when all child parts are terminal; partial parents remain open.
- AC7: Status output, docs/specs, and tests cover detection, exclusions, backup requirement, mutation shape, partial parent behavior, task-tool safety, and status output.

## Constraints
- Never modify `~/.local/bin` directly.
- Never mutate a real OpenCode DB without explicit apply mode and populated backup.
- Use deterministic classification over heuristic cleanup.
- Preserve current blank assistant ghost repair safety boundaries.
- Keep repaired tool-part payloads compatible with OpenCode tool-state schema.
- Runtime watchdog implementation inside OpenCode is out of scope.

## Avoidances
- No blind SQL deletes.
- No force-killing active OpenCode sessions.
- No broad DB vacuum/compaction.
- No cascade-delete repair for tool parts in this change.
- No arbitrary non-schema fields inside OpenCode `state` payloads.

## Preview Applicability
visual_surface: false

Rationale: change affects CLI/status/doctor output and local SQLite repair behavior, not front-end or browser-visible UI.

## Decisions

### User Decisions
- Lineage confirmed: toolbox change `fixOpencodeHangs` is valid origin context.
- Repair default approved: update stale tool parts in place; preserve timeline; do not cascade-delete parent messages.
- Dry-run detail approved: bounded samples for first implementation target.
- Online research requested and incorporated before AC approval.

### Agent Decisions (LBP)
- Repair non-terminal tool parts by schema-valid terminal `error` state, not deletion.
- Store interruption marker outside the `state` schema payload, e.g. metadata/error payload, while preserving schema validity.
- Use session/message liveness and tool-part age to distinguish live/in-flight, idle-active, and orphan repairable rows.
- Treat task/subagent tool rows conservatively unless strong orphan evidence exists.

## Deferred Questions
None.

## Sign-Off
User approved acceptance criteria via chat reply: `yes`.