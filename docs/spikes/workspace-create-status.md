# Spike: Workspace.create connected-status for target.type:"local"

Task: `tk-ad9ebd8b983f` (change `fixWorktreeSessionRoot`).

## Verdict

**YELLOW.** The original assumption — that `Workspace.create` for `target.type: "local"` reaches `connected` synchronously — IS correct, but only when the `experimentalWorkspaces` runtime flag is enabled. By default the flag is OFF, and `Workspace.create` will TIME OUT after 5 seconds and return HTTP 400 instead.

The design's detection probe (`GET /experimental/workspace` → 2xx means available) is INSUFFICIENT. The HTTP endpoint is mounted regardless of flag state; the flag gates the internal sync machinery.

## Evidence

### 1. Local-target sync is synchronous (good news, partial)

`packages/opencode/src/control-plane/workspace.ts:495-498` (v1.15.5):

```ts
if (target.type === "local") {
  setStatus(space.id, (yield* fs.existsSafe(target.directory)) ? "connected" : "error")
  return
}
```

When `experimentalWorkspaces` is enabled and the target directory exists on disk, `startSync` emits `status: connected` synchronously via `setStatus`. The `waitEvent` at line 578 sees the event immediately, `Workspace.create` resolves cleanly.

ADV creates the worktree directory via `git worktree add` BEFORE calling `createAdvWorkspace`, so `fs.existsSafe(target.directory)` is true. The "error" path is not a concern.

### 2. The flag gates the entire sync machinery

`packages/opencode/src/control-plane/workspace.ts:478-479`:

```ts
const startSync = Effect.fn("Workspace.startSync")(function* (space: Info) {
  if (!flags.experimentalWorkspaces) return
  // ...
})
```

When the flag is off, `startSync` returns immediately without emitting any status event. The `Effect.all([waitEvent({timeout: 5000}), startSync(info)], {concurrency: 2, discard: true})` at line 576 then waits the full 5s for an event that never arrives.

### 3. Timeout surfaces as HTTP 400

`packages/opencode/src/control-plane/util.ts:30-33` — `waitEvent` times out with `Effect.fail(new Error("Timed out waiting for global event"))`.

`packages/opencode/src/server/routes/instance/httpapi/handlers/workspace.ts:32` — the handler maps ALL errors to `HttpApiError.BadRequest({})`. No body distinguishes "timeout" from "validation error" or "adapter failure".

### 4. The flag gating

`packages/opencode/src/effect/runtime-flags.ts:49`:

```ts
experimentalWorkspaces: enabledByExperimental("OPENCODE_EXPERIMENTAL_WORKSPACES"),
```

Where (lines 11-12):

```ts
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: bool(name) }).pipe(
    Config.map((flags) => flags.experimental || flags.enabled),
  )
```

So the flag is true if EITHER:
- `OPENCODE_EXPERIMENTAL=true` (broad opt-in to all experimental features)
- `OPENCODE_EXPERIMENTAL_WORKSPACES=true` (specific opt-in)

Both are false by default. Verified in current session: `OPENCODE_EXPERIMENTAL=unset`, `OPENCODE_EXPERIMENTAL_WORKSPACES=unset`.

## Impact on design

The design's §3.3 `workspaceAndWarpAvailable` is broken for default OpenCode installs:

```ts
// BUG: returns true even when the flag is off, because the GET endpoint
// is unconditionally mounted. The POST will then hang 5s and 400.
export async function workspaceAndWarpAvailable(deps: WarpDeps): Promise<boolean> {
  try {
    const url = new URL("/experimental/workspace", deps.serverUrl);
    const res = await (deps.fetchImpl ?? fetch)(url);
    return res.ok;
  } catch {
    return false;
  }
}
```

## Recommended correction

Two-step detection. Both must pass for warp to be considered available:

1. **Env-var probe** (cheap, structural): check `process.env.OPENCODE_EXPERIMENTAL === "true"` OR `process.env.OPENCODE_EXPERIMENTAL_WORKSPACES === "true"`. Plugin runs in the same Node process as the server, so this env IS reachable.
2. **Endpoint probe** (sanity check for future versions where the flag might be removed): the existing `GET /experimental/workspace` 2xx probe.

```ts
export function warpFlagEnabled(): boolean {
  const broad = process.env.OPENCODE_EXPERIMENTAL;
  const specific = process.env.OPENCODE_EXPERIMENTAL_WORKSPACES;
  return broad === "true" || specific === "true";
}

export async function workspaceAndWarpAvailable(deps: WarpDeps): Promise<boolean> {
  if (!warpFlagEnabled()) return false;
  try {
    const url = new URL("/experimental/workspace", deps.serverUrl);
    const res = await (deps.fetchImpl ?? fetch)(url);
    return res.ok;
  } catch {
    return false;
  }
}
```

When `warpFlagEnabled()` returns false, the plugin emits a clear log line:

```
[worktree] mode: warp requested but OPENCODE_EXPERIMENTAL_WORKSPACES is not enabled;
downgrading to mode: terminal. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or
OPENCODE_EXPERIMENTAL=true) to enable session-rerooting via OpenCode's experimental
workspaces feature.
```

This is actionable — users who want the warp behavior know exactly which env var to set.

## Effect on task 4 (HTTP shim)

Implementation status: task `tk-45ca436b3d21` added `warpFlagEnabled()` and integrated it into `workspaceAndWarpAvailable`; `workspace-warp.test.ts` covers flag-off short-circuit, flag-on success, endpoint failure, and fetch failure.

Task 4 (`tk-45ca436b3d21`) added `warpFlagEnabled()` to the shim and integrated it into `workspaceAndWarpAvailable`. The unit tests in task 4 cover:

- Flag off (env unset) → `workspaceAndWarpAvailable` returns false WITHOUT making any HTTP call
- Flag on + endpoint 200 → returns true
- Flag on + endpoint 404 → returns false
- Flag on + fetch throws → returns false

Test setup uses `vi.stubEnv` (vitest) to manipulate `process.env.OPENCODE_EXPERIMENTAL_WORKSPACES` per test case.

## Effect on task 6 (worktree switch)

Implementation status: task `tk-f27fac1ba79c` added the actionable downgrade warning in worktree create mode resolution.

Task 6's downgrade log line mentions the env var so the user can act:

```ts
if (requestedMode === "warp" && !available) {
  log.warn(
    "[worktree] mode: warp requested but unavailable. " +
      "Set OPENCODE_EXPERIMENTAL_WORKSPACES=true to enable. " +
      "Downgrading to mode: terminal.",
  );
  effectiveMode = "terminal";
}
```

## Effect on AC-5

Acceptance criterion 5 stands as-is. The test stub for the downgrade case should now mock `process.env.OPENCODE_EXPERIMENTAL_WORKSPACES` instead of (or in addition to) returning 404 on the GET probe.

## Effect on task 12 (live validation)

Task 12 should be split into two sub-scenarios:

1. **With flag enabled**: `OPENCODE_EXPERIMENTAL_WORKSPACES=true opencode` — exercises the warp path end-to-end. All AC-1, AC-2, AC-3, AC-6 should pass.
2. **Default (flag off)**: `opencode` — exercises the downgrade path. AC-5 should pass; AC-1/AC-2 do NOT apply because warp is not active.

Both sub-scenarios MUST be tested before acceptance gate.

Implementation status: task 12 completed both live smoke scenarios after build; results are recorded in `docs/spikes/warp-live-validation.md` (flag-enabled warp and default flag-off downgrade).

## Residual risks

- **Risk: the flag is removed in future OpenCode versions.** If `experimentalWorkspaces` graduates to GA, the env var becomes a no-op (always-on). Our `warpFlagEnabled()` would then return false (env unset) even though warp is fully available, causing unnecessary downgrade. Mitigation: when the flag graduates, fold its semantics into a runtime probe (e.g. send a small `POST` with an aborted controller after 500ms — if the endpoint behaves, warp is available). Defer this until OpenCode publishes graduation.
- **Risk: the flag enables warp but disables other ADV expectations.** `OPENCODE_EXPERIMENTAL=true` is a broad opt-in that enables many experimental features. Verify ADV doesn't break when these other features turn on. Mitigation: the design recommends users set the NARROW flag (`OPENCODE_EXPERIMENTAL_WORKSPACES`), not the broad one. Documentation in `ADV_INSTRUCTIONS.md` updated to recommend the narrow flag specifically.

## Sources

- `/tmp/opencode-v1.15.5/packages/opencode/src/control-plane/workspace.ts:476-594` — `startSync`, `Workspace.create`, `waitEvent` integration
- `/tmp/opencode-v1.15.5/packages/opencode/src/control-plane/util.ts` — `waitEvent` timeout mechanism
- `/tmp/opencode-v1.15.5/packages/opencode/src/server/routes/instance/httpapi/handlers/workspace.ts:24-33` — HTTP create error mapping
- `/tmp/opencode-v1.15.5/packages/opencode/src/effect/runtime-flags.ts:11-12, 49` — flag definition and gating
- Current environment: `OPENCODE_EXPERIMENTAL=unset`, `OPENCODE_EXPERIMENTAL_WORKSPACES=unset` (verified)
