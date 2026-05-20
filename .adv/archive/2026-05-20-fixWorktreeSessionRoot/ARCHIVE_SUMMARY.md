# Archive: Fix worktree session root

**Change ID:** fixWorktreeSessionRoot
**Archived:** 2026-05-20T18:03:50.664Z
**Created:** 2026-05-20T04:46:21.578Z

## Tasks Completed

- ✅ Spike: verify Workspace.create connected-status semantics for target.type:"local"
  > Spike completed. VERDICT: YELLOW. Verified that Workspace.create for target.type:"local" reaches "connected" synchronously when experimentalWorkspaces flag is on (fs.existsSafe check at workspace.ts:495-498), but the flag is OFF by default (env vars OPENCODE_EXPERIMENTAL=unset, OPENCODE_EXPERIMENTAL_WORKSPACES=unset). Without the flag, startSync returns immediately at workspace.ts:479 without emitting status events, causing waitEvent to time out after 5s and Workspace.create to return HTTP 400. Design's detection probe (GET /experimental/workspace → 2xx) is INSUFFICIENT — endpoint is mounted regardless of flag.

CORRECTION REQUIRED: Add warpFlagEnabled() env-var check in workspace-warp.ts shim (task tk-45ca436b3d21). Both env check AND endpoint probe must pass for warp to be considered available. Downgrade log line should mention the env var so users can act. Task 12 live validation must cover both flag-on and flag-off paths.

Full analysis with source citations in docs/spikes/workspace-create-status.md (committed as 4a88b60).
- ✅ Audit: module-scope singletons in plugin/src for double-init resilience
  > Audit complete. Two consequential findings:

**1. RED (action required): `registerShutdownHandlers` in plugin-init.ts unconditionally registers process.on() listeners. With warp causing a second plugin instance, this becomes a double-fire bug.** Fix: add `shutdownHandlersRegistered` guard. Folded into task tk-19b6a92616ad.

**2. PLANNING-LEVEL (premise of task tk-fdfc9937bb57 was wrong): `addSession`/`getSession`/`removeSession` in worktree/state.ts are ALL NO-OPS** ("Session registry retired with projectWorkflow"). The SessionRecord schema is dead code. Original design plan to store workspaceID on the session record would accomplish nothing.

REDIRECTION (folded into task notes): use `findWorkspaceByDirectory(worktreePath)` at delete-time instead of storing workspaceID. Cleanest option — no new persistence, leverages OpenCode's existing GET /experimental/workspace endpoint. Task tk-fdfc9937bb57 is now reduced to implementing this helper (~30 lines), and tasks tk-f27fac1ba79c + tk-5b5a278eb07e have updated implementation guidance.

**3. YELLOW findings, no fix needed**: STSL singleton is properly idempotent; metrics/peer-sessions/fs counters are intentionally process-global; bell-state singletons have existing dedup; tools/worktree/index.ts:545 projectRoot stale-cache is cosmetic (state DB is project-id-keyed so both plugin instances target the same DB).

**Flag side-effect research**: OPENCODE_EXPERIMENTAL_WORKSPACES=true has 5 gated call sites. None affect ADV functionally; only B.2/B.3 (Session.list semantic) is worth documenting for advanced users. No graduation timeline published; opt-in is current/ongoing.

All findings in docs/spikes/module-singleton-audit.md (committed 21fd54e). Updates propagated to 5 downstream tasks' notes. Ready to proceed with task tk-180a72cea67c (trunk-write firewall fix).
- ✅ Fix trunk-write firewall: derive projectRoot from git, not session directory
  > Task evolved mid-execution. Original spec called for one-line fix at index.ts to derive projectRoot from gitSession.mainCheckoutPath. Discovery: that fix had already landed in prior change `gateTrunkFirewall` (commit ac9880b). BUT writing the regression test surfaced a paired bug: `firewallConfigRoot` at index.ts:323 was still deriving from `gitSession.currentCheckoutPath` (the worktree, post-warp), rendering the original fix ineffective in production — the firewall was bypassed entirely because project.json doesn't exist in worktrees.

Per user-approved Option B (scope expansion), fixed both:
1. `firewallConfigRoot = gitSession.mainCheckoutPath ?? gitSession.currentCheckoutPath ?? effectiveDir` (index.ts:323) — reads project config from trunk
2. Annotated the pre-existing `projectRoot = gitSession.mainCheckoutPath ?? directory` fix at index.ts:580 with rationale + cross-reference to this task

Added regression test in integration.test.ts: post-warp scenario where plugin is initialized with `directory: worktreePath`. Asserts:
- Writes to tempDir (trunk) → BLOCKED with "Trunk write firewall" error
- Writes to worktreePath → ALLOWED

Both before-and-after firewall behavior is now project-stable: same trunk classification regardless of session directory.

Verification:
- New test passes
- All "Trunk Write Firewall" integration tests pass (no regressions)
- All trunk-write-firewall unit tests pass
- `pnpm run typecheck` clean

Committed b596db9. 2 files touched: plugin/src/index.ts, plugin/src/integration.test.ts.
- ✅ Make initializeStatus idempotent (preserve activeChangeId on same project)
  > Made initializeStatus idempotent so post-warp double plugin instantiation preserves activeChangeId/currentStatus/taskProgress instead of destructively resetting.

Implementation:
- Added module-scope `let initialized = false` sentinel in events/status.ts
- initializeStatus first call: full reset, flips sentinel to true
- initializeStatus subsequent calls: updates projectName + lastUpdated only (so terminal display reflects current session basename), preserves in-flight state
- Added exported `resetStatusForTest()` for test isolation (resets sentinel + state)
- JSDoc cross-refs to audit doc and task ID

Tests:
- 7 new tests in events.test.ts initializeStatus describe block:
  1. Preserve activeChangeId on second init with same projectName
  2. Preserve activeChangeId across trunk → worktree basename transition (critical: simulates the warp scenario)
  3. Preserve currentStatus
  4. Preserve taskProgress  
  5. Update projectName on second init
  6. Update lastUpdated on every call
  7. resetStatusForTest restores destructive behavior
- Updated all 3 beforeEach hooks in integration.test.ts to call resetStatusForTest (test isolation across vitest workers)

Verification:
- All status/events tests green
- All integration tests green (no regression in Active Change Title Update, Trunk Write Firewall, Wisdom Lifecycle suites)
- `pnpm run typecheck` clean

Committed 4cb8d0a. 3 files touched.
- ✅ Create buildAdvWorktreeAdapter() — custom OpenCode workspace adapter
  > Added `plugin/src/utils/workspace-adapter.ts` with `buildAdvWorktreeAdapter()`. The adapter identifies as `adv-worktree`, copies the OpenCode workspace directory from `info.extra.directory` during `configure()`, no-ops `create()`/`remove()` because ADV owns git worktree lifecycle, and resolves local targets from configured `info.directory`. Added `plugin/src/utils/workspace-adapter.test.ts` covering adapter identity, directory configuration, structural rejection of missing/non-string directory input, target routing, pre-configure target rejection, and no-op lifecycle methods.
- ✅ Create workspace-warp HTTP shim — raw HTTP for workspace create/warp/delete
  > Added `plugin/src/utils/workspace-warp.ts` with raw HTTP helpers: `warpFlagEnabled()`, `workspaceAndWarpAvailable()`, `createAdvWorkspace()`, `warpSession()`, and `deleteAdvWorkspace()`. The availability probe short-circuits without HTTP unless `OPENCODE_EXPERIMENTAL=true` or `OPENCODE_EXPERIMENTAL_WORKSPACES=true`. Workspace create uses `type:"adv-worktree"` with directory carried through `extra.directory`; create response validates a string `id`. Warp posts `WarpPayload` with `id` (not `workspaceID`), `sessionID`, and hardcoded `copyChanges:false`. Delete treats 404 as already clean and rejects other non-2xx responses. Added `plugin/src/utils/workspace-warp.test.ts` covering env flag semantics, endpoint probing behavior, create/warp/delete request bodies and failure paths.
- ✅ Schema migration: worktreeConfigSchema.inline → mode enum with coercion
  > Migrated worktree config parsing toward `mode` enum (`warp` | `spawn` | `terminal`) while preserving legacy behavior until the create/delete flow switch is rewritten. Added `normalizeWorktreeConfig()` and `worktreeModes` exports. Defaults now resolve to `mode:"warp"`; legacy `inline:true` maps to `mode:"terminal"`; legacy `inline:false` maps to `mode:"spawn"`; explicit `mode` wins over deprecated `inline` with a warning. A temporary deprecated `inline` bridge remains derived from mode so existing create/delete branches keep working until the later flow rewrite task. Updated auto-generated `.opencode/worktree.jsonc` comments to document mode and deprecated inline mapping. Added `plugin/src/tools/worktree/config.test.ts` covering defaults, legacy coercion, mode precedence, sync/hook preservation, and structural rejection of unknown modes.
- ✅ Extend worktree session record schema with optional workspaceID
  > Completed the audit-redirection for this task: did not modify dead SessionRecord persistence. Added `findWorkspaceByDirectory()` to `plugin/src/utils/workspace-warp.ts`, which short-circuits when warp env flags are off, queries `GET /experimental/workspace` when enabled, structurally validates list items, matches by exact `directory`, and returns `{workspaceID}` or `null` for no match/non-2xx/fetch errors/malformed responses. Extended `workspace-warp.test.ts` to cover short-circuit, matching lookup, no match, and safe-null failure cases.
- ✅ Wire plugin init: destructure serverUrl + experimental_workspace, register adapter
  > Wired plugin init to register the custom `adv-worktree` OpenCode workspace adapter when `experimental_workspace.register` is available. Added shutdown handler idempotency: repeated plugin initialization now returns no-op shutdown handlers instead of registering duplicate process listeners, and the real disposer clears the guard. Added regression coverage in `plugin-init.worker-singleton.test.ts` for duplicate listener prevention and in `integration.test.ts` for adapter registration. Added the requested post-warp double-init comment near worktree module `projectRoot`, documenting why the cached root is benign. Verified related singleton paths: `startWorkerHealthMonitor` returns the existing active monitor, worker singleton resolution is lock/plan guarded, and worker heartbeat timers are tracked in `workerLockHeartbeats` and drained during shutdown.
- ✅ Rewrite worktree_create switch: warp/spawn/terminal with re-warp guard + rollback
  > Rewrote `worktree_create` to resolve the new `mode` enum before creating a git worktree. `mode:"warp"` now first checks the exact OpenCode workspace env flags and downgrades to `terminal` with an actionable `OPENCODE_EXPERIMENTAL_WORKSPACES` warning when disabled; when enabled it blocks re-warp from an already-workspaced session before creating anything; then it verifies workspace endpoint availability, creates the ADV OpenCode workspace, warps the current session with `copyChanges:false`, rolls back the workspace row on warp failure, records the real session id via the existing no-op-compatible `addSession`, and returns a warp success message. `mode:"terminal"` keeps the legacy inline/workdir guidance; `mode:"spawn"` keeps the existing fork+terminal path. Added `WorktreePlugin` tests covering default warp downgrade, successful warp request bodies, and already-warped blocking with no git worktree creation.
- ✅ Extend worktree_delete: cascade DELETE of OpenCode workspace for mode:warp records
  > Extended worktree deletion to clean up matching OpenCode workspace rows before removing the git worktree. Added optional `warpDeps` to `AdvWorktreeDeleteDeps`; when present, deletion calls `findWorkspaceByDirectory(worktreePath)` and then `deleteAdvWorkspace(workspaceID)` before `git worktree remove`. No match and flag-off cases proceed without HTTP/delete. DELETE 404 is treated as already clean by the shim. Non-404 workspace cleanup errors are logged as warnings and git worktree deletion still proceeds. Wired production `adv_worktree_delete`/`worktree_delete` through `createToolMap(..., serverUrl)` so registered tools can pass `serverUrl` to the lower delete flow. Added tests for matching cleanup, no match, flag-off, 404, and non-404 warning/continue cases.
- ✅ Update ADV_INSTRUCTIONS.md Worktree Protocol section
  > Updated `ADV_INSTRUCTIONS.md` Worktree Protocol section to document `mode:"warp"` as the default, the required opt-in launch environment (`OPENCODE_EXPERIMENTAL_WORKSPACES=true`, with broader `OPENCODE_EXPERIMENTAL=true` alternative), restart requirement, no plugin-side `process.env` mutation, graceful downgrade to terminal mode, fallback `terminal`/`spawn` behavior, warp-mode workspace cleanup on delete, and the advanced `client.session.list` filtering side effect of enabling OpenCode experimental workspaces. Kept wording compressed to satisfy the ratcheting line-ceiling asset test.
- ✅ Full quality gate: pnpm run check + pnpm test green
  > Ran the required quality commands from the isolated worktree plugin directory. `pnpm run check` passed. Initial `pnpm test` hit an `ENOTEMPTY` temp-directory cleanup failure in `src/temporal/worker-heartbeat.test.ts`; the specific failing test file passed on isolated rerun, and the complete `pnpm test` suite passed on rerun. `pnpm run build` passed for plugin and Temporal worker outputs. Final git status was clean.
- ✅ Live-session validation: rebuild, restart OpenCode, smoke-test warp behavior
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For OpenCode workspace adapters, mirror the SDK contract directly: `WorkspaceInfo.directory` can start as `null`, so custom adapters should structurally validate `info.extra` at `configure()` and only route `target()` from populated `info.directory`. Keep ADV git worktree create/delete ownership separate with adapter lifecycle methods as no-ops.
- **[gotcha]** OpenCode workspace HTTP endpoints being mounted is not enough to prove workspace warp is usable. `workspaceAndWarpAvailable()` must first check the exact opt-in env vars (`OPENCODE_EXPERIMENTAL=true` or `OPENCODE_EXPERIMENTAL_WORKSPACES=true`) and short-circuit without HTTP when absent, otherwise create can hang and fail later with an unhelpful 400.
- **[pattern]** For config migrations that must land before flow rewrites, introduce the new structural field (`mode`) and a temporary derived legacy bridge (`inline`) so existing branches keep stable behavior until downstream tasks switch call sites. This keeps intermediate commits coherent while preserving the locked target semantics.
- **[success]** Audit redirection avoided persisting `workspaceID` into a retired no-op session registry. Lookup-by-directory via OpenCode's workspace list keeps cleanup state derived from the actual OpenCode workspace table and avoids adding new ADV persistence for delete-time cleanup.
- **[pattern]** For OpenCode plugin double-init surfaces, register process-level handlers behind a module-level guard and make duplicate registrations return no-op disposers. Let the real disposer clear the guard so fresh sessions can register after `session.deleted`, while concurrent duplicate plugin instances do not double-fire shutdown hooks.
- **[gotcha]** `worktree_create` should resolve warp availability and re-warp guard before creating the git worktree. That prevents an already-warped session from creating a stray worktree and lets default `mode:"warp"` downgrade to terminal immediately when env flags are off, without touching OpenCode workspace HTTP.
