# Design

## Architecture Overview

This change treats sub-agent report integrity as a source-asset contract:

```
Zod report schema
  → report-field classification / context-anchor contract
  → command context packet fences
  → agent prompt instructions
  → asset/schema tests
  → spec-law anchors + durable doc/skill guidance
```

Strict runtime ingest stays unchanged. The fix makes the prompt/packet surfaces structurally match the already-strict schemas instead of weakening validation.

## Key Decisions

### D1 — Split scanner packets from remediation worker packets

- Keep `/adv-review` and `/adv-harden` scanner packets for `explore` only.
- Add explicit fenced remediation worker packets at the remediation spawn sites.
- Reviewer remediation packets include `PHASE: review` or `PHASE: harden`.
- Engineer remediation packets mirror the apply packet shape and omit `PHASE` because `ENGINEER_REPORT` has no phase field.

Rationale: scanner workers produce dimension JSON and do not own typed persistence. Remediation workers submit typed reports and require task identity.

### D2 — Use schema-adjacent field classification, not scattered hardcoded anchor lists

Create a small test-facing contract near sub-agent report types that classifies required report fields:

- `packet_anchor`: field must be present in spawn context packet.
- `worker_derived`: field is produced by the worker from its work/output.
- `tool_enriched`: field may be added by submit consumers.

Asset tests derive required keys from `EngineerSubagentReportSchema` / `ReviewerSubagentReportSchema`, then require every required key to be classified. Packet-anchored fields must map to command packet anchors.

This avoids a second silent required-field list. New required schema fields force a classification/test update.

### D3 — Tests own recurrence prevention

Add or extend asset tests so they verify:

- Apply packet still satisfies `adv-engineer` packet anchors.
- Review/harden reviewer remediation packets satisfy reviewer packet anchors.
- Review/harden engineer remediation packets satisfy engineer packet anchors.
- Review/harden scanner packet sections do not mention `adv_subagent_report_submit`, `ENGINEER_REPORT`, or `REVIEWER_REPORT`.
- Agent prompts mention required packet-derived fields (`attempt`, `task_id`/`TASK`, `phase` for reviewer, `WORKING DIRECTORY`).
- Spec assets include the new packet/lane requirements.

### D4 — Update spec law with packet/lane contract

Add `rq-subagentReports05` for context-packet field coverage. Amend existing `subagent-reports` and `delegation-defaults` requirements/tests so spec law matches current strict schema reality:

- `ATTEMPT` remains required.
- `TASK`/`task_id` is required for typed persisted workers.
- `PHASE` is required for `adv-reviewer` report-producing workers.
- Scanner lanes are non-persisted unless explicitly wrapped by a future typed report design.

### D5 — Add durable agent-callable tool contract guidance

Add `docs/agent-tool-contracts.md` with the repeatable checklist:

1. Define/inspect the machine schema.
2. Classify each required field by source: packet, worker-derived, tool-enriched, or explicit exemption.
3. Ensure command packets contain packet-sourced fields.
4. Ensure agent prompts instruct how to populate schema fields.
5. Add asset/schema tests and spec anchors.
6. Keep scanner/advisory outputs distinct from persisted typed reports.

Add a repo-owned globally synced skill, `skills/adv-agent-tool-contracts/SKILL.md`, because the closest conceptual skill (`customize-opencode`) is built-in and not repo-owned here. The skill triggers on agent-callable tools, sub-agent context packets, MCP/ADV tool contracts, and report schemas, then points to the durable doc. Add an asset test so the doc/skill link and checklist anchors cannot drift.

### D6 — Include only adjacent guardrails with direct type-safety payoff

Adopt:

- Exhaustive `switch` for `blockerSummary` over the supported report discriminator, with `never` default.
- Narrow `consumer_warnings` validation test for submit-consumer enrichment shape.

Reject:

- Full runtime re-parse of enriched reports after `consumer_warnings` merge. It is heavier than needed and not the same bug class.

## ADR Drafts

None. Decisions are local, reversible, and documented in design/spec/tests rather than an ADR.

## Implementation Strategy

1. Add report context contract helper/test utilities near `plugin/src/types/subagent-reports.ts`.
   - Derive required schema keys in tests.
   - Classify packet-sourced fields and map them to packet anchors.
2. Update command packets.
   - Rename/clarify scanner packets as scanner-only for review/harden.
   - Add fenced remediation worker packets for review/harden reviewer and engineer paths.
   - Keep apply packet as reference and ensure tests cover it.
3. Update agent prompts only where needed.
   - Ensure `adv-reviewer` explicitly expects `TASK`, `PHASE`, `ATTEMPT`, `WORKING DIRECTORY`.
   - Ensure `adv-engineer` continues to expect `TASK`, `ATTEMPT`, `WORKING DIRECTORY`.
4. Update specs and spec-asset tests.
   - Add `rq-subagentReports05`.
   - Amend delegation-defaults requirement text/tests for packet coverage and scanner/worker lane distinction.
5. Add doc + skill.
   - `docs/agent-tool-contracts.md`.
   - `skills/adv-agent-tool-contracts/SKILL.md`.
   - Asset test pinning doc/skill checklist anchors and global-sync expectation.
6. Add adjacent guard tests/refactor.
   - Exhaustive `blockerSummary` switch.
   - Consumer warning schema-focused test.
7. Verify.
   - Focused tests: subagent report type/tool tests, engineer/reviewer asset tests, spec asset tests, new doc/skill asset test, relevant Temporal state test.
   - `pnpm run check` from `plugin/`.

## LBP Analysis

This is the preferred long-term approach because correctness remains structural and local:

- Schemas stay strict.
- Command packets are explicit source assets.
- Tests bridge schemas ↔ packets ↔ prompts ↔ specs.
- The new doc/skill gives future work a repeatable checklist without making prose the enforcement mechanism.
- Runtime packet generation is avoided because the current source-asset test layer is cheaper, clearer, and sufficient for this drift class.

## Affected Components

- Report schemas / typed report helpers:
  - `plugin/src/types/subagent-reports.ts`
  - `plugin/src/types/subagent-reports.test.ts`
- Submit and workflow handling:
  - `plugin/src/tools/subagent-report.ts`
  - `plugin/src/tools/subagent-report.test.ts`
  - `plugin/src/temporal/change-state.ts`
- Command contracts:
  - `.opencode/command/adv-apply.md`
  - `.opencode/command/adv-review.md`
  - `.opencode/command/adv-harden.md`
- Agent prompts:
  - `.opencode/agents/adv-engineer.md`
  - `.opencode/agents/adv-reviewer.md`
- Spec laws/tests:
  - `.adv/specs/subagent-reports/spec.json`
  - `.adv/specs/delegation-defaults/spec.json`
  - `plugin/src/subagent-reports-spec-assets.test.ts`
  - `plugin/src/delegation-matrix.test.ts`
- Asset tests:
  - `plugin/src/adv-engineer-assets.test.ts`
  - `plugin/src/adv-reviewer-asset.test.ts`
  - new/updated doc-skill asset test
- Durable guidance:
  - `docs/agent-tool-contracts.md`
  - `skills/adv-agent-tool-contracts/SKILL.md`

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Zod shape introspection becomes brittle | Use introspection only in tests; keep field classification compact and type-checked. |
| Asset tests become over-specific | Assert anchors and lane boundaries, not full packet text. |
| Skill proliferation | New skill stays short and links durable doc; trigger description narrow to agent-callable tools/sub-agent contracts. |
| Scope creep into full delegation redesign | Keep changes local to packet/report/doc/spec/test surfaces. |
| Built-in `customize-opencode` is not repo-owned | Use repo-owned bundled skill and document the limitation per OOS3. |

## Design Leverage Scout

Candidates considered: 5.

Auto-adopted:

- Test-time required-key classification derived from Zod schemas.
- Explicit fenced remediation worker packets in review/harden command files.
- Exhaustive `blockerSummary` switch for supported report discriminator.
- Dedicated `docs/agent-tool-contracts.md` + repo-owned globally synced `adv-agent-tool-contracts` skill.

Rejected:

- Runtime re-parse of fully enriched reports after `consumer_warnings` merge. Use narrower warning-shape tests instead.

Surface-to-user outcome:

- Dedicated skill chosen without another prompt. This is an internal architecture choice, not a user-value tradeoff; it best satisfies AC8 while respecting OOS3.

## Independent Validator Result

Verdict: VALIDATED.

Findings:

- Correctness: design closes the actual contract gap. Evidence: report schemas require `task_id`, `attempt`, reviewer `phase`; current review/harden scanner packets lack `TASK`/`PHASE` while remediation routes to typed report workers.
- Simplicity: no simpler approach found that satisfies AC4 and AC8. Runtime packet generation and full enriched-report re-parse are heavier than needed.
- Spec-law compliance: additive updates; no contradiction with `subagent-reports` or `delegation-defaults` laws.
- Alternative watch item: keep asset tests anchored on stable section markers and key labels rather than free-form prose.

Recommendation: proceed to planning. No design rework needed.

## Contract-Compromise Risk Assessment

No contract-compromise risk identified. The design satisfies AC1-AC8 without weakening constraints or avoidances.