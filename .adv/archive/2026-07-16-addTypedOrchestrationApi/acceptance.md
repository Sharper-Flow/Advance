# Acceptance

Reviewed at: 2026-07-16T17:54:14.167Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Current ADV consumers can obtain one authoritative current-action plan from durable state without reconstructing workflow position from prose. | pass | Independent acceptance review attempt 3: canonical PhasePlan and opt-in plan projection provide one durable-state plan source. |
| SC2 | success_criterion | Existing command entry points and human checkpoints remain available through the migration. | pass | Legacy directive adapter and existing command-entry consumer tests remained green in focused verification. |
| SC3 | success_criterion | Unavailable authoritative state never becomes an invented next action. | pass | Reviewer confirmed degraded/fail-closed plan behavior; phase-plan and migration tests passed. |
| SC4 | success_criterion | Baseline and post-change context/payload measurements are recorded; no reduction threshold is required. | pass | Implementation and acceptance materials record baseline/post-change context and payload measurements; no reduction threshold claimed. |
| AC1 | acceptance_criterion | A plan reports exactly one current state: actionable, approval-required, blocked, recovery-required, terminal, or degraded. | pass | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC2 | acceptance_criterion | All seven gate positions produce deterministic plans from the same durable snapshot. | pass | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC3 | acceptance_criterion | Missing, conflicting, or unsupported state produces a typed non-authorizing result, and plan reads perform zero mutations. | pass | PhasePlan and fail-closed migration coverage passed; reviewer verified non-authorizing degraded behavior. |
| AC4 | acceptance_criterion | The plan distinguishes source provenance and recovery-required state from ordinary progress. | pass | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC5 | acceptance_criterion | The plan carries no more than 12 required reads/evidence entries and no more than 3 guidance snippets. | pass | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC6 | acceptance_criterion | `adv_gate_status` continues to return directive-compatible guidance across all seven gates plus archived and closed states. | pass | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC7 | acceptance_criterion | A structural test detects every manifest-to-workflow-safe command mapping mismatch. | pass | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC8 | acceptance_criterion | Current ADV tools expose an opt-in plan read projection; no external MCP surface is added. | pass | Query/message/change focused suite: 145/145 passed in durable run tr_mrnso67s_13adbf19. |
| AC9 | acceptance_criterion | Before full-machine deployment and agent/session restart, existing routing remains unchanged. After structural proof that every local ADV project uses the migrated build and every active session has restarted, failed authoritative plan derivation returns typed diagnostics and stops only plan-dependent consumer routing; it does not mutate or terminate the Temporal workflow. | pass | Migration and fail-closed focused suite: 92/92 passed in durable run tr_mrnsojah_6792fbbd. |
| AC10 | acceptance_criterion | A table-driven parity suite covers normal gates, precedence, malformed state, recovery, terminal state, mapping drift, and every current orientation consumer. | pass | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC11 | acceptance_criterion | Targeted parity tests, `pnpm run check`, build, workflow replay verification, and `bin/oc-test full` pass. | pass | Final execution evidence: full suite 378 files/5,848 tests; fresh pnpm run check passed in durable run tr_mrnsqjwp_e0b707c6. |
| C1 | constraint | Temporal/Zod-derived change state remains authoritative. | respected | Reviewer found canonical plan derives from Temporal/Zod state; no competing persistence introduced. |
| C2 | constraint | Plans are read-only and never authorize a mutation. | respected | Plan schemas and query projection are read-only; reviewer found no mutation authority path. |
| C3 | constraint | Workflow-reachable derivation remains workflow-safe and avoids storage, tool, and manifest imports. | respected | Workflow-safe derivation and worker build passed; no storage/tool/manifest imports in workflow-reachable kernel. |
| C4 | constraint | Current ADV consumers only; Epic entry 4 owns separate MCP read-surface work. | respected | Review confirmed current ADV tool opt-in projection only; no external MCP surface added. |
| C5 | constraint | Fail-closed routing occurs only after complete structural full-machine migration proof and agent/session restart. | respected | Migration/fail-closed suite passed 92/92; routing remains bounded to complete structural migration conditions. |
| DONT1 | avoidance | Do not infer gate completion or authority from agent prose. | respected | Reviewer confirmed authority remains durable-state/gate based, not agent prose. |
| DONT2 | avoidance | Do not persist a separate competing plan state machine. | respected | Reviewer confirmed one canonical PhasePlan derivation with legacy adapter, not a second plan state machine. |
| DONT3 | avoidance | Do not add an external MCP read/compose surface in this change. | respected | Review confirmed no external MCP read/compose surface. |
| DONT4 | avoidance | Do not silently route through legacy prose after the approved full-machine cutover. | respected | Migration tests cover typed diagnostics and stop only plan-dependent consumer routing after required proof. |
| DONT5 | avoidance | Do not terminate, fail, complete, or signal a Temporal workflow because a read-plan derivation degrades. | respected | Reviewer confirmed degraded read-plan behavior is non-authorizing and does not terminate or signal workflows. |
| OOS1 | out_of_scope | Removing human approvals or weakening existing gate authority. | not_applicable | Agreement scope retained existing human approvals and gate authority. |
| OOS2 | out_of_scope | Partial per-project migration after deployment. | not_applicable | No partial per-project migration was introduced. |
| OOS3 | out_of_scope | Reworking unrelated Epic entries, including role-scoped tools and external MCP read surface work. | not_applicable | Role-scoped tools and external MCP work remain separate Epic entries. |
| OOS4 | out_of_scope | Adopting broader Temporal Worker Versioning without separate platform verification. | not_applicable | Broader Temporal Worker Versioning was not adopted. |

