# Fix hot-change self-worker attribution

## Intent

Resolve bug #95: hot-change recommendations should not say work belongs to another agent when the caller is the worker responsible for that change.

## Scope

- Inspect hot-change/session attribution logic.
- Add regression coverage where caller session matches worker identity.
- Fix attribution/rendering so self-owned work is not framed as another agent's work.
- Preserve warnings for truly peer-owned changes.

## Success Criteria

- Caller-owned hot changes are attributed to the caller/current worker.
- Peer-owned hot changes still warn appropriately.
- Regression tests cover self and peer cases.
- Relevant checks pass.