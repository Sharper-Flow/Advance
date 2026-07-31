# worker-startup-pressure-positive

POSITIVE fixture for the `worker_startup_pressure` opt-scan detector.

## What this proves

Synchronous I/O (`readFileSync`) executed at module top level in a worker-named
file MUST emit a static startup-pressure candidate. The trigger evidence points
at the synchronous call; the scope evidence notes it is in a startup-named file.

## File map

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `src/worker.ts`   | Top-level `readFileSync` during worker startup.      |

## Line map (1-indexed) of `src/worker.ts`

| Line | Content (key only)                          |
|------|---------------------------------------------|
| 6    | `const config = JSON.parse(readFileSync(...));` (trigger) |
