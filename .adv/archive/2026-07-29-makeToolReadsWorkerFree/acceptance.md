# Acceptance

Reviewed at: 2026-07-29T16:37:17.858Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1 — worker-free gate status:** Given a valid durable change projection and an unreachable change workflow, `adv_gate_status` returns the persisted gate map and next gate without issuing a workflow query; a targeted test proves this path. | pass | Focused gate worker-free coverage passed; reviewer traced durable gate map and zero workflow-query behavior. |
| AC2 | acceptance_criterion | **AC2 — truthful incompleteness:** When projection data cannot authoritatively provide gate criteria or acceptance projection, `adv_gate_status` returns an explicit typed unavailable/degraded marker and reason; it never derives those fields from absence or returns a false pass. | pass | Focused gate coverage passed; reviewer confirmed typed unavailable markers for non-projected criteria. |
| AC3 | acceptance_criterion | **AC3 — archive read continuity:** With archived projection/bundle data available and no live workflow, `adv_change_list({ includeArchived: true })` returns the archived row(s), while corrupt/unavailable summaries produce explicit completeness/warning metadata rather than an empty-success result. | pass | Change projection/archived-list tests passed; reviewer confirmed degraded metadata behavior. |
| AC4 | acceptance_criterion | **AC4 — Epic boundary:** With an unreachable Epic workflow, ordinary `adv_epic_list`/`adv_epic_show` still render active or retired projection facts; completed-candidate evaluation and convergence cannot silently report success when their live operation is unavailable. | pass | Epic worker-free tests passed; reviewer confirmed projection-first rendering and unavailable live evaluation/convergence. |
| AC5 | acceptance_criterion | **AC5 — structural and regression protection:** A shared automated guard rejects workflow-query constructs in designated routine host-tool read paths. Handler tests cover one unreachable-worker case for gate status and one for each affected Epic boundary. | pass | Shared routine-read structural guard and focused handler tests passed. |
| AC6 | acceptance_criterion | **AC6 — preserved fail-closed split:** The CLI status table still returns zero active rows on Visibility failure and does not use disk/projection data as an active-row substitute; its existing contract test remains green. | pass | CLI bridge fail-closed regression passed; reviewer found no production CLI change. |
| C1 | constraint | No producer/projection-writing changes, workflow patches, or replay-semantic changes. | respected | Committed diff contains no producer, workflow patch, or replay-semantic change. |
| C2 | constraint | No mutation is reclassified as worker-free. | respected | Mutations remain separate; only read handler behavior changed. |
| C3 | constraint | Preserve `rq-statusCliWorkerFree01` and avoid expanding the CLI import boundary. | respected | CLI code/import boundary unchanged; CLI bridge regression passed. |
| C4 | constraint | Projection freshness/completeness must be visible; stale or unavailable data is never rendered as genuine absence. | respected | Gate and Epic worker-free paths emit typed unavailable markers rather than false absence. |

