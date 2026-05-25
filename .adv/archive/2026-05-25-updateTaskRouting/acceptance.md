# Acceptance

Reviewed at: 2026-05-25T01:12:10.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `/adv-task` contract requires a Spec-law impact section with Add / Modify / Remove / No spec law update / Uncertain outcomes. | pass | `.opencode/command/adv-task.md` contains Spec-Law Impact Assessment table with Add/Modify/Remove/No update/Uncertain; `plugin/src/adv-task-assets.test.ts` exact table-row assertions pass. |
| AC2 | acceptance_criterion | If impact is Add/Modify/Remove, `/adv-task` persists draft spec-delta obligations with concrete `rq-*` IDs and Given/When/Then scenarios in proposal/discovery/design artifacts before planning completes. | pass | `adv-task.md` requires draft spec-delta obligations with concrete `rq-*` IDs and Given/When/Then scenarios before planning; asset tests assert these strings and `rq-taskSpecLaw01.1` covers delta obligations. |
| AC3 | acceptance_criterion | If impact is No update, `/adv-task` persists an explicit no-delta rationale. | pass | `adv-task.md` requires `No spec law update required: {rationale}` before planning; `rq-taskSpecLaw01.2` and asset tests cover no-delta rationale. |
| AC4 | acceptance_criterion | If impact is Uncertain, `/adv-task` must not complete planning; it routes to deeper proposal/discovery work. | pass | `adv-task.md` says Uncertain MUST NOT complete planning/create implementation tasks and must carry same change through `/adv-proposal` or deeper discovery; `rq-taskSpecLaw01.4` and asset tests verify route. |
| AC5 | acceptance_criterion | ADV agent routing says small well-understood durable changes should use `/adv-task` so change/task tracking exists before implementation. | pass | `.opencode/agents/adv.md` adds `Small tracked change` routing to use `/adv-task workflow` so change/task state exists before implementation; asset tests assert routing strings. |
| C1 | constraint | Preserve `/adv-problem` read-only boundary. | respected | No changes to `.opencode/command/adv-problem.md`; review/security scans reported no boundary regression. ADV changes only touched `/adv-task` and routing docs/tests/specs. |
| C2 | constraint | Do not add heuristic-only enforcement; add asset/spec tests for durable contract coverage. | respected | Enforcement is structural via command contract, `.adv/specs/advance-workflow/spec.json`, docs mirror, and asset/manifest tests. No heuristic-only enforcement added. |

