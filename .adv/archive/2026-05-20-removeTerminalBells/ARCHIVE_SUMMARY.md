# Archive: Remove terminal bells

**Change ID:** removeTerminalBells
**Archived:** 2026-05-20T21:05:18.048Z
**Created:** 2026-05-20T18:08:34.632Z

## Tasks Completed

- ✅ Replay parent no-BEL terminal title behavior with RED/GREEN tests
  > Task checkpoint completed
- ✅ Remove ADV-owned bell runtime state, exports, and arming call sites
  > Task checkpoint completed
- ✅ Rewrite chat-output-display specs/docs for host-owned notifications and no ADV BEL
  > Rewrote chat-output-display spec/docs for no ADV BEL policy: bumped spec/mirror to v1.5.0, changed rq-idleMarker03 to host-owned notifications with no ADV-emitted BEL or replacement notification protocol, added rq-titleBell01 requiring title/status paths to avoid BEL, use ST (`ESC \\`) OSC title terminators, and sanitize control bytes. Updated docs/specs/chat-output-display.md and docs/adv-context-agreement.md mirrors. Added handoff-footer drift tests that fail on stale spec version, missing rq-titleBell01/no-BEL wording, or missing markdown mirror requirement IDs.
- ✅ Run final verification and BEL-removal audit
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For spec/docs changes, add a drift assertion that the markdown mirror lists every JSON requirement ID. This catches stale human docs when spec.json gains requirements such as rq-titleBell01 or tool-title requirements.
- **[gotcha]** Full test suites in ADV worktrees can expose stale tests that still expect source-checkout plugin paths even though deploy-local.sh now registers the stable runtime plugin path under `$HOME/.local/share/Advance/plugin`. Treat this as contract drift: align tests to runtime plugin path and keep source paths only for asset copy/build inputs.
