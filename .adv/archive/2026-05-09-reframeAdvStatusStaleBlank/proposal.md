# Reframe adv_status blank assistant message recommendation

## Intent

Resolve bug #92: `adv_status` doctor recommendation should avoid misleading 'Stale OpenCode blank assistant messages detected' framing when blank rows may belong to live/active sessions.

## Scope

- Inspect `adv_status` doctor/session-debt formatting.
- Update wording to distinguish active-session blank rows from orphan/repairable rows.
- Align language with safer classification work from issue #91 where applicable.
- Add/update tests for status recommendation text.

## Success Criteria

- Status recommendation no longer implies all blank assistant rows are stale/deletable.
- Wording is actionable and safety-preserving.
- Tests cover updated doctor recommendation output.
- Relevant checks pass.