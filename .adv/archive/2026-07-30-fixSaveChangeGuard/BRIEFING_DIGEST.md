# Archive Briefing Digest

**Change ID:** fixSaveChangeGuard
**Title:** Fix save change guard
**Status:** archived
**Generated:** 2026-07-30T19:04:52.844Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Showing 31 of 31 durable facts.

- **[archive_only_evidence]** decisions: Centralized AST call-site detection in save-change-allow-list.ts — Both guard tests need the same CallExpression scan and context-name extraction; sharing the logic prevents divergence and keeps the allow-list helper next to its policy.
- **[archive_only_evidence]** decisions: Kept rg as a candidate file finder but validate with the TypeScript AST — rg quickly finds files containing the string; parsing only those files with ts.createSourceFile keeps the guard structural while minimizing work.
- **[archive_only_evidence]** decisions: Added inline fixture tests using collectSaveChangeCallSitesFromText instead of a new non-test source file — A fixture source file would itself be scanned and risk a real violation; inline parsing lets the test assert literals, comments, and executable calls without polluting the scan target.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts (1) — Baseline RED: false positive on literal saveChange( in read-command-boundary.test.ts before AST detection
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts (0) — GREEN: both affected guard suites pass (18 tests)
- **[archive_only_evidence]** verification: pnpm run check (0) — typecheck, lint, format, schema, manifest checks pass (3 pre-existing warnings in manifest-frontmatter.ts unrelated)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: baseline-red-tk-3319ed594ec4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-tk-3319ed594ec4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: check-tk-3319ed594ec4
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts (0) — GREEN: both affected guard suites pass (18 tests)
- **[report_follow_up]** follow_ups: Packet scope key was supplied as "self-matching-guard-design"; persisted report scope uses the schema-required researcher: prefix.
- **[research_citation]** sources: Inventory guard implementation: The guard runs rg against raw TypeScript source, then excludes only comment-only lines and the saveChange definition. (file:///home/jon/dev/advance/plugin/src/storage/save-change-allow-list.test.ts)
- **[research_citation]** sources: Writer-boundary guard implementation: The second guard runs the same raw rg search, excludes test files, then applies the same limited line filtering. (file:///home/jon/dev/advance/plugin/src/storage/read-command-boundary.test.ts)
- **[research_citation]** sources: Allow-list contract: The allow-list allows whole inventory/test files and therefore cannot prove an individual literal was structurally ignored. (file:///home/jon/dev/advance/plugin/src/storage/save-change-allow-list.ts)
- **[archive_only_evidence]** architecture_assessment: CONFLICT: fragment construction removes the one contiguous literal from test source while preserving the runtime rg pattern, but neither current guard lexically parses TypeScript or strips strings/comments before matching. The proposed regression fixtures therefore cannot establish C2 with the stated mechanism alone; in the inventory guard, the entire test file is allow-listed, so a string-only fixture can pass even when rg found it.
- **[unresolved_action]** validation.blockers: The design's fragment-only mechanism does not meet C2's requirement to distinguish executable code from comments and string literals. Both guards first collect raw rg matches and only skip lines whose trimmed text starts with a comment marker or the function definition; neither removes quoted strings nor handles inline/block-comment occurrences structurally.
- **[unresolved_action]** required_main_agent_actions: Record this independent acceptance review and retain the known unrelated full-suite failure inventory as AC3 evidence; do not attribute those failures to the saveChange guard.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the two scoped review fixes before acceptance completion; leave production write behavior and allow-list policy unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] An AST guard is only structural if candidate enumeration is not narrower than the language grammar. Text-prefiltering `saveChange(` missed valid whitespace-formatted calls; enumerate source files first, then let the parser identify call expressions.
- **[archive_only_evidence]** changes_made: plugin/src/storage/save-change-allow-list.ts: Expanded candidate discovery from exact `saveChange(` text to every TypeScript source file before AST traversal, so whitespace-formatted executable calls cannot evade AC2; added class-method context extraction to make allow-list context matching structural.
- **[archive_only_evidence]** changes_made: plugin/src/storage/save-change-allow-list.test.ts: Added executable spaced-call and class-method fixtures; asserts all executable fixture calls remain unallowlisted while literal and comments remain excluded.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts, pnpm --dir plugin run check results=pass — Focused suites: 2 files, 18 tests passed after final edits. `pnpm --dir plugin run check` passed schema, type, manifest, frontmatter, isolation, lint, and Prettier checks (only three existing eslint warnings in manifest-frontmatter.ts). `git diff --check` passed. Diff remains limited to storage guard helper/tests; no production write path or allow-list entry changed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** required_main_agent_actions: Do not mark release ready: establish merge/reachability proof for HEAD 5c2a98cb against origin/trunk.
- **[unresolved_action]** required_main_agent_actions: Triage or restore the 51 unrelated full-suite failures, then rerun bin/oc-test full.
- **[unresolved_action]** required_main_agent_actions: Leave the scoped AST guard implementation alone: targeted tests passed and no repository changes were made by this review.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Run bin/oc-test targeted from the repo root with plugin-relative paths (src/...); the wrapper executes Vitest from plugin/, so plugin/src/... filters find no tests.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test full, bin/oc-test targeted -- plugin/src/storage/save-change-allow-list.test.ts plugin/src/storage/read-command-boundary.test.ts results=fail — Full suite: worker bundles compiled successfully, then Vitest ended 12 failed files / 51 failed tests / 7888 passed after 912.56s. Failure paths have zero direct overlap with the three changed files. First targeted invocation used incorrect plugin/src filters and found no tests; corrected plugin-relative invocation passed 2 files / 18 tests in 3.90s. git status remained clean. Release reachability failed: HEAD is not an ancestor of origin/trunk; current branch is behind origin/trunk by 15 commits.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/storage/save-change-allow-list.test.ts plugin/src/storage/read-command-boundary.test.ts

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: baseline-red-tk-3319ed594ec4
- verification_missing: No durable adv_run_test evidence found for run_id: green-tk-3319ed594ec4
- verification_missing: No durable adv_run_test evidence found for run_id: check-tk-3319ed594ec4
- The design's fragment-only mechanism does not meet C2's requirement to distinguish executable code from comments and string literals. Both guards first collect raw rg matches and only skip lines whose trimmed text starts with a comment marker or the function definition; neither removes quoted strings nor handles inline/block-comment occurrences structurally.
- Record this independent acceptance review and retain the known unrelated full-suite failure inventory as AC3 evidence; do not attribute those failures to the saveChange guard.
- Checkpoint the two scoped review fixes before acceptance completion; leave production write behavior and allow-list policy unchanged.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/save-change-allow-list.test.ts src/storage/read-command-boundary.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- Do not mark release ready: establish merge/reachability proof for HEAD 5c2a98cb against origin/trunk.
- Triage or restore the 51 unrelated full-suite failures, then rerun bin/oc-test full.
- Leave the scoped AST guard implementation alone: targeted tests passed and no repository changes were made by this review.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/storage/save-change-allow-list.test.ts plugin/src/storage/read-command-boundary.test.ts
