# repeated-boundary-work-negative

NEGATIVE (rejection) fixture for the `repeated_boundary_work` opt-scan detector.

## What this proves

When a boundary call (`fetch`) appears but is NOT inside a loop construct, the
detector MUST NOT emit a candidate. Static advisory findings require a loop
context; a single call is insufficient evidence.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/api.ts`      | Single `fetch` call with no surrounding loop.        |

## Line map (1-indexed) of `src/api.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 5    | `await fetch(\`/api/users/\${id}\`);` (trigger, rejected) |
