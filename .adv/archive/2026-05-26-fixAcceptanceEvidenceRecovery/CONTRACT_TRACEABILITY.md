# Contract Traceability

**Change ID:** fixAcceptanceEvidenceRecovery
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T15:56:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance proof sequence implemented in /adv-review contract and verified by reviewer READY report plus gate-readiness/workflow tests. |
| SC2 | success_criterion | pass | review | Workflow artifact metadata, generated acceptance.md, and audited disk recovery paths implemented; regression suite passed. |
| SC3 | success_criterion | pass | review | saveRecoveredArtifactMetadata, review-matrix recovery, and acceptance gate disk recovery implemented without manual ADV state-file edits. |
| SC4 | success_criterion | pass | review | Deterministic blockers added for missing/stale executive-summary metadata/hash and failing/missing review rows. |
| SC5 | success_criterion | pass | review | Workflow remains signal/query-only; no defineUpdate reintroduced; workflow tests and boundary checks passed. |
| AC1 | acceptance_criterion | pass | test | adv-review docs require proof before prompt; workflow writes acceptance.md and verifies executive-summary hash; targeted and full tests passed. |
| AC2 | acceptance_criterion | pass | test | gate-readiness and workflows.signal-handlers tests cover missing metadata/hash and stale executive-summary hash blockers. |
| AC3 | acceptance_criterion | pass | test | store-temporal metadata and activities tests prove executive-summary contentHash and inspection support; workflow readiness requires it. |
| AC4 | acceptance_criterion | pass | test | _recovery-writers, contract, change, and gate tests cover artifact metadata, review matrix, and acceptance gate recovery. |
| AC5 | acceptance_criterion | pass | test | gate and contract recovery tests require recoveryEvidence/recoveryReason/priorApprovalEvidence; missing audit fields reject recovery. |
| AC6 | acceptance_criterion | pass | test | Acceptance gate completion blocks before done when proof missing/stale; chat approval alone cannot bypass readiness. |
| AC7 | acceptance_criterion | pass | test | Workflow change surface remains signal/query-only; pnpm run check and workflow tests passed. |
| AC8 | acceptance_criterion | pass | test | advance-workflow spec, docs/adv-gates, and .opencode/command/adv-review updated; asset and citation tests passed. |
| AC9 | acceptance_criterion | pass | test | Cross-path regression suite passed: 234 targeted tests across metadata, readiness/workflow, recovery, assets, and citations. |
| AC10 | acceptance_criterion | pass | test | Final verification passed after reviewer fixes: pnpm run check, pnpm run build, and pnpm test. |
| C1 | constraint | respected | static_check | advance-workflow spec updated before/with implementation; spec JSON and citation invariant passed. |
| C2 | constraint | respected | static_check | No-late-homework order encoded in /adv-review and enforced by readiness/workflow before acceptance completion. |
| C3 | constraint | respected | static_check | executiveSummary metadata contentHash is required and executive-summary.md is inspected as acceptance proof. |
| C4 | constraint | respected | static_check | Recovery paths require explicit audit fields and recovery authorization before disk projection repair. |
| C5 | constraint | respected | static_check | Acceptance recovery rejects missing priorApprovalEvidence; workflow readiness blocks missing proof before approval can complete gate. |
| C6 | constraint | respected | static_check | No defineUpdate changes; Temporal workflow signal/query architecture preserved. |
| C7 | constraint | respected | static_check | Correctness uses typed contract review matrix, artifact metadata hashes, and deterministic readiness blockers. |
| C8 | constraint | respected | static_check | Implemented tool-based recovery writers; no supported manual ADV state-file edit path introduced. |
| C9 | constraint | respected | static_check | Scope stayed on acceptance evidence/recovery; release/archive finalization sequencing was not changed. |
| DONT1 | avoidance | respected | review | No manual ADV state-file editing repair path added. |
| DONT2 | avoidance | respected | review | Recovery requires structured evidence fields; no chat-history reconstruction used as proof. |
| DONT3 | avoidance | respected | review | Workflow/tool computes or validates contentHash; caller-forged metadata is not sole acceptance authority. |
| DONT4 | avoidance | respected | review | Recovery requires recoveryEvidence, recoveryReason, and priorApprovalEvidence where applicable. |
| DONT5 | avoidance | respected | review | executive-summary.md is now workflow-visible acceptance proof with hash metadata. |
| DONT6 | avoidance | respected | review | No broad release/archive behavior changes made beyond acceptance proof references. |
| DONT7 | avoidance | respected | review | No Temporal update handlers added to change workflow. |
| OOS1 | out_of_scope | not_applicable | not_applicable | PokeEdge app logic and fixSetPriceSorting implementation were not changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Dirty-main checkpointing, worktree cleanup, and archive finalization sequencing were not changed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Proposal/discovery/design/planning/execution gates were not reworked beyond shared acceptance evidence infrastructure. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No external services or dependencies added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-475fcb20608d | AC8 | AC8 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4 |  |
| tk-5ab80065db9a | AC1, AC3, AC7 | AC1, AC3, AC7 | C2, C3, C6, C7, DONT3, DONT5, DONT7 |  |
| tk-9c56fb7a2000 | AC1, AC2, AC3, AC6, AC7 | AC1, AC2, AC3, AC6, AC7 | C2, C3, C5, C6, C7, DONT2, DONT3, DONT5, DONT7 |  |
| tk-a4618afa951e | AC4, AC5, AC6, AC7 | AC4, AC5, AC6, AC7 | C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT7 |  |
| tk-0880c9367959 | AC9 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
| tk-7c571e84cf57 | AC10 | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, C7, C8, C9, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4 |  |
