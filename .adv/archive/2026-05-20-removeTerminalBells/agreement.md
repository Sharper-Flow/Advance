# Agreement

## Objectives

1. Remove ADV-owned audible BEL notification behavior from terminal status/title paths.
2. Preserve terminal title behavior from `fixTerminalTitleBell`: deterministic title payloads, sanitized payloads, ST terminator, and no BEL title output.
3. Remove or retire bell-only runtime state, exports, and tests when they no longer have a non-bell purpose.
4. Update `chat-output-display` specs/docs to make notification delivery host/tool-owned rather than ADV-owned.
5. Keep Warp/OpenCode notification guidance advisory and external to ADV correctness.
6. Verify no ADV status/title path emits BEL and all plugin quality gates pass.

## Acceptance Criteria

1. `plugin/src/events/terminal.ts` contains no ADV-owned BEL emission path for status transitions, final-alert policy, or title refreshes.
2. `ringBell()`, `_setBellCallback()`, `armPendingFinalAlert()`, `_clearPendingFinalAlert()`, and debounce/final-alert state are removed unless a remaining non-bell purpose is documented and tested.
3. `plugin/src/index.ts` no longer arms terminal bell notifications from `message.updated` events unless discovery/design identifies a non-bell use.
4. Terminal title tests prove deterministic title payloads, sanitized payloads, ST title terminator, and no BEL in title output.
5. Specs/docs no longer require ADV-owned audible bells; `rq-titleBell01` remains or is strengthened as the no-BEL title/status law; `rq-idleMarker03` is removed or rewritten to no-audible-bell semantics.
6. Bell-only tests are removed/replaced with negative tests proving status/title updates are non-audible, while unrelated status marker/title/context tests still pass.
7. Verification from `plugin/` passes: targeted terminal/events tests, relevant spec/drift tests, `pnpm run check`, `pnpm test`, and `pnpm run build`.

## Constraints

1. The implementation must incorporate the parent `fixTerminalTitleBell` no-BEL title behavior before or while removing bell code; current fast-follow worktree is not yet a descendant of the parent branch.
2. No OSC 9, OSC 777, or other terminal escape notification replacement in ADV core.
3. No changes to Warp/OpenCode plugin configuration or external notification integrations.
4. Do not change status marker semantics, context snapshot/ticker behavior, or title identity formatting beyond preserving/sanitizing title output.
5. Historical changelog entries may remain historical unless they claim current behavior.

## Avoidances

1. Do not emit BEL (`\x07`) from ADV status/title paths after this change.
2. Do not weaken `rq-titleBell01` or reintroduce BEL as an OSC title terminator.
3. Do not hide correctness behind Warp-specific behavior; Warp notifications are optional/user-environment integration.
4. Do not keep dead bell state/tests after runtime bell emission is removed.
5. Do not silently regress tmux title behavior.

## User Decisions

- User agreed to remove ADV bell ringing and rely on environment/tool notifications instead of maintaining ADV-owned audible bell policy.
- User agreed this should be a fast-follow from `fixTerminalTitleBell`, not absorbed into that archived change.

## Deferred Questions

None blocking. Design will choose exact spec delta mechanics (`rq-idleMarker03` rewrite vs removal) and the safest way to incorporate parent branch changes.
