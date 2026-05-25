# Design: Fix Warp Session Lookup

## Architecture Overview

The fix is structural, not heuristic (P33): the broken raw-fetch lookup is replaced by a typed SDK call whose request-interceptor pipeline guarantees the `x-opencode-directory` header on every outbound request from the SDK client. Where the SDK does not expose typed methods (the four `/experimental/workspace/*` endpoints, in the v1 client surface the plugin receives), the same header is attached at the raw-fetch call site so server-side project-id resolution is unambiguous.

Three components are touched:

```
┌────────────────────────────────────────────────────────────────────┐
│ plugin/src/index.ts                                                │
│   advancePluginImpl(input) — destructure input.client now          │
│         │                                                          │
│         ▼                                                          │
│ plugin/src/tool-registry.ts                                        │
│   createToolMap(store, directory, agendaPath, serverUrl, client?)  │
│         │                                                          │
│         ▼                                                          │
│ plugin/src/tools/adv-worktree.ts                                   │
│   AdvWorktreeCreateRuntime { serverUrl?, sessionID?, client? }     │
│   resolveCreateRuntimeMode — uses client.session.get; emits        │
│   structured downgrade_reason on every fallback path               │
│         │                                                          │
│         ▼                                                          │
│ plugin/src/utils/workspace-warp.ts                                 │
│   WarpDeps { serverUrl, directory, fetchImpl?, client? }           │
│   getSessionWorkspaceID(deps, sessionID) — uses deps.client        │
│   createAdvWorkspace / warpSession / deleteAdvWorkspace —          │
│     attach x-opencode-directory header explicitly                  │
│   workspaceAndWarpAvailable / findWorkspaceByDirectory — same      │
└────────────────────────────────────────────────────────────────────┘
```

Spec law `worktree-warp-mode` is added under `.adv/specs/` to codify the runtime contract.

## SDK v1 vs v2 — Clarifying the Client Surface

**The plugin receives the v1 SDK client, not v2.** This is a critical constraint that shapes the design.

- `@opencode-ai/plugin@1.15.5` types `PluginInput.client` as `ReturnType<typeof createOpencodeClient>` where `createOpencodeClient` is imported from `@opencode-ai/sdk` (the v1 path), per `node_modules/@opencode-ai/plugin/dist/index.d.ts:1,37`.
- The v1 `OpencodeClient` class (`@opencode-ai/sdk/dist/gen/sdk.gen.d.ts:377-403`) exposes: `global`, `project`, `pty`, `config`, `tool`, `instance`, `path`, `vcs`, `session`, `command`, `oauth`, `provider`, `find`, `file`, `app`, `auth`, `mcp`, `lsp`, `formatter`, `control`, `tui`, `event`. It does NOT expose `experimental.workspace.*`.
- v1 `client.session.get` shape: `{ path: { id: string }, query?: { directory?: string } }` (`SessionGetData` at `dist/gen/types.gen.d.ts:1888-1897`). The existing dead-code at `tools/worktree/index.ts:1962` uses this shape — it is correct for v1.
- The v2 SDK (`@opencode-ai/sdk/v2`) DOES expose `client.experimental.workspace.{list,create,remove,warp,status,syncList}` and uses `{ sessionID }` parameter shape. **But the plugin does not currently receive a v2 client.** Constructing one from `input.serverUrl` would duplicate v1's auth/error interceptor logic and is explicitly out of scope.

**Result:** session lookup goes through the v1 typed `client.session.get`; workspace POST/DELETE/PUT stays on raw fetch with explicit `x-opencode-directory` header. If/when `PluginInput.client` becomes v2, a follow-up change can migrate the workspace endpoints to typed methods.

## Key Decisions

### KD-1: Session lookup routes through the v1 SDK client

`@opencode-ai/sdk@1.15.5` v1 `createOpencodeClient(config)` (`dist/client.js:31-54`) sets `config.headers["x-opencode-directory"] = encodeURIComponent(config.directory)` when constructed with a directory, and registers a request interceptor that rewrites GET/HEAD to a `?directory=` query param. OpenCode constructs `input.client` with `directory: ctx.directory` (`packages/opencode/src/plugin/index.ts:128`). Calling `client.session.get({ path: { id: sessionID } })` therefore inherits both the default header and the GET-to-query rewrite without any per-call header attachment.

The call site:
```ts
const result = await client.session.get({ path: { id: sessionID } });
// result.data, result.error, result.response
```

This solves the root cause: the missing `x-opencode-directory` header on session lookup.

### KD-2: Raw fetch retained for workspace POST/DELETE/PUT with explicit header attachment

The v1 client surface does not expose typed methods for `/experimental/workspace/*` (`Experimental` and `Workspace` classes are v2-only — `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` has no such classes; only `@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts` does, but the plugin receives v1). The four endpoints (`POST /experimental/workspace`, `POST /experimental/workspace/warp`, `DELETE /experimental/workspace/{id}`, `GET /experimental/workspace` list) remain raw-fetch.

Pattern: each function attaches `"x-opencode-directory": encodeURIComponent(directory)` via `headers`. The encoding matches the SDK's own behavior (`v1/client.js:42-45`).

**Alternatives considered:**
- `client._client.post(...)` (v1 private surface) — rejected: underscore-prefixed access is private SDK surface and brittle across versions; not supported by the v1 type declarations.
- Constructing a v2 client locally — rejected: duplicates v1's auth/error interceptor logic, requires us to track upstream SDK changes for two clients, and is out of scope.
- Bumping the plugin SDK peer dep to a v2-emitting plugin host — rejected: requires upstream `@opencode-ai/plugin` to change, out of scope.

### KD-3: GET availability and discovery checks also raw-fetch with explicit header

The `workspaceAndWarpAvailable` GET and `findWorkspaceByDirectory` GET could be routed through the v1 SDK using its bare `_client.get(...)` surface, but doing so reintroduces the private-surface concern from KD-2 and changes the test mock shape from `fetchImpl` to client-method mocks for these two callers only. Keeping all five workspace endpoints on raw fetch + explicit header is structurally simpler. The v1 client's interceptor's GET-to-query rewrite is a server-side compatibility shim, not a security boundary — sending `x-opencode-directory` as a header on GET is equally accepted by upstream.

### KD-4: Structured `downgrade_reason` is a discriminated union

```ts
type DowngradeReason =
  | { kind: "missing_server" }
  | { kind: "missing_session" }
  | { kind: "missing_client" }
  | { kind: "flag_disabled" }
  | { kind: "lookup_failed"; status?: number; detail?: string }
  | { kind: "endpoint_unreachable"; detail?: string };
```

Emitted on every `mode:warp → mode:terminal` downgrade path. `missing_client` is separate from `missing_server` for diagnostic precision (one is "no `serverUrl` wired", the other is "no SDK client wired"). `lookup_failed` carries `status` when the server returned a structured response and `detail` either way. `endpoint_unreachable` covers the `workspaceAndWarpAvailable` false branch.

The legacy `warning: string` field is preserved for back-compat and human readability; `downgrade_reason` is the structural channel.

### KD-5: `getSessionWorkspaceID` returns a result tuple, not throws

```ts
type SessionLookupResult =
  | { ok: true; workspaceID: string | null }
  | { ok: false; status?: number; detail: string };
```

The current implementation throws on non-2xx and on `null`-vs-string drift, which forces `resolveCreateRuntimeMode` to catch and stringify. Returning a structured result avoids the lossy `String(error)` conversion and lets the caller build `downgrade_reason` precisely. The SDK call returns `{ data, error, response }`; we translate `error` set → `{ ok: false, status: response.status, detail }` and `data` set → `{ ok: true, workspaceID: data.workspaceID ?? null }`.

### KD-6: Spec law `worktree-warp-mode` codifies the runtime contract

Net-new capability spec at `.adv/specs/worktree-warp-mode.md` (with adjacent `spec.json` per ADV spec conventions) defines:

- `rq-warpModeContract01` — When `mode:warp` is selected (config + flag + lookup success + endpoint reachable).
- `rq-warpModeContract02` — The already-warped block contract (lookup returns workspaceID → return `SESSION_ALREADY_WARPED` error, not downgrade).
- `rq-warpModeContract03` — Downgrade triggers and the guaranteed `downgrade_reason` shape (all six kinds above).
- `rq-warpModeContract04` — Session lookup MUST route through the SDK client (`client.session.get`); raw fetch is disallowed for `/session/:id`.
- `rq-warpModeContract05` — Workspace POST/DELETE/PUT calls MUST attach `x-opencode-directory`.

Asset test `plugin/src/__tests__/worktree-warp-mode-assets.test.ts` enforces section presence and `rq-` IDs. A grep gate is added to enforce KD-1's structural rule: `rg -n "fetch.*\\/session\\/" plugin/src/utils/workspace-warp.ts plugin/src/tools/worktree/index.ts` MUST return zero matches.

## ADR Drafts

None proposed. The 3-criteria rubric (hard-to-reverse, surprising-without-context, real-tradeoff): KD-1 is reversible; KD-2 is forced by v1 SDK surface and reversible once a v2 client is available; KD-4 is additive. No ADR required.

## Implementation Strategy

Sequence (each step independently testable):

1. **Extend types** — `WarpDeps` gains `directory: string` and `client?: OpencodeClient`. `AdvWorktreeCreateRuntime` gains `client?: OpencodeClient`. `createToolMap` signature gains optional `client` arg.

2. **Rewrite `getSessionWorkspaceID`** — switch to `client.session.get({ path: { id: sessionID } })`; return structured result tuple; unit-test happy / 404 / network-error / missing-workspaceID paths via a small `createMockSdkClient` helper. Red→green.

3. **Attach header on workspace endpoints** — `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace`, `findWorkspaceByDirectory`, `workspaceAndWarpAvailable` all set `"x-opencode-directory": encodeURIComponent(directory)`. Unit-test header presence on each via `fetchImpl` mock capture.

4. **Update `resolveCreateRuntimeMode`** — emit `downgrade_reason` on every path; thread `client` from runtime into `WarpDeps`; surface `missing_client` when `runtime.client` is undefined. Unit-test each downgrade emits the correct kind.

5. **Wire registry + plugin-init** — `index.ts` destructures `input.client`; `tool-registry.ts` accepts and forwards it through `adv_worktree_create` (and legacy `worktree_create` alias) registration. Confirm `serverUrl`/`client` are both forwarded for `adv_worktree_delete` and `adv_worktree_cleanup` (so cleanup path also gets the header).

6. **Remove parallel implementation** — `tools/worktree/index.ts:1958-1967` (`getCurrentSessionWorkspaceID`) — delete and re-import shared utility. Update `resolveEffectiveWorktreeMode` call.

7. **Spec law** — author `.adv/specs/worktree-warp-mode.md` and `spec.json`; add asset test enforcing structure.

8. **Validation methodology** — append "fresh standalone session NOT started via `--attach --dir`" scenario to `docs/spikes/warp-live-validation.md`.

9. **Green-bar verification** — `pnpm test && pnpm run check && pnpm run build`.

## Affected Components

| Path | Change shape |
|---|---|
| `plugin/src/index.ts` | Destructure `input.client`; pass to `createToolMap` |
| `plugin/src/tool-registry.ts` | `createToolMap` accepts optional `client`; threaded into `adv_worktree_create` + `worktree_create` (and `adv_worktree_delete`/`cleanup`/legacy aliases) registration runtime args |
| `plugin/src/tools/adv-worktree.ts` | `AdvWorktreeCreateRuntime.client?` added; `resolveCreateRuntimeMode` returns `downgrade_reason` on every fallback; `terminalModePayload` carries it through |
| `plugin/src/tools/adv-worktree.test.ts` | Mock new runtime field; assert `downgrade_reason` shape on each path |
| `plugin/src/utils/workspace-warp.ts` | `WarpDeps` extended; `getSessionWorkspaceID` rewritten to use v1 client.session.get with `{ path: { id } }` shape; POST/DELETE/PUT/GET add header |
| `plugin/src/utils/workspace-warp.test.ts` | New + updated tests for SDK-routed lookup, header presence, structured-result shape |
| `plugin/src/tools/worktree/index.ts` | Delete `getCurrentSessionWorkspaceID`; update `resolveEffectiveWorktreeMode` import |
| `.adv/specs/worktree-warp-mode.md` (NEW) | Spec law capability file |
| `.adv/specs/worktree-warp-mode/spec.json` (NEW) | rq-id registry per ADV spec conventions |
| `plugin/src/__tests__/worktree-warp-mode-assets.test.ts` (NEW) | Asset test enforcing spec structure |
| `docs/spikes/warp-live-validation.md` | Append revised methodology scenario |

Not modified: `mode:spawn`/`mode:terminal` direct paths, legacy `WorktreePlugin` standalone export, upstream OpenCode, Temporal workflows.

## LBP Analysis

**Why this is the preferred long-term approach:**

1. **One source of truth.** Two parallel implementations existed (`tools/worktree/index.ts:getCurrentSessionWorkspaceID` SDK-routed but dead-code, `utils/workspace-warp.ts:getSessionWorkspaceID` raw-fetch and live). Consolidating to one SDK-routed implementation removes the regression-vector inconsistency.

2. **Structural correctness over heuristic** (P33). The fix is "use the typed client whose interceptor guarantees the header" — a deterministic mechanism — instead of "always remember to set the header." The remaining raw-fetch sites are minimal and the header attachment is explicit at the call site, not implicit.

3. **Spec law as durable enforcement.** The asset test + grep gate makes future regressions of this exact shape visible at PR time. Without the spec, the next refactor could reintroduce the bug.

4. **Structured diagnostic surface** is forward-compatible. Agents can branch on `downgrade_reason.kind` without prose parsing; the legacy `warning: string` stays for humans.

5. **Validation methodology fix** prevents the same false-positive that masked this bug in 2026-05-20 validation.

6. **v2 SDK migration is open downstream.** When `@opencode-ai/plugin` bumps `PluginInput.client` to v2, the workspace POST/DELETE/PUT calls can move to typed methods (`client.experimental.workspace.*`) in a follow-up change. The header attachment becomes redundant at that point but is harmless.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| SDK contract drifts between versions (interceptor behavior changes, `client.session.get` shape changes) | Asset test pins the rq-IDs; `OpencodeClient` type is aliased via `utils/opencode-types.ts`/`utils/opencode-sdk.d.ts`. v1 interceptor pattern is stable per `dist/client.js`. v2 migration tracked as follow-up. |
| `input.client` is undefined in some plugin-init contexts (older OpenCode versions) | `missing_client` downgrade emitted with structured `downgrade_reason`; not a hard error. |
| `directory` value mismatch with session's storage namespace (cross-project sessions) | Use `store.paths.root` (project root) as the directory header. Cross-project sessions are explicitly out of scope (matches upstream #14595's stance). |
| Removing `tools/worktree/index.ts:getCurrentSessionWorkspaceID` breaks `resolveEffectiveWorktreeMode` (the SDK-routed legacy path) | Re-import from shared utility; same call signature; tests in `index-create.test.ts` cover the path. |
| Spec law introduction is rejected by validation tooling | Run `adv_spec action: "show"` against the new capability after authoring; asset test confirms structure. |
| Test mock surface for `client.session.get` grows | Use a small `createMockSdkClient({ session: { get: async ({ path }) => ({ data, error, response }) } })` helper; co-locate with `workspace-warp.test.ts`. |
| Validator's v2-vs-v1 confusion repeats in future review | Design explicitly documents the v1/v2 split (this section + KD-2); spec law `rq-warpModeContract04` names the v1 surface. |

## Design Leverage Scout

**Scope assessment:** tightly scoped bug fix with explicit AC, one root cause, one architectural choice (use the v1 SDK client for session lookup, raw-fetch + explicit header for workspace endpoints), and a small surface area (~6 source files + 1 spec). Opportunity surface for a scout pass is near-zero — the work is concentrated, the alternatives table in the proposal already enumerated the leverage points (consolidate parallel impl, codify spec law, structured diagnostic), and they are all in scope.

**Scout result:** skipped — trivially scoped bug fix with all leverage candidates already in scope; no additional scouting expected to add findings.

## Validator Result

**Verdict: CAUTION (resolved inline).**

Validator (adv-researcher, 2026-05-21) returned CAUTION with one effective CONFLICT-level finding in dimension 1: "KD-2 claims no typed workspace SDK methods exist, but they do." Investigation: the validator read `@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts` (v2 SDK), which DOES expose `client.experimental.workspace.{list,create,remove,warp,status,syncList}` and uses `{ sessionID }` shape for `session.get`. However, the plugin's `PluginInput.client` is typed as `ReturnType<typeof createOpencodeClient>` from `@opencode-ai/sdk` (v1 path), and the v1 `OpencodeClient` has NO `experimental.workspace.*` methods and uses `{ path: { id } }` for `session.get`. Architectural decision unchanged. Design wording corrected: explicit v1/v2 split documented (see "SDK v1 vs v2" section and KD-2 alternatives). Validator's second dimension-1 caution (parameter shape mismatch) was also based on v2 shape and is also addressed by the explicit v1 documentation. Dimensions 2, 3, 4 findings are informational and do not change the design.

Resolution recorded 2026-05-21. Proceeding to planning.

