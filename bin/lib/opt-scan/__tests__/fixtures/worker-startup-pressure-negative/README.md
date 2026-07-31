# worker-startup-pressure-negative

NEGATIVE (rejection) fixture for the `worker_startup_pressure` opt-scan detector.

## What this proves

When `readFileSync` is inside a function rather than at module top level, the
detector MUST NOT emit a startup-pressure candidate. Deferred loading is not the
same as startup-time synchronous I/O.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/worker.ts`   | `readFileSync` inside `loadConfig()`, not top level. |

## Line map (1-indexed) of `src/worker.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 5    | `return JSON.parse(readFileSync(...));` (rejected) |
