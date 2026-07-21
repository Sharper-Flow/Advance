# Archive Briefing Digest

**Change ID:** tightenPreProposalCommands3
**Title:** Tighten pre-proposal commands
**Status:** archived
**Generated:** 2026-07-21T17:30:39.079Z

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

Showing 13 of 13 durable facts.

- **[research_citation]** sources: ADV agreement (approved): Objectives O1–O4 and AC1–AC7 require command/body/routing alignment, explicit persistence behavior, an adv-improve iterate exit, and aligned exit grammar. (adv_change_show://tightenPreProposalCommands3/agreement)
- **[research_citation]** sources: adv-problem command contract: Current Phase 1 covers bug, failure, and confusing behavior; it captures symptoms, observed versus expected behavior, frequency, environment, and changes. Its output requires RCA for defect/bug/regression paths. (file:///home/jon/dev/advance/.opencode/command/adv-problem.md)
- **[research_citation]** sources: adv-improve command contract: Current-state scan is Phase 2 and External Landscape is Phase 4; the command is read-only for ADV state and persists only docs/*-prep.md evidence packs. (file:///home/jon/dev/advance/.opencode/command/adv-improve.md)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The proposed text changes preserve the existing command-frontmatter → manifest → documentation mirror architecture and fit the command bodies and routing/spec-law boundaries. One minor design gap remains: DD3 selects an emoji-prefixed iterate label although the two reference commands currently use different iterate labels, so it cannot itself establish literal all-three exit-label consistency.
- **[unresolved_action]** required_main_agent_actions: None; review evidence supports acceptance.
- **[archive_only_evidence]** verification: tests_run=rg -l 'Triage issues before fixing' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md, rg -l 'Triage defects and unintended behavior' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md, rg -l 'Suggest targeted improvements' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md, rg -l 'Improvement analysis and research' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md, rg -n 'Triage issues before|Suggest targeted improvements' ., pnpm run check results=pass — AC1=pass (0 old problem); AC2=pass (5 new problem); AC3=pass (0 old improve); AC4=pass (5 new improve); AC5=pass (adv-improve.md:50 iterate); AC6=pass (Persistence at idea:22, problem:22, improve:28); AC7=pass (`pnpm run check`, exit 0; schemas/typecheck/manifests/isolation/lockfile/lint/Prettier green). SC1=pass (descriptions/routing distinguish idea, defect triage, improvement); SC2=pass (persistence descriptions accurate); SC3=pass (all exit tables use Exit/Condition grammar and iterate, with intentional existing emoji style variance). C1/C2=pass (metadata-only four-commit diff; mirrors complete); C3=pass (adv.md:186/199 route unintended behavior to adv-problem and RCA); C4=pass (adv.md:195 keeps improve/research as differentiated optional pre-proposal clarification); DONT1-DONT4=pass (no split/new command/runtime/spec-rule edit). Whole-repo old-description scan had no matches. `git diff --check HEAD~4..HEAD` passed; worktree clean.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Triage issues before fixing' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Triage defects and unintended behavior' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Suggest targeted improvements' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Improvement analysis and research' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -n 'Triage issues before|Suggest targeted improvements' .
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |

## Unresolved Actions

- None; review evidence supports acceptance.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Triage issues before fixing' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Triage defects and unintended behavior' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Suggest targeted improvements' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -l 'Improvement analysis and research' .opencode/ plugin/src/manifest.ts README.md ADV_INSTRUCTIONS.md SETUP.md
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: rg -n 'Triage issues before|Suggest targeted improvements' .
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
