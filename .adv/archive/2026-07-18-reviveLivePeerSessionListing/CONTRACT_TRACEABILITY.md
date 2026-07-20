# Contract Traceability

**Change ID:** reviveLivePeerSessionListing
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-18T19:37:35.728Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer verdict READY; session tests tr_mrqrq6t1_245761b5 prove self plus detected peers. |
| SC2 | success_criterion | pass | review | Reviewer confirmed privacy projection; session tests assert no PID/full-path fields. |
| SC3 | success_criterion | pass | review | Stable opaque SHA-256-derived session IDs verified by session tests. |
| SC4 | success_criterion | pass | review | Non-Linux unavailable behavior verified by session tests. |
| SC5 | success_criterion | pass | review | backlog tests tr_mrqrchcq_99f4181e verify adv_wip_state maps listPeerSessions live projection. |
| AC1 | acceptance_criterion | pass | test | tr_mrqrq6t1_245761b5: 33/33 focused tests; self first plus N peers. |
| AC2 | acceptance_criterion | pass | test | Session projection tests assert no pid, cwd, or worktreePath fields. |
| AC3 | acceptance_criterion | pass | test | Repeated-call stable opaque sessionId test passed in tr_mrqrq6t1_245761b5. |
| AC4 | acceptance_criterion | pass | test | Non-Linux detector-unavailable test passed in tr_mrqrq6t1_245761b5. |
| AC5 | acceptance_criterion | pass | test | Dead and PID-reused peer filtering tests passed; scan-time startTicks race fixed by reviewer. |
| C1 | constraint | respected | static_check | Diff replaces listSessions read with detectPeerSessions; no registry writes or resurrection. |
| C2 | constraint | respected | static_check | Public SessionListEntry projection excludes PID and full cwd; tests enforce. |
| C3 | constraint | respected | static_check | Explicit process.platform Linux guard returns unavailable on other platforms. |
| C4 | constraint | respected | static_check | Listing path performs process/procfs reads only; reviewer found no workflow mutation. |
| DONT1 | avoidance | respected | review | Reviewer READY; public entries contain only opaque ID, timestamps, basename, isSelf. |
| DONT2 | avoidance | respected | review | Reviewer confirmed no registerSession or heartbeat writes added. |
| DONT3 | avoidance | respected | review | Reviewer confirmed adv_session_show ACL unchanged; existing ACL tests remain green. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a4dd083aae2a | SC1, SC2, SC3, SC4 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
| tk-06b820fa9081 | SC5 | AC1 | C2, C4 |  |
| tk-6b57206d5912 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, C1, C2, C3, C4 |  |  |
