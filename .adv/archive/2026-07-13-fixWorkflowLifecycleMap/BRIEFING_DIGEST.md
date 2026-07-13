# Archive Briefing Digest

**Change ID:** fixWorkflowLifecycleMap
**Title:** Fix workflow lifecycle map
**Status:** archived
**Generated:** 2026-07-13T20:50:42.068Z

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

Showing 30 of 30 durable facts.

- **[archive_only_evidence]** decisions: Used native edit tool for all 3 docs edits instead of morph_edit — All 3 edits are small, precise, single-line replacements — edit tool is faster and more reliable for exact string matches
- **[archive_only_evidence]** decisions: Used regex /^\| proposal\s+\|.*$/m to extract the proposal row for the ownership table assertion — More precise than a generic toContain — pins the assertion to the specific table row, preventing false positives from other file sections
- **[archive_only_evidence]** decisions: Added 5 trailing spaces when replacing 'success criteria' (16 chars) with 'proposal.md' (11 chars) in ASCII diagram — Preserves the 73-char fixed-width column alignment of the diagram box borders
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts (1) — RED phase: all 3 tests failed as expected — 'success criteria' present, proposal.md missing from ownership table, Per-Gate Line-Item Map cross-ref missing. lastRedRunId: tr_mrjoeiqm_e4c48974
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts (0) — GREEN phase: all 3 tests pass after fixing 3 defects in docs/adv-workflow.md. lastGreenRunId: tr_mrjoffxd_1e501fed
- **[archive_only_evidence]** verification: grep -n 'success criteria' docs/adv-workflow.md (1) — Confirmed 'success criteria' fully removed from adv-workflow.md (grep exit 1 = no matches)
- **[archive_only_evidence]** verification: awk 'NR==20 {print length($0)}' docs/adv-workflow.md (0) — Line 20 alignment preserved at 73 chars, matching all other diagram lines
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -n 'success criteria' docs/adv-workflow.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: awk 'NR==20 {print length($0)}' docs/adv-workflow.md
- **[archive_only_evidence]** decisions: Used edit tool with anchored oldString on last fenced block (adv_gate_complete example) instead of bash heredoc append — Preserves whitespace exactly and avoids shell quoting issues with backticks and special characters in markdown tables
- **[archive_only_evidence]** decisions: Placed new describe block AFTER the existing AC1 describe block — Matches pattern from T1; REPO_ROOT const is shared so no duplication needed
- **[archive_only_evidence]** decisions: Kept assertion 16 as positive 'Wisdom capture (advisory' string match instead of asserting adv_wisdom_add presence — Matches packet directive; packet explicitly downgraded from tool-name assertion to advisory-wording assertion to honor AC3 (wisdom is advisory, not command-mandated)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts (1) — RED phase — 12/12 new map assertions failed (expected, map not yet in adv-gates.md). runId: tr_mrjokbr6_b5902f61. Existing AC1 tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts (0) — GREEN phase — 16/16 tests pass (3 existing AC1 + 13 new AC2/AC3 map assertions). runId: tr_mrjol9tj_899c4b0f. Duration 262ms.
- **[archive_only_evidence]** verification: wc -l docs/adv-gates.md && head -20 docs/adv-gates.md && sed -n '150,160p' docs/adv-gates.md (0) — APPEND-ONLY verified: file grew from 152 → 271 lines; original header + first 152 lines byte-identical; new map section starts at line 154 with '## Per-Gate Line-Item Map'.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: wc -l docs/adv-gates.md && head -20 docs/adv-gates.md && sed -n '150,160p' docs/adv-gates.md
- **[agenda]** follow_ups: Implementer: before RED assertions, grep-verify each AC3 row anchor is literally present in its cited owning source; reconcile the worktree-isolation row (adv_worktree_resume vs adv_worktree_create).
- **[agenda]** follow_ups: When strengthenAgentEvidence ships: flip the DONT1 negative assertion to a positive verification-evidence-disposition row and update the map (design already flags this).
- **[archive_only_evidence]** sources: docs/adv-gates.md (map-placement target): Existing home of gate contract: gate table, status values, enforcement rules, gate-specific behaviors. Confirms C2 single-source-of-truth placement is correct; append-only map section is compatible.
- **[archive_only_evidence]** sources: docs/adv-workflow.md (defects under fix): Line 20 diagram box claims proposal produces 'success criteria' (AC1 defect confirmed). Line 65 ownership table proposal row lists only problem-statement.md, omitting proposal.md (AC1 defect confirmed). Both defects are real and precisely located.
- **[archive_only_evidence]** sources: adv-skill-backed-commands-assets.test.ts (idiom + adv-gates pinning): Confirms the presence-based .toContain/.toMatch idiom on docs/adv-gates.md that the design reuses. This is the single pre-existing adv-gates.md test the append-only edits must not break.
- **[archive_only_evidence]** sources: .adv/specs/advance-workflow/spec.json (cited spec IDs): rq-releaseFinalization01, rq-inlineApproval01, rq-designQualityEvidence01 all confirmed as real spec requirements. rq-autonomy01 confirmed via docs anchors. Cited anchor tokens are stable and updateAgentGuide-reword-resistant.
- **[archive_only_evidence]** sources: AC3 tool anchors in owning command files: adv_design_concern_disposition (review/harden), adv_reflect (reflect/archive), and Phase 0.1 Worktree Isolation (apply) all confirmed present as stable anchors for AC3 rows.
- **[archive_only_evidence]** sources: VERIFICATION_EVIDENCE_MISSING absence (DONT1 negative assertion): Token absent from trunk. Confirms DONT1 negative assertion is safe and meaningful: map must not mention verification-evidence dispositions until strengthenAgentEvidence ships.
- **[archive_only_evidence]** sources: adv-apply.md Phase 0.1 worktree tool naming (anchor-precision caution): Phase 0.1 uses adv_worktree_create / adv_worktree_delete literally; adv_worktree_resume does NOT appear in adv-apply.md. Design/AC3 warrant cites tool:adv_worktree_resume for the worktree row — imprecise provenance citation vs actual command-file idiom.
- **[archive_only_evidence]** architecture_assessment: The design is a bounded docs+test change that correctly solves all three objectives. Map placement in docs/adv-gates.md is the by-the-book choice: that file already owns gate-by-gate behavior, satisfies C2 by avoiding a competing table, and has an established presence-based test idiom (verified at adv-skill-backed-commands-assets.test.ts:718-743). The two adv-workflow.md defects are real and precisely located (line 20 success-criteria claim; line 65 incomplete proposal row). Drift-anchoring on stable identifiers (tool names, rq-IDs, fixed vocabulary tokens) rather than prose is the correct hedge against updateAgentGuide's in-flight 30-file reword — all four cited rq-IDs are confirmed real in spec.json, and all AC3 tool/phase anchors are confirmed present in owning command files. The DONT1 negative assertion is safe: VERIFICATION_EVIDENCE_MISSING has zero trunk matches. The design reuses the established repo idiom (23+ command-asset test files) rather than inventing a docs-lint/generated-doc pipeline — proportionate and LBP-consistent. One minor caution: the AC3 worktree row provenance cites tool:adv_worktree_resume, but adv-apply.md Phase 0.1 literally uses adv_worktree_create/adv_worktree_delete; the source-anchor citation should be reconciled to the actual command-file token (or anchor on the stable phrase 'Worktree Isolation' / 'Phase 0.1') at implementation to keep DD1/DD2 precise.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: grep -n 'success criteria' docs/adv-workflow.md
- verification_missing: No adv_run_test evidence found for reported command: awk 'NR==20 {print length($0)}' docs/adv-workflow.md
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-workflow-docs-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: wc -l docs/adv-gates.md && head -20 docs/adv-gates.md && sed -n '150,160p' docs/adv-gates.md
