## Why
Small durable ADV changes have recently bypassed spec-law assessment and durable task/change tracking when agents judge a full `/adv-proposal` cycle too heavy. A crash can then lose partially completed work and leave no tracked tasks or spec-delta obligation.

## What Changes
- `/adv-task` must perform an explicit spec-law impact assessment for small fast-track changes.
- `/adv-task` must record either draft spec-delta obligations or a no-delta rationale before creating implementation tasks.
- ADV agent routing should prefer `/adv-task` for well-understood small durable changes when full `/adv-proposal` ceremony is not worth it, so change/task state exists before implementation.

## Success Criteria
- `/adv-task` command contract includes spec-law add/modify/remove/no-change assessment.
- ADV agent instructions route small well-understood durable changes to `/adv-task` instead of ad hoc/direct implementation.
- Specs and asset tests enforce the routing + spec-law check.