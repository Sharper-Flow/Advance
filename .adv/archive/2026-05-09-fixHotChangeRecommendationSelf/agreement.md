# Discovery Agreement

## Facts

- Issue #95 reports hot-change recommendation falsely says another agent owns work when caller is the worker.
- Peer-session warnings remain useful for truly peer-owned changes.
- Attribution needs self-vs-peer identity comparison, not just presence of active worker/session.

## Decisions

- Add explicit self-owned classification before peer warning rendering.
- Preserve peer-owned warnings.
- Cover both self and peer scenarios in tests.

## Risks / Unknowns

- Current session identity may be privacy-defensive or partial.
- Must avoid exposing peer-private details.

## Out of Scope

- Cross-project session list expansion.
- Changing privacy boundaries for session detail output.