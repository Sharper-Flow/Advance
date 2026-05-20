# Design — Fix worktree session root

Status: **LOCKED.** Independent validation by `adv-researcher` returned NEEDS_REVISION on HTTP wire bugs; revisions applied; design now ships with validator-verified payload shapes.

## 0. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| §6.1 Workspace adapter | **B — Custom `adv-worktree` adapter via `experimental_workspace.register()`** | Preserves `change/<change-id>` branch/path identity referenced by Temporal workflow IDs, specs, and `_contextSnapshot`. Built-in adapter would force a name-translation layer for zero benefit. Validator confirmed: built-in `WorktreeAdapter` actively calls `Worktree.Service.makeWorktreeInfo({ detached: true })` which would fight ADV's chosen branch name |
| §6.2 OpenCode version gate | **Graceful downgrade** | Endpoint detection at plugin init; missing endpoint → `mode: terminal` fallback + one log line. Hard-fail would brick ADV worktree creation on any future endpoint rename |
| §6.3 `mode` default | **`warp`** | Defaulting to anything else means almost no one gets the fix. Combined with §6.2, the worst case is status-quo inline behavior |
| §6.4 Trunk-write firewall fix scoping | **Inside this change** | Fix is only safe in the post-warp world; shipping independently risks a fix-then-broken interval. Bundling preserves coherent firewall behavior across the transition |
| §6.5 Status singleton handling | **Idempotent `initializeStatus`** | 5-line fix. Preserves `activeChangeId` and `currentStatus` when called with same `projectName` |

## 0a. Validator findings applied

Independent validator (`adv-researcher`) returned NEEDS_REVISION on 2026-05-20 citing:

- **HTTP wire bug**: `WarpPayload` field is `id`, not `workspaceID` (verified in `groups/workspace.ts:13-17` and `handlers/workspace.ts:48-54`). Original §3.3 pseudocode would have 400'd on every warp.
- **HTTP wire bug**: `CreatePayload` does NOT accept `directory` — directory flows through `extra` and the adapter's `configure` writes it onto `info.directory` server-side.
- **Missing-risk #2**: warp-while-already-warped fires `prompt.cancel(sessionID)` against the executing tool's own session.
- **Missing-risk #3**: create-then-warp atomicity — orphan workspace row on warp failure.
- **Missing-risk #7**: orphan workspace row when user `rm -rf`'s the worktree without `adv_worktree_delete`.
- **Adapter contract bug**: `configure: passthrough` is wrong; `info` starts with `directory: null` per `workspace.ts:536`. Adapter MUST write `directory` into `info` from `info.extra.directory`.
- **Ledger bug**: synthesizing `sessionId: "warp:${branch}"` misuses the existing session-tracking ledger because warp doesn't create a new session, it re-roots the existing one.
- **AC verification mechanism**: pin to `client.session.get().data.workspaceID` + workspace-list lookup (concrete two-step), not SSE event matching.

All findings folded into §3 and §4 below. One residual verification (validator recommendation 3 — confirm `startSync` connected-status semantics for `target.type === "local"`) deferred to execution gate as task 0a (pre-execution spike).

## 1. Architecture summary

ADV creates a git worktree as it does today, then registers it as an OpenCode workspace via a custom `adv-worktree` adapter (carrying the worktree path in `extra`), then warps the current session into that workspace via `POST /experimental/workspace/warp` with body `{ id: workspaceID, sessionID, copyChanges: false }`. OpenCode's workspace-routing layer then resolves all subsequent requests for this session to the worktree directory, giving correct LSP roots, formatter discovery, permission patterns, and project-relative path display — without per-tool `workdir` threading.

The OpenCode plugin layer is `InstanceState`-cached per directory, so warp causes a SECOND `advancePluginImpl` to instantiate against the worktree directory. The trunk-rooted plugin instance remains cached but no longer serves this session's requests. External state (Temporal workflows + `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`) is project-id-keyed, so both plugin instances see identical state.

If `/experimental/workspace*` endpoints are absent, ADV downgrades to `mode: terminal` (today's inline behavior + per-tool `workdir`) automatically.

## 2. Verified mental model (validator-confirmed)

| Layer | Source of `directory` | After warp |
|---|---|---|
| HTTP request routing | `WorkspaceRouteContext.directory` ← `WorkspaceAdapterRuntime.target(workspace).directory` | NEW (worktree) |
| `InstanceState.context` per request | resolved from the workspace-routed directory (`middleware/instance-context.ts:23-35`) | NEW (worktree) |
| Plugin `PluginInput.directory` | derived from `InstanceState.context` for the directory-keyed plugin cache (`effect/instance-state.ts:10-72`) | NEW (worktree) — in a FRESH plugin instance |
| Tool execution context (LSP, permissions, formatters, path display) | reads from `InstanceState.context` per tool call | NEW (worktree) ✅ |
| `SessionTable.directory` (DB column) | written once at session create; warp updates `workspace_id` only (`control-plane/workspace.ts:694-708` confirmed by validator) | UNCHANGED (still trunk) — informational only |
| `SessionTable.workspace_id` (DB column) | updated by warp for `target.type === "local"` | NEW (workspaceID) |
| `client.session.get({id}).data.workspaceID` | reads `SessionTable.workspace_id` | NEW (workspaceID) ✅ |
| `client.session.get({id}).data.directory` | reads `SessionTable.directory` | UNCHANGED — do NOT use as acceptance check |

**Acceptance tests must use `data.workspaceID` + workspace-list lookup, NOT `data.directory`.**

## 3. Design choices

### 3.1 Pre-flight: fix trunk-write firewall (ships FIRST, in this change)

`plugin/src/index.ts:544` change:

```diff
- const projectRoot = directory;
+ const projectRoot = gitSession.mainCheckoutPath ?? directory;
```

`gitSession` is already computed at L299 by `resolveGitSessionContext(directory, worktree)`. Validator confirmed: no other callers in `plugin/src/index.ts` derive trunk from `directory` for the same purpose; the surrounding `firewallDeps` uses `projectRoot` consistently.

Regression test: `directory !== mainCheckoutPath` case; assert worktree writes pass + trunk writes block.

### 3.2 Custom workspace adapter for ADV worktrees (corrected per validator)

New file `plugin/src/utils/workspace-adapter.ts`:

```ts
// Pseudocode — see §5 for actual file
export function buildAdvWorktreeAdapter(): WorkspaceAdapter {
  return {
    name: "adv-worktree",
    description: "ADV-managed git worktree (per-change isolation)",
    async configure(info /* WorkspaceInfo with directory: null, extra carries our payload */) {
      // info.extra is populated by the caller (createAdvWorkspace) with
      // { directory, branch }. The directory column starts null per
      // workspace.ts:536; we MUST write it here so target() can read it.
      const extra = info.extra as { directory?: string; branch?: string } | null;
      const directory = extra?.directory;
      if (!directory) {
        throw new Error("adv-worktree adapter requires info.extra.directory");
      }
      return { ...info, directory };
    },
    async create(/* info, _env, _from, _context */) {
      // No-op: the git worktree was already created by adv_worktree_create
      // before this adapter sees it. This adapter wraps an existing worktree.
    },
    async remove(/* info */) {
      // No-op: worktree deletion is owned by adv_worktree_delete (which now
      // also DELETEs the OpenCode workspace — see §3.5)
    },
    target(info) {
      // info.directory is populated by configure() above
      return { type: "local", directory: info.directory };
    },
    async list() {
      // Not used by ADV — we don't enumerate workspaces. Return empty.
      return [];
    },
  };
}
```

Registered once at plugin init via `input.experimental_workspace?.register?.("adv-worktree", buildAdvWorktreeAdapter())`. Defensive optional chaining: if the OpenCode build doesn't expose `experimental_workspace`, registration is skipped and downgrade flow takes over.

### 3.3 Raw-HTTP shim for workspace + warp (corrected wire shapes)

New file `plugin/src/utils/workspace-warp.ts`:

```ts
// Pseudocode — see §5 for actual file
export interface WarpDeps {
  serverUrl: URL; // read at call time, NOT cached at plugin init
  fetchImpl?: typeof fetch;
}

/**
 * Detection probe. Returns true if the OpenCode build exposes
 * /experimental/workspace endpoints. Anything other than a 2xx → false,
 * including 400/404/500/503/network errors (the validator noted the
 * middleware chain can return many non-200 codes, all of which are
 * "not available" for our purposes).
 */
export async function workspaceAndWarpAvailable(deps: WarpDeps): Promise<boolean> {
  try {
    const url = new URL("/experimental/workspace", deps.serverUrl);
    const res = await (deps.fetchImpl ?? fetch)(url);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create the ADV worktree workspace. POST body matches CreatePayload
 * shape from groups/workspace.ts:12 (Struct.omit Workspace.CreateInput
 * fields ["projectID"]) — accepts { id?, type, branch?, extra? }.
 * `directory` flows through `extra`; the adapter's configure() reads it.
 */
export async function createAdvWorkspace(deps: WarpDeps, input: {
  directory: string;
  branch: string;
}): Promise<{ workspaceID: string }> {
  const url = new URL("/experimental/workspace", deps.serverUrl);
  const body = {
    type: "adv-worktree",
    branch: input.branch,
    extra: { directory: input.directory, branch: input.branch },
  };
  const res = await (deps.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`createAdvWorkspace failed: ${res.status} ${await res.text()}`);
  }
  const info = await res.json() as { id: string };
  return { workspaceID: info.id };
}

/**
 * Warp the session into the new workspace.
 *
 * IMPORTANT: WarpPayload schema (groups/workspace.ts:13-17) names the
 * workspace field `id`, NOT `workspaceID`. The handler at
 * handlers/workspace.ts:48-54 maps `ctx.payload.id` → workspaceID
 * internally. Posting `workspaceID` will be rejected as 400 BadRequest.
 *
 * copyChanges is hardcoded false: the worktree was created by
 * `git worktree add` and already contains the correct files. Setting
 * copyChanges: true would extract a VCS diff from the source workspace
 * (trunk) and apply it on top of the worktree files, corrupting them
 * (workspace.ts:638-666 confirms the diff/apply path is gated on this
 * boolean). Never expose this as a config knob.
 */
export async function warpSession(deps: WarpDeps, args: {
  workspaceID: string;
  sessionID: string;
}): Promise<void> {
  const url = new URL("/experimental/workspace/warp", deps.serverUrl);
  const body = {
    id: args.workspaceID, // CRITICAL: field name is `id`, validator-verified
    sessionID: args.sessionID,
    copyChanges: false,    // CRITICAL: hardcoded, never config
  };
  const res = await (deps.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`warpSession failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Delete the OpenCode workspace when ADV deletes the worktree. Best-effort:
 * a 404 here means OpenCode already lost the workspace row (e.g. through its
 * own cleanup); not a hard error.
 */
export async function deleteAdvWorkspace(deps: WarpDeps, workspaceID: string): Promise<void> {
  const url = new URL(`/experimental/workspace/${workspaceID}`, deps.serverUrl);
  const res = await (deps.fetchImpl ?? fetch)(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteAdvWorkspace failed: ${res.status} ${await res.text()}`);
  }
}
```

Tests assert exact request body shape including `id` (not `workspaceID`) and hardcoded `copyChanges: false`. A code comment on the `warpSession` call site documents the corruption risk for future contributors.

### 3.4 Worktree config schema migration

`plugin/src/tools/worktree/index.ts:223-244` `worktreeConfigSchema`:

```diff
- inline: z.boolean().default(true),
+ mode: z
+   .enum(["warp", "spawn", "terminal"])
+   .default("warp")
+   .describe(
+     "warp: register worktree as OpenCode workspace and warp session into it (default, recommended). " +
+       "spawn: open a new terminal with a forked session (legacy non-inline behavior). " +
+       "terminal: stay in current session and use workdir= per tool (legacy inline behavior; auto-fallback when warp endpoints absent)."
+   ),
+ /** @deprecated use `mode` instead. true → "terminal", false → "spawn". */
+ inline: z.boolean().optional(),
```

Backward-compat coercion helper:
- `inline === undefined`, `mode === undefined` → `mode = "warp"`
- `inline === true`, `mode === undefined` → `mode = "terminal"` + deprecation log
- `inline === false`, `mode === undefined` → `mode = "spawn"` + deprecation log
- Both set → `mode` wins, deprecation log notes `inline` ignored

The `inline: true → mode: terminal` mapping is correct because today's `inline === true` path (`worktree/index.ts:1956-1981`) returns the `workdir=...` instruction string — exactly the legacy `terminal` mode semantics. Validator confirmed.

### 3.5 Worktree create flow rewrite (with safety guards)

Replace `worktree/index.ts:1956-1981` (inline branch) and modify `worktree/index.ts:1983-2034` (non-inline branch) into a unified switch with new guards:

```ts
// Pseudocode
const cfg = await loadWorktreeConfig(directory, log);
const effectiveMode = await resolveEffectiveMode(cfg.mode, warpDeps, log);

// NEW GUARD: warp-while-already-warped detection (validator risk #2)
// Read current session's workspaceID; if non-null AND matches an existing
// adv-worktree workspace for THIS sessionID, refuse to warp again.
if (effectiveMode === "warp") {
  const currentSession = await client.session.get({ path: { id: toolCtx.sessionID } });
  if (currentSession.data?.workspaceID) {
    // Already in some workspace. Refuse to re-warp from a warped state —
    // would fire prompt.cancel against ourselves (workspace.ts:629).
    return [
      `[ADV:BLOCKED] Cannot create worktree while session is already warped.`,
      `Session ${toolCtx.sessionID} is in workspace ${currentSession.data.workspaceID}.`,
      `Open a fresh OpenCode session from the trunk checkout to create a new worktree.`,
    ].join("\n");
  }
}

switch (effectiveMode) {
  case "warp": {
    let workspaceID: string | undefined;
    try {
      // Step 1: create workspace
      const created = await createAdvWorkspace(warpDeps, {
        directory: worktreePath,
        branch: args.branch,
      });
      workspaceID = created.workspaceID;

      // Step 2: warp session (validator risk #3: atomicity)
      await warpSession(warpDeps, {
        workspaceID,
        sessionID: toolCtx.sessionID,
      });
    } catch (e) {
      // Rollback orphan workspace if create succeeded but warp failed
      if (workspaceID) {
        try {
          await deleteAdvWorkspace(warpDeps, workspaceID);
        } catch (cleanupErr) {
          log.warn(
            `[worktree] Warp failed AND orphan workspace cleanup failed for ${workspaceID}: ${cleanupErr}`,
          );
        }
      }
      throw e;
    }

    // Validator note: do NOT synthesize `sessionId: "warp:${branch}"`.
    // The same session is re-rooted, not replaced. Record using the real
    // sessionID with a metadata tag, and store workspaceID for later cleanup.
    await addSession(database, {
      sessionId: toolCtx.sessionID,
      branch: args.branch,
      path: worktreePath,
    }, undefined, inferChangeIdFromBranch(args.branch));
    // (Schema may need a `workspaceID` field added to support §3.5 cleanup —
    //  see §5 file list)

    return [
      `Worktree created at ${worktreePath}`,
      `Branch: ${args.branch}`,
      ``,
      `Session warped to workspace ${workspaceID}.`,
      `Subsequent tool calls operate with the worktree as the project root.`,
    ].join("\n");
  }
  case "spawn": {
    // Existing non-inline path (was: !inline); unchanged behavior
  }
  case "terminal": {
    // Existing inline path (was: inline); unchanged behavior
  }
}
```

### 3.5b Worktree delete now also cleans up the OpenCode workspace

`worktree_delete` tool (`worktree/index.ts:2038+`) extended to call `deleteAdvWorkspace(warpDeps, session.workspaceID)` if the session record has a `workspaceID` (i.e. it was created via `mode: warp`). Best-effort: a 404 from OpenCode is acceptable (workspace already gone); other errors are logged but do not block the worktree delete.

This addresses validator risk #7 (orphan workspace when user `rm -rf`'s without going through `adv_worktree_delete` is still possible; document as known limitation in the `mode: warp` section of `ADV_INSTRUCTIONS.md`).

### 3.6 Plugin in-memory state coexistence

`plugin/src/events/status.ts:49-58` `initializeStatus` becomes idempotent:

```ts
export const initializeStatus = (projectName: string): void => {
  if (state.projectName === projectName && state.lastUpdated > 0) {
    state.lastUpdated = Date.now();
    updateTerminal();
    return;
  }
  state = {
    currentStatus: "IDLE",
    projectName,
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
  updateTerminal();
};
```

**Validator recommendation 7 followup**: audit other module-level side-effects beyond `events/status.ts`. Task added to graph (§7 task 0b: grep audit for `module-scope new Map | setInterval | process.on | new Set` in `plugin/src/{events,utils,tools,index.ts}` and ensure each is double-init-safe or scoped per-instance).

Document the coexistence reality in `ADV_INSTRUCTIONS.md`:

> After `adv_worktree_create` in `mode: warp`, a fresh ADV plugin instance is loaded for the worktree workspace. Terminal status markers preserved (idempotent init). External state (Temporal + on-disk) is project-id-keyed and shared by both plugin instances; no drift.

### 3.7 ADV_INSTRUCTIONS.md Worktree Protocol rewrite

Replace lines 920-934. New text:

```
### Worktree Protocol

Mode is controlled by `.opencode/worktree.jsonc` `mode` (default `warp`).

**Mode: warp** (recommended, default; requires OpenCode /experimental/workspace* endpoints)
1. `adv_worktree_create` → creates worktree, registers it as an OpenCode
   workspace via the `adv-worktree` adapter, and warps the current session
   into it.
2. Subsequent OpenCode-native tool calls (read, write, edit, bash, lsp,
   formatters, permissions) are rooted at the worktree automatically.
   No per-tool `workdir` override needed.
3. Continue inline.
4. Delete via `adv_worktree_delete branch:<branch>` only after merge. This
   also DELETEs the OpenCode workspace registration.

Known limitation: if the worktree directory is removed externally (e.g.
`rm -rf`) without `adv_worktree_delete`, the OpenCode workspace row
remains orphaned. Reinit OpenCode to clear stale workspaces.

Re-warp blocked: cannot run `adv_worktree_create` from a session that
is already warped. Open a fresh OpenCode session from trunk to create
additional worktrees.

**Mode: terminal** (legacy / auto-fallback when warp endpoints absent)
1. `adv_worktree_create` → captures path
2. Use worktree path as `workdir` for ALL subsequent tool calls.
   Path-aware OpenCode behavior (LSP, formatters, permissions, display)
   remains trunk-rooted.
3. Continue inline.
4. Delete via `adv_worktree_delete branch:<branch>` only after merge.

**Mode: spawn** (legacy non-inline)
1. `adv_worktree_create` → creates worktree, forks session, opens new
   terminal at the worktree.
2. Continue work in new terminal; original session unaffected.
3. Delete via `adv_worktree_delete branch:<branch>` only after merge.
```

## 4. Acceptance criteria (final, validator-tightened)

1. After `adv_worktree_create` in `mode: warp` against a warp-capable OpenCode build, the session's `workspaceID` (queried via `client.session.get(sessionID).data.workspaceID`) matches the workspaceID returned by `createAdvWorkspace`, AND that workspace's `target.directory` (queried via `GET /experimental/workspace` list, filtered by id) equals the worktree path. Concrete two-step assertion per validator AC-1 tightening.
2. File-edit tool output for paths under the worktree displays project-relative (`plugin/src/foo.ts`), not `../../../.local/share/...`. Verified in a fresh OpenCode session AFTER `pnpm run build` + session restart (mandatory per `AGENTS.md` source-vs-dist reload caveat).
3. Trunk-write firewall BLOCKS writes to trunk AND ALLOWS writes to worktree, when the active session is warped to the worktree workspace. Regression test simulates `directory !== mainCheckoutPath`.
4. Storage path remains `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. No path migration.
5. When `GET /experimental/workspace` returns non-2xx OR throws on fetch, `mode: warp` auto-downgrades to `mode: terminal` with exactly one log line at plugin init. Behavior identical to today's inline mode.
6. Plugin handles being instantiated twice (once per workspace's directory) without crash, without corrupting external state (assert: same project-id derived from both, same Temporal task-queue), without duplicate `[ADV:...]` markers, and without resetting `activeChangeId` for the SAME project.
7. `ADV_INSTRUCTIONS.md § Worktree Protocol` updated per §3.7.
8. No symlinks, env hacks, wrapper scripts, or path-rewriting heuristics introduced.
9. `copyChanges` is hardcoded `false` at the warp call site; test asserts the exact request body shape includes `copyChanges: false` and field name `id` (not `workspaceID`).
10. `adv_worktree_create` from an already-warped session is rejected with a clear `[ADV:BLOCKED]` message (validator risk #2). Test asserts behavior.
11. `adv_worktree_create` where workspace-create succeeds but warp fails triggers `deleteAdvWorkspace` rollback. Test asserts cleanup is attempted (validator risk #3).
12. `adv_worktree_delete` for a `mode: warp` worktree also calls `deleteAdvWorkspace`. Test asserts the DELETE call is fired.
13. All existing tests pass: `pnpm test`. New tests cover: warp happy path, endpoint-absent downgrade, double plugin init, firewall regression, `copyChanges: false` + `id` field enforcement, schema migration `inline → mode`, re-warp guard, create-fail-warp rollback, delete cleans workspace.

## 5. Files affected (final)

| File | Change |
|---|---|
| `plugin/src/index.ts:298` | Destructure `serverUrl`, `experimental_workspace` from `PluginInput` |
| `plugin/src/index.ts:544` | `projectRoot = gitSession.mainCheckoutPath ?? directory` (§3.1) |
| `plugin/src/index.ts` (plugin init body) | Defensive `input.experimental_workspace?.register?.("adv-worktree", buildAdvWorktreeAdapter())` |
| `plugin/src/utils/workspace-adapter.ts` (NEW) | `buildAdvWorktreeAdapter()` per §3.2; **`configure` writes `info.directory` from `info.extra.directory`** |
| `plugin/src/utils/workspace-warp.ts` (NEW) | `workspaceAndWarpAvailable`, `createAdvWorkspace`, `warpSession`, `deleteAdvWorkspace` per §3.3; **warp body uses `id` not `workspaceID`** |
| `plugin/src/tools/worktree/index.ts:223-244` | Schema: add `mode` enum, mark `inline` deprecated, coercion helper |
| `plugin/src/tools/worktree/index.ts:1810-1830` | `WorktreePlugin` destructures `serverUrl` from input |
| `plugin/src/tools/worktree/index.ts:1920-2034` | Replace inline+non-inline branches with `switch (mode)` containing warp / spawn / terminal arms + re-warp guard (§3.5) + atomicity rollback |
| `plugin/src/tools/worktree/index.ts:2038+` (delete handler) | Call `deleteAdvWorkspace` when `session.workspaceID` present (§3.5b) |
| `plugin/src/tools/worktree/state.ts` (or wherever SessionRecord lives) | Add optional `workspaceID?: string` to the worktree session record so delete can clean up |
| `plugin/src/events/status.ts:49-58` | Idempotent `initializeStatus` (§3.6) |
| `ADV_INSTRUCTIONS.md` (lines 920-934) | Rewrite per §3.7 |
| `plugin/src/tools/trunk-write-firewall.test.ts` | Regression test for `directory !== mainCheckoutPath` |
| `plugin/src/utils/workspace-warp.test.ts` (NEW) | Detection, create wire-body, warp wire-body (asserts `id` field), `copyChanges: false`, delete cleanup, errors |
| `plugin/src/utils/workspace-adapter.test.ts` (NEW) | `configure` writes directory from extra; `target` returns local shape |
| `plugin/src/tools/worktree/__tests__/warp-flow.test.ts` (NEW) | Warp happy path, downgrade-on-404, re-warp guard, create-fail rollback, double plugin init |
| `plugin/src/events/status.test.ts` (existing or new) | Idempotency test |

`.opencode/worktree.jsonc` files in user projects need no migration — `inline` is deprecated-but-honored.

## 6. Risk register (final)

| Risk | L | I | Mitigation |
|---|---|---|---|
| `/experimental/workspace*` endpoint signatures shift between OpenCode versions | M | H | §3.3 detection + §3.5 downgrade to `mode: terminal` |
| Trunk-write firewall regression during transition | H (without §3.1) → L (with) | H | §3.1 ships as task 1, before any warp wiring |
| Two coexisting plugin instances drift in-memory state | M | M | §3.6 idempotent `initializeStatus` + task 0b audit |
| `copyChanges: true` regression by future contributor | L | H | Hardcoded `false`, asserted in test, code comment |
| ADV worktrees parallel-coexist with OpenCode-native worktrees in same parent dir | L | L | Custom adapter `type: "adv-worktree"` distinguishes |
| Live-warp behavior cannot be validated in same session as code change | High (certain) | L | Documented in `AGENTS.md`; last execution task captures evidence |
| `inline → mode` schema coercion breaks existing user config | L | M | Backward-compat coercion (§3.4) + deprecation log; tested |
| `experimental_workspace.register` API surface changes | L | M | `?.register?.` optional chaining; falls through to `terminal` |
| Re-warp from already-warped session cancels own prompt | M | H | §3.5 guard rejects with `[ADV:BLOCKED]`; AC-10 |
| Create-then-warp atomicity: orphan workspace on warp failure | M | M | §3.5 try/catch + `deleteAdvWorkspace` rollback; AC-11 |
| External `rm -rf` of worktree orphans OpenCode workspace row | M | L | Documented limitation in §3.7; OpenCode workspace remove cascade not pursued |
| `startSync` connected-status semantics unclear for `target.type: "local"` | M | M | **Task 0a: pre-execution spike to verify against OpenCode source.** If `startSync` doesn't reach `connected` for local targets within 5s timeout, design needs adjustment (e.g. pre-emit status, or accept timeout + downgrade) |
| `Server.url` may be unset; fallback hardcoded `localhost:4096` | L | L | Always read getter at call time, never cache; `WarpDeps.serverUrl` is read fresh each call |

## 7. Task graph (preview for planning gate)

| # | Task | Blocks |
|---|---|---|
| 0a | **SPIKE**: verify `startSync` connected-status for `target.type: "local"` workspace in OpenCode v1.15.5 source. If problematic, propose design adjustment before task 4 | 4, 6 |
| 0b | **AUDIT**: grep `plugin/src/` for module-scope `new Map()` / `setInterval` / `process.on` / `new Set()`. For each, decide: double-init-safe (no action), needs idempotency (add task), or needs `InstanceState`-scoping (escalate) | 2 (if audit finds issues) |
| 1 | Fix trunk-write firewall `projectRoot = gitSession.mainCheckoutPath ?? directory` + regression test | 5, 9 |
| 2 | Make `initializeStatus` idempotent + test (+ any other findings from 0b) | 9 |
| 3 | Add `buildAdvWorktreeAdapter()` + unit test (`configure` writes directory from extra; `target` shape) | 5 |
| 4 | Add `workspaceAndWarpAvailable` / `createAdvWorkspace` / `warpSession` / `deleteAdvWorkspace` shim + unit tests (wire-body assertions: `id` field, hardcoded `copyChanges: false`, endpoint detection) | 5 |
| 5 | Schema migration: `worktreeConfigSchema.inline` → `mode` + coercion helper + test | 6 |
| 6 | Rewrite worktree-create switch with warp/spawn/terminal arms + re-warp guard + create-fail-rollback | 7 |
| 6b | Extend worktree-delete to call `deleteAdvWorkspace` when session record has `workspaceID` | 7 |
| 7 | Plugin init: destructure `serverUrl` + `experimental_workspace`, register adapter, fall through if missing | 8, 9 |
| 8 | Warp happy-path integration test (mock OpenCode HTTP fixture) | 11 |
| 9 | Downgrade test, double-plugin-init test, re-warp guard test, rollback test, delete-cleans-workspace test | 11 |
| 10 | Update `ADV_INSTRUCTIONS.md § Worktree Protocol` | 11 |
| 11 | `pnpm run check` + full `pnpm test` green | 12 |
| 12 | Live-session validation: `pnpm run build` → restart OpenCode → create worktree → assert warp behavior + workspaceID populated + paths relative → archive evidence | — |

Sequencing notes:
- Task 0a (spike) must complete BEFORE task 4 commits to the wire shapes; if `startSync` is problematic, task 4 design changes
- Tasks 1, 2, 0b ship as a small independent bundle first
- Tasks 3, 4 are independent of each other; both block task 5
- Tasks 6 and 6b can run in parallel after 5
- Tasks 8, 9 can run in parallel during execution
