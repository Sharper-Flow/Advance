# Backend API Style Evaluation

## Consider

- Client diversity — client count and differing data needs.
- Fetch efficiency — over-fetching vs under-fetching.
- Contract stability — internal mesh vs public external API.
- Caching — HTTP caching vs query-level caching.
- Type safety at boundary.
- Ecosystem — SDK generation, docs, schema evolution, client support.

## Socratic prompts

1. Do clients have structurally different data needs, or can REST endpoints serve them?
2. How much response data is unused by clients today?
3. Is this internal service mesh or public API?
4. Does HTTP caching matter more than query flexibility?

## Evidence to gather

- Client list and data-access patterns.
- Public compatibility/support expectations.
- Docs and SDK generation needs.
- Auth, versioning, and error-contract requirements.
- Observed performance/caching constraints.

## Default bias

REST remains boring default for simple public APIs. RPC/trpc-like styles fit tight internal TypeScript surfaces. GraphQL earns keep when clients have divergent data shapes and query flexibility beats cache simplicity.
