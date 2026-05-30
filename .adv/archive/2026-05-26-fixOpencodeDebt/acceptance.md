# Acceptance

Reviewed at: 2026-05-26T02:01:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Dry-run reports stale blank assistant ghosts and stale `running`/`pending` tool parts with bounded session/message/part/tool/status/age/context samples. | pass | Focused vitest: src/utils/opencode-session-debt.test.ts + status/formatter tests passed; scanner/status expose blank ghosts and stale tool-part counts/samples. |
| AC2 | acceptance_criterion | Apply mode refuses without explicit apply and backup directory, and writes DB/WAL/SHM backups before mutation. | pass | opencode-session-debt.test.ts doctor apply fixture passed; apply without --backup-dir throws; backup_files asserted populated. |
| AC3 | acceptance_criterion | Apply repairs only classified stale orphan tool parts in place: `state.status:'error'`, schema-valid error payload, `metadata.interrupted:true`, terminal timestamp. | pass | opencode-session-debt.test.ts doctor apply fixture passed; repaired part has state.status error, metadata.interrupted true, state.time.end number. |
| AC4 | acceptance_criterion | Live/in-flight, idle-active, and plausibly task-waiting tool parts remain unchanged unless orphan evidence is strong. | pass | Post-review regression passed: task tools with active child sessions stay live/not repairable; live row remains running in doctor fixture. |
| AC5 | acceptance_criterion | Blank assistant ghost repair remains limited to classified orphan ghosts. | pass | Blank assistant classifier tests passed; getDeletableBlankAssistantIds returns only orphan_ghost rows. |
| AC6 | acceptance_criterion | Parent assistant is completed only when all child parts are terminal; partial parents remain open. | pass | Doctor apply fixture passed; complete parent finish set to error, partial parent finish remains null when live child remains running. |
| AC7 | acceptance_criterion | Status output, docs/specs, and tests cover detection, exclusions, backup requirement, mutation shape, partial parent behavior, task-tool safety, and status output. | pass | Status/formatter focused tests passed; spec JSON parse passed; docs/spec updated for rq-opencodeDebt01; lint/typecheck/format passed. |
| C1 | constraint | Never modify `~/.local/bin` directly. | respected | Git diff touches repo files only; no ~/.local/bin path edits. |
| C2 | constraint | Never mutate a real OpenCode DB without explicit apply mode and populated backup. | respected | Doctor mutation path requires --apply --backup-dir and backupDatabaseFiles before applyRepairs; tests use temp DB only. |
| C3 | constraint | Use deterministic classification over heuristic cleanup. | respected | Classification uses SQL fields, timestamps, session/child-session liveness, deterministic thresholds; no heuristic-only repair authority. |
| C4 | constraint | Preserve current blank assistant ghost repair safety boundaries. | respected | Blank assistant APIs retained; tests for existing blank assistant behavior passed. |
| C5 | constraint | Keep repaired tool-part payloads compatible with OpenCode tool-state schema. | respected | Repair writes runtime MessageV2 ToolPart-compatible state: status error, error string, metadata, time start/end; no arbitrary state.interrupted. |
| C6 | constraint | Runtime watchdog implementation inside OpenCode is out of scope. | respected | No OpenCode runtime watchdog implementation added; changes are ADV doctor/status/spec only. |
| DONT1 | avoidance | No blind SQL deletes. | respected | Reviewer APPROVED after remediation; SQL deletes remain limited to validated blank assistant ids and tool parts use UPDATE. |
| DONT2 | avoidance | No force-killing active OpenCode sessions. | respected | No process/session kill behavior implemented. |
| DONT3 | avoidance | No broad DB vacuum/compaction. | respected | No vacuum/compaction behavior added; WAL checkpoint + DB/WAL/SHM copy only. |
| DONT4 | avoidance | No cascade-delete repair for tool parts in this change. | respected | Tool-part repair uses UPDATE part; no parent cascade-delete for tool repair. |
| DONT5 | avoidance | No arbitrary non-schema fields inside OpenCode `state` payloads. | respected | Repair marker is state.metadata.interrupted, not arbitrary top-level state.interrupted. |

