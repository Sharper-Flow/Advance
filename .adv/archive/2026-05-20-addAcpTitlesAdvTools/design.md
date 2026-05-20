# Design

## Architecture Overview

Implement tool-call display titles as a registry-layer adapter around ADV tool execution.

The plugin already centralizes all ADV tool registration in `plugin/src/tool-registry.ts` through `registerTool`, `bindTool`, and `bindToolSimple`. The design adds a pure title-formatting module and has `registerTool` apply title metadata consistently to every registered ADV tool. Tool implementations continue returning strings; the registry wrapper converts the final SDK result into an OpenCode `ToolResult` object:

```ts
{
  title,
  output: existingBudgetedOutputString,
  metadata: { adv: { toolName, titleKind, ...safeDisplayMetadata } }
}
```

When the SDK execution context exposes `metadata`, the wrapper also calls `context.metadata({ title, metadata })` before executing the tool so in-progress rows can use the same display title. This is best-effort display metadata only; no workflow, permission, or persistence logic reads it.

## Key Decisions

### KD-1: Central registry adapter, not per-tool implementation edits

Use `registerTool` as the single wrapping point. All store-backed, agenda-style, special-case, degraded, and alias tools pass through this function or `createDegradedToolMap`.

Rationale:

- Prevents per-tool duplication and drift.
- Covers current aliases without touching their implementations.
- Gives tests one structural contract: every `ADV_TOOL_NAMES` entry has a title.
- Keeps tool files focused on state behavior and JSON payloads.

### KD-2: Pure deterministic title formatter

Add a pure helper near other display utilities, for example `plugin/src/utils/tool-title.ts`:

- `formatAdvToolTitle(toolName: string, args: unknown): AdvToolTitle`
- `formatToolResultWithTitle(toolName, args, output): ToolResult` or equivalent registry helper
- `getAdvToolTitleCoverage(): Record<AdvToolName, ...>` or test-only exported mapping

The formatter should be table-driven for known tools and fall back deterministically for unknown ADV names. It must not inspect ADV state or tool output. Titles are derived only from tool name and already-supplied arguments.

### KD-3: Preserve existing string output as `output`

`safeExecute` and `safeExecuteSimple` remain responsible for catching errors and applying JSON output budgeting. Title wrapping happens after those wrappers return their string.

Existing consumers that parse tool output must parse the `output` string field. Hook code that receives object-shaped results should normalize through a helper before parsing.

### KD-4: Redact and truncate title inputs

The formatter uses structural redaction rules:

- Sensitive key names: password, passwd, pwd, token, secret, apiKey, credential, privateKey, and hyphen/underscore/case variants.
- Sensitive values: display as `[redacted]` or omit from title.
- Long strings: truncate to a bounded length with `…`.
- Commands/paths/IDs: include only short display snippets needed for scanability.

This is display safety, not security authority. The actual tool args remain unchanged.

### KD-5: Result metadata is additive and namespaced

Attach lightweight metadata for future surfaces without requiring UI parsing of title strings:

```ts
metadata: {
  adv: {
    toolName,
    title,
    titleKind: "read" | "write" | "execute" | "operator",
    changeId?,
    taskId?,
    gateId?
  }
}
```

Metadata must contain only redacted/bounded display-safe values.

### KD-6: Legacy `worktree_*` aliases stay covered

The aliases are still referenced by command files, agent manifests, and tests. This change does not remove them. It gives them titles while preserving the separate migration path for eventual alias removal.

## ADR Drafts

None. The registry adapter decision is straightforward, local, and reversible. It does not meet the ADR rubric threshold.

## Implementation Strategy

1. Add `plugin/src/utils/tool-title.ts`.
   - Define `ADV_TOOL_TITLE_RULES` keyed by `ADV_TOOL_NAMES` values or by tool name string.
   - Implement redaction/truncation helpers.
   - Export `formatAdvToolTitle(toolName, args)`.
2. Update `plugin/src/tool-registry.ts`.
   - Broaden internal execute/result types to the SDK `ToolResult` shape.
   - In `registerTool`, compute title from `toolName` when `namedExecute` metadata is present.
   - Best-effort call `context.metadata({ title, metadata })` before preflight/execution when available.
   - Wrap returned string as `{ title, output, metadata }`.
   - Preserve preflight/error outputs as the `output` string.
3. Normalize hook output parsing.
   - Add/export a small helper in `plugin/src/plugin-output.ts`, e.g. `getToolOutputText(raw): string | unknown` or enhance extractors to handle `{ output }` shaped results.
   - Update `index.ts` after-hook calls for `adv_change_create` and `adv_task_update` to pass normalized output.
4. Update SDK test mock typings.
   - Allow `ToolDefinition.execute` to return `ToolResult` instead of only `string`.
   - Add a mock `metadata(input)` function shape that accepts title metadata.
5. Add tests.
   - Unit tests for representative titles, redaction, truncation, and weak-key fallbacks.
   - Registry coverage test: every `ADV_TOOL_NAMES` entry returns a non-empty title.
   - Registry execution smoke test: executing a simple tool returns an object with `title` and parseable JSON `output`.
   - Hook regression tests: object-shaped `adv_change_create` and `adv_task_update` outputs still update active change and completed-task tracking.
6. Add spec delta for `chat-output-display`.
   - Tool display titles are deterministic display metadata.
   - Titles redact/truncate display values.
   - Titles must not affect state, permission, or gate authority.

## LBP Analysis

The registry adapter is the preferred long-term approach because tool display is a cross-cutting presentation concern. Centralizing it keeps behavior structural and testable: new ADV tools are detected by `ADV_TOOL_NAMES` coverage, while tool implementation files keep owning only their business logic.

Using the OpenCode SDK `ToolResult` and `ToolContext.metadata` surfaces is lower risk than output banners, chat prompts, or upstream UI patches. It works where hosts consume plugin titles and degrades harmlessly where they do not. Keeping the existing JSON payload in `output` preserves machine readability and avoids token-heavy pretty output.

## Affected Components

- `plugin/src/tool-registry.ts`
  - registry wrapper, return type, running metadata call, final result wrapping.
- `plugin/src/utils/tool-title.ts` and tests
  - deterministic title mapping, redaction, truncation, metadata building.
- `plugin/src/plugin-output.ts`
  - output normalization for hook parsers.
- `plugin/src/index.ts`
  - after-hook parser call sites if needed after normalization.
- `plugin/src/__mocks__/opencode-plugin.ts`
  - SDK mock `ToolResult` compatibility.
- `plugin/src/tool-registry.test.ts` / new title tests / integration tests
  - coverage and regression checks.
- `.adv/specs/chat-output-display/spec.json`
  - spec requirements for tool title display metadata.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Tests or hooks assume `execute()` returns a raw string | Normalize object-shaped results in `plugin-output.ts`; update mock typings and focused tests. |
| Title wrapping bypasses output budgeting | Keep `safeExecute` as the string-budgeting layer and wrap only after it returns. |
| Sensitive args appear in display title | Central redaction helper with explicit tests for sensitive key variants. |
| New tools ship without useful titles | Coverage test over `ADV_TOOL_NAMES`; fallback remains deterministic but explicit mappings should be asserted for representative tools. |
| OpenCode surface ignores title metadata | Harmless degradation; output and behavior remain unchanged. |
| Alias removal gets mixed into this change | Keep aliases covered only; removal is separate migration. |

## Validator Result

DESIGN_VALIDATION:
  verdict: VALIDATED
  findings:
    - dimension: 1
      level: info
      summary: Central registry wrapping correctly targets every ADV tool execution path.
      detail: Local code centralizes registration through `registerTool`, `bindTool`, and explicit `registerTool` calls, including legacy `worktree_*` aliases, so adding title wrapping at `registerTool` satisfies the objective without changing tool schemas or implementations.
    - dimension: 2
      level: info
      summary: The proposed registry adapter is simpler than per-tool title logic.
      detail: Because all ADV tools already flow through one helper and existing tools return strings after `safeExecute` budgeting, wrapping the already-budgeted string once at the registry boundary is the lowest-duplication approach.
    - dimension: 3
      level: info
      summary: No existing spec-law conflict was found.
      detail: `chat-output-display` does not forbid additive SDK tool-result metadata, and the design preserves returned JSON inside `output` rather than changing machine-readable content.
    - dimension: 4
      level: info
      summary: No significant simpler viable alternative appears overlooked.
      detail: Patching OpenCode rendering, renaming tools, or adding per-tool titles are constrained out or more invasive; using only `context.metadata()` would not cover final result metadata as completely as returning ToolResult.
  recommendation: Proceed with the design. Keep the implementation strictly at the registry/title utility boundary, ensure hook parsing handles `output.output` and any object-shaped fallback defensively, and make coverage/redaction tests mandatory for `ADV_TOOL_NAMES` plus the legacy aliases.
