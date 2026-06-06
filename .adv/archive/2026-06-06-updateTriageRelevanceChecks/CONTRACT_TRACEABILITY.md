# Contract Traceability

**Change ID:** updateTriageRelevanceChecks
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T20:03:15.994Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | .opencode/command/adv-triage.md contains `### 4b. Relevance validation` before `### 4c. Field assignments` and MUST NOT prompt Priority/Value before relevance validation. |
| AC2 | acceptance_criterion | pass | test | skills/adv-triage/PROMPTS.md contains Relevance validation with evidence sources and outcomes: relevant, stale/already-addressed, duplicate/superseded, unclear. |
| AC3 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/adv-triage-relevance-assets.test.ts` passed after reviewer remediation. |
| AC4 | acceptance_criterion | pass | test | Asset test asserts command and skill anchors; command constraints still forbid autofill bug priority and autonomous feature Value unless user chooses autofill. |
| C1 | constraint | respected | static_check | Command and PROMPTS state relevance heuristics are advisory only and require explicit user approval before close/remove/defer/suppress. |
| C2 | constraint | respected | static_check | Command constraints retain `MUST NOT autofill bug priority` and bugs use priority labels only. |
| C3 | constraint | respected | static_check | PROMPTS preserves Value as user-owned unless user explicitly selects autofill. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f3034cd018e4 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3 |  |
