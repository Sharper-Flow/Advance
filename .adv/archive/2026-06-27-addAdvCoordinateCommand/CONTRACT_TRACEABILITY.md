# Contract Traceability

**Change ID:** addAdvCoordinateCommand
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T17:46:06-04:00

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Targeted verification passed: `bin/oc-test targeted -- src/manifest.test.ts src/manifest-doc-drift.test.ts src/cli-surface-matrix.test.ts src/advance-epics-assets.test.ts` (110 tests). `advance-epics-assets.test.ts` asserts `.opencode/command/adv-coordinate.md` frontmatter, manifest comment, command boundary, read-first phases, report output, approval-gated apply phase. |
| AC2 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). `manifest.test.ts` covers `adv-coordinate` manifest registration: description `Audit Epic alignment, sequencing, and membership health`, no gate, `requiresChangeId: false`, and no `phaseGoal`. |
| AC3 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). `manifest.test.ts` expected command list includes `adv-coordinate` and corrected count 29. Correction from 28 to 29 was user-approved after source evidence. |
| AC4 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). `manifest-doc-drift.test.ts` validates command/docs synchronization; docs touched: README, ADV_INSTRUCTIONS, SETUP, docs/cli-surface-matrix.md. |
| AC5 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). Spec task added `rq-epicCoordinateCommand01` to `.adv/specs/advance-epics/spec.json`, mirrored in `docs/specs/advance-epics.md`, and JSON parse/static check passed. |
| AC6 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). Reviewer fixed scoped test gap by adding explicit AC6 assertions for ownership, narrative, dependency, sequencing/health/capstone report dimensions and approval-gated typed action references. |
| AC7 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). Asset tests assert command does not instruct direct ADV state-file reads/edits; review found no direct state-file access guidance. |
| AC8 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). CLI-surface matrix classifies `/adv-coordinate` as `agent-workflow-only`; no `bin/adv` mutation verb was added. |
| AC9 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). Command text and asset tests state Epic order recommendations are advisory and never block gates, tasks, promotion, or change progress. |
| AC10 | acceptance_criterion | pass | test | Targeted verification passed (110 tests). Command text and asset tests state Epic membership remains optional and no auto-enrollment occurs. |
| AC11 | acceptance_criterion | pass | test | Final targeted verification passed: `bin/oc-test targeted -- src/manifest.test.ts src/manifest-doc-drift.test.ts src/cli-surface-matrix.test.ts src/advance-epics-assets.test.ts` (4 files, 110 tests). Reviewer reran same suite after adding AC6 assertions; still passed. |
| C1 | constraint | respected | static_check | Review verified implementation is command asset + manifest/docs/tests only. No new aggregate MCP tool, Temporal workflow, or persistent coordination state added; durable actions reuse `adv_epic_*` tools. |
| C2 | constraint | respected | static_check | Command contract requires explicit approval before durable actions, uses `expected_version` for update/reorder, and includes evidence requirements for typed repair/update operations. Asset tests assert approval-gated action references. |
| C3 | constraint | respected | static_check | Command contract preserves target-path trust by routing cross-project/product-spanning actions through existing typed Epic tools and their target confirmation/evidence rules; no bypass path introduced. |
| C4 | constraint | respected | static_check | Docs and command prose updated in terse command style; manifest/doc drift coverage passed. Reviewer reported READY with no blocking prose/style findings. |
| DONT1 | avoidance | respected | review | Reviewer verdict READY. Command text/tests state Epic membership remains optional; no mandatory membership language added. |
| DONT2 | avoidance | respected | review | Reviewer verdict READY. Command text/tests state no auto-enrollment; no tool or workflow was added to auto-link changes to Epics. |
| DONT3 | avoidance | respected | review | Reviewer verdict READY. Command text/tests state advisory order recommendations never block gates, tasks, promotion, or change progress. |
| DONT4 | avoidance | respected | review | Reviewer verdict READY. Command adds Epic coordination report/action workflow only; no assignments, estimates, sprints, boards, or ownership workflow were added. |
| DONT5 | avoidance | respected | review | Reviewer verdict READY and CLI matrix test passed. `/adv-coordinate` is `agent-workflow-only`; no `bin/adv` mutation command added. |
| DONT6 | avoidance | respected | review | Reviewer verdict READY. Command requires explicit approval before durable edits and routes them through typed tools with evidence/version fields; no silent durable edit path introduced. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-676d64cc5925 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-6807c9ead3bc | AC5 | AC5 | C1, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-749748efe6bf | AC1, AC6, AC7, AC9, AC10 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-c81687fc7e5e | AC2, AC3, AC4, AC8 | AC2, AC3, AC4, AC8 | C1, C4, DONT5 |  |
| tk-68586c037c92 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
