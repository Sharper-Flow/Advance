# Executive Summary

Fixed stale `/adv-status` active-change output by requiring Temporal server-owned running execution state on active Visibility queries.

## What changed
- CLI `/adv-status` active rows now query `ExecutionStatus = "Running"` alongside active ADV status search attributes.
- Shared `listChangeWorkflowIds` active enumeration now uses the same running-execution guard, keeping MCP/status parity while preserving `statuses: null` terminal/audit mode.
- Added regression coverage for completed workflows with stale active custom search attributes.

## Verification
- RED: targeted status tests failed before the guard.
- GREEN: `bun test bin/lib/live-status.test.ts` passed 13 tests.
- VERIFY: `bun test bin/` passed 107 tests.
- VERIFY: `bin/oc-test targeted -- src/temporal/list-change-workflows.test.ts src/storage/store-temporal/index.test.ts` passed 33 tests.
- Independent review verdict: READY.