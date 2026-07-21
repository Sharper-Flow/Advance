# Archive Briefing Digest

**Change ID:** addUserFocusVoiceRule
**Title:** Add user-focus voice rule
**Status:** archived
**Generated:** 2026-07-21T00:51:13.736Z

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

Showing 14 of 14 durable facts.

- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/manifest-doc-drift.test.ts results=pass — Pass: 17/17 manifest-doc-drift tests, exit 0 (adv_run_test tr_mrtxfkaj_236fa882). `git diff --check trunk...HEAD` clean. Contract review: C1 PASS—only six modified files; User-Focus inserted at docs/command-voice-standard.md:15-46 while Core Rules remain :5-13 and Manifest Description Rules begin :48. C2 PASS—no test file changed; :34 and :42 explicitly classify judgment-only/no drift test. C3/DONT3 PASS—motivational aside explicitly says 'not normative' and 'The rule generalizes' at :44-46. C4 PASS—32-line inherently-prose structured section; only the distinct Prose-Load Reduction Rules section is capped at 80 by plugin/src/manifest-doc-drift.test.ts:350-360. DONT1 PASS—translation is explicit human/agent judgment, not regex, at :28-30. DONT2 PASS—single pointer-style reminder at .opencode/agents/adv.md:156 and mirror at .opencode/overlays/adv.overlay.md:15. Deploy chain PASS—scripts/deploy-local.sh:502-527 copies .opencode/agents/adv.md verbatim, invokes sync at :1601-1602, and excludes adv from overlay application at :1604-1612. Campsite fix PASS—the exact manifest text at plugin/src/manifest.ts:462 matches command frontmatter :3, README.md:428, and ADV_INSTRUCTIONS.md:163; repository text scan found no additional markdown mirrors.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts
- **[unresolved_action]** required_main_agent_actions: Integrate trunk, then rerun targeted drift suite, deploy dry-run, and archive dry-run.
- **[unresolved_action]** required_main_agent_actions: Deploy from updated trunk only; restart OpenCode/plugin-host sessions.
- **[unresolved_action]** required_main_agent_actions: Tier B archive sign-off only after refreshed evidence.
- **[archive_only_evidence]** verification: tests_run=git status --short, git log --oneline trunk..HEAD, git diff --stat trunk..HEAD, git rev-list --left-right --count trunk...HEAD, git merge-tree $(git merge-base trunk HEAD) trunk HEAD, bin/oc-test targeted -- src/manifest.test.ts src/manifest-doc-drift.test.ts src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts src/decision-rationale-assets.test.ts, ./scripts/deploy-local.sh --dry-run --diff, adv_change_archive dryRun:true results=fail — Worktree clean; branch is 7 commits behind trunk. Targeted suite: 98/98 tests passed. Deploy dry-run copies adv.md; 83-tool allowlist and config validation pass. Archive dry-run succeeds with NO_DELTAS.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git status --short
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git log --oneline trunk..HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --stat trunk..HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git rev-list --left-right --count trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git merge-tree $(git merge-base trunk HEAD) trunk HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/manifest.test.ts src/manifest-doc-drift.test.ts src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts src/decision-rationale-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ./scripts/deploy-local.sh --dry-run --diff
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_archive dryRun:true

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| C1 | constraint | pass |
| C2 | constraint | pass |
| C3 | constraint | pass |
| C4 | constraint | pass |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts
- Integrate trunk, then rerun targeted drift suite, deploy dry-run, and archive dry-run.
- Deploy from updated trunk only; restart OpenCode/plugin-host sessions.
- Tier B archive sign-off only after refreshed evidence.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git status --short
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git log --oneline trunk..HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --stat trunk..HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git rev-list --left-right --count trunk...HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git merge-tree $(git merge-base trunk HEAD) trunk HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/manifest.test.ts src/manifest-doc-drift.test.ts src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts src/decision-rationale-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ./scripts/deploy-local.sh --dry-run --diff
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_archive dryRun:true
