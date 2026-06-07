# Executive Summary — fixWorktreeSetupready

## Outcome
Main-checkout guarded ADV state mutations are unblocked after `adv_worktree_resume` for a setup-ready worktree. The persistent `WorktreeIsolationViolation` that survived rebuilds, worker restarts, and OpenCode restarts is resolved.

## True root cause (found during execution)
`getWorktreeRecord` (`plugin/src/tools/worktree/state.ts`) extracted the Temporal client method into a bare variable and called it **unbound**:

```ts
const getHandle = client.workflow?.getHandle;  // unbound
const handle = getHandle(workflowId);          // throws inside SDK
```

The SDK's `WorkflowClient.getHandle` uses `this.getOrMakeInterceptors()`, so the unbound call threw `TypeError: Cannot read properties of undefined (reading 'getOrMakeInterceptors')`. The function's `try/catch` swallowed it to `null` → `worktreeExistsForChange` always returned `false` → the worktree-isolation existing-worktree ALLOW probe never fired → every main-checkout ADV mutation was blocked, regardless of `setupReady`, deploys, or restarts.

The earlier `setupReady` reducer stamp (commit c32d5b44) was a real but secondary gap; it could never take effect while the probe’s query path was dead.

## Changes
- `plugin/src/tools/worktree/state.ts` — call `client.workflow.getHandle(workflowId)` **bound** (matches the existing bound pattern at `state.ts:747`).
- `plugin/src/temporal/contracts.ts` — add `"created"` to `WorktreeRecordStatus` (the reducer and AC1 produce `status:"created"`; `tsc` was red but hidden because tsup/vitest skip full typecheck).
- `plugin/src/tools/worktree/state-record-probe.test.ts` — RED→GREEN regression test using a `this`-dependent fake `getHandle` (throws when unbound). The prior mock used a `this`-free `vi.fn`, which is exactly why the bug shipped.

## Evidence
- Deterministic root-cause proof: bound call returns the record; unbound throws `getOrMakeInterceptors`.
- Standalone repro against the **real** `@temporalio/client` + live workflow: `worktreeExistsForChange('fixWorktreeSetupready') === true` (was `false`).
- 76/76 focused tests; `pnpm run check` green (schemas/typecheck/lint/format); clean build (index + worker bundle).
- Independent acceptance review: verdict READY, 0 blocking findings; related-scan confirms no other unbound `getHandle` call sites.
- Fix deployed to `/home/jon/.local/share/Advance/plugin` (dist verified with bound `getHandle`).

## Known limitation
In-OpenCode-host live main-checkout mutation cannot be demonstrated in the session that began before the deploy (host plugin modules are cached for the session lifetime — AGENTS.md source-vs-dist gotcha). It is structurally guaranteed by the deployed fix and proven by the real-SDK repro; first mutation in a freshly restarted session confirms it live.

## Durable learnings (promoted)
- Never extract `this`-dependent SDK methods (Temporal `getHandle`) into bare variables — call bound.
- Test fakes for `this`-dependent methods MUST also depend on `this`, or unbound bugs pass tests.
- Run the full static gate (`pnpm run check`), not just build + focused tests — tsup/vitest skip full `tsc`.