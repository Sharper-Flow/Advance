# Fix archive seeing incomplete gates despite complete gate status

## Intent

Resolve bug #88: `adv_change_archive` should not report incomplete gates when authoritative gate status shows all gates complete.

## Scope

- Inspect archive gate-read path and gate status source-of-truth selection.
- Add regression coverage for gate status complete while archive sees stale/incomplete projection.
- Fix archive to query/validate authoritative gate state or refresh stale cache before blocking.
- Preserve real incomplete-gate blocking behavior.

## Success Criteria

- Archive proceeds when authoritative gate status is complete.
- Archive still blocks genuinely incomplete gates.
- Regression tests cover stale projection/cache mismatch.
- Relevant checks pass.