# Archive: Add ACP titles to adv tools

**Change ID:** addAcpTitlesAdvTools
**Archived:** 2026-05-20T05:45:31.596Z
**Created:** 2026-05-19T18:40:32.809Z

## Tasks Completed

- ✅ Add ADV tool title formatter with redaction tests
  > Created plugin/src/utils/tool-title.ts with deterministic table-driven title generation, title kind classification, safe display metadata, sensitive-key redaction, and truncation. Added plugin/src/utils/tool-title.test.ts covering representative ADV tools, redacted displayArgs metadata, bounded long command titles, generic weak-key titles, and display-only metadata shape.
- ✅ Wrap registered ADV tool results with SDK title metadata
  > Updated plugin/src/tool-registry.ts to import SDK ToolResult/ToolContext types, compute display metadata from named ADV tool executions, best-effort call context.metadata, and wrap safeExecute/preflight/error string outputs as { title, output, metadata }. Degraded stubs now use namedExecute so they are titled. Updated opencode SDK mock to support ToolResult and metadata calls. Added registry tests for title coverage, ToolResult object output, parseable output, and running metadata.
- ✅ Normalize object-shaped tool outputs for ADV hooks
  > Updated plugin-output parseToolOutput to detect object-shaped ToolResult values with an output string and parse that nested output before falling back to direct object parsing. Added integration tests for adv_change_create and adv_task_update after-hooks receiving { title, output, metadata } ToolResult objects, proving active change tracking and completed-task wisdom prompting still work.
- ✅ Add chat-output-display spec requirements for tool titles
  > Updated .adv/specs/chat-output-display/spec.json to version 1.4.0 with rq-toolTitle01, rq-toolTitle02, and rq-toolTitle03 covering deterministic SDK display titles, display-only metadata authority boundaries, and redaction/truncation requirements. Verified JSON syntax with node JSON.parse.
- ✅ Run focused and full verification for ADV tool titles
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For display metadata that must prove redaction, omission alone can be hard to test. Safer pattern: include a bounded sanitized preview only when sensitive keys are present, with sensitive values replaced by `[redacted]`; keep normal metadata minimal for non-sensitive calls.
- **[pattern]** Central ADV tool wrapping works best at `registerTool`: compute display metadata from `namedExecute.__advToolName`, call `context.metadata` best-effort, then wrap the already-budgeted safeExecute string as `{ title, output, metadata }`. This preserves tool implementation return contracts while enabling SDK display titles.
- **[gotcha]** When OpenCode ToolResult objects reach hooks, the parser must unwrap and parse `output` before treating the wrapper as the payload. Otherwise extractors looking for domain fields (`changeId`, `task`) silently miss them because they see `{ title, output, metadata }` instead.
- **[convention]** For display-surface specs, keep tool-title requirements host-agnostic: require SDK-surface metadata when available, preserve JSON output strings, and explicitly state title metadata is not authority for permissions/gates/state.
- **[gotcha]** Spec version bumps can trigger hidden asset/drift tests even when running seemingly focused tests. When adding requirements, update drift fixtures and add external citations for each requirement ID in plugin/docs source before expecting `pnpm run check` or focused tests to pass.
