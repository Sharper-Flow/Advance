# Contract Traceability

**Change ID:** fixConcurrentSessionStateBleed
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-24T23:06:26.303Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Session isolation test: session-A reads own activeChangeId |
| AC2 | acceptance_criterion | pass | test | setActiveChange in A does not affect B |
| AC3 | acceptance_criterion | pass | test | cleanup() deletes only current session entry |
| AC4 | acceptance_criterion | pass | test | initializeStatus preserves existing entry |
| AC5 | acceptance_criterion | pass | test | Uses getCurrentSessionId() from utils/session-id.ts |
| C1 | constraint | respected | static_check | initialized flag preserved |
| C2 | constraint | respected | static_check | Uses existing getCurrentSessionId, no SDK changes |
| C3 | constraint | respected | static_check | resetStatusForTest clears entire map |
| DONT1 | avoidance | respected | review | No PID as key |
| DONT2 | avoidance | respected | review | No session params on public functions |
| DONT3 | avoidance | respected | review | No OpenCode session DB access |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c900ee3e63d6 | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
