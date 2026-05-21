# Archive: fix warp session lookup

**Change ID:** fixWarpSessionLookup
**Archived:** 2026-05-21T04:48:09.871Z
**Created:** 2026-05-21T03:36:04.267Z

## Tasks Completed

- ✅ Rewrite getSessionWorkspaceID to use SDK client + structured result tuple
  > T1 complete. Implementation:

1. Extended `WarpDeps` (plugin/src/utils/workspace-warp.ts) with required `directory: string` and optional `client?: OpencodeClient`. Both fields documented with rq-warpModeContract IDs for T6 spec law traceability.

2. Exported new `SessionLookupResult` discriminated tuple type:
   - `{ ok: true; workspaceID: string | null }`
   - `{ ok: false; status?: number; detail: string }`

3. Rewrote `getSessionWorkspaceID(deps, sessionID)` to:
   - Return `{ ok: false, detail: "missing client" }` when `deps.client` is undefined (drives `missing_client` downgrade reason in T3)
   - Call `deps.client.session.get({ path: { id: sessionID } })` using v1 SDK shape
   - Translate the v1 SDK `RequestResult` `{ data?, error?, response? }` to the structured tuple
   - Catch thrown errors → `{ ok: false, detail: String(error) }` (network failures)
   - Empty-string workspaceID → `{ ok: true, workspaceID: null }`
   - Never throws — callers branch on `.ok`

4. Added `stringifyErrorDetail` helper to safely format various error shapes (string / Error / object with message / JSON-serializable).

5. P25 touched-scope fix: added `vi.stubEnv("OPENCODE_EXPERIMENTAL", "")` and `vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "")` in beforeEach blocks of workspace-warp.test.ts, index-create.test.ts (line 132), and index-delete.test.ts (line 140) so flag-off tests assert off-by-default behavior even when the shell env has the experimental var set during ADV development.

TDD evidence:
- 32/32 workspace-warp.test.ts tests pass (8 new SDK-routed tests for getSessionWorkspaceID + 24 existing tests updated for `directory` field)
- 100/100 tools/worktree tests pass after P25 env-leak fix
- Typecheck has 8 cascade errors at adv-worktree.ts (lines 91, 94, 309, 341) and worktree/index.ts (lines 2160, 2211, 2462) — expected; T3 rewrites resolveCreateRuntimeMode for new tuple return and threads `directory`, T5 consolidates the legacy worktree/index.ts call sites.
- ✅ Attach x-opencode-directory header on all raw-fetch workspace endpoints
  > T2 complete. Added `directoryHeaders(deps, extra?)` helper in workspace-warp.ts that returns `{ ...extra, "x-opencode-directory": encodeURIComponent(deps.directory) }`. Applied to all five raw-fetch workspace endpoints: workspaceAndWarpAvailable (GET), createAdvWorkspace (POST), warpSession (POST), deleteAdvWorkspace (DELETE), findWorkspaceByDirectory (GET). Encoding matches v1 SDK behavior at @opencode-ai/sdk@1.15.5/dist/client.js:42-45. Content-Type preserved on POST endpoints alongside the new header. 7 new tests added (RED→GREEN): header presence on each endpoint, encodeURIComponent behavior with special characters (verified "/home/jon/My Code/repo" → "%2Fhome%2Fjon%2FMy%20Code%2Frepo"), content-type preservation on POST. 39/39 workspace-warp tests pass.
- ✅ Update resolveCreateRuntimeMode to emit structured downgrade_reason on every path + thread client into WarpDeps
  > T3 complete. Implementation:

1. Added `client?: OpencodeClient` to `AdvWorktreeCreateRuntime` interface.

2. Exported `DowngradeReason` discriminated union with 7 variants:
   - `{ kind: "missing_server" }`
   - `{ kind: "missing_session" }`
   - `{ kind: "missing_client" }` (NEW)
   - `{ kind: "flag_disabled" }`
   - `{ kind: "lookup_failed"; status?: number; detail?: string }`
   - `{ kind: "endpoint_unreachable" }`
   - `{ kind: "warp_failed"; detail: string; cleanupFailed?: boolean }` (NEW)

3. Rewrote `resolveCreateRuntimeMode` to:
   - Insert `missing_client` check after sessionID check, before flag check
   - Construct `WarpDeps` with `directory: projectRoot` and `client: runtime.client`
   - Use new tuple shape: `const lookup = await getSessionWorkspaceID(warpDeps, sessionID); if (!lookup.ok) {...}`
   - Emit structured `downgrade_reason` on every fallback path with appropriate kind + status/detail

4. Updated `terminalModePayload` to accept and pass through `downgrade_reason?: DowngradeReason`.

5. Updated the post-create warp failure path (try/catch around createAdvWorkspace + warpSession) to emit `{ kind: "warp_failed", detail: String(error), cleanupFailed: ... }` when warp fails after the workspace was created. `cleanupFailed: true` is added when orphan-workspace cleanup also fails.

6. Updated `adv_worktree_delete` and `adv_worktree_cleanup` to:
   - Accept `client?: OpencodeClient` in their `options` argument
   - Build `warpDeps` with `directory: projectRoot` and `client: options.client`
   - (Threading from `tool-registry.ts` happens in T4)

TDD evidence:
- 20/20 adv-worktree.test.ts tests pass
- 11 new tests added covering every `downgrade_reason.kind`, legacy warning preservation, WarpDeps construction with directory+client, and cleanupFailed reporting
- Existing tests updated: SESSION_ALREADY_WARPED block now verifies NO downgrade_reason (it's a block, not a downgrade)
- All test mocks updated to use new tuple shape `{ ok: true, workspaceID }` / `{ ok: false, status, detail }`
- ✅ Wire input.client through plugin init → tool-registry → adv_worktree_create runtime
  > T4 complete. Wired input.client end-to-end:

1. `plugin/src/index.ts`: destructured `client` from `input` at advancePluginImpl line 308; passed to `createToolMap` at line 727 (now multi-line with explicit args).

2. `plugin/src/tool-registry.ts`:
   - Imported `OpencodeClient` type from `./utils/opencode-types`
   - Extended `createToolMap` signature with `client?: OpencodeClient` as 5th arg
   - Threaded `client` into all 6 worktree tool registration sites:
     - `adv_worktree_create` (line ~604)
     - `adv_worktree_delete` (line ~620)
     - `adv_worktree_cleanup` (line ~638)
     - Legacy aliases `worktree_create`, `worktree_delete`, `worktree_cleanup` (lines ~666, ~684, ~702)

Verification:
- 181/181 tests pass across tool-registry, adv-worktree, workspace-warp, and tools/worktree/ test files
- Typecheck reduced from 8 errors to 3 — remaining errors in `tools/worktree/index.ts:2160,2211,2462` are the legacy WorktreePlugin standalone code path that T5 consolidates
- ✅ Consolidate parallel session-lookup implementation in tools/worktree/index.ts
  > T5 complete. Consolidated parallel session-lookup implementation:

1. Deleted local `getCurrentSessionWorkspaceID` helper (was `tools/worktree/index.ts:1958-1968`).

2. Added `getSessionWorkspaceID` to the import block at lines 98-107 (already importing other utils from `../../utils/workspace-warp`).

3. Rewrote `resolveEffectiveWorktreeMode`:
   - Removed try/catch around the lookup (the shared utility never throws)
   - Branches on `lookup.ok` to handle the structured tuple
   - When `lookup.ok === false`, logs warning with `lookup.detail`
   - When `lookup.workspaceID` is set, returns blocked (same SESSION_ALREADY_WARPED semantics)
   - The `_client` parameter is retained (prefixed with `_` to indicate unused) for back-compat with the legacy WorktreePlugin signature — the actual client now flows via `warpDeps.client`

4. Updated the 3 legacy WorktreePlugin WarpDeps construction sites to include `directory` and `client` from the outer `ctx` closure:
   - `processPendingDeletes` at line 2150
   - `worktree_create.execute` at line 2201 (`const warpDeps: WarpDeps = { serverUrl, directory, client }`)
   - `worktree_delete.execute` at line 2452

Verification:
- Typecheck: clean (0 errors, down from 3)
- 181/181 tests pass across tool-registry, adv-worktree, workspace-warp, and tools/worktree/ — the existing harness in index-create.test.ts continues to work because the shared `getSessionWorkspaceID` accepts the same v1 SDK `{ path: { id } }` shape
- ✅ Author spec law worktree-warp-mode + asset test enforcing structure
  > T6 complete. Authored spec law `.adv/specs/worktree-warp-mode/spec.json` with 6 requirements (rq-warpModeContract01 through rq-warpModeContract06):

- rq-warpModeContract01: Warp Mode Selection — the 5 preconditions
- rq-warpModeContract02: Already-Warped Block Contract — SESSION_ALREADY_WARPED is a block, not a downgrade
- rq-warpModeContract03: Downgrade Reason Discriminated Union — all 7 kinds enumerated (including warp_failed added at T3)
- rq-warpModeContract04: SDK-Routed Session Lookup — client.session.get with v1 shape + grep gate
- rq-warpModeContract05: x-opencode-directory Header on Workspace Endpoints — all 5 raw-fetch functions
- rq-warpModeContract06: Client Threading From Plugin Input — PluginInput.client through createToolMap

Each requirement has body, priority="must", tags, and 1-2 scenarios with given/when/then.

Asset test `plugin/src/__tests__/worktree-warp-mode-assets.test.ts` with 11 tests covering: spec file existence + valid JSON, name/title/purpose strings, all 6 rq-IDs present, every requirement has required fields, each rq's body contains its key contract terms (e.g. rq-01 mentions all 5 preconditions, rq-03 enumerates all 7 downgrade kinds, rq-05 lists all 5 function names), and a live grep gate (rq-04 enforcement) that scans `plugin/src/utils/workspace-warp.ts` and `plugin/src/tools/worktree/index.ts` for any `fetch(...)/session/` pattern — returns zero matches.

Verification:
- 11/11 asset tests pass
- `adv_spec action: "show" capability: "worktree-warp-mode"` returns the new capability with all 6 requirements correctly
- ✅ Append revised validation methodology scenario to warp-live-validation doc
  > T7 complete. Appended "Revised methodology — fresh standalone session (no --attach --dir)" section to docs/spikes/warp-live-validation.md (after Deviations). Documents the 5-step validation scenario: (1) start OpenCode without --attach --dir; (2) invoke adv_worktree_create; (3) expected outcome — mode:warp with workspaceID; (4) regression diagnosis steps if mode:terminal with lookup_failed (check client threading per rq-warpModeContract06, SDK routing per rq-warpModeContract04, v1 SDK construction directory); (5) confirm --attach --dir scenario still works (no regression). Explains why this matters (Instance.project.id resolution + --dir masking the missing-header bug). References fixWarpSessionLookup archive (TBD), the new spec law's rq-04 and rq-05, and upstream opencode issues #8538/#7149/#14595/#3551.
- ✅ Green-bar verification — full pnpm test + check + build
  > T8 complete — full green-bar verification:

- `pnpm test`: 208 test files passed | 1 skipped (209 total). 2559 tests passed | 2 skipped (2561 total) | 0 failed. Duration 28.54s.
- `pnpm run check`: clean. typecheck → check-test-isolation → check-lockfile-policy → lint → format:check all pass. (One small remediation step: `pnpm run format` to normalize formatting on the 3 newly-touched files before re-running.)
- `pnpm run build`: ESM + DTS build success. dist/index.js + dist/index.d.ts emitted cleanly along with temporal/ worker bundle.

Verifies AC6 (full pnpm test + check + build green) and AC7 (no regression in legacy paths — 2559 tests is the full suite including all existing legacy tests).

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** SDK v1 vs v2 path-resolution trap: `@opencode-ai/sdk@1.15.5` ships TWO complete SDK surfaces — v1 at `dist/gen/sdk.gen.d.ts` and v2 at `dist/v2/gen/sdk.gen.d.ts`. The v2 SDK exposes typed `client.experimental.workspace.{list,create,remove,warp,status,syncList}` methods; the v1 SDK does NOT. The plugin's `PluginInput.client` type is `ReturnType<typeof createOpencodeClient>` where `createOpencodeClient` is imported from `@opencode-ai/sdk` (the v1 path, NOT `@opencode-ai/sdk/v2`), so the plugin actually receives a v1 client.

This caused a real validator misread during the fixWarpSessionLookup design phase: the adv-researcher validator read the v2 SDK file and asserted typed workspace methods exist, leading to a CONFLICT-level finding that turned out to be wrong for the plugin's actual surface.

Lesson: when reading SDK types, verify which path the consuming code actually imports from. `PluginInput.client` type → trace the import → confirm v1 vs v2. Both v1 and v2 share the same fetch-interceptor pattern (auto-attaches `x-opencode-directory` for default config + GET→query rewrite), but only v2 exposes typed workspace endpoints. Future migration to v2 client would let us drop the explicit-header attachment on POST/DELETE/PUT in `workspace-warp.ts`.
- **[pattern]** Pattern: discriminated-union result tuple for never-throws lookup functions. The original `getSessionWorkspaceID(deps, sessionID): Promise<string | null>` threw on non-2xx and on JSON parse drift, forcing every caller to wrap in try/catch and string-format the error for downstream `downgrade_reason`. Replacing the signature with:

```ts
type SessionLookupResult =
  | { ok: true; workspaceID: string | null }
  | { ok: false; status?: number; detail: string };
```

— let callers branch precisely without lossy `String(error)` conversion. The function catches its own SDK throws and returns structured failure. Combined with the `downgrade_reason` discriminated union at the tool-output layer, this gives agents a fully structural channel for failure-mode branching (`downgrade_reason.kind`, with `status?` and `detail?` where applicable) without parsing prose `warning` strings.

This is the P33 (structural-correctness) pattern applied at the function-signature level: deterministic structural surface > heuristic string parsing.
- **[gotcha]** Test env-leak gotcha: `vi.unstubAllEnvs()` only restores envs that were explicitly stubbed via `vi.stubEnv()`. It does NOT clear pre-existing shell envs. When ADV is being developed and `OPENCODE_EXPERIMENTAL_WORKSPACES=true` is set in the developer's shell, tests asserting `warpFlagEnabled()` returns `false` (no env set) silently break.

Fix pattern: in test `beforeEach` blocks for any test file that exercises `warpFlagEnabled()`, explicitly clear both flag vars:

```ts
beforeEach(() => {
  vi.stubEnv("OPENCODE_EXPERIMENTAL", "");
  vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "");
  // ... other setup
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```

Empty string is treated as falsy by `process.env.X === "true"` check. Discovered during fixWarpSessionLookup T1 — applied as P25 touched-scope fix to workspace-warp.test.ts, index-create.test.ts, and index-delete.test.ts.
- **[gotcha]** Grep-gate regexes that use negated character classes like `/fetch[^;{]*\/session\//` are fragile against modern JavaScript syntax. Template literals contain `${`, which means any `{`-excluding character class halts before reaching the target substring. The original gate in worktree-warp-mode-assets.test.ts missed `fetch(`${url}/session/${id}`)` — the exact shape of the pre-fix regression — even though it caught string-concat and `new URL` forms.

Pattern: when writing structural grep gates against source code, walk balanced parentheses to extract the call's argument expression and test for the literal target substring within it. Excluding `{` is incompatible with template literals; excluding `;` only happens to work because raw fetches typically don't span statement boundaries.

Surfaced by adv-reviewer during fixWarpSessionLookup acceptance review (2026-05-21). Reviewer applied scoped fix to use a balanced-paren scanner instead of regex negation.
- **[pattern]** Asset-test grep gates should be exercised against simulated regressions BEFORE shipping. If you author a structural grep gate (e.g., "no raw fetch to /session/:id"), add a parallel meta-test that constructs synthetic regression patterns in-memory (template literal, string concat, new URL, member-call variants) and asserts the gate function flags each one. This catches gate-erosion without requiring an actual regression to expose it.

The grep-gate-template-literal blindspot in fixWarpSessionLookup's T6 asset test (caught by adv-reviewer during acceptance) would have been caught at TDD time if the gate had been tested against its own regression vectors. Generalize: any pattern-detection assertion should have positive AND negative cases.
