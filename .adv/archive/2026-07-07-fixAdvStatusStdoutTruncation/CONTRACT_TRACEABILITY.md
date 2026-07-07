# Contract Traceability

**Change ID:** fixAdvStatusStdoutTruncation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T04:22:14.016Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tr_mra56ner_506e42ff: pokeedge piped = 17169 bytes; file = 17170 bytes (1-byte newline difference at EOF). Byte-for-byte match confirmed. |
| AC2 | acceptance_criterion | pass | test | Error path (/tmp): exit=1 (not git repo). Temporal failure: exit=2 (adv.test.ts confirms). Success: exit=0. |
| AC3 | acceptance_criterion | pass | test | tr_mra56ep4_92ceb21e: 16 pass, 0 fail, 58 expect() calls. |
| AC4 | acceptance_criterion | pass | test | bun test bin/lib/live-status.test.ts: 18 pass, 0 fail, 50 expect() calls. |
| AC5 | acceptance_criterion | pass | test | Manual timing: adv status --json from pokeedge exits in 0.4s. Error path test (adv.test.ts) passes in 513ms (was 5001ms timeout with exitCode-only approach). |
| C1 | constraint | respected | static_check | All tests run under bun (shebang #!/usr/bin/env bun). Piped output verified under bun: 17169 bytes. |
| C2 | constraint | respected | static_check | process.exit(code) still called in stdout.end() callback, ensuring dangling handles are killed. |
| DONT1 | avoidance | respected | review | process.exitCode-only approach was tested and rejected (caused 5s timeout in error-path test). |
| DONT2 | avoidance | respected | review | process.stdout.write('', cb) pattern was tested and rejected (Bun ignores callback, still truncated at 8192). |
| OOS1 | out_of_scope | respected | not_applicable | Dangling gRPC handles not fixed; force-exit pattern retained as workaround. |
| OOS2 | out_of_scope | respected | not_applicable | Only bin/adv exit handler changed. No other CLI files modified. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-84302348f406 | AC1, AC2, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, DONT1, DONT2, OOS1, OOS2 |  |
