# Agreement

## Objectives

- Improve ADV tool-call scanability from the plugin side only.
- Provide terse, deterministic display titles for ADV-owned tools through OpenCode plugin SDK title surfaces.
- Preserve existing public tool names, argument schemas, permissions, gate behavior, persistence behavior, and machine-readable JSON output.

## Acceptance Criteria

1. All registered `adv_*` tools and legacy `worktree_*` aliases produce deterministic terse display titles.
2. Tool IDs, argument schemas, permissions, gates, and workflow state behavior remain unchanged.
3. Existing tool JSON remains parseable from the returned `output` string.
4. Titles redact sensitive values and truncate long/opaque values.
5. Registry/title tests enforce coverage for every registered ADV tool name.
6. Representative runtime tests verify object-shaped tool results do not break ADV hook bookkeeping.

## Constraints

- Do not patch or fork OpenCode.
- Do not rename `adv_*` tools.
- Do not add ACP/Zed-specific logic.
- Do not add UI-only toast/chat noise for every tool call.
- Do not pretty-print JSON by default.
- Treat titles as display metadata only; permissions, workflow state, persistence, and spec compliance must continue to use structural tool names, args, schemas, and state.
- Preserve `safeExecute` output budgeting for the result `output` string.
- Redact sensitive keys and bound title length by default.

## Avoidances

- No OpenCode TUI/ACP renderer patch.
- No second ADV runtime or direct OpenCode tool-exec helper.
- No per-tool ad hoc title logic duplicated across tool implementation files if a central registry adapter can cover it.
- No title strings as authority for correctness/security/workflow decisions.

## Decisions

### User Decisions

- Title style: terse scan labels.
- Coverage: all ADV tools and the current legacy `worktree_*` aliases.
- Alias support: keep aliases in this change; removal is a separate cleanup/migration because commands, agents, and tests still reference them.

### Agent Decisions (LBP)

- Use a central plugin registry title adapter as the preferred implementation point.
- Use both running-state `context.metadata({ title })` and final `{ title, output, metadata }` where the SDK context is available.
- Redact and truncate title argument snippets because the user had no strong preference and safe display defaults are required.
- Add coverage tests tied to `ADV_TOOL_NAMES` so future tool additions require display-title coverage.

## Deferred Questions

None.

## Sign-Off

User approved the acceptance criteria by replying `ok` after clarification about legacy `worktree_*` aliases.
