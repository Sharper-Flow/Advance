# Acceptance

Reviewed at: 2026-06-20T05:18:20.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Agents can find active ops/enabler follow-ups from relevant ADV state without agenda archaeology. | pass | adv-reviewer acceptance report verdict READY; adv_change_show/adv_change_list/adv_wip_state expose structural ops follow-up readback; bin/oc-test full passed. |
| SC2 | success_criterion | Parent changes can release with explicit surviving ops obligations when release-first sequencing is required. | pass | Release/archive handoff tests passed in bin/oc-test full; archive output surfaces open non-blocking obligations. |
| SC3 | success_criterion | Ops follow-up state is clear enough for agents to know whether work is not started, running/partial, failed, rerun-needed, cleanup-needed, or complete. | pass | src/tools/ops-evidence.test.ts and full suite passed; reviewer targeted ops evidence/gate tests passed. |
| SC4 | success_criterion | Required in-scope release-safety obligations remain blocking; release-first follow-ups become explicit linked obligations, not silent backlog notes. | pass | Gate-readiness tests passed; existing required-critical coverage preserved; full suite passed. |
| AC1 | acceptance_criterion | Linked ops/enabler work persists structural source provenance: originating change/report/agenda source, relationship, status, and timestamp in authoritative workflow state. | pass | Ops follow-up schemas/signals/reducer tests passed; ChangeSchema includes typed source, relationship, status, timestamps. |
| AC2 | acceptance_criterion | Report/agenda follow-up promotion preserves typed provenance; free-text agenda descriptions are not the sole source of truth. | pass | adv_followup_promote tests and subagent-report promotion paths passed; source identity uses report/agenda/manual structural fields. |
| AC3 | acceptance_criterion | Light evidence entries support env, action/batch, status, timestamp, evidence summary, and next step or completion signal. | pass | adv_ops_evidence_add tests passed; schema supports env, action, batch, status, summary, next_step, completion_signal, recorded_at/id. |
| AC4 | acceptance_criterion | Evidence state supports partial, failed, rerun-needed, rollback/cleanup-needed, and complete outcomes. | pass | Ops evidence/status enum tests passed for partial, failed, rerun_needed, rollback_needed, cleanup_needed, complete. |
| AC5 | acceptance_criterion | Parent release/archive reporting surfaces open linked ops obligations and records explicit handoff for non-blocking release-first work. | pass | Archive/release handoff tests passed; change archive output includes open ops obligations. |
| AC6 | acceptance_criterion | Blocking linked obligations prevent release; non-blocking release-first obligations do not block once explicit handoff is recorded. | pass | temporal/gate-readiness and tools/gate.release-enforcement tests passed; full suite passed. |
| AC7 | acceptance_criterion | Planning/WIP collision checks surface active linked ops work from structural state or Visibility-backed discovery, not agenda text search. | pass | backlog/wip readback tests passed; compact ops annotations derive from structural state/projections. |
| AC8 | acceptance_criterion | Same-project and cross-project follow-up links support finding child/follow-up work from the parent/source context. | pass | adv_followup_promote creates child profile and parent/source link with target project/path fields; reviewer verdict READY. |
| AC9 | acceptance_criterion | Existing required-critical obligation enforcement from `enforceCriticalOpsPlanning` remains intact. | pass | Full suite passed; existing enforceCriticalOpsPlanning/checkCriticalOpsCoverage tests remain green. |
| AC10 | acceptance_criterion | Specs and tests cover linked provenance, promotion, evidence state, release handoff, planning/WIP visibility, and backward compatibility. | pass | Spec asset tests, schemas:check, pnpm run check, pnpm run build, and bin/oc-test full passed. |
| C1 | constraint | Do not turn ADV into a project-manager clone. | respected | Design/implementation uses normal ADV changes plus lightweight ops profile, not a separate project-management object. |
| C2 | constraint | Do not make every linked ops follow-up a release blocker. | respected | Gate-readiness tests distinguish blocks vs follows_release/monitors/cleanup_after. |
| C3 | constraint | Do not rely on agenda scanning as the source of truth. | respected | Promotion/readback uses typed source/link/evidence schemas; agenda ID only legacy/fallback provenance. |
| C4 | constraint | Do not require active human bookkeeping. | respected | Tools create/update links and evidence structurally; no manual bookkeeping workflow required after promotion/evidence append. |
| C5 | constraint | Do not make the model infra-specific; it must cover migrations, backfills, deploy config, monitoring, cleanup, teardown, docs, and similar enablers. | respected | OpsFollowupKind covers migration/backfill/deploy_config/monitoring/cleanup/teardown/docs/other-like enablers without product-specific fields. |
| C6 | constraint | Preserve structural correctness: typed state and validated transitions over title/priority heuristics. | respected | Zod schemas, workflow signals, reducers, and tests own transitions; title matching not used for correctness. |
| C7 | constraint | Preserve existing human checkpoints and approval boundaries. | respected | No human checkpoint or approval-boundary changes introduced; ADV gates unchanged. |
| C8 | constraint | Keep the operational evidence record light but durable. | respected | Evidence schema is append-only and compact; no heavyweight runbook system introduced. |
| C9 | constraint | Relationship labels are agent-context labels; exact enum names are design-owned and do not need to optimize for user-facing copy. | respected | Relationship enum labels are agent-context labels: blocks, follows_release, monitors, cleanup_after. |
| C10 | constraint | Design must evaluate whether a runbook-like model helps without creating heavyweight bookkeeping. | respected | Design evaluated runbook-shaped evidence and chose lightweight evidence entries only. |
| DONT1 | avoidance | Do not use agenda text search as the correctness authority for active ops obligations. | respected | Readback/promotion paths use typed state and source IDs; no agenda text search authority added. |
| DONT2 | avoidance | Do not rely on heuristic title matching for dependency or collision correctness. | respected | Duplicate promotion uses structural source identity, not title similarity. |
| DONT3 | avoidance | Do not require humans to maintain links/status manually after agents create the relationship. | respected | Promotion/evidence tools update authoritative state automatically. |
| DONT4 | avoidance | Do not demote required ops/enabler work into untracked backlog notes. | respected | Required follow-ups can become linked ADV changes with ops profile and release handoff. |
| DONT5 | avoidance | Do not block release when deployment-first sequencing is explicitly required and a surviving linked obligation is recorded. | respected | Gate-readiness tests allow non-blocking release-first links with handoff. |
| DONT6 | avoidance | Do not add new KeywordList search attributes unless an existing KeywordList is intentionally displaced. | respected | No new KeywordList search attribute introduced; Visibility remains advisory/minimal. |
| DONT7 | avoidance | Do not use Temporal Memo for filterable relationship/collision data. | respected | Filterable/collision state remains in workflow/projections/search attributes; Temporal Memo not used for correctness. |
| OOS1 | out_of_scope | Building a general project-management system. | respected | No general project-management system added. |
| OOS2 | out_of_scope | Replacing GitHub Issues, GitHub Projects, or external incident/runbook tooling. | respected | No GitHub Issues/Projects or incident/runbook replacement built. |
| OOS3 | out_of_scope | Modeling every optional advisory follow-up as a required obligation. | respected | Only promoted/linked ops follow-ups get profile; optional advisory items not all required. |
| OOS4 | out_of_scope | Making all parent changes wait for all follow-ups before release. | respected | Release logic distinguishes blocking from non-blocking links. |
| OOS5 | out_of_scope | Implementing product-specific PokeEdge migration logic. | respected | No PokeEdge-specific migration logic present. |
| OOS6 | out_of_scope | Designing or running product-specific migrations/backfills. | respected | No product-specific migrations/backfills designed or run. |

