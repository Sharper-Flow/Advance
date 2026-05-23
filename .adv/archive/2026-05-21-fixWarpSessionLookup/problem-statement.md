# Problem Statement: Warp Session Lookup Fails for Live Sessions

## What is broken

After enabling worktree `mode:warp`, some fresh OpenCode sessions emit:

```
mode:warp unavailable because current session lookup failed (<error>); falling back to mode:terminal.
```

…and silently downgrade to `mode:terminal`, even though the `OPENCODE_EXPERIMENTAL_WORKSPACES=true` flag is set and a single opencode process is running normally. This defeats the warp mode the user explicitly enabled, with no diagnostic detail surfaced to the agent or user.

## Where it originates

`plugin/src/utils/workspace-warp.ts:117` (`getSessionWorkspaceID`) performs a raw `fetch(GET {serverUrl}/session/{sessionID})`. When that returns non-OK (or `fetch` itself rejects), the catch in `plugin/src/tools/adv-worktree.ts:99` (`resolveCreateRuntimeMode`) downgrades the requested `mode:warp` to `mode:terminal`. The downgrade IS the designed fallback contract — the bug is that the lookup fails in the first place under conditions that should succeed.

## Why it happens (root cause)

OpenCode's `GET /session/:id` resolves session storage using `Instance.project.id`, derived from the request's `x-opencode-directory` header (with server cwd as fallback). Multiple upstream issues describe this exact failure shape:

- [opencode #8538](https://github.com/anomalyco/opencode/issues/8538) — "Session lookup fails with NotFoundError when PTY spawned from non-git directory context"
- [opencode #7149](https://github.com/anomalyco/opencode/issues/7149) — "opencode attach --session fails with 'Session not found' since v1.1.1" (regression from PR #6715 which added `x-opencode-directory: process.cwd()` to attach)
- [opencode #14595](https://github.com/anomalyco/opencode/issues/14595) — "Background Task Session Lookup Fails Across Project Contexts"
- [opencode #3551](https://github.com/anomalyco/opencode/issues/3551) — directory-scoped resolver searches `session/global/` but session lives in `session/{projectHash}/`

Confirmed in upstream source: `packages/opencode/test/server/httpapi-experimental.test.ts:28` shows every legitimate request sets `headers.set("x-opencode-directory", directory)`. ADV's raw-fetch lookup sets no such header, so the server resolves to its own cwd, which may not match the session's storage namespace.

## Two parallel implementations exist — only the broken one is wired

The ADV plugin already contains a working pattern:

- `plugin/src/tools/worktree/index.ts:1958-1967` defines `getCurrentSessionWorkspaceID(client, sessionID)` using `client.session.get({ path: { id } })` — the SDK client routes through OpenCode's typed client, which handles request context.
- `plugin/src/utils/workspace-warp.ts:117` defines `getSessionWorkspaceID(deps, sessionID)` using raw `fetch` against `serverUrl` with no headers.

The live `adv_worktree_create` tool path (registered in `tool-registry.ts:597`) wires through `adv-worktree.ts:resolveCreateRuntimeMode`, which imports the **raw-fetch version** (`adv-worktree.ts:24`). The SDK-client version is used elsewhere but not by `adv_worktree_create`. This inconsistency alone is a bug — the new ADV path uses a worse implementation than the older parallel code.

## Why the 2026-05-20 validation passed but live use fails

`docs/spikes/warp-live-validation.md` validated warp via `opencode run --attach --dir /home/dev/dev/repos/advance` in both scenarios. The `--dir` flag pins a consistent directory context, so the server's project-id resolution matched the session's storage namespace. Live fresh sessions in varied directory contexts (worktree subdirs, multi-project layouts, sessions whose directory resolution drifts) hit the bug.

## Observability gap

The runtime warning includes the parenthetical `(${error})` with the inner error message. In practice users report only seeing the "falling back" line — the parenthetical detail is opaque (`getSessionWorkspaceID failed: 404 ...` or `TypeError: fetch failed`) and not structured. The agent has no way to distinguish 404 vs network error vs auth vs server crash without parsing prose.

## No spec law governs warp/fallback today

`.adv/specs/` has no entry covering `mode:warp` lookup behavior, fallback policy, or the contract for what a session-lookup failure means. The current downgrade-on-lookup-failure is unwritten product behavior. As part of this fix we should codify the warp contract as spec law: when `mode:warp` succeeds, when it blocks, when it falls back, and what diagnostic shape is guaranteed to the caller.

## Scope of the fix

1. **Unify session lookup on the SDK client** — plumb `input.client` from plugin init through `createToolMap` → `AdvWorktreeCreateRuntime` → `resolveCreateRuntimeMode`, and replace the raw-fetch `getSessionWorkspaceID` with a single `client.session.get`-based implementation.
2. **Send `x-opencode-directory` on any remaining raw fetch** — `workspaceAndWarpAvailable`, `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace` all use raw fetch and should send the project root as the directory header so server-side resolution matches the session's project.
3. **Structured diagnostic surface** — extend the tool output `warning` field to a structured object `{ kind, status?, error_detail, hint }` so agents can branch on lookup-failure shape; preserve the human-readable string for back-compat.
4. **Spec law: `worktree-warp-mode`** — net-new spec capability defining (a) when `mode:warp` is selected, (b) the blocked-already-warped contract, (c) the downgrade conditions and what is guaranteed to be communicated to the caller, (d) header/SDK-client requirement for session lookup.
5. **Regression coverage** — add unit + integration tests covering: SDK-routed lookup happy path, lookup-404 fallback with structured warning, `x-opencode-directory` header presence on workspace endpoints.

## Out of scope (explicit non-goals)

- Changing the downgrade-on-failure default policy (warp → terminal). The fix is to make the lookup succeed in cases that should succeed, not to convert lookup failure into a hard error.
- Backfilling the OpenCode cross-project session resolver fallback proposed in #14595. That's upstream's call.
- Eliminating the legacy `worktree/index.ts:resolveEffectiveWorktreeMode` path immediately. It already uses the SDK client, so it doesn't suffer the bug; consolidation can happen as a follow-up if both paths still exist post-fix.

## Confidence in root cause

High. Evidence is convergent: upstream issues, upstream test suite, internal two-implementation inconsistency, validation methodology gap, and structural plausibility all point to the missing `x-opencode-directory` header / raw-fetch routing as the root cause.