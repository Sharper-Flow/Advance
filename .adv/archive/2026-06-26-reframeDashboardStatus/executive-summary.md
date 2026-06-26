# Executive Summary

## Outcome

Reframed the local dashboard from a source-event/history board into an ADV-change-centered latest-status board. The dashboard now derives each change’s current state from the latest structurally linked CI/deployment events, so older failed runs are not shown as current failures after a newer same workflow+branch run succeeds or is running.

## Verdict

APPROVED

## What Was Built

1. Added `adv_change_status` primary dashboard cards.
2. Replaced primary lane keys with latest-status lanes: `needs_attention`, `running`, `ready_landed`, `backlog`, and secondary `unmatched_source`.
3. Added a pure latest-source reducer before lane bucketing.
4. Workflow run identity uses `(workflow_id ?? name/title) + branch`; never run id.
5. Recency uses max valid `run_started_at`, `created_at`, and `updated_at` timestamps.
6. Newer same-identity success/running suppresses older failures.
7. Distinct workflow/branch failures remain visible.
8. Missing/invalid timestamps do not suppress valid failures.
9. ADV cards show latest PR, CI, deployment summaries plus read-only source details.
10. Unmatched source work remains secondary.
11. Safe URL allowlisting, HTML escaping, no-secret behavior, degraded-source fallback, and no mutation controls were preserved.

## What Was Verified

- Contract matrix: 27/27 rows pass/respected.
- Acceptance reviewer: `reframeDashboardStatus|change:review:acceptance|adv-reviewer|1` returned READY.
- Targeted dashboard tests: `tr_mqv7ff29_5df2600b` passed 20 tests, 119 assertions.
- Full bin suite: `tr_mqv7g1mj_6c94a733` passed `bun test bin/` with 165 tests, 491 assertions.

## Remaining Concerns

None for the accepted contract. The installed dashboard service still runs the previous release until this change is archived/merged and the service is restarted from trunk.