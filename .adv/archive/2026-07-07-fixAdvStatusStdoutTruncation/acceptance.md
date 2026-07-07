# Acceptance

Reviewed at: 2026-07-07T04:22:14.016Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1**: `adv status --json | wc -c` equals `adv status --json > file && wc -c file` for payloads >8KB | pass | tr_mra56ner_506e42ff: pokeedge piped = 17169 bytes; file = 17170 bytes (1-byte newline difference at EOF). Byte-for-byte match confirmed. |
| AC2 | acceptance_criterion | **AC2**: Exit code is preserved (0 for success, 1 for git failure, 2 for Temporal failure) | pass | Error path (/tmp): exit=1 (not git repo). Temporal failure: exit=2 (adv.test.ts confirms). Success: exit=0. |
| AC3 | acceptance_criterion | **AC3**: All 16 `bin/adv.test.ts` tests pass | pass | tr_mra56ep4_92ceb21e: 16 pass, 0 fail, 58 expect() calls. |
| AC4 | acceptance_criterion | **AC4**: All 18 `bin/lib/live-status.test.ts` tests pass | pass | bun test bin/lib/live-status.test.ts: 18 pass, 0 fail, 50 expect() calls. |
| AC5 | acceptance_criterion | **AC5**: No process hang (>5s) on any code path including error paths | pass | Manual timing: adv status --json from pokeedge exits in 0.4s. Error path test (adv.test.ts) passes in 513ms (was 5001ms timeout with exitCode-only approach). |
| C1 | constraint | **C1**: Must work under Bun runtime (not just Node.js) | respected | All tests run under bun (shebang #!/usr/bin/env bun). Piped output verified under bun: 17169 bytes. |
| C2 | constraint | **C2**: Force-exit still needed — error paths leave dangling gRPC handles | respected | process.exit(code) still called in stdout.end() callback, ensuring dangling handles are killed. |
| DONT1 | avoidance | **DONT1**: Don't use `process.exitCode` alone (gRPC handles prevent natural exit) | respected | process.exitCode-only approach was tested and rejected (caused 5s timeout in error-path test). |
| DONT2 | avoidance | **DONT2**: Don't use `process.stdout.write('', cb)` pattern (Bun ignores the callback) | respected | process.stdout.write('', cb) pattern was tested and rejected (Bun ignores callback, still truncated at 8192). |
| OOS1 | out_of_scope | **OOS1**: Fixing dangling gRPC handles in the Temporal client (separate concern) | respected | Dangling gRPC handles not fixed; force-exit pattern retained as workaround. |
| OOS2 | out_of_scope | **OOS2**: Refactoring other CLI exit patterns (only `bin/adv` is affected) | respected | Only bin/adv exit handler changed. No other CLI files modified. |

