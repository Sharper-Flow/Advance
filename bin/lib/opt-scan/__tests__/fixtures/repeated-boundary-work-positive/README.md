# repeated-boundary-work-positive

POSITIVE fixture for the `repeated_boundary_work` opt-scan detector.

## What this proves

When a boundary call (`fetch`) appears inside an explicit loop construct, the
detector MUST emit a static optimization candidate with file:line trigger evidence
and a surrounding scope evidence entry for the loop.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/api.ts`      | `for...of` loop calling `fetch` for each user id.    |

## Line map (1-indexed) of `src/api.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 6    | `for (const id of ids) {` (scope)           |
| 7    | `await fetch(\`/api/users/\${id}\`);` (trigger) |
