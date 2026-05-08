## Summary

Extend `plugin/src/utils/plugin-runtime-info.ts` and the `adv_status` health surface to detect and prescribe recovery for the cached-plugin-dist trap. Adds source-vs-dist freshness, process-vs-dist staleness, plugin checkout branch + HEAD, cwd-vs-plugin-root mismatch, and prescriptive recovery hints.

## Rationale

The runtime-provenance half of #40 belongs in advance per the ownership decision documented in `.adv/decisions/2026-05-04-open-issue-long-term-solutions.md`. The companion rebuild/session-handoff half belongs in OCA (their #9). Splitting cleanly means advance can ship a useful diagnostic now without coupling to OCA's release cadence.

The existing `getPluginRuntimeInfo` already provides loaded_module_path, build_marker_found, worker_script_path, and a static reload_caveat — but no mismatch detection. The fix layers comparison logic on top: stat source `dist/index.js` and source `src/index.ts` for mtime/hash, compare against process_started_at, probe git branch + HEAD, and synthesize a recovery_hint object that the agent can surface verbatim to the user.

## Success Criteria

1. `adv_status view: health` exposes the loaded plugin's dist mtime/hash, source mtime, freshness verdict, plugin checkout branch + HEAD, and cwd-vs-root match in a formatted, agent-readable section.
2. Three distinct staleness states are detectable and labeled:
   - `fresh` — dist mtime ≥ source mtime AND process_started_at ≥ dist mtime
   - `source_ahead_of_dist` — source mtime > dist mtime (user edited source, didn't rebuild)
   - `dist_ahead_of_process` — dist mtime > process_started_at (rebuild happened, session cached old code)
3. Prescriptive recovery hint is emitted for each non-fresh state, including the exact `pnpm run build` invocation path, the affected worktree path, and "restart session" instruction.
4. cwd-vs-plugin-root mismatch is detected and reported (e.g. user is in `/home/jrede/dev/other-project` but plugin loaded from `/home/jrede/dev/oc-plugins/advance/plugin`).
5. Plugin checkout branch + HEAD SHA are reported when git probe succeeds; gracefully omitted when git unavailable.
6. No regression: existing `PluginRuntimeInfo` consumers (`adv_status`, `status.test.ts`) continue to work without changes; new fields are additive.
7. New fields are tested with positive and negative paths (fresh, stale-source, stale-dist, no-git, cwd-mismatch).
8. Spec scenario added under capability `runtime-diagnostics` (or extend `advance-delivery` if appropriate) covering the freshness verdict contract.

## In Scope

| File | Change |
|---|---|
| `plugin/src/utils/plugin-runtime-info.ts` | Extend `PluginRuntimeInfo` type with `dist_mtime_iso`, `dist_index_hash`, `source_index_path`, `source_index_mtime_iso`, `source_dist_freshness`, `plugin_checkout_branch`, `plugin_checkout_head_sha`, `cwd_vs_plugin_root_match`, `recovery_hint`. Implement git probe (graceful failure). |
| `plugin/src/utils/plugin-runtime-info.test.ts` (new) | Unit tests for each freshness state + git fallback + cwd mismatch |
| `plugin/src/tools/status.ts` | Extend formatted health section to include freshness verdict + recovery hint when non-fresh |
| `plugin/src/tools/status.test.ts` | Update existing assertions; add new ones for the formatted output |
| `.adv/specs/<chosen capability>/spec.json` | Spec scenarios for source/dist/process freshness verdicts |

## Out of Scope (explicit)

- OCA-side rebuild orchestration (their #9)
- Auto-restart or session handoff
- `oca-build.json` schema changes (handled when OCA companion lands)
- Any change to plugin loading path itself
- Runtime hot-reload of plugin code (architecturally OOS for this layer)

## Constraints

- ✓ Additive to `PluginRuntimeInfo` only
- ✓ Graceful degradation: missing git, missing source files, stat failures all return `unknown` rather than throwing
- ✓ Recovery hint is structured (`{ action, command, paths }`), not just a string
- × No breaking changes to existing fields
- × No new tools beyond extending existing `adv_status`

## Acceptance Criteria

| AC | Verifiable by |
|---|---|
| AC-1 dist mtime/hash + source mtime exposed | Unit test reads getPluginRuntimeInfo(), asserts fields present |
| AC-2 freshness verdict matches state | Unit tests for each of 3 states |
| AC-3 prescriptive recovery hint structure correct | Test asserts `recovery_hint.action`, `recovery_hint.commands`, `recovery_hint.paths` shape |
| AC-4 cwd-vs-plugin-root mismatch detected | Test mocks `process.cwd()`, asserts boolean correct |
| AC-5 git branch+HEAD reported when available | Test with git installed; graceful fallback test |
| AC-6 no regression on existing consumers | Existing `status.test.ts` passes unchanged for old fields |
| AC-7 new freshness states covered by tests | New tests pass |
| AC-8 spec scenario added | Spec assets test passes |
| AC-9 `pnpm run check` + `pnpm test` clean | Full verify |

## Estimated effort

Medium-small. ~6-8 tasks. Single session, ~60-90 min. Mostly additive code with isolated test surface.