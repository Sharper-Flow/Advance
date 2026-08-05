# Contract Traceability

**Change ID:** fixAdvStateAuthority
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-05T20:00:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Cross-surface terminality invariant and targeted storage tests; task tk-1ec0745f9268. |
| SC2 | success_criterion | pass | review | Machine-wide census plus approved cleanup evidence; tk-34dfa8e5cb54 and cleanup tasks. |
| SC3 | success_criterion | pass | review | Typed degradation provenance and loaded-bundle guard tests; tk-12fd286ef09a, tk-7c2211ff33ab. |
| SC4 | success_criterion | pass | review | Identity resolver/data-home regression suites; tk-de53ed89c77a, tk-2c29af26aff8. |
| AC1 | acceptance_criterion | pass | test | Per-ID archive dominance regression and cross-surface invariant; tk-e3227282c426/tk-1ec0745f9268. |
| AC2 | acceptance_criterion | pass | test | Root-cause repair persisted terminal status in archiveChangeSignal at commit 721692d9. |
| AC3 | acceptance_criterion | pass | test | changes.ts:1004-1063 applies archive-bundle dominance to summary rows; targeted regressions. |
| AC4 | acceptance_criterion | pass | test | Approved Design Compromise: behavioral equivalence is locked by invariant rather than helper extraction. |
| AC5 | acceptance_criterion | pass | test | plugin/src/storage/cross-surface-terminality.invariant.test.ts covers list, listSummary, get, snapshot, launcher projection. |
| AC6 | acceptance_criterion | pass | test | project-id.ts:286-301 redirects test mode to tmpdir; task tk-2c29af26aff8 tests. |
| AC7 | acceptance_criterion | pass | test | project-id.ts:228-233 rejects non-40-hex root identity; no-store regression. |
| AC8 | acceptance_criterion | pass | test | tk-21fd0193df5f manifest-before-delete dry run, approval, guarded deletion, and post-census. |
| AC9 | acceptance_criterion | pass | test | tk-4e503f7ab15e scan and row-by-row evidence preserved canonical stores. |
| AC10 | acceptance_criterion | pass | test | Per-workflow signal-first evidence and approved terminate override in Design Compromise 2. |
| AC11 | acceptance_criterion | pass | test | tk-68c2dbba347f machine-wide dry-run, explicit blanket approval, pinned-run application. |
| AC12 | acceptance_criterion | pass | test | Replay fixture namespace boundary tests prevent default/live namespace creation. |
| AC13 | acceptance_criterion | pass | test | Doctor repair backfills missing projections; 80 targeted Epic/doctor tests. |
| AC14 | acceptance_criterion | pass | test | Typed host/MCP generation guard with process-specific recovery; 33 focused tests. |
| AC15 | acceptance_criterion | pass | test | Census implementation and machine-wide cleanup evidence. |
| C1 | constraint | respected | static_check | changes.ts:1032-1034 keeps routine list/listSummary projection-only; Epic repair is doctor-only. |
| C2 | constraint | respected | static_check | Signal-first, per-workflow evidence, and explicit user-approved terminate exception documented in Design Compromise 2. |
| C3 | constraint | respected | static_check | workflows.ts:2292-2307 projects terminal state before handler drain. |
| C4 | constraint | respected | static_check | Cleanup manifests used canonical/symlink/path guards and did not mutate source stores during consolidation assessment. |
| C5 | constraint | respected | static_check | No change altered decideWorkflowHibernation; it remained excluded from in-flight cleanup work. |
| DONT1 | avoidance | respected | review | Task-scoped adv-reviewer attestations for tk-e3227282c426, tk-12fd286ef09a, tk-7c2211ff33ab, tk-7aa616a5ae6d; degraded reads retain usable projections. |
| DONT2 | avoidance | respected | review | Task-scoped adv-reviewer attestations for tk-21fd0193df5f and tk-4e503f7ab15e; manifests preserve canonical stores. |
| DONT3 | avoidance | respected | review | Task-scoped adv-reviewer attestations for tk-8687225528cd, tk-ddbd76c41d12, tk-44c6afb7af6b; all use per-entity evidence. |
| DONT4 | avoidance | respected | review | Task-scoped adv-reviewer attestation for tk-68c2dbba347f; dry run and explicit all-project user approval precede application. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9dfdbe456431 |  |  |  | Prerequisite diagnostic that separates write-side from read-side contribution before implementation. Informs AC1-AC3 but neither implements nor verifies a contract item. |
| tk-4270b24e90d2 | AC2 |  | C3 |  |
| tk-e3227282c426 | AC1, AC3 |  | C1, DONT1 |  |
| tk-12fd286ef09a | SC3 |  | DONT1, C1 |  |
| tk-1ec0745f9268 | AC4, AC5 | AC1, AC2, AC3, SC1 |  |  |
| tk-de53ed89c77a | AC7, SC4 |  | C1 |  |
| tk-2c29af26aff8 | AC6, SC4 |  | C1 |  |
| tk-5fd80bcba6c8 | AC12 |  | C1 |  |
| tk-7c2211ff33ab | AC14, SC3 |  | DONT1 |  |
| tk-7aa616a5ae6d | AC13 |  | C1, DONT1 |  |
| tk-34dfa8e5cb54 | AC15, SC2 |  | C1 |  |
| tk-21fd0193df5f | AC8 |  | DONT2, C4 |  |
| tk-4e503f7ab15e | AC9 |  | C4, DONT2 |  |
| tk-8687225528cd | AC10, SC2 |  | C2, C3, C5, DONT3 |  |
| tk-68c2dbba347f | AC11, SC2 |  | DONT4, C4 |  |
| tk-ddbd76c41d12 | SC1, SC2 | AC1 | DONT3 |  |
| tk-9bface1e7e16 | SC3 |  |  |  |
| tk-44c6afb7af6b | SC2 |  | DONT3 |  |
