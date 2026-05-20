# Proposal

Add plugin-side display titles for ADV tools so OpenCode clients can show meaningful action text instead of raw `adv_*` tool IDs when the host consumes plugin tool titles.

## Why

ADV tools currently return plain JSON strings. OpenCode's plugin SDK supports tool result titles via `{ title, output, metadata }` and running-state title updates via `context.metadata({ title })`, but ADV does not use either path. As a result, plugin-registered tools often render as raw schema names such as `adv_change_show`, `adv_task_update`, and `adv_gate_complete`.

The goal is to improve scanability from the plugin side only. No OpenCode patch, fork, ACP-specific dependency, or tool renaming.

## What Changes

- Add a deterministic ADV tool title formatter.
- Wrap ADV tool execution results so successful calls can return `{ title, output, metadata }` while preserving the existing JSON `output` string.
- Set running-state titles with `context.metadata({ title })` where the SDK context is available and the title can be computed before execution.
- Cover all registered ADV/plugin aliases, including `adv_*` tools and legacy `worktree_*` aliases.
- Add tests for representative title generation and output compatibility.

## Success Criteria

1. Representative ADV tools produce stable human-readable titles, including:
   - `adv_change_show` → `Show change: {changeId}`
   - `adv_task_update` → `Update task: {taskId}`
   - `adv_gate_complete` → `Complete gate: {gateId}`
   - `adv_run_test` → `Run test: {command}`
   - `adv_status` → `Show ADV status`
2. Tool IDs and argument schemas remain unchanged.
3. Existing JSON response bodies remain parseable from the returned `output` string.
4. Unknown or weakly keyed tools fall back to concise deterministic titles such as `List changes` or `Show status`.
5. Tests verify title mapping without requiring an OpenCode fork or ACP client.

## Affected Code

- `plugin/src/tool-registry.ts` — central wrapper point for registered tool definitions.
- `plugin/src/utils/` — likely home for title formatting helpers and tests.
- `plugin/src/utils/safe-execute.ts` — may need `ToolResult`-compatible return typing or post-safe wrapper compatibility.
- `plugin/src/plugin-output.ts` and hook tests — must tolerate object-shaped tool results where hooks inspect output.
- `plugin/src/__mocks__/opencode-plugin.ts` — test mock must accept object tool results and metadata calls.

## Scope

### In Scope

- Plugin-side title generation for ADV-owned tools.
- Return-shape adaptation from plain string to OpenCode `ToolResult` object where appropriate.
- Running-state metadata title updates when supported by the SDK context.
- Coverage for all `adv_*` tools and legacy `worktree_*` aliases.
- Unit tests for title formatting, redaction/truncation, registry coverage, and output compatibility.

### Out of Scope

- Patching OpenCode TUI, ACP adapter, or upstream renderer behavior.
- Renaming public tools such as `adv_change_show`.
- Changing permissions, gate rules, workflow state, Temporal persistence, or tool argument schemas.
- Adding UI-only toasts or chat noise for every tool call.
- Pretty-printing JSON by default.

### Must Not

- Must not break agents that expect tool output to be JSON parseable.
- Must not expose secrets or long raw command/query payloads in display titles.
- Must not use heuristic titles as correctness, permission, or workflow-state authority.
- Must not require Zed/ACP to validate the implementation.

## Constraints

- OpenCode plugin SDK currently defines `ToolResult = string | { title?: string; output: string; metadata?: object; attachments?: ... }`.
- ADV tests run on Node with a mocked `@opencode-ai/plugin`; runtime is Bun.
- Source edits require `pnpm run build` and a fresh OpenCode session before live plugin behavior is visible.
- `safeExecute` currently returns strings and applies output budgeting; adapting titles should preserve this budget path for the `output` string.

## Impact

- Better tool-call scanability in any OpenCode surface that consumes plugin tool result titles.
- No behavior change for ADV state, specs, tasks, gates, or permissions.
- Minimal user-facing risk because `output` remains the same machine-readable JSON payload.

## Discovery Findings

Discovery completed. Agreement captures terse labels, all ADV tool coverage including temporary worktree aliases, and redact/truncate defaults.
