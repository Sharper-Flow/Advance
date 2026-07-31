# cache-opportunity-negative

NEGATIVE (rejection) fixture for the `cache_opportunity` opt-scan detector.

## What this proves

A function that performs a pure-looking computation but lacks cache ownership,
invalidation, and immutable identity evidence MUST NOT emit a candidate. The
cache-opportunity detector rejects unclear cases rather than guessing.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/hasher.ts`   | Stateless `computeHash` with no cache signals.       |

## Line map (1-indexed) of `src/hasher.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 6    | `return input.split("").reverse().join("");` (trigger, rejected) |
