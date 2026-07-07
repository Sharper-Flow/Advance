# Fix adv status stdout truncation — Executive Summary

## Outcome

`adv status --json` piped output now matches file-redirected output byte-for-byte. Previously, piped output was truncated at ~8KB because `process.exit()` killed the Bun event loop before async pipe writes completed.

## What shipped

- **`bin/adv`** (1 file, 8 insertions, 1 deletion): replaced `process.exit(code)` with `process.stdout.end(() => process.exit(code))`. The `stdout.end()` call signals end-of-stream, flushes pending writes, then invokes the callback where force-exit is safe.

## Root cause

Node.js/Bun `process.exit()` terminates the event loop immediately. When stdout is a pipe (not a TTY/file), writes are asynchronous. If the event loop dies before async writes drain, the pipe reader receives truncated output. The truncation point (~8KB) corresponds to the libuv/pipe buffer flush threshold.

## Why `stdout.end` + `process.exit`

Three approaches were tested:
1. **`process.exitCode = code`** — works for Node.js, hangs under Bun (dangling gRPC handles from Temporal client prevent natural exit)
2. **`process.stdout.write('', cb)`** — works for Node.js, ignored by Bun (output still truncated)
3. **`process.stdout.end(cb)` + `process.exit(code)` in callback — works for both Node.js and Bun

## Verification

- 16/16 `bin/adv.test.ts` tests pass (including error-path timeout test)
- 18/18 `bin/lib/live-status.test.ts` tests pass
- Pokeedge (33 changes, 17KB JSON): piped = 17169 bytes = file = 17170 bytes (1-byte newline)
- Toolbox (3 changes, 2KB JSON): unchanged
- Exit codes preserved: 0 (success), 1 (not git), 2 (Temporal failure)
- No process hang: 0.4s execution on pokeedge

## Release readiness

- **PR**: https://github.com/Sharper-Flow/Advance/pull/201 (CI: 6/6 green, squash-merged as `c987e3f8`)
- **Deployed**: via `scripts/deploy-local.sh --fix` from worktree
- **Live verification**: `zellij-project-launcher --adv-changes /home/jon/dev/pokeedge` now shows colored epic heatmap with local TZ timestamps (was all grey with no timestamps)

## Follow-ups

- OOS1: Dangling gRPC handles in error paths still require force-exit. Separate cleanup change would allow `process.exitCode` instead.