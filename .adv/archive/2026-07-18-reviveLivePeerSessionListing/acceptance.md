# Acceptance

Reviewed at: 2026-07-18T19:37:35.728Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | When peer OpenCode sessions share the project, `adv_session_list` returns one entry per live peer plus the caller's own (`isSelf: true`). | pass | Reviewer verdict READY; session tests tr_mrqrq6t1_245761b5 prove self plus detected peers. |
| SC2 | success_criterion | Output exposes only sessionId (opaque), startedAt (ISO), worktree (basename), isSelf, lastSeenAt — never PID or full cwd. | pass | Reviewer confirmed privacy projection; session tests assert no PID/full-path fields. |
| SC3 | success_criterion | `sessionId` is stable for a given process across repeated calls and opaque (PID not recoverable in plaintext). | pass | Stable opaque SHA-256-derived session IDs verified by session tests. |
| SC4 | success_criterion | On non-Linux, the tools return `unavailable: true` (no throw). | pass | Non-Linux unavailable behavior verified by session tests. |
| SC5 | success_criterion | `adv_wip_state.peer_sessions` reflects the same live peers. | pass | backlog tests tr_mrqrchcq_99f4181e verify adv_wip_state maps listPeerSessions live projection. |
| AC1 | acceptance_criterion | Given N live peer OpenCode processes in the project, when adv_session_list runs, then N+1 entries (peers + self) are returned, self first. | pass | tr_mrqrq6t1_245761b5: 33/33 focused tests; self first plus N peers. |
| AC2 | acceptance_criterion | Given a detected peer, when projected, then the entry contains no pid/full-path fields. | pass | Session projection tests assert no pid, cwd, or worktreePath fields. |
| AC3 | acceptance_criterion | Given the same process, when adv_session_list is called twice, then its sessionId is identical. | pass | Repeated-call stable opaque sessionId test passed in tr_mrqrq6t1_245761b5. |
| AC4 | acceptance_criterion | Given process.platform !== 'linux', when the tools run, then result.unavailable === true and no exception propagates. | pass | Non-Linux detector-unavailable test passed in tr_mrqrq6t1_245761b5. |
| AC5 | acceptance_criterion | Given a dead/exited PID surfaced by a race, when projected, then it is filtered (PID-reuse-safe liveness). | pass | Dead and PID-reused peer filtering tests passed; scan-time startTicks race fixed by reviewer. |
| C1 | constraint | Do NOT resurrect the retired Temporal projectWorkflow session registry. | respected | Diff replaces listSessions read with detectPeerSessions; no registry writes or resurrection. |
| C2 | constraint | Preserve the privacy-defensive projection (KD-4): no PID/full-path leak. | respected | Public SessionListEntry projection excludes PID and full cwd; tests enforce. |
| C3 | constraint | Linux-only detection (existing detector platform guard); other platforms degrade to unavailable. | respected | Explicit process.platform Linux guard returns unavailable on other platforms. |
| C4 | constraint | Reads only; no workflow mutations from a list call. | respected | Listing path performs process/procfs reads only; reviewer found no workflow mutation. |
| DONT1 | avoidance | Do not surface PID or full cwd in any public entry. | respected | Reviewer READY; public entries contain only opaque ID, timestamps, basename, isSelf. |
| DONT2 | avoidance | Do not re-add registerSession/heartbeat writes (detector is registration-free). | respected | Reviewer confirmed no registerSession or heartbeat writes added. |
| DONT3 | avoidance | Do not change adv_session_show ACL semantics in this change. | respected | Reviewer confirmed adv_session_show ACL unchanged; existing ACL tests remain green. |

