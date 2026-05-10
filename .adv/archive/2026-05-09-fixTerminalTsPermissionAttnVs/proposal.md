# Fix terminal.ts permission-ATTN vs idle-ATTN distinction

## Intent

Resolve bug #86: `terminal.ts` does not distinguish between permission-request ATTN events and idle/background ATTN events, making it impossible for consumers to differentiate user-actionable attention from passive status.

## Scope

- Inspect `plugin/src/events/terminal.ts` for ATTN event handling
- Add a distinguishable type or field to separate permission-ATTN from idle-ATTN
- Add regression tests for both event types
- Preserve existing ATTN event behavior

## Success Criteria

- Permission-ATTN and idle-ATTN events are distinguishable by consumers
- Existing ATTN event behavior preserved
- Regression tests cover both event types