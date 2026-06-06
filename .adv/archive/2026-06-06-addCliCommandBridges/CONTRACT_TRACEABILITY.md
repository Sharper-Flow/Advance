# Contract Traceability

**Change ID:** addCliCommandBridges
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-05T19:40:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | bin/lib/live-status.test.ts verifies live Temporal workflow states are listed/query-by-name and build live payload from queried rows; `bun test bin/` passed 66 tests. |
| AC2 | acceptance_criterion | pass | test | plugin/src/cli-bridge-contract.test.ts verifies `.opencode/command/adv-status.md` contains `!`adv status --no-color`` and forbids adv_* MCP fanout tokens; targeted test passed 16 tests. |
| AC3 | acceptance_criterion | pass | test | STATUS LIVE DEFAULT GUARDS assert `bin/adv` does not contain `join(root, "changes")` or `isDashboardActiveStatus`; live-status payload tests exclude disk-only IDs. |
| AC4 | acceptance_criterion | pass | test | `ADV_STATUS_TIMEOUT_MS=1000 bun bin/adv status --json` exited 2 with JSON `live:false`, `stale:false`, `error`, and remediation; no table/disk active fallback emitted. |
| AC5 | acceptance_criterion | pass | test | bin/adv.test.ts verifies standalone `adv status` no longer requires a disk ADV state directory; `bun test bin/` passed 66 tests. |
| AC6 | acceptance_criterion | pass | test | bin/adv.test.ts and live failure runtime evidence verify JSON fields: source, live, stale, generated_at, project_id/counts/changes, error, remediation. |
| AC7 | acceptance_criterion | pass | test | .adv/specs/advance-meta/spec.json rq-statusCliBridge01 updated to live-default/no-silent-stale law; cli-bridge-contract test asserts live Temporal-backed/fail-closed/disk-not-active wording. |
| AC8 | acceptance_criterion | pass | test | STATUS LIVE DEFAULT GUARDS verify `/adv-roadmap` bridge remains `!`adv roadmap --no-color`` and roadmap CLI keeps `unavailable_cli_file_mode`; roadmap parity/matrix targeted suite passed 23 tests. |
| AC9 | acceptance_criterion | pass | test | NO-CLI-MUTATION GUARD and STATUS LIVE DEFAULT GUARDS scan status implementation for mutation dispatch/signal/start/update/restart patterns; targeted test passed. |
| AC10 | acceptance_criterion | pass | test | Coverage commands passed: `bun test bin/` 66 tests; `bin/oc-test targeted -- src/cli-bridge-contract.test.ts` 16 tests; CLI bridge/parity/matrix suite 23 tests. |
| C1 | constraint | respected | static_check | bin/adv still uses node:util parseArgs and no new package dependencies were added. |
| C2 | constraint | respected | static_check | `--no-color` bridge flag preserved in `.opencode/command/adv-status.md` and tests; output remains stable for command rendering. |
| C3 | constraint | respected | static_check | `adv status --json` emits structured success/failure fields; failure evidence shows CI-readable live:false/stale:false/error/remediation. |
| C4 | constraint | respected | static_check | Guard test prevents active rows from disk `changes` directory in default status; live-status module owns Temporal read path. |
| C5 | constraint | respected | static_check | Remediation text exists in bin/lib/live-status.ts failure JSON/stderr path, not in `.opencode/command/adv-status.md`; no-fanout command test passes. |
| C6 | constraint | respected | static_check | Roadmap bridge/file-snapshot tests unchanged and passing; roadmap guard verifies `unavailable_cli_file_mode`. |
| DONT1 | avoidance | respected | review | ADV_TOOL_NAMES frozen registry guard still passes; no MCP tools removed. |
| DONT2 | avoidance | respected | review | No adv validate/doctor/hygiene CLI implementation added; bin/adv dispatch guard allows only status and roadmap. |
| DONT3 | avoidance | respected | review | No CLI gate/archive/cancel/task/destructive mutation dispatch added; mutation guard tests pass. |
| DONT4 | avoidance | respected | review | Default status active rows come from Temporal live reader; disk active substitution guard passes; runtime failure emitted no disk table. |
| DONT5 | avoidance | respected | review | /adv-status command file still contains no adv_status, adv_change_list, adv_change_show, adv_gate_status, or adv_spec fanout instructions; bridge tests pass. |
| DONT6 | avoidance | respected | review | Status failure remediation instructs user to verify/restart services; code only reports remediation and contains no worker restart operation. Guard tests scan for restart mutation identifiers. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4781868e7a81 | AC3, C4 |  | C1 |  |
| tk-01449062f500 | AC7 |  | DONT4 |  |
| tk-8270800d8017 | AC1, AC2, AC8 |  | DONT2 |  |
| tk-3b37128036bd |  | AC3, C4 |  |  |
| tk-286991856559 | AC4, C2, C3 |  | DONT4 |  |
| tk-eaecc5ed31ba | AC4, C2 |  | C1, C3, DONT3, DONT4 |  |
| tk-88a2828020ea |  | AC4 |  |  |
| tk-375810084ef4 | AC6 | AC5, AC7, AC9 | DONT1, DONT3 |  |
| tk-9c7fdd49c4d2 | AC5 |  | DONT3, DONT4 |  |
| tk-e353a4f26924 | AC2, AC7, AC10 | AC2, AC7 | C5, DONT5 |  |
| tk-9d123b9021d0 | AC1, AC3, AC4, AC5, AC6 | AC1, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, DONT3, DONT4, DONT6 |  |
| tk-134186ff8104 |  | AC4, AC5, AC6, AC10 | AC8, AC9, C6, DONT6 |  |
| tk-fcd4811c8a63 | AC8, AC9, AC10 | AC8, AC9, AC10 | C5, C6, DONT2, DONT3, DONT5 |  |
| tk-f774167c1343 |  | AC4, AC5, AC6, AC10 | AC8, AC9, C6, DONT6 |  |
