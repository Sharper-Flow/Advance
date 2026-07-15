# Archive Briefing Digest

**Change ID:** addRewriteScanPrompts
**Title:** Add rewrite scan prompts
**Status:** archived
**Generated:** 2026-07-15T18:52:56.480Z

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

Showing 17 of 17 durable facts.

- **[report_follow_up]** follow_ups: `adv-comp-scan` is outside the requested architecture/slop scope and was not changed.
- **[unresolved_action]** required_main_agent_actions: Inspect the scoped diff and checkpoint the six modified files.
- **[archive_only_evidence]** decisions: Use command-level `rewriteAssessment` with complete or indeterminate status, definite conclusion lists, evidence, and tentative heuristic material. — Preserves typed runner boundaries while supplying a self-describing orchestration output.
- **[archive_only_evidence]** decisions: Place assessment after scan evidence and before report assembly. — Keeps it derived rather than creating a second analysis authority.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts (0) — PASS — 2 test files, 25/25 tests pass (including rewrite-assessment symmetry tests).
- **[archive_only_evidence]** verification: git status --short && git diff --stat (0) — Diff confined to the six required files; no commit made.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --stat
- **[unresolved_action]** required_main_agent_actions: Persisted by orchestrator because the reviewer lacked the ADV report tool.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts results=pass — 2 test files, 25 tests passed. Commit 9d547198 implements both exact questions, evidence rules, tentative heuristic handling, indeterminate degraded coverage, advisory/deletion boundaries, command-level JSON placement, and symmetric command/skill asset assertions.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts, git diff --check 9d547198^ 9d547198 results=pass — Targeted suite passed: 2 files, 25 tests. Commit diff check passed; worktree unchanged from accepted commit.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check 9d547198^ 9d547198
- **[archive_only_evidence]** sources: Architecture command contract: Existing report flow separates structural evidence, low-confidence heuristic findings, and JSON output.
- **[archive_only_evidence]** sources: Slop command contract: Existing report flow fails on required coverage degradation and preserves confidence/actionability boundaries.
- **[archive_only_evidence]** sources: Slop report schema: slop_scan_report.v1 is typed and must be extended with a validator-backed assessment rather than prompt-only JSON.
- **[archive_only_evidence]** sources: Asset tests: Tests enforce command, skill, spec/docs, and output-contract symmetry.
- **[archive_only_evidence]** architecture_assessment: A derived rewrite assessment fits the existing report-assembly design only when it consumes existing findings and coverage status. It must not become a second analysis authority or alter severity, actionability, coverage status, or deletion safety.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |

## Unresolved Actions

- Inspect the scoped diff and checkpoint the six modified files.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --stat
- Persisted by orchestrator because the reviewer lacked the ADV report tool.
- verification_missing: No adv_run_test evidence found for reported command: git diff --check 9d547198^ 9d547198
