# Contract Traceability

**Change ID:** fixHealthDegradedAlive
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T20:10:32.261Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tool-formatters.test.ts: temporalDegraded → 'server degraded' + 'liveness unconfirmed', NOT 'server alive ✓'. |
| AC2 | acceptance_criterion | pass | test | status.ts: temporalDegraded=probe_degraded passed; catch path freshness stale:true (degraded not authoritative-fresh). |
| AC3 | acceptance_criterion | pass | test | status-health.ts staleQueueProbe + queue-serviceability.ts type widened to 'ok'|'degraded'|'unavailable'. |
| AC4 | acceptance_criterion | pass | test | health-probe-cache.ts isTemporalHealthUsable unchanged: server_alive || probe_degraded; degraded still admits computation (health-probe-cache.test.ts). |
| C1 | constraint | respected | static_check | Fix surface tools/+utils/+temporal type only; workflows.ts untouched. |
| C2 | constraint | respected | static_check | pnpm run check + pnpm run build green. |
| DONT1 | avoidance | respected | review | isTemporalHealthUsable unchanged; degraded still admits (no false-down regression). |
| DONT2 | avoidance | respected | review | buildTemporalHealthFallback unchanged on server_alive; the DISPLAY now distinguishes degraded instead of asserting alive. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c412c02982ad | AC1, AC2 |  | C1, C2, DONT2 |  |
| tk-3d572d3606d2 | AC3 | AC4 | DONT1 |  |
