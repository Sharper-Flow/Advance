# Design

## Architecture Overview

Implement sub-agent contract clarity by extending the existing schema → packet → prompt → spec → test loop rather than adding a parallel orchestration path.

Current ADV already has strong foundations:

- report schemas in `plugin/src/types/subagent-reports.ts`
- packet-anchor derivation through `SUBAGENT_REPORT_FIELD_SOURCES` and `getSubagentReportPacketAnchors`
- worker prompts in `.opencode/agents/adv-engineer.md` and `.opencode/agents/adv-reviewer.md`
- command packet templates in `.opencode/command/adv-apply.md`, `.opencode/command/adv-review.md`, and `.opencode/command/adv-harden.md`
- specs in `.adv/specs/subagent-reports/spec.json` and `.adv/specs/delegation-defaults/spec.json`
- asset/schema tests that already pin identity anchors

The design extends those same surfaces with explicit scope/done/stop/verification contract fields.

## Key Decisions

### 1. Add structured packet anchors, not prose-only guidance

Worker packets will include first-class sections:

```text
TASK_SCOPE:
  task_id: {task-id}
  objective: {one-line objective}
  in_scope:
    - {file/glob/component/finding}
  out_of_scope:
    - {boundary or OOS*/DONT* ref}
DONE_WHEN:
  - {condition}
STOP_WHEN:
  - {condition}
VERIFICATION:
  required_when_possible:
    - {command or check}
  optional_additional_checks: true
```

Existing identity anchors remain mandatory and strict: `WORKING DIRECTORY`, `CHANGE`, `TASK`, `PHASE` when applicable, and `ATTEMPT`.

### 2. Warn-first rollout for new non-identity anchors

Missing new scope/done/stop/verification anchors should produce warnings during rollout while identity anchors remain strict. This preserves compatibility with existing packet templates and histories while still surfacing defects.

Rollout exit criterion: once all owned packet templates, prompts, specs, and asset tests include the new anchors, prep should add a task or acceptance check to promote missing new anchors from warning to strict validation where safe. Warn-first is a migration state, not permanent slack.

### 3. Extend engineer reports toward reviewer parity

Engineer report schema should gain structured fields for:

- `scope_drift`: nullable object reusing or adapting `ReviewerScopeDriftSchema`
- `required_main_agent_actions`: array of orchestrator actions

Keep `context_update_for_adv` as a continuation hint. Use `required_main_agent_actions` only for action items the orchestrator must handle.

### 4. Keep scanner lanes non-persisted

Explore scanner packets may get clearer scope/done/stop language, but scanners still do not call `adv_subagent_report_submit`. Only orchestrator-submitted scanner bundles are persisted.

### 5. Treat report tool object typing as a contract surface

The observed researcher scout attempt reported `adv_subagent_report_submit` receiving a string instead of an object. Design includes a schema/tool contract test ensuring the tool argument schema exposes `report` as an object-like payload and rejects string-serialized reports deterministically.

### 6. Avoid a broad packet-renderer rewrite in this change

A single packet renderer would reduce markdown-template duplication, but it is a wider architecture move because command packets currently live as markdown contracts. This change should pin expanded anchors with asset tests and may pilot a small helper only if it stays local and low-risk. A broad renderer can be a follow-up.

## ADR Drafts

None. The decisions are additive extensions to existing ADV contract architecture, not hard-to-reverse architectural pivots.

## Implementation Strategy

1. **Spec first**
   - Extend `.adv/specs/subagent-reports/spec.json` with a requirement for scope/done/stop/verification anchors.
   - Extend `.adv/specs/delegation-defaults/spec.json` packet contracts for task-scoped workers and relevant scanner bundles.

2. **Schema and helper types**
   - Add structural constants for new packet anchors near `SUBAGENT_REPORT_PACKET_ANCHORS`.
   - Keep identity anchors separate from warn-first non-identity anchors so strictness can differ.
   - Add engineer report fields for `scope_drift` and `required_main_agent_actions`.
   - Reuse or adapt `ReviewerScopeDriftSchema` to avoid creating two divergent drift models.
   - Add/update validation tests in `plugin/src/types/subagent-reports.test.ts`.

3. **Tool schema hardening**
   - Inspect `adv_subagent_report_submit` tool argument schema in `plugin/src/tools/subagent-report.ts` / registry binding.
   - Add tests that object payloads validate as objects and string payloads fail as `INVALID_REPORT` rather than being accepted or misrouted.

4. **Command packet templates**
   - Update Apply Context Packet with `TASK_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, and `VERIFICATION` sections.
   - Update review/harden remediation packets similarly, including finding-list-specific done rules.
   - Update discovery/design researcher packet templates if anchor expansion applies to change-scoped workers.
   - Add asset tests so packet-template drift is caught even while packets remain markdown contracts.
   - Add canonical anchor-ordering assertions so packet parsers and prompts do not silently drift.

5. **Worker prompts**
   - Update `adv-engineer.md` to map new packet sections into report fields.
   - Update `adv-reviewer.md` where remediation packets should share scope/done/stop semantics.
   - Preserve packet-defect policy for missing identity anchors.
   - Add explicit default: finish owned scope if safe, then report out-of-scope findings; stop immediately for contract/security/release blockers.

6. **Asset tests**
   - Extend existing asset tests or add a new packet-contract asset test to validate all packet templates include required identity plus new non-identity anchors.
   - Add prompt tests proving workers mention `TASK_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, `VERIFICATION`, `scope_drift`, and `required_main_agent_actions`.
   - Add scanner-lane tests that scanners remain non-persisted.

## LBP Analysis

Best long-term path is structural expansion of the current contract spine. It preserves existing ADV invariants:

- Zod/schema validation owns persistence correctness.
- Packet anchors supply schema-derived identity instead of worker discovery.
- Prompts explain mapping but do not become sole source of truth.
- Specs record behavior as capability law.
- Asset tests prevent prompt/packet/schema drift.

Alternatives rejected:

- **More prose in worker prompt only** — cheaper, but repeats the failure mode: correctness depends on instruction recall.
- **Let workers query ADV state for missing task context** — violates the agreement avoidances and makes workers mini-orchestrators.
- **Relax report validation** — hides packet defects and weakens persistence correctness.
- **Broad packet-renderer rewrite now** — high leverage, but wider than needed for this contract fix; keep as follow-up/pilot unless prep proves it small.

## Affected Components

- `plugin/src/types/subagent-reports.ts`
- `plugin/src/tools/subagent-report.ts`
- `plugin/src/tool-registry.ts` if argument schema binding requires adjustment
- `.opencode/agents/adv-engineer.md`
- `.opencode/agents/adv-reviewer.md`
- `.opencode/command/adv-apply.md`
- `.opencode/command/adv-review.md`
- `.opencode/command/adv-harden.md`
- `.opencode/command/adv-discover.md` / `.opencode/command/adv-design.md` for researcher packet consistency if needed
- `docs/agent-tool-contracts.md`
- `.adv/specs/subagent-reports/spec.json`
- `.adv/specs/delegation-defaults/spec.json`
- asset/schema tests under `plugin/src/*assets*.test.ts` and `plugin/src/types/subagent-reports.test.ts`

## Risks / Mitigations

- **Risk: legacy packets fail too early.** Mitigation: warn-first rollout for new non-identity anchors; keep identity anchors strict; define strictness-promotion exit criterion.
- **Risk: verification commands become stale.** Mitigation: required when possible, worker may add checks and report command blockers.
- **Risk: scope blocks useful campsite fixes.** Mitigation: finish owned scope if safe, report out-of-scope actions; stop only for contract/security/release blockers.
- **Risk: schema expansion breaks legacy report consumers.** Mitigation: additive fields with compatibility tests and sidecar/task readback checks.
- **Risk: scanner lane accidentally becomes persisted worker lane.** Mitigation: explicit scanner tests and delegation-default spec coverage.
- **Risk: packet anchor duplication remains costly.** Mitigation: asset tests first; broad renderer follow-up if duplication causes implementation friction.

## Design Leverage Scout

Validator/scout pass returned `VALIDATED` design leverage findings:

Auto-adopted:

- Reuse reviewer drift shape for engineer scope-drift parity.
- Extend anchor constants/metadata for new scope/done/stop/verification packet sections while separating strict identity anchors from warn-first anchors.
- Harden `adv_subagent_report_submit` object typing and make probe/string payload failures visible.
- Reuse existing drift recommendation semantics for finish-owned-scope vs stop-and-report behavior.

Design-around / follow-up:

- Broad packet-renderer helper has high payoff but wider scope. Pilot only if local and low-risk; otherwise create fast-follow after this change.

Scout transport note: `adv_subagent_report_submit` rejected researcher report payload as string-serialized object; this reinforces AC8 and should be tested/fixed in execution.

## Validator Result

VALIDATED.

Findings:

- Correctness: design maps all ACs to existing extension points.
- Simplicity: additive extension is simpler than a broad renderer rewrite or prose-only patch.
- Spec-law compliance: no conflict with `subagent-reports` or `delegation-defaults`; extensions are additive and preserve scanner separation and identity-anchor strictness.
- Alternative: broad typed packet renderer is the main future alternative; defer or pilot locally. Validator recommended adding rollout exit criterion and canonical anchor ordering tests; both are incorporated above.