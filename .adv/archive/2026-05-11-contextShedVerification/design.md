# Design

## Summary

Implement smart output shaping inside existing `adv_run_test`. Replace naive head-only truncation with a pure helper that preserves high-signal lines while keeping current API, return shape, and ~2000-character output budget.

## Strategy

Add a pure helper in `plugin/src/tools/test.ts`:

```ts
export const shapeCommandOutput = (
  rawOutput: string,
  exitCode: number,
  maxOutputLen = 2000,
): string => { ... }
```

Behavior:

1. If `rawOutput.length <= maxOutputLen`, return unchanged.
2. Split output into lines.
3. Preserve ADV diagnostic prefix lines (`[adv_run_test] ...`) first.
4. Select high-signal lines:
   - failing run (`exitCode !== 0`): failure/diagnostic-looking lines using conservative word-boundary regexes
   - passing run (`exitCode === 0`): summary/stat-looking lines using conservative word-boundary regexes
5. Always include tail lines.
6. Deduplicate exact lines while preserving order.
7. Join with compact markers.
8. Final hard cap to `maxOutputLen`, preserving exact suffix `... (truncated)`.

Regex principles:

- failure terms: `\b(?:fail(?:ed|ure|ures)?|error|exception|assert(?:ion)?|expected|received)\b`
- source locations: `\b[\w./-]+:\d+:\d+\b`
- stack frames: `\bat\s+.*:\d+:\d+\b`
- summary terms: `\b(?:tests?|test files?|passed|failed|skipped|duration|time|pass|ok)\b`

Integration:

```ts
const maxOutputLen = 2000;
const truncatedOutput = shapeCommandOutput(rawOutput, exitCode, maxOutputLen);
```

No args or output fields change.

## Tests

Add/extend tests in `plugin/src/tools/test.test.ts`:

1. Failing noisy output: failure appears after first 2000 chars; shaped output contains late failure and truncation suffix.
2. Passing noisy output: late summary/stats line preserved.
3. Bounded output: shaped output remains near 2000 chars.
4. Diagnostic prefix preservation: `[adv_run_test] ...` prefix survives truncation.
5. Existing long-output test still passes with exact `... (truncated)` suffix.

## Contract Preservation

- `adv_run_test` args unchanged
- return shape unchanged: `{success, exitCode, output, command, timedOut, maxBufferExceeded, timeoutMs?}`
- exitCode untouched
- timeout/maxBuffer classification untouched
- `rq-TDD008path` preserved
- no artifact storage, new tools, sub-agents, or OpenCode core changes

## Validator Result

Independent validator verdict: **VALIDATED**.

Key findings:

- `rq-TDD008path` compliance passes — tool path and exit-code semantics unchanged
- `output` field is opaque to validators
- `formatToolOutput` only JSON serializes return object
- `taskCompletedSignal.verification` is separate agent-authored text, not derived from output
- Existing truncation test depends on exact `... (truncated)` suffix — preserve it

Required design refinements adopted: word-boundary anchors, exact-line dedupe, exact suffix preservation, exported helper for direct tests.

## Spec Delta

No new capability needed. Optional `tdd-contract` clarification only if implementation changes evidence wording; expected not required.