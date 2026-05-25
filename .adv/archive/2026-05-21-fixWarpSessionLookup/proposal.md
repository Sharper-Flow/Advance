# Proposal: Fix Warp Session Lookup

## Summary

Replace raw-fetch session lookup with SDK-client routing, send `x-opencode-directory` on all workspace endpoints, structure the diagnostic surface, and codify the warp-mode contract as spec law.

## Background

Worktree `mode:warp` is the recommended default for ADV worktree creation: it registers the new worktree as an OpenCode workspace and warps the calling session into it, eliminating per-tool `workdir=` overrides. Live use after the 2026-05-20 enablement shows some sessions silently downgrading to `mode:terminal` with the warning `mode:warp unavailable because current session lookup failed (...)`. The downgrade is the *designed* fallback, but the precondition lookup is failing on the happy path.

Root cause: `getSessionWorkspaceID` in `plugin/src/utils/workspace-warp.ts` makes a raw `fetch` to `GET {serverUrl}/session/{sessionID}` with no `x-opencode-directory` header. OpenCode's `Session.get` endpoint resolves session storage via `Instance.project.id` derived from that header (fallback: server cwd). When the calling context's directory resolution doesn't match the session's storage namespace, the endpoint returns 404 → the catch downgrades to `mode:terminal`.

Multiple upstream issues describe this exact pattern (#8538, #7149, #14595, #3551), and upstream's own request layer always sets `x-opencode-directory` (`packages/opencode/test/server/httpapi-experimental.test.ts:28`).

## Discovery findings (2026-05-21)

Investigation against upstream OpenCode source confirmed and refined the original root-cause hypothesis:

### Finding D1: OpenCode SDK v2 auto-routes the directory transparently

`packages/sdk/js/src/v2/client.ts:47-90` — `createOpencodeClient({ directory })` registers a fetch interceptor:

- For **GET/HEAD**, the interceptor moves `x-opencode-directory` into a `?directory=` query parameter and strips the header.
- For **POST/DELETE/PUT**, the header passes through unmodified.
- A pre-configured `directory` option is automatically added as a default header on every outbound request.

### Finding D2: The plugin already receives a correctly-configured client

`packages/plugin/src/index.ts:56-66`:

```ts
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  experimental_workspace: { register(...) }
  serverUrl: URL
  $: BunShell
}
```

Upstream constructs the client at plugin-init time with `directory: ctx.directory` (`packages/opencode/src/plugin/index.ts:128`). ADV's `advancePluginImpl` (`plugin/src/index.ts:307-321`) destructures `directory`, `worktree`, `project`, and `experimental_workspace` from `input` but **skips `client`** — the SDK client is sitting unused.

### Finding D3: Two parallel implementations, only the broken one is wired

- `plugin/src/tools/worktree/index.ts:1958-1967` defines `getCurrentSessionWorkspaceID(client, sessionID)` using `client.session.get({ path: { id } })`. Used by `resolveEffectiveWorktreeMode` in the same file.
- `plugin/src/tools/worktree/index.ts:2094-2540` exports `WorktreePlugin` as the default — a complete standalone plugin entry with the SDK-routed flow.
- Cross-reference (`grep -rn "WorktreePlugin" plugin/src`): only `index-create.test.ts:89,172` references it. **The standalone `WorktreePlugin` is dead code at runtime**, never imported by the live ADV plugin entry.
- The live `adv_worktree_create` tool path (`tool-registry.ts:597-614` → `adv-worktree.ts:174` → `resolveCreateRuntimeMode` → `utils/workspace-warp.ts:117`) uses **raw fetch** without the header — the regression.

### Finding D4: Test coverage exists and is adaptable

`plugin/src/tools/worktree/index-create.test.ts:651-691` already exercises the SDK-routed warp happy path through `WorktreePlugin`/`createWorktreeCreateHarness`. The same harness pattern (mocking `client.session.get` and `fetch` for `/experimental/workspace/*`) can be applied to the new `adv_worktree_create` flow once it's unified.

### Finding D5: POST/DELETE workspace endpoints also need explicit directory

Since the SDK interceptor only rewrites GET/HEAD, the four POST/DELETE/PUT workspace endpoints in `utils/workspace-warp.ts` (`workspaceAndWarpAvailable` uses GET — auto-rewritten — but `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace` are POST/DELETE) require:

- **Option A**: Route through typed SDK methods if the SDK exposes them (e.g. `client.experimental.workspace.create(...)`). Investigation needed at design time.
- **Option B**: If no typed SDK method exists, retain raw fetch but explicitly send `x-opencode-directory` header.

OpenCode upstream test fixtures (`httpapi-workspace.test.ts:34-35`) set the header on every workspace request, confirming the server expects it for all methods.

### Finding D6: SDK method shape for `client.session.get`

Existing usage at `worktree/index.ts:1962-1967`:

```ts
const currentSession = await client.session.get({ path: { id: sessionID } });
const workspaceID = (currentSession.data as { workspaceID?: unknown } | null)?.workspaceID;
```

The SDK returns `{ data, error, response }` — the unified fix must handle the `error`-set path (non-2xx) as a structured `lookup_failed` downgrade reason, not throw, so the warning shape is consistent.

### Finding D7: Validation methodology gap

`docs/spikes/warp-live-validation.md` used `opencode run --attach --dir <repo>` for both happy-path and downgrade scenarios. The `--dir` flag pins a consistent directory header, masking the bug. Production methodology must include a "fresh standalone session without `--dir`" scenario to catch directory-context drift regressions.

## Goals

- `mode:warp` succeeds for every session where workspace warp is genuinely available, instead of silently downgrading when the lookup endpoint hits directory-context mismatch.
- A single source of truth for session lookup that uses the OpenCode SDK client and respects upstream's request conventions.
- Structured downgrade reasons that agents can branch on, in addition to the existing human-readable warning string.
- A durable spec law for warp-mode behavior so future regressions surface as spec violations, not silent fallbacks.

## Non-goals

- Changing the downgrade-on-failure default (warp → terminal).
- Eliminating fallback entirely / making lookup-failure a hard error.
- Upstream OpenCode changes (cross-project session resolver fallback).
- Removing or consolidating the dead-code `WorktreePlugin` entry in `worktree/index.ts` — flag as follow-up.

## Scope

### Files modified

| Path | Change |
|---|---|
| `plugin/src/index.ts` | Extract `input.client` at plugin init; thread into `createToolMap`. |
| `plugin/src/tool-registry.ts` | `createToolMap` accepts `client?: OpencodeClient`; wires it into `AdvWorktreeCreateRuntime` at `adv_worktree_create` (and legacy `worktree_create` alias) registration. |
| `plugin/src/tools/adv-worktree.ts` | Extend `AdvWorktreeCreateRuntime` with `client?`; update `resolveCreateRuntimeMode` to use SDK-routed lookup; emit structured `downgrade_reason`; thread `directory` into `WarpDeps`. |
| `plugin/src/utils/workspace-warp.ts` | Rewrite `getSessionWorkspaceID` to take `client` and call `client.session.get`; extend `WarpDeps` with `directory: string`; add `x-opencode-directory` header to every raw-fetch POST/DELETE call (`createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace`); GET path (`workspaceAndWarpAvailable`) inherits via SDK client where possible. |
| `plugin/src/tools/worktree/index.ts` | Remove local `getCurrentSessionWorkspaceID`; re-import shared utility from `utils/workspace-warp.ts`. Update `resolveEffectiveWorktreeMode` callsite. |
| `plugin/src/utils/workspace-warp.test.ts` | Update + extend tests: SDK happy path, 404 fallback structured reason, network-error fallback structured reason, header presence on POST/DELETE. |
| `plugin/src/tools/adv-worktree.test.ts` | Update mocks for new runtime shape; assert structured downgrade reason in tool output. |
| `.adv/specs/worktree-warp-mode.md` | Net-new capability spec for warp mode contract. |
| `plugin/src/__tests__/worktree-warp-mode-assets.test.ts` | Net-new asset test enforcing spec/implementation consistency. |
| `docs/spikes/warp-live-validation.md` | Append revised methodology scenario (live session not started via `--attach --dir`). |

### Files NOT modified

- Existing `mode:spawn` / `mode:terminal` direct paths — untouched.
- Legacy `WorktreePlugin` standalone entry in `worktree/index.ts:2094-2540` — kept; retirement is follow-up.
- OpenCode upstream — out of scope.

### Surface area

- ~6 source files, ~3 test files, 1 new spec, 1 new asset test, 1 docs update.
- ~3 modules cross-coupled (plugin init → tool-registry → adv-worktree runtime).
- No DB / Temporal workflow / external state schema changes.

## Proposed change

### 1. Plumb the SDK client into the worktree-create runtime

- Extract `input.client` in `plugin/src/index.ts:advancePluginImpl`.
- Extend `createToolMap` signature with `client?: OpencodeClient`.
- Extend `AdvWorktreeCreateRuntime` in `plugin/src/tools/adv-worktree.ts` with `client?: OpencodeClient`.
- Pass `client` through at the registration site (`tool-registry.ts:597-614` and the legacy-alias path `666-683`).

### 2. Unify session lookup on the SDK client

- Replace `getSessionWorkspaceID` in `plugin/src/utils/workspace-warp.ts` with a single `getSessionWorkspaceID(client, sessionID)` that calls `client.session.get({ path: { id: sessionID } })`.
- Handle the `{ data, error }` return shape: on `error` set, return a structured `lookup_failed` result with `error.status` and `error.detail`; do not throw.
- Remove the parallel `getCurrentSessionWorkspaceID` from `plugin/src/tools/worktree/index.ts` and re-import the shared utility — both call sites use the same code path.
- `WarpDeps` retains `serverUrl` for endpoints not yet typed by SDK and gains `directory: string` for header attachment.

### 3. Send `x-opencode-directory` on raw-fetch POST/DELETE workspace endpoints

- Extend `WarpDeps` with `directory: string` (the project root).
- `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace` set `headers["x-opencode-directory"] = encodeURIComponent(directory)` on every request (matching SDK encoding).
- `workspaceAndWarpAvailable` (GET) is candidate for SDK routing or query-param form — design-time decision.
- Use `store.paths.root` as the directory value at call sites.

### 4. Structured downgrade warning

- Extend the `mode:terminal` return shape in `resolveCreateRuntimeMode` with a structured `downgrade_reason: { kind: "missing_server" | "missing_session" | "flag_disabled" | "lookup_failed" | "endpoint_unreachable", status?: number, detail?: string }` alongside the existing `warning: string`.
- Surface `downgrade_reason` in the `adv_worktree_create` tool output (alongside `mode: "terminal"`) so agents can branch programmatically.

### 5. Spec law: `worktree-warp-mode`

- Add `.adv/specs/worktree-warp-mode.md` defining:
  - When `mode:warp` is selected (config + flag + lookup success + endpoint reachable).
  - The already-warped block contract.
  - Downgrade triggers + the guaranteed structured `downgrade_reason` shape.
  - Header/SDK-client requirement for session lookup.
- Reference IDs for traceability (`rq-warpModeContract01`, etc.).

### 6. Regression coverage

- Unit: SDK-routed lookup happy path, 404-fallback path produces structured `downgrade_reason: { kind: "lookup_failed", status: 404 }`, network-error fallback produces structured `downgrade_reason: { kind: "lookup_failed" }` with detail.
- Unit: `x-opencode-directory` header presence on `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace`.
- Asset test (against `.adv/specs/worktree-warp-mode.md`) verifying spec/implementation consistency.
- Integration: extend `docs/spikes/warp-live-validation.md` methodology with a "live session NOT started via `--attach --dir`" scenario so future validation catches directory-context drift.

## Success Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Live fresh OpenCode sessions with `OPENCODE_EXPERIMENTAL_WORKSPACES=true` complete `adv_worktree_create` in `mode:warp` instead of downgrading | Manual smoke test (revised methodology — no `--attach --dir`) shows tool output has `mode: "warp"` and a `workspaceID`. |
| 2 | All session-lookup calls in the warp path route through `client.session.get` | `grep -rn "GET /session" plugin/src/` returns zero matches; `grep -rn "fetch.*session/" plugin/src/utils/workspace-warp.ts` returns zero matches. |
| 3 | Every raw-fetch POST/DELETE call to `/experimental/workspace/*` includes the `x-opencode-directory` header | Unit tests assert the header on each endpoint; reading the call sites confirms structural inclusion (no per-call inlining). |
| 4 | Tool output for `adv_worktree_create` includes structured `downgrade_reason` whenever `mode === "terminal"` was triggered from a `warp`-requested config | Unit tests assert presence + `kind` enum + `status`/`detail` where applicable. |
| 5 | `.adv/specs/worktree-warp-mode.md` exists with the warp contract | Asset test enforces section headers and contract requirements. |
| 6 | `pnpm test && pnpm run check && pnpm run build` all green | CI / local. |
| 7 | No regression in `mode:spawn` / `mode:terminal` direct paths or legacy `worktree.*` tools | Existing tests still pass; new tests do not modify legacy assertions. |

## Risks

| Risk | Mitigation |
|---|---|
| SDK client unavailable in some plugin-init contexts | Fallback: structured `downgrade_reason: { kind: "missing_client" }` (new enum value) when `client` is undefined; raw fetch with manual header is the secondary path. |
| OpenCode SDK version drift (`client.session.get` shape changes) | `OpencodeClient` already aliased via `utils/opencode-types.ts`; ambient declaration in `utils/opencode-sdk.d.ts` insulates against minor drift. The interceptor pattern is stable (v1 + v2 SDK both use it). |
| Header value resolution (which directory?) | Project root from `store.paths.root` matches session creation directory in the common case. Edge cases (cross-project tool calls) are out of scope. |
| Spec law introduction breaks existing changes | Net-new spec; no spec-delta on existing capabilities. Asset test enforces forward consistency only. |
| `workspaceAndWarpAvailable` GET inherits via SDK has typed-method gap | Design-time investigation will confirm whether `client.experimental.workspace.*` exists; otherwise raw fetch + query param form (matching SDK interceptor) is the fallback. |

## Alternatives considered

- **Catch 404 specifically and treat as "no workspaceID"** (skip the already-warped check on failure). Rejected: silently changes the contract — sessions that ARE warped would slip through and we'd attempt double-warp. The structured-warning approach preserves the safety invariant while making the failure visible.
- **Hard error on lookup failure**. Rejected: too aggressive; transient network failures (or genuinely missing sessions during teardown) shouldn't break worktree creation. Downgrade with structured reason is the right default.
- **Wait for upstream cross-project resolver fix (#14595)**. Rejected: timeline unknown, and our local raw-fetch missing-header bug is real regardless.
- **Consolidate the dead-code `WorktreePlugin` entry in this change**. Rejected: scope creep; the SDK-routed lookup helper there will be unified, but the standalone plugin export is a separate retirement decision.

## Open questions (carry into design)

- Should `downgrade_reason` be returned to the agent in *all* mode-warp downgrade cases (including config-disabled and missing-server), or only on lookup failures? (Proposed: all, for uniformity.)
- Does the OpenCode SDK expose typed `client.experimental.workspace.*` methods (create/warp/delete/list), or are these still raw-fetch-only? Design-time check against the SDK gen.
- Whether to retire the legacy `WorktreePlugin` standalone export in this change or as a follow-up. (Proposed: follow-up.)
- Whether `missing_client` should be a separate `downgrade_reason.kind`, or folded into `missing_server`. (Proposed: separate, for diagnostic precision.)
