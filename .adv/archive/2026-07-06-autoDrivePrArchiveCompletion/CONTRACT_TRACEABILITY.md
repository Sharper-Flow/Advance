# Contract Traceability

**Change ID:** autoDrivePrArchiveCompletion
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-06T22:42:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Auto-drive end-to-end via Phase 9.5 (adv-archive.md:506-533) + syncDefaultBranchAfterMerge helper. 6 commits. 4610 tests pass. Prose-orchestration known limitation (ct-1), not blocking. |
| SC2 | success_criterion | pass | review | Real-git test 'clean ff-only' (git-finalize.test.ts:3001-3022) confirms afterHead==origin/trunk, 2-element ffCommits. |
| SC3 | success_criterion | pass | review | 'does not record release-done' type-shape test (git-finalize.test.ts:3097-3121). adv-archive.md:528 explicit 'never escalate non-terminal to Shipped.' DONT3 regression guard (3653-3674). |
| AC1 | acceptance_criterion | pass | test | adv-archive.md:512-518 spawns adv-ci-waiter via Task tool. rq-releaseFinalization02.1 in spec.json. Regression guard 'git-finalize.ts does NOT reference Task-spawn or CI-wait APIs' (3639-3646). |
| AC2 | acceptance_criterion | pass | test | FIXED ce-1/ce-2/ce-3: rev-list status check + HEAD-on-default guard + merge-path destructive-ops spy. Real-git tests green. 96 tests in git-finalize.test.ts. |
| AC3 | acceptance_criterion | pass | test | Helper diverged branch returns {status: 'diverged', localOnlyCommits} without merge/reset. Real-git test (git-finalize.test.ts:3024-3044) confirms local HEAD unchanged. |
| AC4 | acceptance_criterion | pass | test | adv-archive.md:521-525 re-calls adv_change_archive through verifyReleaseEvidenceFromMain. DONT3 regression guard confirms no redrive path. |
| AC5 | acceptance_criterion | pass | test | adv-archive.md:526-529 renders 'Pending auto-merge.' with PR URL + retry command. rq-releaseFinalization04.1/.2 in spec.json. |
| AC6 | acceptance_criterion | pass | test | Regression guard 'syncDefaultBranchAfterMerge is exported but not invoked internally' (3595-3622). Pre-push gate green. Diff purely additive. |
| AC7 | acceptance_criterion | pass | test | Regression guards 'no new temporal/* imports' (3624-3637) + 'no Task-spawn or CI-wait APIs' (3639-3646). workflow-bundle-boundary.test.ts green (6 passed). |
| C1 | constraint | respected | static_check | FIXED ce-2: MAIN_NOT_ON_DEFAULT guard via git rev-parse --abbrev-ref HEAD after fetch. Destructive-ops spy covers both diverge + merge paths. |
| C2 | constraint | respected | static_check | adv-archive.md:518 P37 enforcement. Regression guard (3639-3646) confirms no CI-wait in helper. |
| C3 | constraint | respected | static_check | Helper uses GitFinalizeDeps + mirrors reconcileChangeBranchWithDefault. Command references verifyReleaseEvidenceFromMain + syncDefaultBranchAfterMerge. |
| C4 | constraint | respected | static_check | Regression guards (3624-3637, 3639-3646). workflow-bundle-boundary.test.ts green. |
| C5 | constraint | respected | static_check | 'does not record release-done' type-shape test (3097-3121). Helper has no store/signal surface. |
| C6 | constraint | respected | static_check | FIXED ce-1 + ce-3: helper only runs fetch / rev-list / merge --ff-only / log. Destructive-ops spy covers both paths. |
| DONT1 | avoidance | respected | review | Regression guard (3595-3622) confirms purely additive. No existing function modified. |
| DONT2 | avoidance | respected | review | Helper has no changeTipSha/squash detection. Tip-SHA delegated to parent change (referenced in spec body). |
| DONT3 | avoidance | respected | review | Regression guard (3653-3674) reads Phase 9.5 section, asserts redrive absent and verifyReleaseEvidenceFromMain present. |
| DONT4 | avoidance | respected | review | git log d99bc31e^..beca5a22 --name-only confirms zero .opencode/agents/adv-ci-waiter.md / instructions/oc-ci-wait.md modifications. |
| DONT5 | avoidance | respected | review | Helper grep — no pull invocation. Destructive-ops spy covers merge path (ce-3 fix). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a51821b42b6e | AC1, AC2, AC3, AC5, AC7 |  | C1, C2, C3, C4, C6, DONT1, DONT5, DONT4 |  |
| tk-fbcc9bbd8210 | AC2, AC3 |  | C1, C5, C6, DONT5 |  |
| tk-93768a64274c | AC1, AC4, AC5 |  | C2, C3, DONT3 |  |
| tk-1628c7a3d0ff | AC6, AC7 |  | DONT1, DONT2, DONT3 |  |
| tk-356994b0fe14 |  |  | C3, C5 |  |
