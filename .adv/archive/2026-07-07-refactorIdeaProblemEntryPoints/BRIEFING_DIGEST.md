# Archive Briefing Digest

**Change ID:** refactorIdeaProblemEntryPoints
**Title:** Refactor idea and problem entry points
**Status:** archived
**Generated:** 2026-07-07T02:22:31.690Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 32 of 32 durable facts.

- **[agenda]** follow_ups: tk-rewrite-idea (tk-614f1a6a4ffb) will rewrite .opencode/command/adv-idea.md to satisfy this RED test, turning it GREEN
- **[archive_only_evidence]** decisions: mirrored adv-problem-assets structural shape — preserves convention (vitest imports, readFileSync command read, describe/test per DDC)
- **[archive_only_evidence]** decisions: asserted explicit forbid strings for mutation tools rather than only absence of calls — DDC-1 requires the command to contain FORBID language naming each tool; also guard against direct invocations
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-idea-assets.test.ts (1) — RED: 6/7 DDC-1 assertions failed — missing subagent dispatch, adv-researcher/validation.status, initiative sizing, /adv-epic routing, explicit forbid statements for mutation tools, and adv-research.md:111-135 reference
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
- **[archive_only_evidence]** decisions: 5-phase structure (Frame → Explore → Synthesize → Size → Exit) — matches design.md Phase 2 / KD-1 and satisfies RED-test assertions
- **[archive_only_evidence]** decisions: Rewrote anti-patterns in new failure modes — KD-8 / DA-4: replaced old anti-patterns with no sub-agent dispatch, silent state mutation, opaque scope decisions
- **[archive_only_evidence]** decisions: Used literal tool names without parentheses for mutation-tool forbid — satisfies AC7 while keeping command prose natural and test-passing
- **[archive_only_evidence]** decisions: Included inline sub-agent resilience paragraph referencing adv-research.md:111-135 — AC8 / DDC-4 requires canonical source citation and retry+fallback chain
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-idea-assets.test.ts (0) — GREEN: 7/7 DDC-1 assertions pass in adv-idea entry-point contract
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
- **[archive_only_evidence]** decisions: 7-phase tiered evidence flow (Frame → Tier 1 local → Tier 2 external → Tier 3 user uploads → Spec-law assessment → Triage classify → Exit) — design.md KD-1 and AC5/AC6/AC8 require structured evidence before direct-fix or proposal routing
- **[archive_only_evidence]** decisions: preserved DDC-2 7-string set verbatim — machine-checked by adv-problem-assets.test.ts:19-39; dropping any string fails CI
- **[archive_only_evidence]** decisions: kept Phase 5 spec-law assessment as the anchor for the mandatory strings — original command already contained the required spec-law language; relocating it to Phase 5 keeps it findable while surrounding it with the new tiered flow
- **[archive_only_evidence]** decisions: mirrored adv-idea.md structural conventions — sibling commands must present consistent frontmatter, Command Boundary, Phase 0 methodology, phase list, exit paths, and anti-patterns
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-problem-assets.test.ts (0) — GREEN: 4/4 assertions pass, all 7 DDC-2 strings preserved
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-idea-assets.test.ts (0) — no collateral damage to adv-idea-assets; 7/7 pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-problem-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
- **[agenda]** follow_ups: Execution guardrail: verbatim-preserve the adv-problem-assets.test.ts regex string 'uncertain spec-law impact MUST NOT be direct-fix; route to /adv-proposal or keep investigating' and 'MUST NOT create changes, tasks, gates, or spec deltas directly'.
- **[agenda]** follow_ups: Design-doc hygiene: correct the 'adv-discover.md Phase 3.5 scout, line 533' citation; the verified resilience-mirror source is adv-research.md:111-135.
- **[archive_only_evidence]** sources: adv-problem-assets.test.ts (machine-checked spec-law strings): Asserts adv-problem.md contains verbatim: 'Spec-law impact', 'durable product/system behavior', 'Spec-law change required', 'No spec law update required', 'direct fix remains allowed only when all direct-fix guardrails pass', the regex /uncertain spec-law impact MUST NOT be direct-fix; route to /adv-proposal or keep investigating/, and 'MUST NOT create changes, tasks, gates, or spec deltas directly'. Tied to rq-problemSpecLaw01.
- **[archive_only_evidence]** sources: advance-workflow spec rq-problemSpecLaw01: MUST requirement: /adv-problem includes spec-law impact assessment; law-changing findings route to /adv-proposal with draft spec-delta obligation; uncertain impact MUST NOT be trivial direct-fix; command remains read-only. Scenarios .1/.2/.3 fixed and order-checked by the assets test.
- **[archive_only_evidence]** sources: adv-research.md Sub-Agent Resilience protocol (LBP source): Detection (empty/failed criteria incl. missing validation.status), Retry-once, inline Context7/Exa/searchcode fallback, never-skip-a-question. Exact block C2/AC8 require the two rewritten commands to mirror. Line 139 is 'Spawn Research Sub-Agents' matches KD-1 dispatch-spine claim.
- **[archive_only_evidence]** sources: manifest.ts adv-idea / adv-problem entries: Both entries currently: requiresChangeId:false, scope.creates=[], modifies=[], gates=[], reads=['specs','codebase'], successors=['adv-proposal']. C1 requires adding 'adv-epic' to successors; AC11 requires scope arrays stay empty/truthful.
- **[archive_only_evidence]** sources: manifest.test.ts successor + command-list assertions: Line 116-120 asserts every successor references a valid command name (adv-epic is valid so safe). Line 372 pins a specific successors array for a DIFFERENT command, not idea/problem. Adding adv-epic to idea/problem successors is test-safe.
- **[archive_only_evidence]** sources: Test-file coverage grep for command references: Only adv-problem-assets.test.ts references adv-problem.md; only manifest.test.ts references the names. NO existing assets test references adv-idea.md, so AC12 for adv-idea is currently vacuous, and design Step 4 creates a NEW adv-idea-assets.test.ts (net-new coverage, correct).
- **[archive_only_evidence]** sources: Subagent/tool surface verification (warrant balance): adv-researcher and adv-tron are Task-tool spawned agent files; 'explore' is a Task-tool subagent, none are public ADV tools indexed by warrant resolution. Confirms DA-1/Warrant-policy treatment of subagent invocations as behavioral assertions (not tool-surface warrants) is consistent with existing LBP.
- **[archive_only_evidence]** architecture_assessment: Workflow reorganization of two read-only CLI command files plus a one-line manifest successor edit and one net-new assets test. No new types, no new tool surface, no spec law. All four validated constraints hold under evidence. (1) Spec-law compliance: KD-7 preserves the rq-problemSpecLaw01 verbatim strings that adv-problem-assets.test.ts:19-39 machine-checks, including the distinct regex string at line 54 of the current command; phase reorg keeps these as a sub-section, and OOS4 forbids spec deltas. (2) Read-only safety: AC7 enforced structurally via a coverage test asserting absence of adv_change_create/adv_gate_complete/adv_task_add/adv_epic_create, plus DONT1/DONT2 recommend-not-invoke; KD-5 correctly defers adv_subagent_report_submit until a change exists (that tool requires change_id). (3) LBP alignment: C2/AC8 mirror adv-research.md:111-135 verbatim (verified as the exact resilience block); KD-1 dispatch spine mirrors adv-research.md:139. (4) Warrant balance: subagent assertions are behavioral, verified accurate against the actual agent-file surface. Initiative sizing (KD-3 any-of >=3 sub-problems / >=3 regions / >1 repo) matches AC4/DA-3 exactly. Two MINOR non-blocking observations: (a) the Architecture Overview cites 'adv-discover.md Phase 3.5 scout, line 533' while the resilience anchor is adv-research.md:111-135, the substantive mirror source is correct but the adv-discover line citation is imprecise; (b) implementation must preserve not only the five prompt-listed strings but ALSO the exact regex-tested string 'uncertain spec-law impact MUST NOT be direct-fix; route to /adv-proposal or keep investigating' (test lines 29-33) and 'MUST NOT create changes, tasks, gates, or spec deltas directly' (lines 35-38) as first-class verbatim-preserve targets.
- **[agenda]** follow_ups: Pre-existing tool-name-assets.test.ts failure on .opencode/command/adv-coordinate.md: adv_backed_fact is OUT OF SCOPE — recommend separate ADV change (e.g. 'fixToolNameAssetsTestOvermatch') to extend the test's exclusion list (matches prose references like 'adv_backed_fact') or add constant to ADV_TOOL_NAME_SET. NOT silently absorbed.
- **[agenda]** follow_ups: Future harden/follow-up: extract Tier-3 secret detection regex to a testable constant + add machine-checkable credential-shape log mock in adv-problem-assets.test.ts to close AC10 verification surface.
- **[archive_only_evidence]** findings: [suggestion] security: Tier-3 secret detection described narratively without literal regex constant; subsequent harden-phase task should add explicit regex constant + machine-checkable test.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | not_applicable |
| SC2 | success_criterion | not_applicable |
| SC3 | success_criterion | not_applicable |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-problem-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-idea-assets.test.ts
