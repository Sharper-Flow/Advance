## Problem

Every fresh OpenCode 1.18.x instance fails to load the Advance plugin:

```
level=ERROR message="failed to load plugin" path=file:///home/jon/.local/share/Advance/plugin
error="undefined is not an object (evaluating 'content.length')"
```

Blast radius (shard logs): 189 failures in one project shard, 184/165/157/92 in
others — host-wide, ongoing since at least 2026-08-30. Sessions still start, so
the loss is silent: no adv_* tools, no tool.execute.before firewalls, no
compaction/prompt hooks in any new session. Only long-lived pre-upgrade
instances retain the plugin.

## Root Cause Analysis

OpenCode 1.18.4+ invokes **every function-valued export** of a plugin entry
module as a plugin factory, passing `PluginInput`. The Concord adapter entry
documents this contract in its header ("the loader iterates Object.values and
calls each export with PluginInput; therefore this entry module exports
EXACTLY ONE thing: default").

The Advance entry (`plugin/src/index.ts`) exports six function-valued
symbols: `AdvancePlugin`, `default`, `compactPromptMessages`, `compactToolPart`,
`fallbackPersistedMarker`, `persistFallbackContent`, `resolveGitSessionContext`.

`fallbackPersistedMarker(source, content, …)` invoked as a factory receives
`{directory}` as `source` and `undefined` as `content`; evaluating
`content.length` throws. OpenCode logs "failed to load plugin" and drops the
entire plugin.

Executable reproduction (verified 2026-08-31):

```js
await import(".../Advance/plugin/dist/index.js").fallbackPersistedMarker({directory:"..."})
// → throws: undefined is not an object (evaluating 'content.length')
```

Every other export survives the same one-arg call; `fallbackPersistedMarker`
alone rejects, matching the logged message exactly.

## Fix direction

Entry module exports exactly one function-valued symbol (`default`). Helpers
move to a non-entry module; internal callers import from there; tests re-point.
Verify by: import probe shows a single export; fresh sharded `opencode run`
logs no plugin failure.
