# cache-opportunity-no-invalidation

NEGATIVE (rejection) fixture for the `cache_opportunity` opt-scan detector.

## What this proves

A function with immutable identity (`const key = ...`) and clear cache
ownership (`private cache = new Map(...)`) but no invalidation policy MUST NOT
emit a candidate. V1 requires explicit invalidation evidence such as `ttl`,
`expire`, `refresh`, `evict`, or `invalidate`.

## File map

| File                 | Purpose                                              |
|----------------------|------------------------------------------------------|
| `src/calculator.ts`  | Cached computation without invalidation policy.      |
