# Archive: Add 6-gate quality checklist and incremental sync optimization

**Change ID:** add-6-gate-qual-RS08
**Archived:** 2026-01-30T00:15:17.672Z
**Created:** 2026-01-29T21:03:17.297Z

## Tasks Completed

- ✅ Add GatesSchema, GateId, and GateStatus types to types.ts
- ✅ Add gates property to ChangeSchema in types.ts
- ✅ Add gates property to AgendaItemSchema in types.ts
- ✅ Update change.schema.json with gates property
- ✅ Add sync_files table to SQLite schema (TDD: includes mtime_ms, size, inode columns for triple-attribute sync)
- ✅ Add sqlite.sync.needsSync(path) and markSynced(path) methods (TDD: uses triple-attribute comparison mtime+size+inode)
- ✅ Update store.sync() to use incremental triple-attribute sync (TDD: skip unchanged files, verify performance)
- ✅ Add gate helper methods to store (TDD: getGates, completeGate with sequence enforcement, migrateGates for legacy status)
- ✅ Implement adv_gate_status tool (TDD: returns gate state with status/timestamps for change or agenda item)
- ✅ Implement adv_gate_complete tool (TDD: marks gate done with sequence enforcement, returns error if prior gate incomplete)
- ✅ Add gate enforcement to adv_change_archive (TDD: block if any gate incomplete, list missing gates in error)
- ✅ Add gate enforcement to adv_agenda_complete (TDD: block if any gate incomplete, list missing gates in error)
- ✅ Update /adv-research command to mark research gate on success (call adv_gate_complete)
- ✅ Update /adv-prep command to mark prep gate on success (call adv_gate_complete)
- ✅ Update /adv-apply to mark implementation gate (with cancellation approval flow via question tool)
- ✅ Update /adv-ralph to mark implementation gate (with cancellation approval flow via question tool)
- ✅ Update /adv-review command to mark review gate on success (call adv_gate_complete)
- ✅ Update /adv-harden command to mark harden gate on success (call adv_gate_complete)
- ✅ Update /adv-archive to require signoff gate via question tool (prompt user confirmation, then mark signoff gate)
- ✅ Update /adv-quick to handle all 6 gates with lightweight execution (fast research via Context7, quick prep scan, expedited review/harden)
- ✅ Add migration logic for existing changes (TDD: set gates to 'legacy' status except signoff which stays 'pending')
- ✅ Update ADV_INSTRUCTIONS.md with gate workflow documentation
- ⏭️ Add tests for gate enforcement logic (sequence, blocking)
- ⏭️ Add tests for incremental sync logic (mtime comparison)
- ✅ Add auto-completion logic to /adv-apply: if research gate missing, auto-execute Context7 lookup (query libs from affected files, resolve-library-id then query-docs)
- ✅ Add auto-completion logic to /adv-apply: if prep gate missing, auto-execute quick prep (scan affected files for conflicts, check cross-cutting concerns)
- ✅ Add gate prerequisite checks to /adv-review (block if implementation gate incomplete, show clear error message)
- ✅ Add gate prerequisite checks to /adv-harden (block if review gate incomplete, show clear error message)
- ⏭️ Add inode column to sync_files table schema
- ⏭️ Add size column to sync_files table schema
- ✅ Add structured logging for gate state changes (log gate transitions with changeId, gateId, old/new status, timestamp)
- ✅ Add error handling for gate completion failures (TDD: rollback on partial failure, clear error messages)
- ⏭️ Update agenda.schema.json with gates property (parallel to change.schema.json update)
- ✅ Update /adv-ralph to auto-complete missing research/prep gates (same as /adv-apply)
- ✅ Add user notification in /adv-apply acceptance prompt about auto-completing missing gates
- ✅ Add user notification in /adv-ralph acceptance prompt about auto-completing missing gates

## Specs Modified

