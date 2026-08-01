# avoidable-collection-work-positive

POSITIVE fixture for the `avoidable_collection_work` opt-scan detector.

## What this proves

When collection transformations are chained (`map(...).filter(...).reduce(...)`),
the detector MUST emit a static candidate. The trigger evidence points at the
chained line.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/summarize.ts`| Chained `.map().filter().reduce()` on an array.      |

## Line map (1-indexed) of `src/summarize.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 6-8  | `.map(...).filter(...).reduce(...)` (trigger) |
