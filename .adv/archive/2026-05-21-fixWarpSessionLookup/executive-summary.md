# Executive Summary

## Outcome
Fixed the silent `mode:warp → mode:terminal` downgrade caused by a missing `x-opencode-directory` header on session lookup. Session lookup now routes through the v1 SDK client (auto-attaches the header via the interceptor); the four raw-fetch `/experimental/workspace/*` endpoints attach the header explicitly. Every `warp→terminal` fallback now emits a structured `downgrade_reason` discriminated union so agents can branch programmatically. Net-new spec law `worktree-warp-mode` codifies the contract as durable enforcement.

## Verdict
APPROVED (acceptance-stage review verdict: READY; no blockers; reviewer applied one scoped fix to the asset-test grep gate).

## What Was Built

1. **`getSessionWorkspaceID` rewritten** (`plugin/src/utils/workspace-warp.ts`) — switched from raw fetch to `client.session.get({ path: { id: sessionID } })` (v1 SDK shape). Returns structured `SessionLookupResult` tuple. Never throws. `WarpDeps` extended with required `directory: string` and optional `client?: OpencodeClient`. (rq-warpModeContract04)

2. **`x-opencode-directory` header attached on all 5 raw-fetch workspace endpoints** via shared `directoryHeaders()` helper. Encoding matches v1 SDK's own behavior. (rq-warpModeContract05)

3. **`resolveCreateRuntimeMode` emits structured `downgrade_reason` on every fallback path** — 7-variant discriminated union (`missing_server`, `missing_session`, `missing_client`, `flag_disabled`, `lookup_failed` with `status?`+`detail?`, `endpoint_unreachable`, `warp_failed` with `detail`+`cleanupFailed?`). Legacy `warning: string` preserved for back-compat. (rq-warpModeContract03)

4. **`input.client` threaded end-to-end** from `advancePluginImpl` → `createToolMap` → `AdvWorktreeCreateRuntime` and into all 6 worktree tool registration sites (`adv_worktree_create/delete/cleanup` + legacy `worktree_create/delete/cleanup` aliases). (rq-warpModeContract06)

5. **Parallel session-lookup implementation consolidated** — deleted dead-code `getCurrentSessionWorkspaceID`; legacy `WorktreePlugin` `WarpDeps` constructions updated.

6. **Net-new spec law `worktree-warp-mode`** with 6 requirements (`rq-warpModeContract01–06`); asset test with 11 tests including live grep gate (reviewer strengthened the gate to handle template-literal regression vectors).

7. **Validation methodology gap closed** in `docs/spikes/warp-live-validation.md` — documents the fresh-standalone-session scenario that masked the original bug.

8. **Full green-bar verification** — `pnpm test` 2561 passed / 0 failed, `pnpm run check` clean, `pnpm run build` success.

Touched-scope improvements (P25):
- Cleared shell-env-leak in 3 test files so flag-off tests assert off-by-default behavior even when dev shell has the experimental flag set.
- Fixed `ARTIFACT_FIELDS` constant in `plugin/src/utils/tool-arg-preflight.ts` to include `executiveSummary` (was blocking the executive-summary persist call during this very acceptance phase).

## What Was Verified

- **Verdict**: READY (no blockers; 1 question, 1 nit, 3 praise findings from reviewer)
- **Tests**: 2561 / 2561 pass (full suite after all touched-scope fixes and reviewer's grep-gate strengthening)
- **Check**: typecheck + lint + format all clean
- **Build**: ESM + DTS emission successful
- **Investment**: 8 tasks / 0 retries / 22 min active work / tier: auto. No doom loop.
- **Grep gate**: `rg -n "fetch.*session/" plugin/src/utils/workspace-warp.ts plugin/src/tools/worktree/index.ts` returns zero matches
- **Spec law**: `adv_spec action: "show" capability: "worktree-warp-mode"` returns all 6 requirements

## Remaining Concerns

1. **AC1 manual smoke deferred to fresh OpenCode session post-build.** Source-vs-dist reload gotcha means live tool behavior validation requires `pnpm run build` + OpenCode session restart. AC1 is verified by unit/integration tests (every code path exercised in vitest); the fresh-session smoke test is the operator-time activity defined in `docs/spikes/warp-live-validation.md § Revised methodology`.

2. **Legacy `WorktreePlugin` standalone export retained per agreement avoidance.** Out of scope; flagged for possible follow-up retirement.

3. **Future v2 SDK migration could simplify KD-2/KD-3.** If `@opencode-ai/plugin` bumps `PluginInput.client` to v2, the typed `client.experimental.workspace.*` methods would obviate the explicit-header pattern on POST/DELETE/PUT. Out of scope; fast-follow candidate when upstream is ready.

4. **One preflight-validator regression vector closed and one pattern surfaced.** The shipped fix for `ARTIFACT_FIELDS` is one-line minimal with regression test; the reviewer's wisdom captured the broader pattern: any pattern-detection grep gate should ship with positive AND negative regression cases (now applied as the strengthened spec-law asset test in this change).