# Acceptance

Reviewed at: 2026-05-26T15:56:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Acceptance proof exists durably before the acceptance approval prompt. | pass | Acceptance proof sequence implemented in /adv-review contract and verified by reviewer READY report plus gate-readiness/workflow tests. |
| SC2 | success_criterion | Required acceptance evidence is represented in workflow state or in an explicitly audited recovery projection. | pass | Workflow artifact metadata, generated acceptance.md, and audited disk recovery paths implemented; regression suite passed. |
| SC3 | success_criterion | Stuck completed/poisoned workflow states can be repaired without manual ADV state-file edits. | pass | saveRecoveredArtifactMetadata, review-matrix recovery, and acceptance gate disk recovery implemented without manual ADV state-file edits. |
| SC4 | success_criterion | Missing or invalid proof yields deterministic blockers instead of heuristic agent judgment. | pass | Deterministic blockers added for missing/stale executive-summary metadata/hash and failing/missing review rows. |
| SC5 | success_criterion | Healthy acceptance flow remains structurally compatible with existing signal/query workflow architecture. | pass | Workflow remains signal/query-only; no defineUpdate reintroduced; workflow tests and boundary checks passed. |
| AC1 | acceptance_criterion | `/adv-review` must persist and verify `contract.reviewMatrix`, generated `acceptance.md`, and `executive-summary.md` before presenting acceptance approval. | pass | adv-review docs require proof before prompt; workflow writes acceptance.md and verifies executive-summary hash; targeted and full tests passed. |
| AC2 | acceptance_criterion | Acceptance gate completion must fail with deterministic blockers when any required acceptance proof is missing, stale, failing, or not workflow-visible. | pass | gate-readiness and workflows.signal-handlers tests cover missing metadata/hash and stale executive-summary hash blockers. |
| AC3 | acceptance_criterion | `executive-summary.md` must be workflow-known acceptance evidence, not only a communication artifact. | pass | store-temporal metadata and activities tests prove executive-summary contentHash and inspection support; workflow readiness requires it. |
| AC4 | acceptance_criterion | Completed/poisoned workflow recovery must support audited repair for review matrix, executive summary, and acceptance gate completion. | pass | _recovery-writers, contract, change, and gate tests cover artifact metadata, review matrix, and acceptance gate recovery. |
| AC5 | acceptance_criterion | Recovery must require precise evidence, recovery rationale, and prior user approval evidence; no silent repair. | pass | gate and contract recovery tests require recoveryEvidence/recoveryReason/priorApprovalEvidence; missing audit fields reject recovery. |
| AC6 | acceptance_criterion | Chat approval alone must never mark acceptance done when required proof failed to persist. | pass | Acceptance gate completion blocks before done when proof missing/stale; chat approval alone cannot bypass readiness. |
| AC7 | acceptance_criterion | Healthy paths remain signal/query-only; no Temporal `defineUpdate` reintroduction. | pass | Workflow change surface remains signal/query-only; pnpm run check and workflow tests passed. |
| AC8 | acceptance_criterion | Specs and `/adv-review` docs encode the no-late-homework rule. | pass | advance-workflow spec, docs/adv-gates, and .opencode/command/adv-review updated; asset and citation tests passed. |
| AC9 | acceptance_criterion | Regression tests cover healthy path, missing evidence blockers, completed workflow recovery, poisoned recovery, and rejection without recovery evidence. | pass | Cross-path regression suite passed: 234 targeted tests across metadata, readiness/workflow, recovery, assets, and citations. |
| AC10 | acceptance_criterion | `pnpm run check`, `pnpm run build`, and relevant/full tests pass. | pass | Final verification passed after reviewer fixes: pnpm run check, pnpm run build, and pnpm test. |
| C1 | constraint | Specs are law: update `advance-workflow` before or with implementation. | respected | advance-workflow spec updated before/with implementation; spec JSON and citation invariant passed. |
| C2 | constraint | Required acceptance proof must be persisted and verified before acceptance approval prompt. | respected | No-late-homework order encoded in /adv-review and enforced by readiness/workflow before acceptance completion. |
| C3 | constraint | `executive-summary.md` is acceptance proof for this change's target behavior. | respected | executiveSummary metadata contentHash is required and executive-summary.md is inspected as acceptance proof. |
| C4 | constraint | Recovery must be explicit, audited, and evidence-gated. | respected | Recovery paths require explicit audit fields and recovery authorization before disk projection repair. |
| C5 | constraint | Do not silently mark acceptance done from chat approval alone when required proof failed to persist. | respected | Acceptance recovery rejects missing priorApprovalEvidence; workflow readiness blocks missing proof before approval can complete gate. |
| C6 | constraint | Preserve Temporal signal/query-only change workflow surface; do not reintroduce `defineUpdate`. | respected | No defineUpdate changes; Temporal workflow signal/query architecture preserved. |
| C7 | constraint | Use deterministic readiness blockers and typed evidence, not LLM judgment, for gate correctness. | respected | Correctness uses typed contract review matrix, artifact metadata hashes, and deterministic readiness blockers. |
| C8 | constraint | Do not require manual reads or edits under ADV state directories. | respected | Implemented tool-based recovery writers; no supported manual ADV state-file edit path introduced. |
| C9 | constraint | Keep release/archive ordering scope with `fixArchiveReleaseOrdering`; this change owns acceptance evidence only. | respected | Scope stayed on acceptance evidence/recovery; release/archive finalization sequencing was not changed. |
| DONT1 | avoidance | Manual ADV state-file editing as a supported repair path. | respected | No manual ADV state-file editing repair path added. |
| DONT2 | avoidance | Heuristic chat-history reconstruction as proof. | respected | Recovery requires structured evidence fields; no chat-history reconstruction used as proof. |
| DONT3 | avoidance | Caller-forged artifact metadata as authoritative evidence. | respected | Workflow/tool computes or validates contentHash; caller-forged metadata is not sole acceptance authority. |
| DONT4 | avoidance | Silent recovery without recovery evidence, user approval evidence, and rationale. | respected | Recovery requires recoveryEvidence, recoveryReason, and priorApprovalEvidence where applicable. |
| DONT5 | avoidance | Treating `executive-summary.md` as optional communication-only material for acceptance. | respected | executive-summary.md is now workflow-visible acceptance proof with hash metadata. |
| DONT6 | avoidance | Broad release/archive behavior changes unrelated to acceptance proof. | respected | No broad release/archive behavior changes made beyond acceptance proof references. |
| DONT7 | avoidance | New Temporal update handlers on change workflows. | respected | No Temporal update handlers added to change workflow. |
| OOS1 | out_of_scope | Fixing PokeEdge app logic or `fixSetPriceSorting` implementation. | not_applicable | PokeEdge app logic and fixSetPriceSorting implementation were not changed. |
| OOS2 | out_of_scope | Broad dirty-main checkpointing, worktree cleanup, or archive finalization sequencing. | not_applicable | Dirty-main checkpointing, worktree cleanup, and archive finalization sequencing were not changed. |
| OOS3 | out_of_scope | Reworking proposal/discovery/design/planning/execution gates except for shared evidence infrastructure needed by acceptance. | not_applicable | Proposal/discovery/design/planning/execution gates were not reworked beyond shared acceptance evidence infrastructure. |
| OOS4 | out_of_scope | Adding external services or dependencies. | not_applicable | No external services or dependencies added. |

