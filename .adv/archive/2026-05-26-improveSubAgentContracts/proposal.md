# Proposal: Improve sub-agent contracts

## Problem
Recent engineer sub-agent work required too much self-discovery to determine task scope, target files, verification expectations, and how to report results back to ADV. The sub-agent transcript shows repeated local inference about what remains in scope, what to test, and how to summarize completion.

## Scope
Affected ADV surfaces likely include:

- `plugin/src/types.ts` and `plugin/src/types/subagent-reports.ts` report schemas and packet-anchor metadata
- `plugin/src/tools/subagent-report.ts` report ingest and validation behavior if schema/tool typing needs tightening
- `.opencode/agents/adv-engineer.md` and `.opencode/agents/adv-reviewer.md` worker prompts
- `.opencode/command/adv-apply.md`, `.opencode/command/adv-review.md`, `.opencode/command/adv-harden.md`, `.opencode/command/adv-discover.md`, and `.opencode/command/adv-design.md` packet templates
- `docs/agent-tool-contracts.md` and related ADV operating docs
- `plugin/src/*assets*.test.ts`, `plugin/src/types/subagent-reports.test.ts`, and related schema/asset tests
- `.adv/specs/subagent-reports/spec.json` and `.adv/specs/delegation-defaults/spec.json`

## Success Criteria
- Sub-agents receive explicit, structured task scope instead of inferring it from prior chat.
- Required report identity fields (`change_id`, `task_id`, `phase`, `attempt`) are always supplied by orchestrator-owned packets.
- Reports return machine-consumable evidence: files changed, verification run/results, blockers, scope drift, and required main-agent actions.
- Missing required packet/report fields fail via schema/test validation, not hidden heuristics.
- Engineer/reviewer prompts describe exactly how to map packet anchors into `adv_subagent_report_submit`.

## Failure handling
- If a worker packet omits required identity/scope anchors, worker should report a packet-defect instead of guessing.
- If `adv_subagent_report_submit` rejects a report, orchestrator fixes packet/schema/prompt alignment; validation must not be weakened.
- If a worker finds out-of-scope failures, it reports them as `required_main_agent_actions` instead of silently expanding scope.

## Discovery Findings

### Current State
- `plugin/src/types/subagent-reports.ts` already has strict Zod report schemas and packet-anchor metadata for `CHANGE`, `TASK`, `PHASE`, `ATTEMPT`, `SCOPE KEY`, and `WORKING DIRECTORY`.
- `docs/agent-tool-contracts.md` already defines schema ↔ packet ↔ prompt ↔ tests ↔ specs as the contract checklist.
- `adv-apply.md` Apply Context Packet includes `WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`, `AFFECTED FILES`, `PROJECT STRUCTURE`, `DESIGN EXCERPT`, `ACCEPTANCE CRITERIA`, and `EXPECTED OUTPUT`.
- `adv-engineer.md` has Scope Lock, Working Directory Lock, Drift Guardrails, and an `ENGINEER_REPORT` payload, but `scope` remains a prose string and the schema lacks reviewer-like `scope_drift` and `required_main_agent_actions` fields.
- `adv-review.md` and `adv-harden.md` remediation packets include `SCOPE`, `FINDINGS TO FIX`, and `ACCEPTANCE CRITERIA`, but do not spell out finding-list-specific `DONE WHEN` / `STOP WHEN` rules.
- `adv-discover.md` / `adv-design.md` researcher packet examples are lighter than the contract checklist and should be aligned if the packet contract expands.

### Gaps
- No first-class `TASK_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, `OUT_OF_SCOPE`, or `VERIFICATION_COMMANDS` packet anchors.
- Engineer report schema cannot structurally distinguish scope drift, blocker, follow-up, and required main-agent action as clearly as reviewer reports.
- Asset tests verify core identity anchors, but not done/stop/scope-boundary coverage across all worker packets.
- The transcript failure mode is mostly a boundary/done-condition gap, not a missing identity-field gap.

### Edge Cases
- Worker receives valid `TASK` and `ATTEMPT` but no usable owned-file or out-of-scope boundary list.
- Architecture guard or test output lists many failures outside task scope; worker must know whether to fix, report, or stop.
- Verification command supplied by orchestrator is stale or too narrow; worker needs rule for substituting or adding evidence.
- Report submission rejects payload because report schema/tool schema drifted; orchestrator must repair contract, not ask worker to infer missing fields.

### Related Pattern Scan
- Existing recurring pattern: packet anchors derive from strict report schemas via `getSubagentReportPacketAnchors` and are checked in asset tests.
- Existing asymmetry: reviewer reports have `scope_drift` and `required_main_agent_actions`; engineer reports have only `blockers`, `follow_ups`, and prose `context_update_for_adv`.
- Existing scanner lane distinction is sound: explore scanners are non-persisted; scanner bundle is orchestrator-submitted.

### Opportunity Scout
Auto-adopted:
- Add first-class task-scope packet blocks.
- Add engineer schema parity for scope drift / required main-agent actions.
- Add `DONE WHEN` / `STOP WHEN` packet anchors and prompt enumeration.
- Extend spec/tests to pin scope/done/stop anchors.

Design-around:
- Decide whether `VERIFICATION_COMMANDS` are mandatory or advisory; stale commands can block useful worker judgment.

### AMBIGUITY ANALYSIS
Coverage: B:P F:C S:P M:C

- B1 MEDIUM Boundaries — Packet scope boundaries are proposed but exact fail-fast behavior needs user preference.
  Evidence: "If a worker finds out-of-scope failures, it reports them as `required_main_agent_actions` instead of silently expanding scope."
  Reason: unclear whether worker stops immediately or finishes owned scope first.
- S1 MEDIUM Completion Signals — Verification command behavior needs preference.
  Evidence: "verification expectations" and proposed `VERIFICATION_COMMANDS` are mentioned, but mandatory/advisory behavior is not fixed.
  Reason: stale commands can cause false blockers if treated as absolute.

## Proposed direction
Make ADV sub-agent dispatch and return contracts explicit and schema-backed:

- Define a structured worker context packet that includes change, task, attempt, phase, working directory, task list/scope, acceptance criteria, required/forbidden files or tokens when applicable, verification expectations, and report obligations.
- Improve typed report schemas so engineer/reviewer reports capture completed work, scoped files changed, verification evidence, remaining blockers, scope drift, and recommended orchestrator actions.
- Align prompts, command contracts, schemas, tool docs, specs, and tests so missing required anchors fail structurally rather than forcing sub-agents to infer.

## Non-goals
- Do not weaken report validation to accept incomplete packets.
- Do not rely on prose-only conventions where schema/test enforcement is possible.
- Do not add nested sub-agent delegation.
- Do not make scanner lanes call `adv_subagent_report_submit` directly.