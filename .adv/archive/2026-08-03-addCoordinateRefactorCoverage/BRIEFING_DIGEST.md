# Archive Briefing Digest

**Change ID:** addCoordinateRefactorCoverage
**Title:** Add coordinate refactor coverage
**Status:** archived
**Generated:** 2026-08-03T00:30:04.370Z

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

Showing 19 of 19 durable facts.

- **[unresolved_action]** required_main_agent_actions: Use this persisted reviewer report as the reviewer-owned static-check evidence for tk-4d141d1c68be and proceed with normal task completion.
- **[unresolved_action]** required_main_agent_actions: Do not revisit the command content or alter deployment behavior in this task. If desired, separately assess the pre-existing post-commit deployment design against P32; it is not a blocker for DDC6 parity.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] The post-commit deployment hook is intentionally unchanged by the command-content checkpoint and deploys local assets from the committing checkout. DDC parity can therefore be proven before trunk merge, but this produces a deployed copy ahead of trunk until merge.
- **[archive_only_evidence]** verification: tests_run=sha256sum ".opencode/command/adv-coordinate.md" "/home/jon/.config/opencode/command/adv-coordinate.md" "/home/jon/dev/advance/.opencode/command/adv-coordinate.md", grep '^## Phase 6\.5: Refactor Coverage Audit$' /home/jon/.config/opencode/command/adv-coordinate.md, git diff --quiet f08fa395^ f08fa395 -- .githooks/post-commit; git show f08fa395^:.githooks/post-commit | sha256sum; sha256sum .githooks/post-commit, git log --format='%H%n%B%n---' -1 f08fa395; git show --format= --name-status f08fa395; git config --get core.hooksPath results=pass — Branch and deployed hashes are both 9c227f6cdaccbbf9c51ce0ae255175302fe49bfd172b5c2820ac59eb735e90fb; trunk is 5661658660885ba7009fb0c7cdf818f1ad3fe8cafa7cb21e0e71607d1ebe4015. Deployed file contains Phase 6.5 at line 171. f08fa395 changed only .opencode/command/adv-coordinate.md; post-commit hook was byte-identical before/after and is active via core.hooksPath=.githooks. Hook lines 21-25 include .opencode/command/ and line 53 runs deploy-local.sh --fix; deploy-local lines 26 and 137-144 copy command assets to ~/.config/opencode/command. No manual deployment command was run for this task. The deployed-ahead-of-trunk state is accurately a pre-existing automatic-hook release-time observation, not a DDC6 defect, and does not block this static parity task.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: sha256sum ".opencode/command/adv-coordinate.md" "/home/jon/.config/opencode/command/adv-coordinate.md" "/home/jon/dev/advance/.opencode/command/adv-coordinate.md"
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: grep '^## Phase 6\.5: Refactor Coverage Audit$' /home/jon/.config/opencode/command/adv-coordinate.md
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --quiet f08fa395^ f08fa395 -- .githooks/post-commit; git show f08fa395^:.githooks/post-commit | sha256sum; sha256sum .githooks/post-commit
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git log --format='%H%n%B%n---' -1 f08fa395; git show --format= --name-status f08fa395; git config --get core.hooksPath
- **[archive_only_evidence]** verification: tests_run=branch=$(sha256sum .opencode/command/adv-coordinate.md | cut -d ' ' -f1); deployed=$(sha256sum ~/.config/opencode/command/adv-coordinate.md | cut -d ' ' -f1); test "$branch" = "$deployed" && test "$branch" != "5661658660885ba7009fb0c7cdf818f1ad3fe8cafa7cb21e0e71607d1ebe4015" && grep -Fqx '## Phase 6.5: Refactor Coverage Audit' ~/.config/opencode/command/adv-coordinate.md && printf 'branch=%s\ndeployed=%s\nPASS: branch==deployed, differs from baseline, deployed contains Phase 6.5\n' "$branch" "$deployed" results=pass — Typed adv_run_test run tr_mscgrs6m_1a8ef40a: exit 0, classification passed. It proved branch/deployed SHA equality (9c227f6cdaccbbf9c51ce0ae255175302fe49bfd172b5c2820ac59eb735e90fb), inequality from baseline 5661658660885ba7009fb0c7cdf818f1ad3fe8cafa7cb21e0e71607d1ebe4015, and deployed literal Phase 6.5 heading. Prior proving run tr_mscgomr2_486b2e9f independently recorded the same assertions.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: branch=$(sha256sum .opencode/command/adv-coordinate.md | cut -d ' ' -f1); deployed=$(sha256sum ~/.config/opencode/command/adv-coordinate.md | cut -d ' ' -f1); test "$branch" = "$deployed" && test "$branch" != "5661658660885ba7009fb0c7cdf818f1ad3fe8cafa7cb21e0e71607d1ebe4015" && grep -Fqx '## Phase 6.5: Refactor Coverage Audit' ~/.config/opencode/command/adv-coordinate.md && printf 'branch=%s\ndeployed=%s\nPASS: branch==deployed, differs from baseline, deployed contains Phase 6.5\n' "$branch" "$deployed"
- **[report_follow_up]** follow_ups: Evidence-label vocabulary drift persists by design: adv-coordinate.md uses hyphen adv-backed-fact while spec/docs use underscore adv_backed_fact, both assertion-locked. Normalization deferred per DONT3 and warrants its own change.
- **[report_follow_up]** follow_ups: The pre-existing .githooks/post-commit hook deploys from the committing checkout, leaving the deployed copy ahead of trunk until merge. Not introduced by this change; warrants separate assessment against the deploy-from-trunk rule.
- **[report_follow_up]** follow_ups: adv_subagent_report_submit rejects agent value adv-researcher (discriminator allows engineer/reviewer/designer only) and its lifecycle excludes discovery/design, so researcher-lane reports have no valid typed transport. Observed twice during this change.
- **[report_follow_up]** follow_ups: Optional cross-reference: add an upstream-callers pointer in adv-refactor.md and a matching line in the adv-cleanup.md coexistence table now that /adv-coordinate also feeds /adv-refactor.
- **[report_follow_up]** follow_ups: Evidence-label vocabulary drift (hyphen adv-backed-fact in command vs underscore adv_backed_fact in spec/docs) remains deliberately untouched per DONT3; normalization warrants its own change.
- **[report_follow_up]** follow_ups: Pre-existing .githooks/post-commit deploys from the committing checkout, leaving the deployed copy ahead of trunk until merge; warrants separate assessment against the deploy-from-trunk rule.
- **[report_follow_up]** follow_ups: adv_subagent_report_submit rejects agent value adv-researcher and its lifecycle excludes discovery/design, leaving researcher-lane reports without a valid typed transport.
- **[archive_only_evidence]** findings: [info] documentation-hygiene: FIXED during harden: Phase 6.5 overstated /adv-refactor's lack of status checking. Its pre-flight does read change status via adv_change_show; the accurate claim is that it has no explicit terminal-state guard. Reworded so the contract text is precisely true.
- **[archive_only_evidence]** findings: [info] documentation-hygiene: REJECTED WITH EVIDENCE: adv-refactor.md and adv-cleanup.md do not name /adv-coordinate as an upstream referral source. Not fixed during this change.

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

## Unresolved Actions

- Use this persisted reviewer report as the reviewer-owned static-check evidence for tk-4d141d1c68be and proceed with normal task completion.
- Do not revisit the command content or alter deployment behavior in this task. If desired, separately assess the pre-existing post-commit deployment design against P32; it is not a blocker for DDC6 parity.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: sha256sum ".opencode/command/adv-coordinate.md" "/home/jon/.config/opencode/command/adv-coordinate.md" "/home/jon/dev/advance/.opencode/command/adv-coordinate.md"
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: grep '^## Phase 6\.5: Refactor Coverage Audit$' /home/jon/.config/opencode/command/adv-coordinate.md
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --quiet f08fa395^ f08fa395 -- .githooks/post-commit; git show f08fa395^:.githooks/post-commit | sha256sum; sha256sum .githooks/post-commit
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git log --format='%H%n%B%n---' -1 f08fa395; git show --format= --name-status f08fa395; git config --get core.hooksPath
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: branch=$(sha256sum .opencode/command/adv-coordinate.md | cut -d ' ' -f1); deployed=$(sha256sum ~/.config/opencode/command/adv-coordinate.md | cut -d ' ' -f1); test "$branch" = "$deployed" && test "$branch" != "5661658660885ba7009fb0c7cdf818f1ad3fe8cafa7cb21e0e71607d1ebe4015" && grep -Fqx '## Phase 6.5: Refactor Coverage Audit' ~/.config/opencode/command/adv-coordinate.md && printf 'branch=%s\ndeployed=%s\nPASS: branch==deployed, differs from baseline, deployed contains Phase 6.5\n' "$branch" "$deployed"
