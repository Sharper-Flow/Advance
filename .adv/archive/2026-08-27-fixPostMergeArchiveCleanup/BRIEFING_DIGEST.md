# Archive Briefing Digest

**Change ID:** fixPostMergeArchiveCleanup
**Title:** Fix post-merge archive cleanup
**Status:** archived
**Generated:** 2026-08-27T21:56:41.221Z

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

Showing 100 of 117 durable facts (17 omitted).

- **[report_follow_up]** follow_ups: Trace all consumers of the archive success payload and errors field before changing the result contract (discovery agenda codebase unknown).
- **[report_follow_up]** follow_ups: Verify whether direct-push and no-PR archive routes share the same projection sequence through finalizeRelease (git-finalize.ts:3674-3759).
- **[report_follow_up]** follow_ups: Confirm refs/pull/{n}/head immutability after merge if it ever becomes load-bearing; the executor revalidation currently covers drift.
- **[report_follow_up]** follow_ups: Exa was unavailable this session (missing EXA_API_KEY) and Episode recall was not on the tool surface; web coverage used official docs directly.
- **[research_citation]** sources: git-merge-base(1) official docs: --is-ancestor exits 0 if the first commit is an ancestor of the second, 1 if not; other non-zero means error. Exact ancestry predicate ADV already uses. (https://git-scm.com/docs/git-merge-base)
- **[research_citation]** sources: git-branch(1) official docs: -d/--delete requires the branch to be fully merged in its upstream or HEAD; -D is a shortcut for --delete --force (verified in fetched page lines 2632-2641). Ancestry checks cannot validate squash-merged content. (https://git-scm.com/docs/git-branch)
- **[research_citation]** sources: GitHub docs: About pull request merges (squash): Squash and merge turns all PR commits into one new commit on the base branch (fast-forward); intermediate PR commits are not preserved on base. Also documents indirect merges: a PR can be marked merged when its commits become reachable via another route, even without this PR satisfying branch protection. (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges)
- **[research_citation]** sources.omitted: 12 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: the deletion planner's proof chain (store terminal status, local ancestry, refs/pull/N/head fetch compared to pr.headRefOid, merge-base --is-ancestor, mergeCommit reachability from origin/default, executor revalidation against head drift) matches or exceeds what the official GitHub CLI itself does for squash-merged branch deletion. Reference pattern: single authoritative writer for terminal facts (the store), disposable repository projections, and a typed result contract that surfaces cleanup refusals. Deviation: NONE in the proof layer; MAJOR in the archive ownership/reporting layer — finalizeRelease creates archive-owned branch state after merge proof with no commit vehicle for terminal projection refresh, and the handler drops the typed cleanup refusal from its reported result while success:true stands. The fix belongs in classification and reporting, not in guard weakening.
- **[report_follow_up]** follow_ups: Deployed submit-tool routing note: a change-scoped adv-researcher report for this advance change must be routed with target_path=/home/jon/dev/advance; the default session store rejects with 'Change not found'.
- **[report_follow_up]** follow_ups: Design should name explicit removals: refreshArchiveBundleProjectionsUnderLock (archive-gate.ts:41-60), inline dual-path loop (handlers-archive.ts:1037-1059), inRepoBundlePath threading (archive-gate.ts:516-893).
- **[report_follow_up]** follow_ups: Out-of-scope follow-up: migrate census.ts:98 / triage.ts:352 / detach.ts:126 to the new NUL status parser later; do not expand this change (DONT4).
- **[report_follow_up]** follow_ups: Design should specify which planner input enables archive-owned classification, since generic force:true must not select it (DDC8) and the current dirty refusal (deletion-planner.ts:518-524) has no other entry.
- **[research_citation]** sources: Executor PR-merged lease revalidation: Existing under-lease revalidation of PR identity, head/repository/default-branch drift, fetched PR head, and merge-commit reachability with typed drifted codes; dispatch at :739-741. (plugin/src/tools/worktree/deletion-executor.ts:520-702)
- **[research_citation]** sources: Integration proof token schema: pr_merged kind already binds prNumber, prHeadOid, mergeCommitOid, headRepository, baseRepository; wdp1 optional-field compat pattern at :25-30 and :75-76; stableStringify token bindings at :111-114. (plugin/src/tools/worktree/deletion-contracts.ts:36-50)
- **[research_citation]** sources: Shared NUL porcelain parser: Canonical NUL-delimited parsing module for git worktree list, with tests at porcelain-parser.test.ts:71+; status parsing elsewhere is non-NUL and duplicated (census.ts:98, triage.ts:352, detach.ts:126). (plugin/src/tools/worktree/porcelain-parser.ts:19-100)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: the draft design's reuse targets already exist in source. The executor already revalidates bound PR identity, head drift, repository identity, default branch, fetched PR head, and merge-commit reachability under the repository lease (deletion-executor.ts:520-702, dispatched at :739-741 for kind 'pr_merged'). The integration-proof token schema already carries exact PR identity fields (deletion-contracts.ts:36-50) with a proven optional-field wdp1 compatibility pattern (:25-30, :75-76, stableStringify bindings :111-114). A shared NUL porcelain parser module exists (porcelain-parser.ts:19-100) but covers only git worktree list; status parsing is non-NUL and duplicated (census.ts:98, triage.ts:352, detach.ts:126). The dual-path terminal bundle refresh the design must retire exists in two live copies (archive-gate.ts:41-60; handlers-archive.ts:1037-1059) plus inRepoBundlePath threading through recovery/retry (archive-gate.ts:516,558,652,761,782,843-893). Six real poisoned archive bundles exist as fixture surfaces in pokeedge-web (.adv/archive/2026-08-2*-...). Reference pattern: extend the first behavior owner rather than adding parallel mechanisms. Deviation: NONE at architecture level; five placement/reuse refinements make DDC4/DDC7/DDC11 structural instead of procedural.
- **[report_follow_up]** follow_ups: Planning task or test must pin the removal-mode-aware ancestry direction in the executor seam (AC10 negative case: archive-mode revalidation must not fail pr_revalidation_local_head_not_in_pr before archive proof runs).
- **[report_follow_up]** follow_ups: adv_spec has no target_path parameter, so spec-law review used the repo-tracked mirrors in /home/jon/dev/advance/docs/specs/; spec-delta execution must re-verify against typed specs through ADV tooling in the advance project.
- **[report_follow_up]** follow_ups: The persisted report schema rejected the packet anchor block and the OUTPUT_SCHEMA extensions (spec_law_implications, summary, required_validation_consistency) as unrecognized keys; those dimensions are carried in validation.notes, architecture_assessment, and the final response instead.
- **[report_follow_up]** follow_ups: Episode recall and lgrep were unavailable on this sub-agent surface; validation relied on source reads, spec mirrors, and official documentation.
- **[research_citation]** sources: handlers-archive.ts (local source): Verifies D1 ordering (writers run before finalizeRelease), the D3 extraction range, the dual-target refresh loop at 1038-1058, the route-name branch gate at 1131-1147, and the dropped targetedWorktreeDeleteResult in final output. (plugin/src/tools/change/handlers-archive.ts:689-777,840-1201)
- **[research_citation]** sources: git-finalize.ts (local source): Verifies commitArchiveArtifacts commits before verifyDirectMergedPrProof merged-PR detection, and that deleteChangeBranch returns a non-throwing typed DeleteChangeBranchResult the handler currently discards. (plugin/src/tools/archive-helpers/git-finalize.ts:342-376,3735-3742,3880-3932)
- **[research_citation]** sources: archive-gate.ts (local source): Verifies the dual-target refreshArchiveBundleProjectionsUnderLock helper that D2 deletes. (plugin/src/tools/change/archive-gate.ts:41-60)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: repository writers (reconcileInRepoArchive, archiveChange) and commitArchiveArtifacts run before merged-PR proof; terminal refresh writes dual targets including the tracked in-repo bundle; the handler computes typed worktree/branch results then drops them from output. Reference pattern: prove merge before any repository write; keep one projection owner; consume every non-throwing typed result; make destructive force authority content-bound and lease-revalidated. Deviation: NONE between design and reference; the design corrects the codebase toward the reference. All cited levers verified in source. Official Git docs confirm worktree remove --force semantics, porcelain v1 -z NUL format with reversed rename fields, and merge-base --is-ancestor directionality. GitHub docs confirm squash merges do not preserve PR-head ancestry in the base branch, validating the design's choice of recorded merge-commit reachability plus fetched refs/pull/N/head equality as proof. required_validation_consistency: caution (matches validation.status).
- **[unresolved_action]** required_main_agent_actions: Resolve the prompt floor regression, then rerun pnpm run check from plugin/.
- **[archive_only_evidence]** decisions: Regenerated both Markdown mirrors with generateSpecDoc using the edited typed specs. — The mirrors had pre-existing drift and must match the repository generator exactly.
- **[archive_only_evidence]** decisions: Retained the approved JSON spec edits and ADR 0010 without changes. — The requested recovery resumed existing partial edits and validation found no concrete defect in those files.
- **[unresolved_action]** blockers: The plugin check did not complete because the prompt floor guard failed.
- **[archive_only_evidence]** verification: pnpm exec tsx -e 'import { readFile } from "node:fs/promises"; import { generateSpecDoc } from "./src/archive/docs.ts"; (async () => { let failed = false; for (const name of ["advance-workflow", "worktree-lifecycle"]) { const spec = JSON.parse(await readFile(`../.adv/specs/${name}/spec.json`, "utf8")); const expected = generateSpecDoc(spec); const actual = await readFile(`../docs/specs/${name}.md`, "utf8"); if (actual !== expected) { failed = true; console.error(`${name}: mismatch`); } else { console.log(`${name}: exact`); } } if (failed) process.exitCode = 1; })();' (0) — advance-workflow: exact; worktree-lifecycle: exact
- **[archive_only_evidence]** verification: pnpm run check (1) — Failed at prompt floor check. Exact output: prompt floor regression detected: floorBytes: 236847 (+3394) > 233453; [ELIFECYCLE] Command failed with exit code 1.
- **[archive_only_evidence]** decisions: Run merged replay detection after task, gate, validation, and contract proof but before archive path selection. — This prevents archiveChange, reconcileInRepoArchive, finalization, and tracked projection writes from running on a proven merged replay.
- **[archive_only_evidence]** decisions: Require exact merged PR proof and a matching committed tracked bundle. — The replay path must validate repository, branch, PR head, base branch, released commit reachability, bundle date identity, and archived change identity.
- **[archive_only_evidence]** decisions: Refresh only the canonical external bundle during replay completion. — The tracked in-repository bundle is release evidence and must remain byte-stable after merge.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (1) — RED: focused tests failed because merged replay detection and completion were not implemented.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (0) — GREEN: 24 focused tests passed. TypeScript, ESLint, Prettier, and diff checks also passed separately.
- **[report_follow_up]** follow_ups: The broader plugin check still reports a prompt-budget floor regression. This task changed no prompt files. Full check needs the existing floor issue reviewed.
- **[unresolved_action]** required_main_agent_actions: Review the prompt-budget floor result during full change validation.
- **[archive_only_evidence]** decisions: Added one completeShippedChange seam for normal shipped archives and verified merged replay. — The seam orders terminal transition and canonical refresh before epic, issue, worktree, and source retirement effects.
- **[archive_only_evidence]** decisions: Mapped worktree cleanup to deleted, already_absent, or retained dispositions. — A cleanup refusal must preserve archived success and return bounded classification and blocker evidence.
- **[archive_only_evidence]** decisions: Required the deletion plan path to equal the supplied proven worktree path. — Merged replay must not infer or delete a different worktree.
- **[archive_only_evidence]** decisions: Skipped terminal bundle refresh on exact merged replay while retaining refresh behavior for other archive recovery paths. — Exact replay must not repeat tracked writers, while existing release recovery keeps its prior durability behavior.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (1) — RED: focused tests failed on missing shared shipped completion, terminal replay rewrite suppression, and cleanup side effects.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (0) — GREEN: 27 focused tests passed. TypeScript, ESLint, Prettier, archive Phase 9 tests, and archive handler tests also passed.
- **[archive_only_evidence]** decisions: Made completeMergedArchiveReplay construct a replay-specific completion input that omits inRepoBundlePath. — The shared non-replay recovery helper may refresh both projections, but verified merged replay can refresh only the canonical external bundle.
- **[archive_only_evidence]** decisions: Kept the inRepoBundlePath argument on the merged replay test seam but ignored it at the replay boundary. — The test proves that a supplied tracked-bundle path cannot reach the merged replay writer.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (1) — RED: the new nonterminal merged-replay test found two refresh calls when only the canonical external bundle was allowed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (0) — GREEN: 28 focused tests passed. Typecheck, lint, Prettier, and git diff checks also passed.
- **[archive_only_evidence]** decisions: Added archive_owned_projection as a signed mode on the existing plan and executor. — This preserves one deletion authority while preventing generic force from selecting historical recovery.
- **[archive_only_evidence]** decisions: Used one NUL-safe status parser for census and executor revalidation. — Leading status bytes and arbitrary path bytes must remain intact during cleanliness proof.
- **[archive_only_evidence]** decisions: Allowed archive-mode force removal only after PR, ancestry, path, status, hash, terminal, CWD, and lease revalidation. — Historical generated projection changes can be removed without weakening normal cleanup guards.
- **[archive_only_evidence]** verification: focused deletion and archive tests (1) — RED reproduced missing proof-bound recovery behavior and handler wiring.
- **[archive_only_evidence]** verification: focused deletion and archive tests (0) — GREEN passed 7 files and 142 tests. TypeScript, ESLint, Prettier, and diff checks also passed.
- **[report_follow_up]** follow_ups: Investigate the repository prompt-floor regression before the parent runs the complete plugin check.
- **[unresolved_action]** required_main_agent_actions: Review the prompt-floor check failure separately from this worktree recovery task.
- **[archive_only_evidence]** decisions: Construct archive recovery proof inside the archive cleanup owner. — The archive handler now creates the proof after terminal refresh, instead of accepting caller-supplied recovery authority.
- **[archive_only_evidence]** decisions: Require a clean worktree for archive recovery and omit archive-specific force removal. — Historical recovery can remove only a clean worktree. The executor now rechecks empty status before removal and passes force only for generic approved deletion.
- **[archive_only_evidence]** decisions: Bind the exact bundle root and canonical bundle files. — The planner derives the root from the bundle identity. The executor rechecks canonical file hashes, committed archive paths, and local file hashes under the lease.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: The full plugin check stops at the repository prompt-floor check. No prompt files are in this task scope.
- **[archive_only_evidence]** verification: bunx vitest run plugin/src/tools/worktree/deletion-contracts.test.ts plugin/src/tools/worktree/deletion-planner.test.ts plugin/src/tools/worktree/deletion-executor.test.ts plugin/src/tools/worktree/deletion-public-contract.test.ts plugin/src/tools/worktree/index-delete.test.ts plugin/src/tools/change/handlers-archive.partial-repair.test.ts (0) — 127 tests passed across 6 files. Typecheck, lint, format, and git diff checks also passed.
- **[unresolved_action]** required_main_agent_actions: Review the added census-scan and index-delete test files because remediation expanded the changed set from 13 to 15 files.
- **[unresolved_action]** required_main_agent_actions: Run Task 5's full archive replay and cleanup route matrix before acceptance.
- **[unresolved_action]** required_main_agent_actions: If satisfied, checkpoint and complete tk-308402da4e2d through the main-agent workflow.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] `git diff --name-status -z` emits status and path as separate NUL fields. Tests must use `A\0path\0`, not a tab-delimited record.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Historical archive recovery must derive a narrow `pr_merged` integration proof before generic PR integration logic. The planner and executor then bind and revalidate repository, PR, ancestry, terminal, path, hash, CWD, lock, lease, and expiry facts.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/handlers-archive.ts: Separated the absolute local repository identity from the GitHub PR repository identity, parsed production Git name-status output, verified reverse ancestry before proof construction, and matched durable terminal evidence.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/handlers-archive.partial-repair.test.ts: Added a real Git fixture that proves archive completion constructs local and PR identities, production NUL encodings, reverse ancestry, and terminal evidence.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/porcelain-parser.ts: Added one shared parser for NUL-separated git diff --name-status -z fields, including rename and copy records.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/porcelain-parser.test.ts: Added the RED production-wire test for separate NUL status and path fields.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/index.ts: Activated exact archive recovery before normal integration checks, while deriving PR proof only from the typed archive-owner proof.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/index-delete.test.ts: Added a real historical topology with a PR head plus one archive projection commit and verified exact recovery planning.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/deletion-executor.ts: Restored normal force deletion, kept archive recovery clean-only, removed --force from archive removal, and reused the production name-status parser during lease-time checks.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/deletion-executor.test.ts: Corrected archive recovery to use a clean census and asserted that archive removal never passes --force.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/deletion-contracts.ts: Made archive-owned projection plans with force:true structurally invalid.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/deletion-contracts.test.ts: Added schema coverage that rejects forced archive recovery even when the token binds force:true.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/census.ts: Changed Git status failures from clean to unsafe so unproven worktree state cannot enter a deletion plan.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/census-scan.test.ts: Added coverage that a failed status probe marks the worktree dirty and blocks clean recovery.
- **[archive_only_evidence]** verification: tests_run=RED: pnpm --dir plugin exec vitest run src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4, pnpm --dir plugin exec vitest run src/tools/change/handlers-archive.partial-repair.test.ts src/tools/worktree/census-scan.test.ts src/tools/worktree/deletion-contracts.test.ts src/tools/worktree/deletion-executor.test.ts src/tools/worktree/deletion-planner.test.ts src/tools/worktree/deletion-public-contract.test.ts src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4, pnpm --dir plugin run typecheck, pnpm --dir plugin exec eslint <15 changed files>, pnpm --dir plugin exec prettier --check <15 changed files>, git diff --check results=pass — RED produced three expected failures: missing production name-status parser, historical recovery refused, and normal force deletion regressed. GREEN passed 147 focused tests across 8 files. TypeScript exited 0. Targeted ESLint exited 0. Prettier reported all matched files formatted. git diff --check exited 0.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: RED: pnpm --dir plugin exec vitest run src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change/handlers-archive.partial-repair.test.ts src/tools/worktree/census-scan.test.ts src/tools/worktree/deletion-contracts.test.ts src/tools/worktree/deletion-executor.test.ts src/tools/worktree/deletion-planner.test.ts src/tools/worktree/deletion-public-contract.test.ts src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint <15 changed files>
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check <15 changed files>
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Review the four uncommitted remediation files and checkpoint them if accepted.
- **[unresolved_action]** required_main_agent_actions: Preserve the typed retained terminal-replay disposition. Do not restore false already_absent success without exact absence evidence.
- **[unresolved_action]** required_main_agent_actions: Treat the known floorBytes check failure as baseline evidence unless a fresh run differs from clean trunk.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A terminal replay cannot infer that cleanup already succeeded. If cleanup state was not persisted or rechecked, report retained instead of already_absent.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Do not collapse branch_not_found into worktree_not_found. Git can retain a registered worktree while its local branch fact is absent, so absence must require exact worktree evidence.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/handlers-archive.ts: Changed exact terminal replay output from false already_absent success to typed retained evidence. Added an honest dry-run preview for pending canonical completion and deferred cleanup.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/handlers-archive.partial-repair.test.ts: Added regression coverage for merged-replay dry-run cleanup preview and terminal replay fail-closed cleanup reporting.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/index.ts: Stopped mapping branch_not_found to WORKTREE_NOT_FOUND because the exact worktree can still exist when its branch fact is missing.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/deletion-public-contract.test.ts: Added regression coverage that preserves an existing worktree as an integration refusal when its branch fact is missing.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin exec vitest run src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts src/tools/worktree/deletion-contracts.test.ts src/tools/worktree/deletion-planner.test.ts src/tools/worktree/deletion-executor.test.ts src/tools/worktree/deletion-public-contract.test.ts src/tools/worktree/index-delete.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin exec eslint src/tools/change/handlers-archive.ts src/tools/change/handlers-archive.partial-repair.test.ts src/tools/worktree/index.ts src/tools/worktree/deletion-public-contract.test.ts, pnpm --dir plugin exec prettier --check src/tools/change/handlers-archive.ts src/tools/change/handlers-archive.partial-repair.test.ts src/tools/worktree/index.ts src/tools/worktree/deletion-public-contract.test.ts, git diff --check results=pass — 149 focused tests passed across 7 files. TypeScript exited 0. ESLint exited 0. Prettier reported all matched files formatted. git diff --check exited 0. Earlier branch evidence also records 168 focused route tests, the full unit suite, schemas, manifests, lint, architecture, and build as passed.
- **[unresolved_action]** required_main_agent_actions: Review the eight uncommitted hardening edits and preserve them when checkpointing.
- **[unresolved_action]** required_main_agent_actions: Run the broader release suite if release policy requires evidence beyond the selected route suite.
- **[unresolved_action]** required_main_agent_actions: Do not extract planner and executor lease-time recovery checks into one shared trust-boundary helper.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When post-merge replay has separate canonical and tracked archive paths, bind terminalRefreshCompleted to recoveryMutation or alreadyDone before shared completion runs. A route-level test must use distinct paths and assert zero tracked refresh calls.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- Resolve the prompt floor regression, then rerun pnpm run check from plugin/.
- The plugin check did not complete because the prompt floor guard failed.
- Review the prompt-budget floor result during full change validation.
- Review the prompt-floor check failure separately from this worktree recovery task.
- finish_owned_scope_then_report: The full plugin check stops at the repository prompt-floor check. No prompt files are in this task scope.
- Review the added census-scan and index-delete test files because remediation expanded the changed set from 13 to 15 files.
- Run Task 5's full archive replay and cleanup route matrix before acceptance.
- If satisfied, checkpoint and complete tk-308402da4e2d through the main-agent workflow.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: RED: pnpm --dir plugin exec vitest run src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change/handlers-archive.partial-repair.test.ts src/tools/worktree/census-scan.test.ts src/tools/worktree/deletion-contracts.test.ts src/tools/worktree/deletion-executor.test.ts src/tools/worktree/deletion-planner.test.ts src/tools/worktree/deletion-public-contract.test.ts src/tools/worktree/porcelain-parser.test.ts src/tools/worktree/index-delete.test.ts --maxWorkers=4
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint <15 changed files>
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check <15 changed files>
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Review the four uncommitted remediation files and checkpoint them if accepted.
- Preserve the typed retained terminal-replay disposition. Do not restore false already_absent success without exact absence evidence.
- Treat the known floorBytes check failure as baseline evidence unless a fresh run differs from clean trunk.
- Review the eight uncommitted hardening edits and preserve them when checkpointing.
- Run the broader release suite if release policy requires evidence beyond the selected route suite.
- Do not extract planner and executor lease-time recovery checks into one shared trust-boundary helper.
