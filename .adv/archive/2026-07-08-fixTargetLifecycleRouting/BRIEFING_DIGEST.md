# Archive Briefing Digest

**Change ID:** fixTargetLifecycleRouting
**Title:** Fix target lifecycle routing
**Status:** archived
**Generated:** 2026-07-08T00:35:32.183Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #192

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

Showing 20 of 20 durable facts.

- **[agenda]** follow_ups: Planning: add explicit dryRun + target_path reenter test asserting snapshot-ok store selection and zero gateReenteredSignal firings (AC4).
- **[agenda]** follow_ups: Planning: add worktree_resume target test asserting advWorktreeResume deps.store === targetStore and initWorktreeDb(target root) so worktree-created signal/cache-refresh binds to target (AC6).
- **[agenda]** follow_ups: Planning: resolve AC6/AC7 ambiguity — commit to full target-aware resume implementation and mark AC7 hard-block as a non-exercised documented fallback to avoid an internally ambiguous acceptance set.
- **[agenda]** follow_ups: Related-scan during execution: confirm no direct adv_worktree_create target misuse; if found, record as separate follow-up per KD3 rather than widening scope.
- **[archive_only_evidence]** sources: Current adv_change_reenter implementation: Confirms reenter has no target_path args, resolves projectId via getProjectId(store.paths.root), builds handle via getChangeHandle(bundle.client, projectId, changeId), fires gateReenteredSignal via fireSignalAndRefresh(handle, store, ...), and dryRun returns preview before any Temporal resolution. Matches design's stated current state exactly.
- **[archive_only_evidence]** sources: adv_change_status_repair target routing (KD1 mirror pattern): Proven precedent: wraps runRepair with withTargetPathStore using stateRequirement: dryRun ? 'snapshot-ok' : 'temporal-required', target_confirmed, confirmationEvidence, and merges formatTargetProjectContext(context). Design KD1 replicates this shape precisely.
- **[archive_only_evidence]** sources: withTargetPathStore state-requirement branches: snapshot-ok uses createLegacyStore (disk snapshot, non-mutating, supports store.changes.get); temporal-required enforces queue readiness via ensureTargetMutationQueueReady and createStore with projectIdOverride. Confirms dryRun snapshot-ok path is read-only and valid for reenter's pre-signal change load + archived/closed rejection.
- **[archive_only_evidence]** sources: adv_worktree_delete / adv_worktree_cleanup target routing (KD2 pattern): targetWorktreeMutationArgSchemas (target_path/target_confirmed/confirmationEvidence) already spread into delete/cleanup; both wrap executeWorktree* with withTargetPathStore(stateRequirement:'temporal-required', mutation:!dryRun) and pass targetStore. This is the exact schema family and wrapper KD2 reuses.
- **[archive_only_evidence]** sources: Current adv_worktree_resume implementation: Confirms resume has no target args, derives projectRoot=store.paths.root, calls initWorktreeDb(projectRoot) and advWorktreeResume(..., { projectRoot, database, log, store }). This is precisely the source-namespace leak #192 AC5 targets.
- **[archive_only_evidence]** sources: advWorktreeResume internals (KD3 justification): advWorktreeResume materializes via advWorktreeCreate(branch, opts, deps) using injected deps.projectRoot/database/store. Confirms widening resume routes target root through DI without needing to widen the lower-level adv_worktree_create command — KD3 is sound.
- **[archive_only_evidence]** sources: Related-scan verification of already-target-routed mutation surfaces (KD4): gate complete, contract mint/review, task add/update/cancel/reclassify, and subagent report submit all route through withTargetPathStore. Confirms design's claim that reenter + worktree_resume are the two genuine remaining gaps, so related-scan is verification not scope expansion.
- **[archive_only_evidence]** sources: status_repair target-routing test precedent: Existing test asserts withTargetPathStore called with target_path + stateRequirement and _projectContext propagated. Directly reusable test shape for the AC1/AC2 reenter regression tests the design plans.
- **[archive_only_evidence]** architecture_assessment: The design is a faithful, minimal application of the established target-project routing primitives to the two confirmed #192 gaps. Every structural claim was verified against source: (1) reenter's current source-project identity path (getProjectId(store.paths.root) + fireSignalAndRefresh(handle, store, ...)) matches the design's stated current state; (2) the KD1 withTargetPathStore wrapper is a near-line-for-line mirror of the proven adv_change_status_repair target path, including the dryRun ? 'snapshot-ok' : 'temporal-required' state requirement that preserves read-only dry-run; (3) KD2 reuses the exact targetWorktreeMutationArgSchemas family and withTargetPathStore(mutation:!dryRun) wrapper already shipped for adv_worktree_delete/cleanup; (4) KD3 is justified because advWorktreeResume materializes via advWorktreeCreate through injected deps.projectRoot/store, so routing resume's deps to the target store is sufficient and widening the lower-level create command is unnecessary; (5) KD4's related-scan claim is accurate — gate/task/contract/report surfaces are already target-routed. The identity boundary (target store + getProjectId(target root) + fireSignalAndRefresh(target store)) is structural, satisfies rq-cacheRefresh01 (C4), and avoids any parallel routing mechanism (C2). No new Temporal primitive is introduced, keeping workflow determinism intact (C6). The 'No spec delta expected' conclusion is well-reasoned: existing cross-project coordination, target-trust, cache-refresh, and worktree-isolation laws already govern this behavior.
- **[unresolved_action]** required_main_agent_actions: Proceed with acceptance if orchestrator accepts source-level verification evidence.
- **[unresolved_action]** required_main_agent_actions: Before live use/release, rebuild and deploy plugin runtime, then restart OpenCode per source-vs-dist runtime boundary if end-to-end live ADV tool validation is required.
- **[unresolved_action]** required_main_agent_actions: Carry forward release/archive note that target_path lifecycle routing was verified by source tests, not by mutating a real external project in this review.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.test.ts src/tools/adv-worktree.test.ts src/tools/target-project.test.ts, pnpm --dir plugin run check, rg "fireSignal\(handle" plugin/src/tools --glob '!*.test.ts' --glob '!**/*.test.ts' || true results=pass — Contract reviewed against agreement AC1-AC11. Path preflight OK for all expected files. Targeted AC10 suite passed: 3 files, 145 tests. pnpm check passed: schemas:check, typecheck, test-isolation, lockfile policy, lint, format:check. rq-cacheRefresh01 scan returned no direct fireSignal(handle matches in tool code. Initial mis-scoped test filter using plugin/src paths produced no tests; corrected to src/tools paths under bin/oc-test.
- **[unresolved_action]** required_main_agent_actions: Before archive sign-off for plugin source changes, ensure source-vs-deployed handoff is recorded: pnpm run build if not already done, scripts/deploy-local.sh --fix from main checkout during archive workflow, then fresh OpenCode session/restart for live-tool validation if needed.
- **[unresolved_action]** required_main_agent_actions: Carry existing verification evidence into archive notes: targeted suite tr_mrbby6eg_b4adb0a1, pnpm run check tr_mrbbym91_37696677, and this harden rerun of bin/oc-test targeted -- src/tools/change.test.ts src/tools/adv-worktree.test.ts src/tools/target-project.test.ts.
- **[archive_only_evidence]** verification: tests_run=test -e plugin/src/tools/change.ts && test -e plugin/src/tools/change.test.ts && test -e plugin/src/tools/adv-worktree.ts && test -e plugin/src/tools/adv-worktree.test.ts, git diff origin/trunk...HEAD -- plugin/src/tools/change.ts plugin/src/tools/change.test.ts plugin/src/tools/adv-worktree.ts plugin/src/tools/adv-worktree.test.ts, grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts" | grep -v rq-cacheRefresh01-exempt || true, bin/oc-test targeted -- src/tools/change.test.ts src/tools/adv-worktree.test.ts src/tools/target-project.test.ts, git status --short results=pass — Path preflight OK for all four scoped files. Diff review found only scoped target_path lifecycle/worktree changes plus regression tests. Cache-refresh law grep returned no direct non-test fireSignal(handle...) violations. Focused oc-test targeted suite passed: 3 files, 145 tests. Working tree clean after review. Prior evidence cited in packet: pnpm run check passed as run tr_mrbbym91_37696677; acceptance review READY.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | not_applicable |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- Proceed with acceptance if orchestrator accepts source-level verification evidence.
- Before live use/release, rebuild and deploy plugin runtime, then restart OpenCode per source-vs-dist runtime boundary if end-to-end live ADV tool validation is required.
- Carry forward release/archive note that target_path lifecycle routing was verified by source tests, not by mutating a real external project in this review.
- Before archive sign-off for plugin source changes, ensure source-vs-deployed handoff is recorded: pnpm run build if not already done, scripts/deploy-local.sh --fix from main checkout during archive workflow, then fresh OpenCode session/restart for live-tool validation if needed.
- Carry existing verification evidence into archive notes: targeted suite tr_mrbby6eg_b4adb0a1, pnpm run check tr_mrbbym91_37696677, and this harden rerun of bin/oc-test targeted -- src/tools/change.test.ts src/tools/adv-worktree.test.ts src/tools/target-project.test.ts.
