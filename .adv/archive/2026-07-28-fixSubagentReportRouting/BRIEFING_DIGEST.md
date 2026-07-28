# Archive Briefing Digest

**Change ID:** fixSubagentReportRouting
**Title:** Fix subagent report routing
**Status:** archived
**Generated:** 2026-07-28T06:52:07.163Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

Epic: optimizeAdvToolSurface · Fix sub-agent report/test routing contract (order 4)

## Durable Facts

Showing 8 of 8 durable facts.

- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift. AC7 fixture evidence is within agreed scope.
- **[archive_only_evidence]** verification: tests_run=npx vitest run src/agent-prompt-policy-binding.test.ts -t "AC7 pre-rewrite evidence" results=pass — 4/4 AC7 fixture tests pass (adv_run_test runId tr_ms3xyvli_a481a445). Guard correctly flags pre-rewrite violation patterns: bare imperative direct calls to adv_subagent_report_submit and adv_run_test in prose outside code fences.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx vitest run src/agent-prompt-policy-binding.test.ts -t "AC7 pre-rewrite evidence"
- **[archive_only_evidence]** decisions: Rewrote every non-Tier-1 ADV tool prose reference to adv_tool_invoke({name, args}) form across the 8 in-scope sub-agent prompts. — AC5/AC1 binds prompt-body call instructions to AGENT_TOOL_POLICY; tools outside the Tier-1 allowed set must be dispatched through the Tier-3 invoke surface so prose cannot drift from the role firewall.
- **[archive_only_evidence]** decisions: Rescoped the adv-engineer.md retry amplifier to transport-only retries and added a ROLE_FIREWALL_BLOCK no-retry payload-emission fallback. — AC4 requires the agent to stop retrying deterministically blocked calls and instead emit the full report payload in the final response for orchestrator recovery.
- **[archive_only_evidence]** verification: npx vitest run src/agent-prompt-policy-binding.test.ts --reporter verbose (0) — All 17 tests pass (0 failures) in agent-prompt-policy-binding.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms3ygnjz_24123d7d
- **[epic_terminal_note]** epic.membership: optimizeAdvToolSurface · Fix sub-agent report/test routing contract (order 4)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- finish_owned_scope_then_report: No scope drift. AC7 fixture evidence is within agreed scope.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx vitest run src/agent-prompt-policy-binding.test.ts -t "AC7 pre-rewrite evidence"
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms3ygnjz_24123d7d
