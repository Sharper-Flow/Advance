# Contract Traceability

**Change ID:** replaceRecoveryToolSprawl
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-22T23:05:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Issue #255 reproductions resolve without manual repair selection or duplicate creation: epic-convergence + creation-hash idempotency + monotonic-recovery/recovery-probe green (tr_mrwn2olz). |
| SC2 | success_criterion | pass | review | Repair group 10→4; 8 tools retired; recovery-surface-parity.test.ts guards all 8; registry/role-policy grep clean. |
| SC3 | success_criterion | pass | review | No poisoned_history ceremony: tool-registry.surface.test.ts asserts args absent; schema grep clean. |
| SC4 | success_criterion | pass | review | Direct convergence (convergeEpicOnShow) + machine-evidence classification; tests green (tr_mrwn2olz). |
| SC5 | success_criterion | pass | review | pnpm run check green (tr_mrwn29td); 117 tests green (tr_mrwn2olz). |
| AC1 | acceptance_criterion | pass | test | Creation/promotion/linking consistent without adv_epic_repair_membership; convergeEpicOnShow verified (epic-convergence + epic #255 integrations). |
| AC2 | acceptance_criterion | pass | test | adv_epic_show matching child healthy, never projection_missing/no-op (rq-epicMembershipConvergence01.2). |
| AC3 | acceptance_criterion | pass | test | Missing membership converges directly; conflict returns typed conflict without overwrite (5-state classification tested). |
| AC4 | acceptance_criterion | pass | test | Post-commit timeout deterministic via creation_request_hash; different hash throws before mutation (creation-hash/workflow-start/changes tests). |
| AC5 | acceptance_criterion | pass | test | Machine evidence classified internally; recoveryMode/Evidence/Reason removed from routine schemas; internal-classification tests. |
| AC6 | acceptance_criterion | pass | test | Safe monotonic recovery via normal ops; destructive/competing refuse typed operator-required (doctor.test.ts). |
| AC7 | acceptance_criterion | pass | test | Zero live-usage residue: runtime/role-policy/manifests grep clean; parity test guards 8 names; poisoned_history args absent; all 20 staged deltas read via adv_delta_show — retired refs only descriptive/prohibitive/retirement-documenting. |
| AC8 | acceptance_criterion | pass | test | Single entry point adv_doctor replaces diagnose→reconnect/restart/register tree (rq-recoverySurfaceRetirement01.3). |
| AC9 | acceptance_criterion | pass | test | Bounded before/after repair evidence only when a fix fired; doctor.test.ts 9 cases incl. healthy no-noise. |
| AC10 | acceptance_criterion | pass | test | Replay/versioning satisfied; archive sole ordinary global-spec writer; malformed-legacy removal (tk-0aefbca1154e, hash-preconditioned) is the approved exception. |
| AC11 | acceptance_criterion | pass | test | Reproduction matrix: post-commit timeout, dropped/conflicting membership, stale status + retry-after-boundary, unavailable target. Green tr_mrwn2olz. |
| C1 | constraint | respected | static_check | Retry/safety only for proven classes; creation_request_hash only on reproduced timeout path. |
| C2 | constraint | respected | static_check | Epic entries authoritative; child membership derived/rebuildable. |
| C3 | constraint | respected | static_check | Automatic repair monotonic, structurally authorized, bounded, idempotent, audited internally. |
| C4 | constraint | respected | static_check | Reachable authority never silently replaced by disk; typed operator-required conflict; tested. |
| C5 | constraint | respected | static_check | Archive sole ordinary global-spec writer; legacy removal hash-preconditioned, no migration/tombstone/shim. |
| C6 | constraint | respected | static_check | Workflow changes satisfy rq-workflowVersioning01 and replay committed histories. |
| C7 | constraint | respected | static_check | Integrated origin/trunk; worker rebuilt/restarted; check green on current basis. |
| C8 | constraint | respected | static_check | Schemas/preflight/policy/manifests/prompts/specs/docs/tests changed together; check green. |
| C9 | constraint | respected | static_check | No tombstones/generic ledger/daemon/new persistence; retry identity + pending intent on existing entities. |
| DONT1 | avoidance | respected | review | No broad framework/router; adv_doctor single bounded tool. |
| DONT2 | avoidance | respected | review | No wrappers/aliases/shims/tombstones/compat fields; parity test + grep clean. |
| DONT3 | avoidance | respected | review | No blanket guardrails; creation-hash opt-in, proof-scoped. |
| DONT4 | avoidance | respected | review | adv_doctor never destructive-auto; those remain explicit operator tools. |
| DONT5 | avoidance | respected | review | Typed machine evidence, not heuristics/free-text; P33. |
| DONT6 | avoidance | respected | review | Repairs not hidden; bounded evidence without noisy warnings. |
| DONT7 | avoidance | respected | review | No repair-tool choice for machine-resolvable state; direct convergence. |
| DONT8 | avoidance | respected | review | No schedules/controllers/ledgers/persistent migrations; direct convergence. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0aefbca1154e | AC7, AC10, SC2, SC3 |  | C5, C8, C9, DONT2, DONT8, OOS4 |  |
| tk-9d7519c9531f | SC1, SC4, AC1, AC2, AC3, AC9, AC11 |  | C2, C3, C6, C9, DONT1, DONT4, DONT8, OOS1 |  |
| tk-74c358188ffb | SC1, AC4, AC11 |  | C1, C3, C9, DONT3, DONT8 |  |
| tk-87c1d5115473 | SC3, SC4, AC5, AC6, AC9, AC10, AC11 |  | C3, C4, C5, C6, C9, DONT1, DONT4, DONT5, DONT8, OOS2, OOS3 |  |
| tk-dc21b6a3658d | SC2, SC4, AC8, AC9 |  | C3, C4, C8, C9, DONT1, DONT4, DONT8, OOS3 |  |
| tk-0528be678596 | SC2, SC3, SC4, AC7 |  | C5, C8, C9, DONT2, DONT7, DONT8, OOS3, OOS4 |  |
| tk-b7112e50fc3d |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
