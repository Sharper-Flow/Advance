# Archive: fix worktree setupReady registration

**Change ID:** fixWorktreeSetupready
**Archived:** 2026-06-07T13:49:53.861Z
**Created:** 2026-06-07T02:21:06.312Z

## Tasks Completed

- ✅ Adopt setupReady reducer stamp and focused reducer test
  > Adopted existing implementation: `applyWorktreeCreatedToState` stores `{ ...payload, status: "created", setupReady: true }`; workflow-state contract documents derived readiness; focused reducer test asserts setupReady true and non-deleted/non-setup_failed status. No signal payload schema change or workflow-unsafe imports.
- ✅ Verify worktree readiness predicate and workflow safety tests
  > Verified existing predicate and workflow safety coverage. `worktreeExistsForChange` negative/positive probe tests, workflow signal-handler tests, and workflow-bundle-boundary test passed. Static schema check found no `setupReady` in `plugin/src/types/signals.ts`.
- ✅ Build, deploy, and prove live main-checkout mutation after worktree resume
  > Built (pnpm run build, clean) and deployed (deploy-local.sh --fix) the worktree plugin carrying the getHandle bind + WorktreeRecordStatus "created" fixes. Verified deployed dist contains workflowApi.getHandle(workflowId). Proved the probe via standalone tsx repro using the real @temporalio/client against the live workflow: worktreeExistsForChange(access, "fixWorktreeSetupready") === true.
- ✅ Fix unbound getHandle in getWorktreeRecord (the true SC1/AC5 blocker)
  > plugin/src/tools/worktree/state.ts: bind getHandle to client.workflow in getWorktreeRecord (matches state.ts:747 pattern). plugin/src/temporal/contracts.ts: add "created" to WorktreeRecordStatus. plugin/src/tools/worktree/state-record-probe.test.ts: RED→GREEN regression test using a this-dependent fake getHandle (throws when unbound), asserting getWorktreeRecord returns the record. Evidence: 76/76 focused tests, pnpm run check green, standalone real-SDK repro worktreeExistsForChange=true (was false), clean build.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When task mutations are routed through target_path worktree, root-scope adv_change_validate may show stale NO_TASKS/CONTRACT_AC_UNCOVERED even while adv_task_list and target adv_change_show show tasks. Use target-state reads for continuity and track root validation mismatch separately (agenda ag-i48YQyDl).
- **[success]** Focused worktree lifecycle verification can cover both reducer projection and guard safety without broad suites: pair `change-state.worktree-auto-manage.test.ts` with `state-record-probe.test.ts`, `workflows.signal-handlers.test.ts`, and `workflow-bundle-boundary.test.ts`; static-check signal schema separately for no derived fields.
- **[gotcha]** Temporal SDK WorkflowClient.getHandle is `this`-dependent (calls this.getOrMakeInterceptors()). NEVER extract it into a bare variable: `const gh = client.workflow.getHandle; gh(id)` throws "Cannot read properties of undefined (reading 'getOrMakeInterceptors')". Always call bound: `client.workflow.getHandle(id)`. getWorktreeRecord (state.ts) did the unbound extraction and swallowed the throw in a try/catch → returned null → worktreeExistsForChange always false → the worktree-isolation existing-worktree ALLOW probe never fired → ALL main-checkout ADV mutations were blocked regardless of setupReady/restarts/deploys. This was the true root cause behind "worktree isolation keeps blocking, restarts don't help."
- **[gotcha]** Test mocks that don't model `this` hide unbound-method bugs. state-record-probe.test.ts mocked getService → client.workflow.getHandle as a free vi.fn() that ignores `this`, so the unbound extraction in getWorktreeRecord passed all tests while throwing against the real SDK. When a dependency's method relies on `this` (Temporal getHandle, many SDK clients), the fake MUST also rely on `this` (e.g. getHandle(){ this.getOrMakeInterceptors() }) so unbound call sites fail in unit tests. Also: pnpm run build (tsup/esbuild) and vitest skip full tsc — a latent type error (WorktreeRecordStatus missing "created") survived until `pnpm run typecheck`/`pnpm run check`. Run the full static gate, not just build+focused tests, before claiming done.
