# Archive Briefing Digest

**Change ID:** fixArchivedBranchFinalization
**Title:** Fix archived branch finalization
**Status:** archived
**Generated:** 2026-08-02T22:47:21.300Z

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

Epic: advInfrastructureHealth · Fix archived branch finalization (order 5)

## Durable Facts

Showing 42 of 42 durable facts.

- **[archive_only_evidence]** decisions: Captured changeTipSha from change/{id} in finalizeRelease before any merge/cleanup — Provides a content-addressed tip that survives branch deletion and enables no_remote tree re-proof
- **[archive_only_evidence]** decisions: Added changeTipSha to GitFinalizeOutcome and threaded it through shipped/pending_merge returns — So change.ts/archive-gate.ts can persist the tip through phase9_status
- **[archive_only_evidence]** decisions: Added tree-SHA fallback only in the no_remote branch of resolveReleaseReachability — direct/PR routes already had a fallback; the task was to close the no_remote gap while remaining fail-closed
- **[archive_only_evidence]** decisions: Preserved changeTipSha in done/pending_merge phase9_status and recovered convergence — Durable evidence must survive archive status transition and disk-projection recovery
- **[archive_only_evidence]** verification: /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixArchivedBranchFinalization/bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts (1) — RED: new no_remote + deleted branch + changeTipSha test failed before fix (route lacked tree-SHA fallback)
- **[archive_only_evidence]** verification: /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixArchivedBranchFinalization/bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts (0) — GREEN: 242 tests passed after fix (includes no_remote tree re-proof, changeTipSha capture/persistence)
- **[archive_only_evidence]** verification: /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixArchivedBranchFinalization/bin/oc-test targeted -- src/tools/change.test.ts src/tools/gate.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.archive-convergence.test.ts src/tools/change.workflow-terminate.test.ts src/tools/change.archive-phase9.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts (0) — 520 related tests passed (archive finalization, release gate, convergence)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, frontmatter, test-isolation, lockfile, lint, format all pass (3 pre-existing eslint warnings in manifest-frontmatter.ts)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-red-2026-07-31T17:12:19-git-finalize.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-green-2026-07-31T17:15:41-phase9-archive-gate
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-green-2026-07-31T17:24:24-archive-related
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-check-2026-07-31T17:25:00
- **[report_follow_up]** follow_ups: adv_change_show timed out (Temporal worker) during this research; ADV state (proposal/problem-statement/design) for fixArchivedBranchFinalization could not be read via tooling. Orchestrator should retry adv_change_show or adv_doctor to confirm the change's stated scope matches these code findings before planning.
- **[report_follow_up]** follow_ups: Verify Phase9FinalizationStatusSchema interaction with the persisted phase9_status round-trip: mergeCommitSha is set at change.ts:630 but absent from the schema (types/changes.ts:1095-1118). If Strategy B is pursued, mergeCommitSha must be added to the schema; if only Strategy A, confirm changeTipSha round-trips correctly (it IS declared).
- **[report_follow_up]** follow_ups: Consider raising the 50-commit trunk tree-scan window in detectSquashMergeByTree (git-finalize.ts:1450) for recovery paths, or adding a full-history fallback (git log --all / merge-base check) to avoid missing deeply-buried squash-merges.
- **[report_follow_up]** follow_ups: Read the canonical requirement text via adv_spec show capability:advance-workflow for rq-releaseFinalization01 and rq-fixPhase9SquashMergeRedetect to lock acceptance criteria against the authoritative spec (semantic search surfaced rendered prose; spec read should go through the adv_spec tool).
- **[research_citation]** sources: verifyChangeBranchReachable (branch-ref-dependent proof): Reachability proof uses `git log ${defaultBranch}..change/${changeId}`. Returns reachable:false on any non-zero git exit. Requires the change/{id} branch ref to exist. (plugin/src/tools/archive-helpers/git-finalize.ts:1018-1037)
- **[research_citation]** sources: verifyChangeBranchReachableFromOrigin (branch-ref-dependent): Uses `origin/${defaultBranch}..change/${changeId}`. Same branch-ref dependency. (plugin/src/tools/archive-helpers/git-finalize.ts:1039-1066)
- **[research_citation]** sources: resolveReleaseReachability no_remote route — NO structural fallback: no_remote branch calls ONLY verifyChangeBranchReachable; on failure returns proof local_unmerged. Unlike direct (2697-2712) and PR routes (2779-2793), there is NO detectSquashMergeByTree fallback. A cleaned-up branch ref cannot be re-proven shipped. (plugin/src/tools/archive-helpers/git-finalize.ts:2605-2629)
- **[research_citation]** sources.omitted: 15 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Reachability re-proof has a branch-name dependency throughout the no_remote route and a branch-name fallback in direct/PR routes that depends on a persisted changeTipSha value that is never captured. Concretely: (1) resolveReleaseReachability's no_remote branch (git-finalize.ts:2605-2629) calls only verifyChangeBranchReachable, which runs `git log ${defaultBranch}..change/${changeId}` — a branch-ref query that fails once deleteChangeBranch (git-finalize.ts:409-439) removes the ref, and there is no detectSquashMergeByTree fallback in this branch (unlike direct 2697-2712 and PR routes 2779-2793). (2) The tree fallbacks that DO exist are gated on input.changeTipSha, which is read from phase9_status.changeTipSha in 5 consumer sites — but that field is never written: change.ts:619-634 builds phase9Done without changeTipSha, and preservePhase9Evidence only carries it forward from a prior undefined value. So in production input.changeTipSha is always undefined and the direct/PR tree fallbacks never fire. Net effect: the primary first-time archive works (finalizeRelease returns shipped from the in-band merge outcome for no_remote at git-finalize.ts:3392-3404), but any subsequent re-proof (archive retry change.ts:4284/4628 via verifyReleaseEvidenceFromMain, adv_doctor, re-verification) cannot re-establish shipped proof once the change branch/worktree is cleaned up — surfacing as 'cannot prove accepted delta projection' for changes with accepted deltas. The declared design intent (Phase9FinalizationStatusSchema SC1 comment, types/changes.ts:1114-1117; rq-fixPhase9SquashMergeRedetect) is clearly changeTipSha capture + content-addressed tree detection; it is simply unimplemented at the write site and missing for the no_remote route.
- **[unresolved_action]** required_main_agent_actions: Record this independent acceptance review as evidence for AC1-AC6 and SC1-SC3; no code remediation remains.
- **[unresolved_action]** required_main_agent_actions: Do not revisit manual branch recreation, unrelated active changes, or broad legacy archive recovery for this change.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When a persisted Git object ID is used as release-proof evidence, enforce its exact representation in both Zod and generated JSON schemas; `z.string()` silently weakens a fail-closed proof contract.
- **[archive_only_evidence]** changes_made: plugin/src/types/changes.ts: Constrained persisted `changeTipSha` to lowercase 40-hex Git SHA values at the Phase 9 persistence boundary.
- **[archive_only_evidence]** changes_made: plugin/src/types/changes.archive-passthrough.test.ts: Added regression coverage accepting a valid 40-hex SHA and rejecting malformed or uppercase values.
- **[archive_only_evidence]** changes_made: plugin/schemas/change.schema.json: Regenerated public Change schema to publish the same 40-hex `changeTipSha` pattern.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/types/changes.archive-passthrough.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts, pnpm run schemas:check, pnpm run typecheck, git diff --check results=pass — Focused Vitest run passed 3 files / 208 tests. Schema generation/check and TypeScript typecheck exited 0. `git diff --check` had no output. Durable implementation evidence `tr_ms9gp6zx_cbb668d9` is recorded as passed in the change execution evidence.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/changes.archive-passthrough.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Review the scoped uncommitted remediation diff, then checkpoint/commit it through the owning workflow before release completion.
- **[unresolved_action]** required_main_agent_actions: Use this harden evidence when determining the release gate; no further reviewer remediation is required.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Phase 9 tree-SHA re-proof must capture the change branch after archive artifacts are committed and propagate that SHA through every protected-route fallback. Capturing before the archive commit or omitting a handoff leaves branch-deletion recovery unable to prove the released tree.
- **[archive_only_evidence]** changes_made: plugin/src/tools/archive-helpers/git-finalize.ts: Captured changeTipSha only after archive artifacts are committed, then threaded it through every protected-branch and merge-queue handoff so durable tree-SHA re-proof represents the exact branch Phase 9 releases.
- **[archive_only_evidence]** changes_made: plugin/src/tools/archive-helpers/git-finalize.test.ts: Added regressions for post-artifact capture, protected-branch fallback handoff, and merge-queue propagation.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts, pnpm --dir plugin run check, git diff --check results=pass — Focused tests: 2 files, 187 passed. Plugin check passed schemas, TypeScript, manifests, frontmatter, isolation, lockfile policy, lint (4 pre-existing warnings only), and formatting. git diff --check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[epic_terminal_note]** epic.membership: advInfrastructureHealth · Fix archived branch finalization (order 5)

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-red-2026-07-31T17:12:19-git-finalize.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-green-2026-07-31T17:15:41-phase9-archive-gate
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-green-2026-07-31T17:24:24-archive-related
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-check-2026-07-31T17:25:00
- Record this independent acceptance review as evidence for AC1-AC6 and SC1-SC3; no code remediation remains.
- Do not revisit manual branch recreation, unrelated active changes, or broad legacy archive recovery for this change.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/changes.archive-passthrough.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run schemas:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Review the scoped uncommitted remediation diff, then checkpoint/commit it through the owning workflow before release completion.
- Use this harden evidence when determining the release gate; no further reviewer remediation is required.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
