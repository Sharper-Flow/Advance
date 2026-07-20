# Archive Briefing Digest

**Change ID:** fixScopeRepoFixture
**Title:** Fix scope repo fixture
**Status:** archived
**Generated:** 2026-07-20T19:25:38.899Z

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

Showing 17 of 17 durable facts.

- **[archive_only_evidence]** verification: tests_run=git diff 1328c5c20ca2db5f5a48ff23bb91cec443caf478^ 1328c5c20ca2db5f5a48ff23bb91cec443caf478 -- plugin/src/tools/cross-project-coordination.test.ts, lgrep exact scan for "w".repeat(40) and repoProjectId, bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts results=pass — Commit is confined to the specified test file: seven invalid "w".repeat(40) fixture/expected-ID occurrences became valid "a".repeat(40) values. All three product-context fixture blocks in this file now use matching valid current-repo IDs; no "w".repeat(40) remains in the file. Assertions and test control flow remain unchanged. Fresh targeted verification passed: 1 file, 8 tests, exit 0 (4.01s). Recorded evidence additionally supplies 10 consecutive targeted runs, typecheck, Prettier, and PR #262 CI 6/6 green/mergeable.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff 1328c5c20ca2db5f5a48ff23bb91cec443caf478^ 1328c5c20ca2db5f5a48ff23bb91cec443caf478 -- plugin/src/tools/cross-project-coordination.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: lgrep exact scan for "w".repeat(40) and repoProjectId
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts
- **[archive_only_evidence]** verification: tests_run=adv_run_test tr_mrtfktp9_e1b3167c — RED: invalid non-hex fixture reproduction (expected failure), adv_run_test tr_mrtflc18_ac83e9c5 — GREEN: corrected fixture verification, adv_run_test tr_mrtfnokv_c602968f — 10 consecutive targeted runs, exit 0, adv_run_test tr_mrtfo681_46b8faee — TypeScript typecheck and Prettier, exit 0, PR #262 CI — 6/6 green; mergeable/CLEAN results=pass — Independent review at checkpoint 1328c5c20ca2db5f5a48ff23bb91cec443caf478: worktree is clean relative to checkpoint and git diff --check passed. Commit changes only plugin/src/tools/cross-project-coordination.test.ts, replacing all seven scoped invalid "w".repeat(40) fixture/expected IDs with schema-valid "a".repeat(40) values; test control flow and assertions otherwise remain unchanged. Recorded typed evidence pointers: RED tr_mrtfktp9_e1b3167c expected failure; GREEN tr_mrtflc18_ac83e9c5; deterministic targeted run series tr_mrtfnokv_c602968f exit 0 (10 consecutive runs); typecheck + Prettier tr_mrtfo681_46b8faee exit 0; PR #262 CI 6/6 green and mergeable/CLEAN. Contract matrix: AC1–AC4 pass; C1–C2 and DONT1–DONT3 respected (9/9).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfktp9_e1b3167c — RED: invalid non-hex fixture reproduction (expected failure)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtflc18_ac83e9c5 — GREEN: corrected fixture verification
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfnokv_c602968f — 10 consecutive targeted runs, exit 0
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfo681_46b8faee — TypeScript typecheck and Prettier, exit 0
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: PR #262 CI — 6/6 green; mergeable/CLEAN
- **[report_follow_up]** follow_ups: No tests were executed during this research pass; repeated targeted test runs and relevant static/type checks remain required.
- **[report_follow_up]** follow_ups: Source evidence proves the invalid fixture and failure path, but not the cause of intermittency itself.
- **[research_citation]** sources: Canonical project identity implementation: ADV project identity derives from the Git root commit; synthetic test IDs are explicitly 40 hexadecimal characters. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-scope-repos-flake/plugin/src/utils/project-id.ts#L1-L70)
- **[research_citation]** sources: Related repository project-ID schema: RelatedRepoSchema requires repo_project_id to match lowercase 40-hex format. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-scope-repos-flake/plugin/src/types/project.ts#L33-L37)
- **[research_citation]** sources: Change repository-scope schema: ChangeRepoScopeSchema requires persisted repo_project_id to match lowercase 40-hex format. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-scope-repos-flake/plugin/src/types/changes.ts#L332-L348)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: CONFIRMED. ADV's canonical and schema-enforced project identity is 40 lowercase hexadecimal characters. Direct ProductContext test fixtures bypass schema typing because their fields are plain strings; default scope resolution then propagates an invalid value into schema-validated persisted change scope. Replacing the invalid non-hex fixture value consistently with a valid 40-hex value is the simplest structural fix and requires no production behavior change. Source inspection establishes the latent fixture defect but does not independently establish why observed execution was intermittent rather than consistent.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff 1328c5c20ca2db5f5a48ff23bb91cec443caf478^ 1328c5c20ca2db5f5a48ff23bb91cec443caf478 -- plugin/src/tools/cross-project-coordination.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: lgrep exact scan for "w".repeat(40) and repoProjectId
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfktp9_e1b3167c — RED: invalid non-hex fixture reproduction (expected failure)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtflc18_ac83e9c5 — GREEN: corrected fixture verification
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfnokv_c602968f — 10 consecutive targeted runs, exit 0
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_run_test tr_mrtfo681_46b8faee — TypeScript typecheck and Prettier, exit 0
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: PR #262 CI — 6/6 green; mergeable/CLEAN
