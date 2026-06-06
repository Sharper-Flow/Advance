# Acceptance

Reviewed at: 2026-06-06T20:03:15.994Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `.opencode/command/adv-triage.md` states Phase 4b must relevance-check field-gap candidates before `question` prompts. | pass | .opencode/command/adv-triage.md contains `### 4b. Relevance validation` before `### 4c. Field assignments` and MUST NOT prompt Priority/Value before relevance validation. |
| AC2 | acceptance_criterion | `skills/adv-triage/PROMPTS.md` or `WSJF.md` defines evidence sources and outcomes for relevance validation. | pass | skills/adv-triage/PROMPTS.md contains Relevance validation with evidence sources and outcomes: relevant, stale/already-addressed, duplicate/superseded, unclear. |
| AC3 | acceptance_criterion | A repo test fails if the command/skill no longer contain the relevance-check-before-prioritization requirement. | pass | `bin/oc-test targeted -- src/adv-triage-relevance-assets.test.ts` passed after reviewer remediation. |
| AC4 | acceptance_criterion | `bin/oc-test targeted -- <test file>` or equivalent targeted verification passes. | pass | Asset test asserts command and skill anchors; command constraints still forbid autofill bug priority and autonomous feature Value unless user chooses autofill. |
| C1 | constraint | Do not let heuristics close or suppress items without user approval where destructive action is involved. | respected | Command and PROMPTS state relevance heuristics are advisory only and require explicit user approval before close/remove/defer/suppress. |
| C2 | constraint | Do not auto-assign bug Priority. | respected | Command constraints retain `MUST NOT autofill bug priority` and bugs use priority labels only. |
| C3 | constraint | Do not auto-assign feature Value unless user explicitly selects autofill. | respected | PROMPTS preserves Value as user-owned unless user explicitly selects autofill. |

