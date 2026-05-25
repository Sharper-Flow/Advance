# Contract Traceability

**Change ID:** updateTaskRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-25T01:12:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `.opencode/command/adv-task.md` contains Spec-Law Impact Assessment table with Add/Modify/Remove/No update/Uncertain; `plugin/src/adv-task-assets.test.ts` exact table-row assertions pass. |
| AC2 | acceptance_criterion | pass | test | `adv-task.md` requires draft spec-delta obligations with concrete `rq-*` IDs and Given/When/Then scenarios before planning; asset tests assert these strings and `rq-taskSpecLaw01.1` covers delta obligations. |
| AC3 | acceptance_criterion | pass | test | `adv-task.md` requires `No spec law update required: {rationale}` before planning; `rq-taskSpecLaw01.2` and asset tests cover no-delta rationale. |
| AC4 | acceptance_criterion | pass | test | `adv-task.md` says Uncertain MUST NOT complete planning/create implementation tasks and must carry same change through `/adv-proposal` or deeper discovery; `rq-taskSpecLaw01.4` and asset tests verify route. |
| AC5 | acceptance_criterion | pass | test | `.opencode/agents/adv.md` adds `Small tracked change` routing to use `/adv-task workflow` so change/task state exists before implementation; asset tests assert routing strings. |
| C1 | constraint | respected | static_check | No changes to `.opencode/command/adv-problem.md`; review/security scans reported no boundary regression. ADV changes only touched `/adv-task` and routing docs/tests/specs. |
| C2 | constraint | respected | static_check | Enforcement is structural via command contract, `.adv/specs/advance-workflow/spec.json`, docs mirror, and asset/manifest tests. No heuristic-only enforcement added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-78f49c5a3589 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 |  |  |
| tk-d392b8b1b011 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 |  |  |
| tk-f167660cc611 | AC5 | AC5 |  |  |
