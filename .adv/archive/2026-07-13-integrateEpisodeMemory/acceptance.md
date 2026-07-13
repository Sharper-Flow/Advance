# Acceptance

Reviewed at: 2026-07-13T03:00:27.707Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Discovery and research can use bounded, active-project decision memory as advisory context. | pass | Reviewer READY; scoped recall grants and policy in adv.md/adv-researcher.md. |
| SC2 | success_criterion | ADV continues with native context when decision-memory service is unavailable and makes the limitation visible. | pass | Policy explicitly continues when Episode unavailable. |
| SC3 | success_criterion | Existing ADV wisdom/reflection ingestion remains the routine durable-learning path. | pass | No direct-write grants; existing wisdom flows unchanged. |
| AC1 | acceptance_criterion | Every eligible decision-memory retrieval is confined to active-project scope; cross-project results are excluded except explicitly shared memory. | pass | tool-name-assets test pins recall grant and top_k: 5. |
| AC2 | acceptance_criterion | Recalled memory cannot authorize gates, override specifications or contracts, or replace task evidence. | pass | Policy text and test pin advisory-only handling. |
| AC3 | acceptance_criterion | Decision-memory service failure does not block discovery or research. | pass | Policy pins graceful continuation on unavailable Episode. |
| AC4 | acceptance_criterion | Before any direct durable-memory contribution behavior is enabled, its eligible content is defined and secrets, transcripts, gate state, and task evidence are excluded. | pass | Test forbids episode_remember/forget/stats grants. |
| AC5 | acceptance_criterion | Shipped asset validation detects missing project scope, advisory-use, or outage-behavior policy. | pass | Focused asset test 5/5 and full suite passed. |
| C1 | constraint | ADV change state, gate state, contracts, task evidence, and `adv_wisdom_*` remain authoritative in ADV. | respected | No workflow-state integration added. |
| C2 | constraint | Decision-memory retrieval remains bounded and project-scoped. | respected | top_k: 5 and active namespace policy. |
| C3 | constraint | Decision-memory service availability is an external runtime prerequisite; Advance deployment does not register the service. | respected | deploy-local exclusion test passed. |
| DONT1 | avoidance | Do not persist secrets, raw transcripts, gate state, or task evidence in decision memory. | respected | No write tools granted. |
| DONT2 | avoidance | Do not treat recalled semantic memory as authoritative workflow or specification state. | respected | Advisory-only policy. |
| DONT3 | avoidance | Do not remove or weaken existing `adv_wisdom_*` behavior. | respected | No ADV wisdom behavior removed. |
| DONT4 | avoidance | Do not mirror routine ADV wisdom/reflection writes through a direct memory-contribution path. | respected | Direct write tools forbidden by test. |
| OOS1 | out_of_scope | Replacing ADV change, task, contract, gate, or evidence stores. | not_applicable | No store replacement. |
| OOS2 | out_of_scope | Re-indexing repository source code in decision memory. | not_applicable | No source indexing. |
| OOS3 | out_of_scope | Broad memory migration or retroactive reconstruction of historical session transcripts. | not_applicable | No migration. |

