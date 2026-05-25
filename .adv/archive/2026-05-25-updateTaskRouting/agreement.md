## Objectives
- Make `/adv-task` the tracked fast path for small, well-understood durable changes.
- Require `/adv-task` to assess spec additions, modifications, removals, or no-op rationale.
- Prevent crash-lost small work by ensuring agents create ADV change/tasks before implementation.

## Acceptance Criteria
- AC1: `/adv-task` contract requires a Spec-law impact section with Add / Modify / Remove / No spec law update / Uncertain outcomes.
- AC2: If impact is Add/Modify/Remove, `/adv-task` persists draft spec-delta obligations with concrete `rq-*` IDs and Given/When/Then scenarios in proposal/discovery/design artifacts before planning completes.
- AC3: If impact is No update, `/adv-task` persists an explicit no-delta rationale.
- AC4: If impact is Uncertain, `/adv-task` must not complete planning; it routes to deeper proposal/discovery work.
- AC5: ADV agent routing says small well-understood durable changes should use `/adv-task` so change/task tracking exists before implementation.

## Constraints
- Preserve `/adv-problem` read-only boundary.
- Do not add heuristic-only enforcement; add asset/spec tests for durable contract coverage.