# cache-opportunity-positive

POSITIVE fixture for the `cache_opportunity` opt-scan detector.

## What this proves

A potentially pure computation (`computeHash`) that has:

- immutable identity (a stable key derived from `input`),
- clear ownership (a class-level `cache` Map),
- invalidation evidence (TTL field + `cache.get`/`set` usage)

MUST emit a static cache-opportunity candidate. The detector requires all three
pieces of source evidence; unclear cases are rejected.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/hasher.ts`   | Class with cached hash computation.                  |

## Line map (1-indexed) of `src/hasher.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 6    | `private cache = new Map<string, string>();` (ownership) |
| 7    | `private ttl = 60_000;` (invalidation)      |
| 10   | `const key = \`hash:\${input}\`;` (identity) |
| 9    | `computeHash(input: string): string {` (trigger) |
