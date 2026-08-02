# worker-startup-pressure-negative

NEGATIVE (rejection) fixture for the `worker_startup_pressure` opt-scan detector.

## What this proves

When `readFileSync` is at module top level in a non-startup library file, the
detector MUST NOT emit a startup-pressure candidate. Library initialization is
not necessarily worker or application startup.

## File map

| File            | Purpose                                                   |
|-----------------|-----------------------------------------------------------|
| `src/config.ts` | Top-level `readFileSync` outside a startup-named file.    |

## Line map (1-indexed) of `src/config.ts`

| Line | Content (key only)                                |
|------|---------------------------------------------------|
| 6    | `JSON.parse(readFileSync(...))` (rejected)        |
