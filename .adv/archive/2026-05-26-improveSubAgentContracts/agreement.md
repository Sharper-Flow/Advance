# Agreement

## Objectives

1. Make sub-agent work packets explicit enough that workers do not infer task scope from chat history or test output.
2. Align report schemas, packet anchors, prompts, specs, and tests so worker report fields have clear sources.
3. Preserve strict identity validation for durable report persistence while allowing a compatible rollout for newly-added scope/done/stop anchors.
4. Give the orchestrator machine-readable worker output for files changed, verification evidence, blockers, scope drift, and required main-agent actions.
5. Keep scanner lanes distinct from persisted worker lanes.

## Acceptance Criteria

- AC1: Worker packets include first-class scope anchors: `TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, and `VERIFICATION`.
- AC2: Engineer reports structurally capture `scope_drift` and `required_main_agent_actions`, not only prose `follow_ups`.
- AC3: Legacy packets warn first during rollout; strict failure remains for identity anchors (`CHANGE`, `TASK`, `PHASE`, `ATTEMPT`, `WORKING DIRECTORY`).
- AC4: Out-of-scope findings use “finish owned scope if safe, then report” by default; stop immediately only for contract/security/release blockers.
- AC5: Verification commands are required when possible; workers may add extra checks.
- AC6: Asset/schema/spec tests prove schema ↔ packet ↔ prompt alignment for identity, scope, done, stop, and verification anchors.
- AC7: Scanner lanes remain non-persisted; only orchestrator-submitted scanner bundles use `adv_subagent_report_submit`.
- AC8: `adv_subagent_report_submit` report tool typing is checked so object payloads are not string-serialized by MCP/schema drift.

## Constraints

- C1: Do not weaken `INVALID_REPORT` validation for required identity fields.
- C2: Do not infer missing `task_id`, `phase`, `attempt`, `change_id`, or `workdir_used` heuristically for persistence correctness.
- C3: Keep worker and scanner transport lanes distinct.
- C4: Use structural mechanisms first: Zod schemas, packet builders/anchors, asset tests, specs, and command/prompt checks.
- C5: Preserve backward compatibility for existing/legacy packets where possible by warning first for newly-added non-identity anchors.
- C6: No nested sub-agent delegation.

## Avoidances

- DONT1: Do not make sub-agents discover their own ADV task IDs from global state.
- DONT2: Do not rely on final-message fenced JSON as ADV worker report transport.
- DONT3: Do not make explore/scanner lanes call `adv_subagent_report_submit` directly.
- DONT4: Do not expand into unrelated sub-agent quality or model-routing refactors.

## Preview Applicability

visual_surface: false

Rationale: This change affects ADV orchestration contracts, prompts, schemas, specs, and tests. It has no browser-visible UI or visual output surface.

## Decisions

### User Decisions

- Scope drift behavior: finish owned scope if safe, then report out-of-scope findings as main-agent actions.
- Rollout strictness: warn first for missing new scope/done/stop anchors; keep strict failure for existing identity anchors.
- Verification commands: required when possible, and workers may add relevant checks.

### Agent Decisions (LBP)

- Add first-class scope/done/stop anchors instead of relying on prose task descriptions.
- Extend engineer report schema toward reviewer parity for `scope_drift` and `required_main_agent_actions`.
- Pin schema ↔ packet ↔ prompt ↔ spec alignment with tests, matching existing project pattern in `getSubagentReportPacketAnchors` and asset tests.
- Treat `adv_subagent_report_submit` object serialization/type drift as an in-scope contract check.

## Deferred Questions

None.

## Sign-Off

User approved acceptance criteria with: `approve`.