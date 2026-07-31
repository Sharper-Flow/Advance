# avoidable-collection-work-negative

NEGATIVE (rejection) fixture for the `avoidable_collection_work` opt-scan detector.

## What this proves

A single collection method (`map`) with no chain is not enough evidence of
avoidable intermediate work. The detector MUST NOT emit a candidate.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/names.ts`    | Single `.map()` call, no chain.                      |

## Line map (1-indexed) of `src/names.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 5    | `return users.map((u) => u.name);` (rejected) |
