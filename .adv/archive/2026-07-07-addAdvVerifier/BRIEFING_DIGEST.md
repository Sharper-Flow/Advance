# Archive Briefing Digest

**Change ID:** addAdvVerifier
**Title:** Add ADV verifier
**Status:** archived
**Generated:** 2026-07-07T06:13:56.248Z

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

No Epic membership

## Durable Facts

Showing 9 of 9 durable facts.

- **[unresolved_action]** required_main_agent_actions: Use the recorded REVIEWER_REPORT as acceptance evidence for addAdvVerifier.
- **[unresolved_action]** required_main_agent_actions: If proceeding beyond acceptance, validate deployment/runtime sync in a fresh OpenCode session after deploy-local per repository Source-vs-Dist Reload Gotcha.
- **[archive_only_evidence]** verification: tests_run=Path preflight for all referenced in-scope files via test -e loop, bin/oc-test targeted -- src/adv-verifier-assets.test.ts src/subagent-reports-spec-assets.test.ts src/delegation-matrix.test.ts src/orchestrator-ops-delegation-assets.test.ts src/phantom-subagent-roster.test.ts results=pass — Path preflight: all referenced in-scope files existed. Targeted suite passed locally: 5 files, 156 tests passed in 533ms. User-provided prior evidence also records targeted contract suite pass runId tr_mra7pq8q_4f8404e, smoke pass runId tr_mra7ph5s_54f4404e (schemas:check, typecheck, lint, format:check, 57 tests), and strict adv_change_validate pass with warning only NO_DELTAS.
- **[agenda]** follow_ups: After merge, run ./scripts/deploy-local.sh --fix and restart OpenCode sessions to consume the new adv-verifier agent asset.
- **[agenda]** follow_ups: Optional future polish: clarify adv-verifier as bundled-global rather than repo-local in ADV_INSTRUCTIONS roster prose, matching deploy-local behavior.
- **[archive_only_evidence]** findings: [info] documentation_hygiene: Scanner concern about prior no-verifier archive record rejected with evidence; current acceptance artifact explicitly covers DONT8 and supersession rationale, and archived acceptance remains historical truth.
- **[archive_only_evidence]** findings: [info] cleanup: Incidental adv-visual-review exhaustive switch fix is documented as a campsite fix, not release risk.
- **[archive_only_evidence]** findings: [info] deployment_readiness: Live OpenCode sessions require deploy-local sync and restart after merge to consume .opencode/agents/adv-verifier.md.
- **[archive_only_evidence]** findings: [suggestion] test_coverage: Optional future hardening: add a focused regression test for adv-visual-review blockerSummary if desired; compile-time exhaustiveness and smoke currently cover the fixed gap.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |

## Unresolved Actions

- Use the recorded REVIEWER_REPORT as acceptance evidence for addAdvVerifier.
- If proceeding beyond acceptance, validate deployment/runtime sync in a fresh OpenCode session after deploy-local per repository Source-vs-Dist Reload Gotcha.
