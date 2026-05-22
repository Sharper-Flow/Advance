# Agreement

## Objectives

1. Make active ADV change id the sole terminal/tab title when a change is active.
2. Fall back to project name when no ADV change is active.
3. Keep ADV-owned OSC title updates for active-change transitions.
4. Preserve existing terminal safety guarantees: sanitized title payloads, ST terminator, and no BEL emission.
5. Preserve title emission discipline: retitle only when the identity string changes.
6. Update current specs/docs and tests to encode the new identity policy.

## Acceptance Criteria

1. Active change title format is exactly `<change-id>` after existing trim/control-byte sanitization.
2. Inactive title format is exactly `<project>` after existing trim/control-byte sanitization.
3. Project name is not prefixed when a change id exists.
4. Worktree path, git branch, trunk/main checkout, status marker, progress, blocked marker, and emoji are not included in title strings.
5. Tests cover active title, inactive title, empty/whitespace change id fallback, empty project with active change, sanitization, no-BEL/ST title output, and no status-churn retitle behavior.
6. Existing tmux, `/dev/tty`, and stdout fallback title emission behavior remains intact aside from title text.
7. Current docs/specs no longer describe the active title as `Project: change-id`; they describe `change-id` active fallback to `project` inactive.
8. Verification from `plugin/` passes: focused terminal/events/spec tests, `pnpm test`, `pnpm run check`, and `pnpm run build`.

## Constraints

1. Do not migrate to OpenCode `session.title` ownership in this change.
2. Do not change chat status markers.
3. Do not add Warp-specific rich styling assumptions; Warp title is plain text.
4. Do not rewrite historical changelog/research-pack entries that are clearly historical unless they claim current behavior.
5. Do not weaken existing no-BEL or control-byte sanitization guarantees.

## Avoidances

1. Avoid heuristic title shortening, acronym generation, verb stripping, humanization, or model-derived title text.
2. Avoid exposing trunk/worktree mechanics in user-visible title strings.
3. Avoid replacing removed BEL behavior with OSC 9, OSC 777, or another ADV-owned terminal notification protocol.
4. Avoid using terminal title display metadata as authority for workflow correctness, security, permissions, persistence, gate completion, or spec compliance.

## Decisions

### User Decisions

- Title identity source: raw ADV change id, not humanized or shortened.
- Docs scope: update current docs/specs; leave historical entries alone unless they claim current behavior.
- Duplicate draft: close duplicate `updateTerminalTitles`; it was closed as superseded by `updateTerminalTitles2`.

### Agent Decisions (LBP)

- Add a distinct `rq-titleIdentity01` requirement to `chat-output-display` rather than overloading `rq-titleBell01`, so title identity and no-BEL safety remain independently testable.
- Keep implementation localized to pure title construction and expectation updates; no OpenCode session-title migration.
- Preserve `lastTitle` identity caching so normal status churn does not retitle.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user via inline Tier A reply: `approve`.