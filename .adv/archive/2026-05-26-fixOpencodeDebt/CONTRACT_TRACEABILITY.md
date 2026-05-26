# Contract Traceability

**Change ID:** fixOpencodeDebt
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T02:01:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Focused vitest: src/utils/opencode-session-debt.test.ts + status/formatter tests passed; scanner/status expose blank ghosts and stale tool-part counts/samples. |
| AC2 | acceptance_criterion | pass | test | opencode-session-debt.test.ts doctor apply fixture passed; apply without --backup-dir throws; backup_files asserted populated. |
| AC3 | acceptance_criterion | pass | test | opencode-session-debt.test.ts doctor apply fixture passed; repaired part has state.status error, metadata.interrupted true, state.time.end number. |
| AC4 | acceptance_criterion | pass | test | Post-review regression passed: task tools with active child sessions stay live/not repairable; live row remains running in doctor fixture. |
| AC5 | acceptance_criterion | pass | test | Blank assistant classifier tests passed; getDeletableBlankAssistantIds returns only orphan_ghost rows. |
| AC6 | acceptance_criterion | pass | test | Doctor apply fixture passed; complete parent finish set to error, partial parent finish remains null when live child remains running. |
| AC7 | acceptance_criterion | pass | test | Status/formatter focused tests passed; spec JSON parse passed; docs/spec updated for rq-opencodeDebt01; lint/typecheck/format passed. |
| C1 | constraint | respected | static_check | Git diff touches repo files only; no ~/.local/bin path edits. |
| C2 | constraint | respected | static_check | Doctor mutation path requires --apply --backup-dir and backupDatabaseFiles before applyRepairs; tests use temp DB only. |
| C3 | constraint | respected | static_check | Classification uses SQL fields, timestamps, session/child-session liveness, deterministic thresholds; no heuristic-only repair authority. |
| C4 | constraint | respected | static_check | Blank assistant APIs retained; tests for existing blank assistant behavior passed. |
| C5 | constraint | respected | static_check | Repair writes runtime MessageV2 ToolPart-compatible state: status error, error string, metadata, time start/end; no arbitrary state.interrupted. |
| C6 | constraint | respected | static_check | No OpenCode runtime watchdog implementation added; changes are ADV doctor/status/spec only. |
| DONT1 | avoidance | respected | review | Reviewer APPROVED after remediation; SQL deletes remain limited to validated blank assistant ids and tool parts use UPDATE. |
| DONT2 | avoidance | respected | review | No process/session kill behavior implemented. |
| DONT3 | avoidance | respected | review | No vacuum/compaction behavior added; WAL checkpoint + DB/WAL/SHM copy only. |
| DONT4 | avoidance | respected | review | Tool-part repair uses UPDATE part; no parent cascade-delete for tool repair. |
| DONT5 | avoidance | respected | review | Repair marker is state.metadata.interrupted, not arbitrary top-level state.interrupted. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d0bec1ff5376 | AC1, AC4, AC5, C3, C4, C5 | AC1, AC4, AC5 | C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-979e51e6be30 | AC2, AC3, AC5, AC6, C2, C4, C5 | AC2, AC3, AC5, AC6 | C1, C2, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-4db77ad2c3d8 | AC1, AC7 | AC1, AC7 | C3, C4, DONT1, DONT2, DONT3 |  |
| tk-ccb72d0cd691 | AC7 | AC7 | C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-676320017242 | AC4 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
