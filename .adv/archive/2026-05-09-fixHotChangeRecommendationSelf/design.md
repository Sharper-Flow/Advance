# Design

## Plan

1. Add failing regression for caller-owned hot change rendered as self-owned, not another-agent warning.
2. Add/keep peer-owned warning regression.
3. Update recommendation attribution logic to compare caller/session ownership before rendering peer warning.
4. Run focused status/session tests and repo check.

## Contracts

- Self-owned work is not framed as another agent.
- Peer-owned work still warns without leaking private peer details.
- Attribution is deterministic with missing identity data failing conservatively.

## Test Strategy

- RED self-attribution regression.
- GREEN peer/self status tests.
- Focused tests plus `pnpm run check`.