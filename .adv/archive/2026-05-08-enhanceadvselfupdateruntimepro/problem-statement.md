## Problem

When ADV is fixing its own plugin code, the running OpenCode session continues using `plugin/dist/index.js` cached from process startup. Source fixes land in the change worktree but live tool calls keep executing pre-fix code. The agent and user have no deterministic way to:

1. Tell whether the running session's loaded plugin is fresh, stale-against-source, or stale-against-dist (rebuilt-but-cached)
2. See the plugin checkout's git branch + HEAD that the loaded module was built from
3. Detect mismatch between current process cwd and the plugin root that's actually loaded
4. Get prescriptive recovery instructions (which worktree to open, which build command, restart sequence) instead of a static caveat string

## Concrete reproduction

`centralizemutationcacherefresh` archive (2026-05-07): cache-stale-after-`fireSignal` fix landed but couldn't apply to itself in-session. `adv_change_validate` returned stale `tdd_intent` for 9 tasks because dist was loaded pre-fix. Same class as #58's session-just-shipped — agent self-modifies, cached dist blocks the fix from applying to itself.

`fixtmprl1100nonterminalreplayf` archive (this session, 2026-05-08): same pattern. Fix landed in source + tests pass against source, but live `adv_change_show` against a poisoned workflow won't exercise the fix until session restart with rebuilt dist.

## Why this matters

1. **Self-hosted ADV development is brittle.** Every tool-code fix risks the apply-itself trap.
2. **No agent-visible mismatch signal.** Existing `plugin_runtime` field surfaces loaded path + build_marker_found, but no comparison logic.
3. **Recovery is a guessing game.** The static `reload_caveat` doesn't tell the user which path/branch/command applies to their current state.

## Out of scope (split per ownership decision in #40)

- **OCA owns** deterministic rebuild + session handoff (their #9, separate repo). This change does NOT implement `oca doctor --scope plugins` or session orchestration.
- This change is the **runtime provenance** half: detect mismatch, report it agent-visibly, recommend the corrective action — without performing the rebuild or session swap itself.

## Constraints

- MUST extend the existing `getPluginRuntimeInfo` function and `plugin_runtime` field — no parallel diagnostic surface
- MUST work without git installed at runtime (graceful degradation if `git rev-parse` fails)
- MUST NOT block startup or read tools when filesystem stat / git probe fails
- MUST keep current `build_marker` integration intact for OCA companion
- Recovery hints MUST be prescriptive (specific paths + commands), not generic prose
- New fields MUST be additive — no breaking changes to existing `PluginRuntimeInfo` consumers

## Linked GitHub issue

Sharper-Flow/Advance#40