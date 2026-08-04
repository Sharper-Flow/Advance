# Archive Briefing Digest

**Change ID:** extendCleanupHygieneCoverage
**Title:** Extend cleanup hygiene coverage
**Status:** archived
**Generated:** 2026-08-04T04:41:50.681Z

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

Showing 36 of 36 durable facts.

- **[archive_only_evidence]** decisions: Applied only Prettier's required multiline wrapping to the existing expect() call. — The sole check failure was formatting width; preserving the regex and assertion logic satisfies the locked scope.
- **[archive_only_evidence]** verification: pnpm run check (0) — Full plugin check passed; schema, typecheck, manifests, isolation, lockfile, lint, and format checks all green. Four pre-existing eslint warnings remain, with 0 errors.
- **[archive_only_evidence]** verification: npx vitest run --project unit src/adv-cleanup-contract-assets.test.ts (0) — Affected contract asset test file passed 56/56 tests.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdyl23j_d83ebf12
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdylfkb_6216b3a0
- **[report_follow_up]** follow_ups: Reconcile the adv-cleanup command frontmatter description with plugin/src/manifest.ts in a separately authorized scope, then rerun bin/oc-test full.
- **[unresolved_action]** required_main_agent_actions: Resolve the pre-existing plugin/src/manifest.ts:395 versus .opencode/command/adv-cleanup.md:3 description drift in an authorized follow-up before claiming full-suite green.
- **[archive_only_evidence]** decisions: Added an explicit Phase 1 dryRun hazard warning and separated DISCOVERY versus APPLY tool rows. — adv_worktree_cleanup has no safe default; omission of dryRun is destructive.
- **[archive_only_evidence]** decisions: Anchored irreversible section extraction to each file's owning heading while preserving intentional first-match semantics. — A generic irreversible heading scan could silently target a future unrelated section.
- **[unresolved_action]** blockers: Full suite remains red on manifest-doc-drift.test.ts because the command frontmatter description does not equal the manifest description.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Full-suite verification found a pre-existing command/manifest description drift. It was not changed because plugin/src/manifest.ts is outside the exact three-file scope and changing the command description would make the four-surface command summary inaccurate.
- **[archive_only_evidence]** verification: bin/oc-test full (1) — Full suite has one failure in manifest-doc-drift.test.ts: command frontmatter description differs from plugin/src/manifest.ts; mismatch was present at the task baseline and is outside the exact three-file scope.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mse0f0wk_2c04d989
- **[report_follow_up]** follow_ups: Could not read the actual current /adv-cleanup implementation to confirm the exact approval-prompt shape and whether 'approve all' today truly spans all buckets in one prompt or is already per-bucket — relied on task description. Verify against plugin/src/tools or the command packet before implementing the tier split.
- **[report_follow_up]** follow_ups: Could not find a single canonical source that explicitly names 'combining reversible and irreversible behind one confirmation flag' as a named anti-pattern; the guidance is convergent-but-implicit across clig.dev (tiered danger), clispec.dev (reserve gates for destructive/irreversible), and peterc compact-contract (per-resource reversible field + stronger guard for irreversible). Verdict rests on convergence of three sources, not a single normative citation.
- **[report_follow_up]** follow_ups: Did not verify the ADV underlying worktree-deletion tool's specific safety refusals beyond confirming git worktree remove's default refuses dirty trees without --force. If the ADV tool goes beyond git's defaults (e.g. refuses unpushed branches, process-CWD worktrees), document those as defense-in-depth in the bucket prompt so the user sees the safety net.
- **[report_follow_up]** follow_ups: Branch -d recoverability window (~30-90d via HEAD reflog before gc.reflogExpireUnreachable prunes) should be surfaced in the destructive-bucket prompt so the user understands recovery is time-bounded, not indefinite.
- **[research_citation]** sources: clig.dev — Command Line Interface Guidelines (Confirm before doing anything dangerous; -n/--dry-run; -f/--force): Canonical CLI design guidance. Tiered danger model: Mild (delete a file, maybe prompt), Moderate (delete a directory / remote resource / bulk mod that can't be easily undone — prompt + offer dry-run), Severe (delete entire app/server — make hard to confirm by accident, type name-of-thing, --confirm flag). Explicitly flags implicit bulk deletion (config 10->1 deletes 9 things) as severe risk that must be hard to do by accident. Endorses y/yes + -f/--force convention; -n/--dry-run is a standard flag. (https://clig.dev/#robustness-guidelines)
- **[research_citation]** sources: The CLI Spec (clispec.dev) — Principles 4 & 5: 'Reserve new confirmation gates for genuinely destructive or irreversible operations, and introduce them as deliberate design decisions.' Non-TTY must refuse with confirmation_required error naming bypass flag, never proceed silently. Endorses --dry-run with structured output for destructive ops. (https://clispec.dev/)
- **[research_citation]** sources: peterc — A compact contract for CLIs for agents and dev tools (2026-06-06 gist): Sharpest direct guidance on risk asymmetry: 'Classify danger by decision tests... More danger tests matched => stronger guard. Low-risk reversible local changes may skip confirmation; bulk/remote/irreversible changes get confirmation plus --dry-run; high-impact named targets require typed target or --confirm=<name>.' Dry-run plan schema includes per-resource reversible:false field and per-plan risks:['remote_state','irreversible']. (https://gist.github.com/peterc/bef25ee122d233c53a851b9ace29efef)
- **[research_citation]** sources.omitted: 15 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The FUSED report+execute pattern is well-established and correct for a hygiene/prune command (docker system prune, git prune/gc, kubectl delete --dry-run, npm prune, cargo sweep, nix-collect-garbage all fuse; even terraform's separated plan/apply has a fused automatic-plan default). ADV /adv-cleanup fits this category and should NOT be split into separate commands. The dry-run-default + whitelist-only-regex approval design is also canonical (clig.dev endorses y/yes + -f; clig.dev/Arcjet explicitly endorse NO fuzzy matching). HOWEVER, putting REVERSIBLE (ADV change close, metadata) and IRREVERSIBLE (worktree dir delete, branch -d) operations behind the SAME --execute flag and SAME 'approve all' prompt is in tension with three independent authoritative sources: clig.dev's Severe-tier guidance (line 820-826), clispec.dev Principle 4 ('reserve confirmation gates for genuinely destructive or irreversible operations'), and peterc's compact contract ('More danger tests matched => stronger guard... irreversible changes get confirmation plus --dry-run'). The recoverability analysis partially mitigates severity (worktree delete is actually LOW risk because branch+commits survive; branch -d is MODERATE because time-bounded reflog recovery ~30-90d; only the directory removal and ref+reflog are truly gone), but it does NOT collapse the asymmetry: change-close is zero-effort reversible, while branch -d requires reflog archaeology under a time deadline. One shared tier is therefore defensible only if each irreversible bucket receives a distinct, name-listing sub-prompt; a single bulk 'approve all' covering reversible+irreversible together is the clig.dev line-826 'easy to do by accident' anti-pattern.
- **[unresolved_action]** required_main_agent_actions: Review and persist the six scoped remediation files before archive; do not create a commit through the known hanging post-commit deploy hook without a safe operator-controlled path.
- **[unresolved_action]** required_main_agent_actions: After merge, from the default-branch trunk checkout only: run `pnpm run build`, then `./scripts/deploy-local.sh --fix`, then restart OpenCode/plugin host so mirrored command/skill and compiled manifest become live. Do not deploy from this worktree.
- **[unresolved_action]** required_main_agent_actions: Record both accepted deviations in release notes: NO_DELTAS direct spec edit and inherited red CI from da0344dd / health-field-scope.test.ts.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When a command accepts subset approval for destructive candidates, its delegated mutation must carry an exact candidate selector. An unscoped batch cleanup call can silently exceed `delete N` authorization even when the confirmation parser is strict.
- **[archive_only_evidence]** changes_made: .opencode/command/adv-cleanup.md: Synced public description and scope-limited merged-branch apply calls to one approved candidate changeId; forbids unscoped apply.
- **[archive_only_evidence]** changes_made: skills/adv-cleanup/SKILL.md: Mirrored the per-approved-candidate archived-branch apply rule and unscoped-apply prohibition.
- **[archive_only_evidence]** changes_made: plugin/src/adv-cleanup-contract-assets.test.ts: Added regression assertions for description synchronization and candidate-scoped archived-branch deletion.
- **[archive_only_evidence]** changes_made: plugin/src/manifest.ts: Synced the user-facing adv-cleanup description with typed-confirmation capability.
- **[archive_only_evidence]** changes_made: README.md: Disclosed that only approved safe worktrees/branches can be deleted with typed confirmation.
- **[archive_only_evidence]** changes_made: ADV_INSTRUCTIONS.md: Disclosed the same typed-confirmed deletion behavior in the advanced-command reference.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-cleanup-contract-assets.test.ts, pnpm exec prettier --check src/manifest.ts src/adv-cleanup-contract-assets.test.ts, git diff --check results=pass — Targeted contract suite passed 69/69. Prettier passed for both changed TypeScript files. git diff --check passed. An initial target used the wrong path prefix and found no files; corrected plugin-relative target passed. Full suite was not rerun per packet.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-cleanup-contract-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/manifest.ts src/adv-cleanup-contract-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
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
| DONT5 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdyl23j_d83ebf12
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdylfkb_6216b3a0
- Resolve the pre-existing plugin/src/manifest.ts:395 versus .opencode/command/adv-cleanup.md:3 description drift in an authorized follow-up before claiming full-suite green.
- Full suite remains red on manifest-doc-drift.test.ts because the command frontmatter description does not equal the manifest description.
- finish_owned_scope_then_report: Full-suite verification found a pre-existing command/manifest description drift. It was not changed because plugin/src/manifest.ts is outside the exact three-file scope and changing the command description would make the four-surface command summary inaccurate.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mse0f0wk_2c04d989
- Review and persist the six scoped remediation files before archive; do not create a commit through the known hanging post-commit deploy hook without a safe operator-controlled path.
- After merge, from the default-branch trunk checkout only: run `pnpm run build`, then `./scripts/deploy-local.sh --fix`, then restart OpenCode/plugin host so mirrored command/skill and compiled manifest become live. Do not deploy from this worktree.
- Record both accepted deviations in release notes: NO_DELTAS direct spec edit and inherited red CI from da0344dd / health-field-scope.test.ts.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-cleanup-contract-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/manifest.ts src/adv-cleanup-contract-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
