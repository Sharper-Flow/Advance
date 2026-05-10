# Fix adv_status visibility memo stale deleted change entries

## Intent

Resolve bug #57: `adv_status` should not continue showing deleted/removed change entries until OpenCode session restart.

## Scope

- Inspect status visibility memo/cache lifecycle around deleted, archived, or closed changes.
- Add regression coverage for status after change deletion/removal or visibility invalidation.
- Fix memo invalidation so status reflects current change visibility without session restart.
- Preserve intended caching performance and Temporal query behavior.

## Success Criteria

- `adv_status` stops showing deleted/stale change entries in the same session.
- Cache invalidation remains scoped and performant.
- Regression tests cover stale-entry invalidation.
- Relevant checks pass.