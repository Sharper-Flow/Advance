# Contract Traceability

**Change ID:** addCoordinateRefactorCoverage
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-02T23:55:44.420Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Phase 6.5 three-group table plus Referral form paragraph give each out-of-date change an explicit next action inside the coordination report; no second command needed. |
| SC2 | success_criterion | pass | review | Epic findings never receive a /adv-refactor target (no Epic mode exists); referral pinned to the bare dry-run form that /adv-refactor actually supports. |
| SC3 | success_criterion | pass | review | Three-group table separates actionable rows from review/deferred; review/deferred output column reads 'Finding and reason only — no command'. |
| AC1 | acceptance_criterion | pass | test | Actionable group row requires nonterminal change with drift supported by repo_backed_fact or adv-backed-fact, output = referral command plus status at emit time. |
| AC2 | acceptance_criterion | pass | test | Review/deferred row covers judgment_call, freshness_limited, and unresolved evidence with output 'Finding and reason only — no command'. |
| AC3 | acceptance_criterion | pass | test | 'Insufficient evidence never produces a referral' paragraph names unreadable artifact, failed or timed-out read, and missing repository freshness, classifying all as freshness_limited with no referral. |
| AC4 | acceptance_criterion | pass | test | Epic paragraph routes stale narrative, order, or membership to adv_epic_update, adv_epic_reorder, or adv_epic_show convergence 'naming the exact stale field', consistent with existing Phase 9 application. |
| AC5 | acceptance_criterion | pass | test | Referral form paragraph: 'Emit exactly /adv-refactor <change-id>. That bare form is dry-run. Never emit --execute, --interactive, --force, or a batch invocation from coordination.' |
| AC6 | acceptance_criterion | pass | test | Dedicated paragraph 'Epic findings never receive a /adv-refactor target' states /adv-refactor resolves a change ID only and has no Epic mode. |
| AC7 | acceptance_criterion | pass | test | 'Point-in-time discipline' paragraph requires recording status as observed at emit time and re-validating before running the referral, because /adv-refactor performs no status check. |
| AC8 | acceptance_criterion | pass | test | Candidate population paragraph covers every nonterminal in-flight change 'whether or not it is linked to an Epic', excludes terminal changes, and states 'do not cap the group'; findings carry their own Phase 6.5 heading and dedicated Phase 7 report row. |
| C1 | constraint | respected | static_check | No new mutation verb, tool, or CLI added. consumer-integration.test.ts AC14 heading filter and read-first assertion pass; diff is 30 added lines in one markdown file with no code or schema change. |
| C2 | constraint | respected | static_check | Evidence threshold paragraph states 'Age, heuristic overlap ranking, and recency never qualify as authority'; only repo_backed_fact or adv-backed-fact may carry a command. |
| C3 | constraint | respected | static_check | Candidate population explicitly includes changes 'whether or not it is linked to an Epic', preserving optional membership. No Epic order semantics were added or made blocking; Phase 5 sequencing text untouched. |
| C4 | constraint | respected | static_check | Epic findings route to the existing approval-gated actions; Phase 8 approval and Phase 9 apply sections are unmodified in the diff. |
| C5 | constraint | respected | static_check | git diff trunk...HEAD shows exactly one changed file, .opencode/command/adv-coordinate.md, 30 insertions. No spec.json, no docs/specs mirror, no new test file. |
| C6 | constraint | respected | static_check | bin/oc-test targeted -- src/advance-epics-assets.test.ts src/consumer-integration.test.ts exited 0: 2 files, 87 tests passed, 0 failed. Neither test file appears in the diff, so no assertion was modified. |
| C7 | constraint | respected | static_check | Hyphen form adv-backed-fact now appears 8 times (6 pre-existing plus 2 added); underscore form adv_backed_fact appears 0 times in the command file. |
| DONT1 | avoidance | respected | review | .opencode/command/adv-refactor.md is not in the diff; no Epic mode was added to it. |
| DONT2 | avoidance | respected | review | Contract emits a referral command for the user to run; it never invokes /adv-refactor, and explicitly forbids emitting --execute from coordination. |
| DONT3 | avoidance | respected | review | The six pre-existing adv-backed-fact occurrences are untouched by the diff and no underscore form was introduced; the spec/command vocabulary divergence is left exactly as found. |
| DONT4 | avoidance | respected | review | Phase 6.5 references the four evidence labels but declares no definition table; the sole definition remains the Phase 3 table at lines 105-108. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7829f97d60a1 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 |  | C1, C2, C3, C4, C5, C7, DONT1, DONT2, DONT3, DONT4 |  |
| tk-b4dc15023ef9 |  |  | C6, C7, C1 |  |
| tk-4d141d1c68be |  |  |  | Closes design-derived criterion DDC6 (repo/deployed SHA parity). No approved contract item governs deployment parity — the agreement is scoped to command-contract content, not asset deployment. |
