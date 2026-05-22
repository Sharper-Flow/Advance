## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.

# Update Terminal Titles

## Problem

ADV terminal titles currently include both project and change identity (`Project: change-id`). That duplicates context in Warp vertical tabs and makes the most valuable signal — the active ADV change — harder to scan.

Desired UX:

- Active ADV change: terminal/tab title is the ADV change id only.
- No active ADV change: terminal/tab title is the project name.
- Worktree/trunk implementation details are not encoded in the title.

## Direction

Keep ADV-owned OSC title updates, but simplify title identity construction:

- Return `changeId` when present.
- Otherwise return `projectName`.
- Exclude status emoji, progress, blocked markers, branch/worktree, and project prefix.

## Scope

### In scope

- Update `plugin/src/events/terminal.ts` title policy.
- Update terminal/status tests that expect `Project: change-id`.
- Update current docs/spec text that documents the terminal-title format.
- Preserve sanitization, no-BEL behavior, tmux, `/dev/tty`, and stdout fallback behavior.

### Out of scope

- Migrating title ownership to OpenCode `session.title`.
- Adding per-substring styling or bold/color to Warp tab titles.
- Encoding worktree path, git branch, or trunk/main checkout in the title.
- Changing chat status markers (`[ADV:WORK]`, `[ADV:IDLE]`, etc.).
- Rewriting historical changelog/research-pack entries that are clearly historical.

### Must Not

- Must not reintroduce heuristic title shortening, acronym generation, or verb stripping.
- Must not emit BEL or add replacement ADV-owned terminal notification protocols.
- Must not weaken existing control-byte sanitization or tmux emission safety.

## Success Criteria

1. With active change `fixFoo`, `buildTabTitle(..., "toolbox", "fixFoo")` returns `fixFoo`.
2. With no active change, `buildTabTitle(..., "toolbox", undefined)` returns `toolbox`.
3. With project `toolbox` and active change `fixFoo`, terminal title output does not contain `toolbox: fixFoo` or any project prefix.
4. Terminal title updates still happen only when identity changes, not on normal status churn.
5. Terminal title output remains sanitized against OSC/BEL/control-character injection.
6. Terminal status updates do not emit BEL and OSC title sequences still terminate with ST (`ESC \\`).
7. Existing tmux, `/dev/tty`, and stdout fallback title emission behavior is preserved aside from title text.
8. Current docs/specs no longer describe the active title as `Project: change-id`; they describe `change-id` active fallback to `project` inactive.
9. `pnpm test` passes.
10. `pnpm run check` passes.
11. `pnpm run build` succeeds.

## Discovery Findings

Discovery established a localized implementation: update pure title construction and expectations while preserving existing no-BEL/sanitization/tmux behavior. Duplicate draft `updateTerminalTitles` was closed as superseded. Add `rq-titleIdentity01` to `chat-output-display` so active/inactive title identity is structurally specified separately from `rq-titleBell01`.