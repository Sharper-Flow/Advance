# Design

## Implementation Plan

1. Locate `adv_change_close` workflow lookup/signal path and error classification for terminated/not-found workflow states.
2. Add failing regression coverage for closing a terminated-workflow change with available projection/audit evidence.
3. Implement safe projection-backed fallback that preserves approval/audit metadata.
4. Ensure invalid/missing changes still return actionable errors.
5. Run focused close/recovery tests and plugin check.

## Planned Tasks

1. Add failing regression coverage for terminated workflow close fallback and invalid missing-change behavior.
2. Implement safe projection-backed close fallback preserving approval/audit requirements.
3. Run focused close/recovery tests and plugin check; document verification evidence.

## Contracts

- Close fallback requires explicit approval/audit evidence.
- Terminated workflow with valid projection can be closed/cancelled according to policy.
- Missing/invalid changes still fail clearly.

## Test Strategy

- Red test for terminated workflow fallback.
- Regression test for invalid missing change.
- Focused close tests, then `pnpm run check` from `plugin/`.