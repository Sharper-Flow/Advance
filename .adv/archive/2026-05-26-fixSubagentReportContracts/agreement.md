# Agreement

## Objectives

- Restore reliable ADV readback for changes containing legacy sub-agent report records.
- Preserve strict validation for new `adv_subagent_report_submit` payloads.
- Define a supported durable persistence model for acceptance-stage reviewer reports.
- Align schemas, tool diagnostics, command packets, agent prompts, specs, and tests.
- Prevent repeated worker retry loops caused by unsupported synthetic task IDs.

## Acceptance Criteria

- AC1: Legacy task and sidecar sub-agent reports missing `scope_drift` and/or `required_main_agent_actions` load with safe defaults.
- AC2: `adv_change_show` and `adv_gate_status` work on changes containing those legacy reports.
- AC3: New malformed report submissions remain rejected by strict Zod validation.
- AC4: Acceptance-stage reviewer reports persist reliably through a supported structural anchor model; no synthetic task IDs.
- AC5: Invalid task anchors return actionable diagnostics with valid anchor guidance.
- AC6: Worker prompts/examples use structural `scope`; string `scope` remains compatibility-only.
- AC7: Specs and tests cover legacy normalization, accepted task reports, invalid anchors, acceptance-review anchoring, and prompt/schema alignment.

## Constraints

- C1: Preserve Temporal replay safety and legacy compatibility (`rq-subagentReports09`).
- C2: Preserve strict Zod validation for new payloads (`rq-subagentReports01`).
- C3: Use explicit deterministic normalization; no heuristic inference of identity anchors.
- C4: Keep scanner lanes non-persisted unless an orchestrator-submitted scanner bundle is explicitly used.
- C5: Coordinate with `fixTaskCompletion` only where touched task/report consumers overlap; do not solve task-completion semantics here.

## Avoidances

- DONT1: Do not require manual ADV state-file edits as the normal recovery path.
- DONT2: Do not persist reviewer reports against fabricated task IDs.
- DONT3: Do not weaken strict validation to make malformed new reports pass.
- DONT4: Do not broaden into a rewrite of delegation architecture or the seven-gate lifecycle.
- DONT5: Do not silently treat string `scope` as the preferred new-report shape.

## Out of Scope

- OOS1: Broad rewrite of ADV delegation or sub-agent architecture.
- OOS2: Task completion ownership/semantics owned by `fixTaskCompletion`.
- OOS3: Adding unrelated sub-agent report variants.
- OOS4: Manual mutation of external ADV state files as the intended fix path.
- OOS5: Broad scanner/handoff persistence refactor beyond clarifying current persisted vs non-persisted lanes.

## Preview Applicability

visual_surface: false

Rationale: This change affects ADV schemas, storage/readback, tool diagnostics, command contracts, prompts, specs, and tests. It has no browser-visible or visual UI surface.

## Decisions

### User Decisions

- Acceptance-stage reviewer reports should persist reliably as durable ADV artifacts.
- Legacy/corrupted report readback should auto-normalize safely; ordinary read tools should not require manual state-file repair.
- Worker prompts/examples should deprecate string `scope` now while parser/readback compatibility remains for legacy records.

### Agent Decisions (LBP)

- Normalize legacy persisted records at a structural read boundary before strict whole-change parsing, while keeping new tool-call submission validation strict.
- Use structural diagnostics for invalid task anchors so workers and orchestrators receive actionable recovery guidance instead of generic unexpected errors.
- Update prompt/spec/asset tests together; report schemas and worker packets must evolve as one contract.
- No external solution research is needed; this is an internal Zod/Temporal/prompt contract alignment bug.

## Deferred Questions

- Exact design of durable acceptance-review anchoring: change-scoped reviewer variant vs dedicated review task vs another structural mechanism. This is deferred to `/adv-design` because it is an internal architecture decision with no user-facing preference remaining.
- Exact normalization implementation site: schema preprocess vs storage adapter vs workflow projection. Deferred to `/adv-design` for source-local architecture selection.

## Sign-Off

User approved the acceptance criteria and agreement via chat: `approve`.
