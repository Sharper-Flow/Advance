# Archive: Refactor change workflows to signal-driven state-holder architecture

**Change ID:** refactorChangeWorkflowsSignal
**Archived:** 2026-05-07T16:08:00Z
**Created:** 2026-05-04T22:04:18.192Z

> ARCHIVE NOTE: This in-repo bundle was assembled manually during the post-cull migration session (commit 4231fc3 baseline + R1/validator follow-on fixes 4a3e81f, 9cd0625). The Temporal workflow for this change was terminated by Tier 5 of the migration matrix (~22 hours pre-archive); the workflow's history contained pre-cull `WorkflowExecutionUpdateAccepted` events that the post-cull worker code cannot replay (TMPRL1100 nondeterminism), so `adv_change_archive` could not be invoked. The disk projection (change.json + agreement/design/problem-statement/proposal markdown) was complete with all 7 gates done, all 38 tasks done, 15 wisdom entries captured. This bundle is byte-identical to the disk record except: (1) status flipped from 'draft' to 'archived', (2) wisdom.json synthesized from change.json's wisdom array, (3) this ARCHIVE_SUMMARY.md generated. The change.json.bak.* file was excluded.

## Outcome

All 7 gates done. 38 tasks done. 15 wisdom entries captured.

## Gates

- **proposal**: done (2026-05-06T01:21:29, by agent)
- **discovery**: done (2026-05-06T01:21:29, by agent)
- **design**: done (2026-05-06T01:21:29, by agent)
- **planning**: done (2026-05-06T01:21:29, by agent)
- **execution**: done (2026-05-06T20:34:46, by agent)
- **acceptance**: done (2026-05-06T20:34:55, by agent)
- **release**: done (2026-05-06T20:43:28, by agent)

## Tasks Completed

- ✅ M0/T01: Spike workflow scaffold. Create one signal-driven change workflow with 5-10 representative signal handlers (e.g.
- ✅ M0/T02: Spike — concurrent signaling test (SC1 verification). Spawn 3 client agents that each fire 50 signals to the sam
- ✅ M0/T03: Spike — continueAsNew test (SC10 part a). Drive spike workflow past 5,000 events via signal flooding. Verify: `i
- ✅ M0/T04: Spike — disk projection cadence + conformance read routing (SC4 verification). Implement `writeChangeProjectionA
- ✅ M0/T05: Spike — one-shot migration script POC + marker barrier (SC10 part b). Pick one current active change (suggest `c
- ✅ M0/T06: Spike report. Synthesize results from T02-T05 into a written kill-criteria report at `docs/decisions/2026-05-04-
- ✅ M1/T07: Capture LOC baseline for SC8 verification. Run `wc -l plugin/src/temporal/**/*.ts` and `wc -l plugin/src/tools/{
- ✅ M1/T08: Bulk deletions per Section 9 strategy. `git rm` source + sibling .test.ts files: (a) `plugin/src/temporal/{migra
- ✅ M1/T09: Update `plugin/src/tool-registry.ts` to remove all references to deleted tools (adv_workflow_repair, adv_change_
- ✅ M2/T10: Define 24 signals + 6 queries in `plugin/src/temporal/messages.ts`. Per Design Section 1: 5 doc/metadata signals
- ✅ M2/T11: Implement signal handlers + query handlers in `plugin/src/temporal/workflows.ts`. Each handler is a pure mutatio
- ✅ M2/T12: Implement bucket derivation in `plugin/src/utils/buckets.ts`. Pure function `deriveBucket(ctx: BucketContext) → 
- ✅ M2/T13: Refactor `plugin/src/temporal/change-state.ts` to pure mutation functions (no Temporal imports, no I/O). Functio
- ✅ M2/T14: Implement tool adapter helpers in `plugin/src/tools/_adapters.ts`. Functions per Design Section 6: `fireSignal(c
- ✅ M2/T15: Add Temporal search attributes per Design Section 7. Existing 9 (`AdvChangeId`, `AdvChangeStatus`, `AdvChangeTit
- ✅ M2/T16: Get `pnpm typecheck` green — M2 milestone gate. Run `pnpm run typecheck` in `plugin/`; resolve any remaining typ
- ✅ M3/T17: Cross-cutting concurrent-signaling test (SC1). Beyond per-handler unit tests, drive the full real workflow (not 
- ✅ M3/T18: Cross-cutting continueAsNew test (SC10 part a). Drive full workflow past 5,000 events. Validate: CAN at threshol
- ✅ M3/T19: Cross-cutting cross-name signal-ordering test. Validate: signals of same name arrive in order; signals across di
- ✅ M4/T20: Refactor `plugin/src/tools/change.ts`, `task.ts`, `gate.ts`, `wisdom.ts` to signal-fire pattern. For each tool: 
- ✅ M4/T21: Refactor `plugin/src/tools/checkpoint.ts`, `test.ts`, `temporal-ops.ts`, `archive-helpers/`. `checkpoint.ts`: si
- ✅ M4/T22: Refactor worktree tools (`adv_worktree_create`, `_delete`, `_triage`, `_resume`, `_cleanup`) to use `AdvWorktree
- ✅ M4/T23: Get `pnpm build` green — M4 milestone gate. Run `pnpm run build` in `plugin/`; ensure tsup ESM bundle generates 
- ✅ M5/T24: Implement one-shot migration script `plugin/scripts/migrate-to-signal-architecture.ts`. Algorithm per Design Sec
- ✅ M5/T25: Migration marker signal infrastructure. Add `migrationMarkerSignal` (defined alongside other signals, marked tra
- ✅ M5/T26: Run dry-run migration on all 7 active changes (`removeBunTypesMainTsconfig`, `reconcilesessionlistwithdiagno`, `
- ✅ M5/T27: Execute migration after dry-run review. Run script with `--execute` flag. Hard cutover per O7. After execution, 
- ✅ M5/T28: Delete migration tooling post-execution. `git rm plugin/scripts/migrate-to-signal-architecture.ts`, `plugin/src/
- ✅ M5/T29: Integration tests pass. Run `pnpm test -- --run integration` (or relevant integration test invocation). Validate
- ✅ M6/T30: Documentation sweep. Update (a) `ADV_INSTRUCTIONS.md` — remove TDD ceremony references (no phase machine, no `ad
- ✅ M6/T31: Apply spec deltas to `.adv/specs/advance-delivery.yaml`. (a) Delete `rq-taskRunLedger01` (all 6 scenarios). (b) 
- ✅ M6/T32: Apply spec deltas to `.adv/specs/tdd-contract.yaml`. (a) Delete `rq-TDD007req` (all 6 scenarios — reclassificati
- ✅ M6/T33: Apply spec deltas to `.adv/specs/advance-meta.yaml`. (a) Modify `rq-worktreeRegistry01` body: replace "must live
- ✅ M6/T34: Apply spec deltas to `.adv/specs/worktree-lifecycle.yaml`. (a) Modify `rq-wl-branchRegistry01` body: replace "Pr
- ✅ M6/T35: Verify SC8 LOC reduction ≥30%. Run `wc -l plugin/src/temporal/**/*.ts plugin/src/tools/**/*.ts` after all M5/M6 
- ✅ M6/T36: Verify SC9 signal traffic ≤300 events. Pick a representative migrated change (suggest `addAgentMeshAndInRepoArch
- ✅ M6/T37: Get full test suite green — M6 milestone gate. Run `pnpm test` in `plugin/`; all 1356+ tests + new tests pass. P
- ✅ M6/T38: Verify SC3 — all 24 slash commands smoke. After session restart (rebuild required per AGENTS.md "Source-vs-Dist 

## Wisdom Captured

- **pattern**: Temporal spike workflows can live in `plugin/src/temporal/spike/` with colocated `contracts.ts`, `messages.ts`, and `workflows.ts`; a focused test can use `Worker.create({ workflowsPath: fileURLToPath
- **gotcha**: Temporal signal client calls are fire-and-forget; `handle.signal(...)` resolving does not mean async signal-handler activities (e.g. projection writes) have completed. Tests and migration barriers mus
- **gotcha**: Design prose said "24 signals" but the enumerated surface is 26 new signals plus retained `applyChangeSummarySignal` (27 primary bindings), with `migrationMarkerSignal` treated as a temporary migratio
- **gotcha**: For signal-driven change workflows, `wf.condition(() => shouldContinueAsNew(...))` can unblock while handlers are still in flight; always call `await wf.condition(wf.allHandlersFinished)` immediately 
- **gotcha**: Bucket precedence must treat `release` awaiting approval specially: in actual `bucketCtxFromState`, release awaiting approval also makes `currentGateStatus === 'awaiting_approval'`. Put `ready_to_arch
- **pattern**: Keep `change-state.ts` as pure workflow-safe mutation code: no Temporal SDK, storage, tools, or node imports; boundary/protocol validation such as sequential gate checks belongs in tool adapters, whil
- **pattern**: Adapter helpers can preserve existing handle-first call sites while enabling signal-driven store-input usage via overloads: accept either `WorkflowHandleLike` or `TemporalStoreBackendInput + changeId`
- **success**: Real `changeWorkflow` concurrent-signaling SC1 verification is covered by `plugin/src/temporal/__tests__/concurrent-signaling.itest.ts`: seed task-add signals first, poll query state as barrier, then 
- **gotcha**: For the real `changeWorkflow` CAN test, one task-added signal roughly added one history event in Temporal test env; 3,000 signals only reached `historyLength=3013`. Use >5,000 signals (5,200 worked) t
- **gotcha**: After a workflow continues-as-new, use a handle bound to the latest `description.runId` for post-CAN marker signals. In the TS SDK test path, a runless handle can still route `signal(...)` to the comp
- **pattern**: Gate tools should enforce V6 against workflow-query state, not stale disk projections: query `getGateStatusQuery` before sequence checks, and query `changeTasksQuery` before completing execution. Disk
- **gotcha**: During the T21 transition, live `adv_run_test` can fail with `WorkflowUpdateFailedError` after source refactors to the same tool surface because OpenCode uses cached plugin dist/tool code in-session. 
- **pattern**: Cross-change worktree branch ownership can be checked through Temporal Visibility before any git mutation: query `AdvAffectedProjects = "{projectId}" AND AdvWorktreeBranches = "{branch}" AND AdvChange
- **success**: M4 build gate passed after signal-driven workflow/tool refactors: `pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts && pnpm run build` generated `dist/index.js` plus `dist/temporal/w
- **gotcha**: T24 exposed a live-session checkpoint ledger gap: git checkpoint can commit successfully while `adv_task_checkpoint` returns `checkpointRecorded:false` with `Workflow Update failed`; do not mark task 
