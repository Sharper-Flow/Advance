# Agreement: Fix Warp Session Lookup

## Objectives

1. **Make `mode:warp` succeed on the happy path.** Live fresh OpenCode sessions with `OPENCODE_EXPERIMENTAL_WORKSPACES=true` that today downgrade to `mode:terminal` with the `current session lookup failed (...)` warning will complete in `mode:warp` after this change.

2. **Unify session lookup on the SDK client.** A single `getSessionWorkspaceID(client, sessionID)` implementation routes through `client.session.get`. The dead-code parallel implementation in `tools/worktree/index.ts` is removed in favor of the shared utility.

3. **Send `x-opencode-directory` on every workspace endpoint call.** All raw-fetch POST/DELETE calls in `utils/workspace-warp.ts` (`createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace`) explicitly attach the header so OpenCode server-side project-id resolution matches the session's storage namespace. GET calls inherit via SDK interceptor or send the same header.

4. **Structure the downgrade diagnostic.** When `mode:warp` falls back to `mode:terminal`, tool output includes a structured `downgrade_reason: { kind, status?, detail? }` alongside the existing human-readable `warning` string, so agents can branch programmatically.

5. **Codify the warp contract as spec law.** A net-new `.adv/specs/worktree-warp-mode.md` defines when warp is selected, the already-warped block contract, downgrade triggers and guaranteed diagnostic shape, and the header/SDK-client requirement.

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | Live fresh OpenCode sessions with `OPENCODE_EXPERIMENTAL_WORKSPACES=true` complete `adv_worktree_create` in `mode:warp` without downgrade | Manual smoke test (revised methodology — no `--attach --dir`) shows `mode: "warp"` and a `workspaceID` in tool output |
| AC2 | All session-lookup calls in the warp path route through `client.session.get` | `grep -rn "GET /session" plugin/src/` returns zero matches; `rg -n "fetch.*session/" plugin/src/utils/workspace-warp.ts` returns zero matches |
| AC3 | Every raw-fetch POST/DELETE/PUT to `/experimental/workspace/*` includes `x-opencode-directory` | Unit tests assert header presence on each endpoint; reading the call sites confirms structural inclusion (no per-call inlining) |
| AC4 | Tool output for `adv_worktree_create` includes structured `downgrade_reason` whenever `mode === "terminal"` was triggered from a `warp`-requested config | Unit tests assert presence + `kind` enum + `status`/`detail` where applicable for each downgrade path (missing_server, missing_session, missing_client, flag_disabled, lookup_failed, endpoint_unreachable) |
| AC5 | `.adv/specs/worktree-warp-mode.md` exists with the warp contract | Asset test enforces section headers and contract requirements (`rq-warpModeContract01` and related IDs) |
| AC6 | `pnpm test && pnpm run check && pnpm run build` all green | CI / local |
| AC7 | No regression in `mode:spawn` / `mode:terminal` direct paths or legacy `worktree.*` tools | Existing tests still pass without modification of legacy assertions |
| AC8 | Validation methodology gap closed | `docs/spikes/warp-live-validation.md` documents the "fresh standalone session NOT started via `--attach --dir`" scenario as part of the validation contract |

## Constraints

- Runtime is Bun for OpenCode; tests run on Node. SDK mocks via `vitest.config.ts` aliases remain authoritative.
- Source-vs-dist reload: live tool behavior validation requires `pnpm run build` + OpenCode session restart. In-session validation is unit/integration tests only.
- Worktree-isolation rule (P32): all writes happen in this worktree, never the trunk checkout.
- Workflow-bundle boundary (`temporal/workflows.test.ts`): no new static imports into `temporal/` from `storage/`, `tools/`, `tool-registry`, or `node:*`.
- The cache-refresh discipline (rq-cacheRefresh01) does not apply here — no change-workflow signals are involved.

## Avoidances

- × Changing the downgrade-on-failure default policy (warp → terminal). The fix makes lookup succeed where it should; it does not convert lookup failure to a hard error.
- × Eliminating fallback entirely. Transient network failures and genuinely missing sessions should not break worktree creation.
- × Upstream OpenCode changes (e.g., the cross-project session resolver fallback proposed in opencode#14595). Out of scope.
- × Retiring the dead-code `WorktreePlugin` standalone export in `tools/worktree/index.ts:2094-2540`. Tagged as a follow-up change, not in this scope.
- × Adding typed SDK wrappers for `/experimental/workspace/*` endpoints. The SDK does not currently expose them; raw fetch with explicit header is the agreed bridge.
- × Reading ADV state files directly (per ADV_INSTRUCTIONS).

## Open Items Resolved at Agreement Time

- **SDK typed methods for `/experimental/workspace/*`** — confirmed via `sdk@1.15.5/dist/v2/client.js` and `gen/sdk.gen.d.ts`: no typed methods exist for create/warp/delete. Decision: raw fetch with explicit `x-opencode-directory` header. The SDK request interceptor pattern (`v2/client.js:17-40`) is the canonical reference for how to attach the header.
- **`missing_client` enum value** — separate `downgrade_reason.kind` for diagnostic precision (matches proposal's "Proposed: separate" answer).
- **`downgrade_reason` uniformity** — emitted on ALL `mode:warp` → `mode:terminal` downgrade paths (not only lookup failures), matching proposal's "Proposed: all" answer.

## Out of Scope (Reaffirmed)

- Replacing `mode:spawn` / `mode:terminal` direct paths.
- Migrating away from `WorktreePlugin` standalone export.
- Modifying the cache-refresh helper (`fireSignalAndRefresh`) — not relevant.
- Upstream OpenCode patches.