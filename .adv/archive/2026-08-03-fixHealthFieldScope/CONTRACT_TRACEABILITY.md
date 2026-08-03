# Contract Traceability

**Change ID:** fixHealthFieldScope
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-03T07:04:39.170Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | WorkerLiveness union emits {status:'unavailable', reason:'not_host_capable'} when hasResolvedWorkerRole() is false, never a bare boolean. Confirmed at producer (health-probe.ts via workerRoleResolved) and serialized through MCP in health-field-scope.test.ts. |
| SC2 | success_criterion | pass | review | The union type WorkerLiveness has no boolean inhabitant for the unavailable case; the illegal state (bare false from a workerless process) is unrepresentable at the type level. doctor.ts duplicate declaration reconciled so the type is shared, not re-declared. |
| SC3 | success_criterion | pass | review | All five coercion sites migrated: tool-formatters.ts:320, status.ts:990/992/1149, health-probe.ts:177-180. isWorkerAffirmativelyAlive predicate returns false for BOTH unavailable and available:false, true only for available:true — unavailable cannot be read as truthy. |
| SC4 | success_criterion | pass | review | temporal-recovery.md:637-642 matrix migrated to shipped vocabulary including a new not_host_capable row; SETUP.md:244 field table updated. Grep confirmed no stale worker_alive boolean literals remain in operator guidance. |
| AC1 | acceptance_criterion | pass | test | WorkerLiveness discriminated union declared once (single shared declaration after doctor.ts/status-health.ts duplicate reconciliation in commit 0f3ad102); both worker_alive and worker_process_alive typed as it. Typecheck green; tsc surfaced 9 consumer errors when casts were removed, all resolved — empirical proof the type is shared, not re-declared. |
| AC2 | acceptance_criterion | pass | test | health-probe.test.ts asserts: when hasResolvedWorkerRole() is false, both worker fields equal {status:'unavailable', reason:'not_host_capable'}. Red run tr_mscrio58_ec5820f1 (2 failures), green tr_mscrmv2v_9798e1fb (18 passed). |
| AC3 | acceptance_criterion | pass | test | health-probe.test.ts asserts the distinct case: role resolved but no worker registered yields {status:'available', value:false}, distinguished from AC2's unavailable. A production-ordering guard fails the test if workerRoleResolved moves into the spawn block (commit 968c0f79, run tr_mscum0fk_01ff1152). |
| AC4 | acceptance_criterion | pass | test | Duplicate TemporalHealthSnapshot declarations reconciled to one shared declaration; as-unknown-as casts at doctor.ts:304 and :762 removed. Typecheck enforced the migration: removing the casts surfaced 9 errors that the duplicate-type trap had been hiding (commit 0f3ad102). |
| AC5 | acceptance_criterion | pass | test | All five sites migrated to explicit handling in commit 0f3ad102: tool-formatters.ts:320, status.ts:990, :992, :1149, health-probe.ts:177-180. No remaining truthiness or ?? false on a union value; typecheck would fail on any regression. |
| AC6 | acceptance_criterion | pass | test | Both buildTemporalHealthFallback branches at status-health.ts:499-532 emit the union. Optimistic timeout branch checks hasResolvedWorkerRole() and emits unavailable rather than claiming availability for a process that never attempted bootstrap. |
| AC7 | acceptance_criterion | pass | test | isWorkerAffirmativelyAlive predicate added and shared by consumers and the docs matrix. Returns false for both unavailable and available:false, true only for available:true — verified by targeted tests in commit 0f3ad102. |
| AC8 | acceptance_criterion | pass | test | temporal-recovery.md matrix and SETUP.md field table migrated by task-scoped reviewer (commit 48a4d355); new not_host_capable row added. Grep-proven no stale worker_alive literals remain in operator guidance. |
| AC9 | acceptance_criterion | pass | test | pnpm run check green with only the 4 known baseline no-explicit-any warnings (temporal/operations.ts, mock-owner.ts — unchanged). Full suite 538 files passed / 1 skipped, 8260 tests passed (verification task tk-71e0ed75db66). Existing health assertions migrated to the union, not deleted. |
| AC10 | acceptance_criterion | pass | test | MCP regression test (health-field-scope.test.ts) exercises real Tier-4 dispatch via createTier4ToolMap against a temp project, asserting a role-unresolved payload emits no bare boolean for worker_alive/worker_process_alive and carries {status:'unavailable', reason:'not_host_capable'}. Strengthened at acceptance review from a stubbed execute to real dispatch (commit 975e036e, run tr_mscvt6oo_d3c807a6, 3/3 passed). |
| C1 | constraint | respected | static_check | Diff is reporting-only: WorkerLiveness type, workerRoleResolved flag (an observation of role resolution, not a change to it), producer/consumer migration, docs. No edits to worker spawn path, singleton policy, queue routing, or bootstrap behavior. plugin-init.ts:280 change is a read-only flag set, not a control-flow change. |
| C2 | constraint | respected | static_check | WorkerLiveness follows the repo's existing discriminated-union idiom (GhJsonParse, ProjectConfigLoad, AdoptionConstructionState at plugin-init.ts:501-507 which models the identical not_attempted marker). No new pattern introduced. |
| C3 | constraint | respected | static_check | Every changed consumer handles the unavailable arm explicitly. isWorkerAffirmativelyAlive and the migrated call sites all switch on status; typecheck enforces exhaustiveness via the discriminated union. The four untyped-JSON test assertions (status-health-integration-blockers.test.ts:805,806,812,846) were hand-audited and migrated per design Decision 6. |
| C4 | constraint | respected | static_check | Existing health assertions in status-health.test.ts, health-probe-cache.test.ts, doctor.test.ts, status.test.ts were migrated to assert against the union, not deleted. Test count held: 8260 passed vs the pre-change baseline. |
| DONT1 | avoidance | respected | review | Orphan-queue adopter construction (plugin-init.ts:409-422, the bl-workerQueueReadBlackout defect) is untouched. Diff shows no changes to OrphanQueueAdopter or its construction path. |
| DONT2 | avoidance | respected | review | adv_doctor's healthy/unhealthy criteria unchanged. doctor.ts edits are limited to migrating worker_alive reads through the predicate and reconciling the duplicate type declaration; the decision logic at doctor.ts:356,645,787,791,800 routes through isWorkerAffirmativelyAlive which preserves the prior boolean semantics for the healthy/unhealthy verdict. |
| DONT3 | avoidance | respected | review | No work on read timeouts or multi-session saturation. fixChangeReadTimeouts, makeToolReadsWorkerFree, fixMultiSessionTemporalRead remain the owners; this change does not touch read-path timeout or hydration behavior. |
| DONT4 | avoidance | respected | review | No new public JSON schema entry. WorkerLiveness is internal-only; schema-registry.ts PUBLIC_JSON_SCHEMAS unchanged. pnpm run schemas:check green with no generated-artifact drift. |
| DONT5 | avoidance | respected | review | No global process-role identifier or environment marker introduced. The bootstrap-attempted distinction is module-local: workerRoleResolved is a module-level flag in plugin-init.ts, consistent with the existing inProcessTemporalWorkers Set it observes. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5a518bcd63c0 | AC1, SC1, SC2 | AC2, AC3, AC6 | C1, C2, DONT5 |  |
| tk-380238fab828 | AC4, AC5, AC7, SC3 |  | C3, C4, DONT2 |  |
| tk-4b97fdb6ea34 | AC8, SC4 |  | C1 |  |
| tk-71e0ed75db66 | AC10 | AC9 | C4, DONT1, DONT3, DONT4 |  |
