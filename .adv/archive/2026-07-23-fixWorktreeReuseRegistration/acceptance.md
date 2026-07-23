# Acceptance

Reviewed at: 2026-07-23T04:21:43.672Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** An orphan-recovered change with an intact disk worktree and genuinely absent workflow registration becomes mutable from trunk/zlauncher through normal create/resume reuse, without manual removal/recreation and without weakening the isolation guard. | pass | Independent reviewer READY: disk reuse plus absent workflow record now signals server-authoritative repair; index-create test proves guard predicate true without manual recreation. |
| AC1 | acceptance_criterion | **AC1** Given an intact disk worktree and no `state.worktrees[branch]` entry, when Step 0 reuses it, then a typed registration-repair signal is delivered and the workflow atomically inserts exactly one complete `WorktreeRecord`: branch/path/baseRef/headSha from the verified disk worktree; `changeId` from workflow state; `createdAt` and `lastSeenAt` equal `repairedAt`; `source:"tool"`; `sourceVersion:1`; `materialized:true`; `status:"created"`; `setupReady:true`. `worktreeExistsForChange` becomes `true`. | pass | tr_mrwzz2jx_297bf7bf targeted suite: index-create absent-map reuse test + reducer complete-record test. |
| AC2 | acceptance_criterion | **AC2** Given an existing `status:"setup_failed"` branch record, when repair arrives (including after client false-null), then reducer performs a true no-op: every record field and `lastSignalAt` remain unchanged; isolation probe stays false. | pass | tr_mrwzz2jx_297bf7bf: reducer test preserves setup_failed record and lastSignalAt exactly. |
| AC3 | acceptance_criterion | **AC3** Given any metadata-rich existing branch record, repair preserves every field and `lastSignalAt`. Given a successful client query returning an existing record, Step 0 sends no repair signal. | pass | tr_mrwzz2jx_297bf7bf: metadata-rich exact no-op and ready-record no-signal tests. |
| AC4 | acceptance_criterion | **AC4** Given Temporal/service/signal timeout or failure, once Step 0 confirms disk path + HEAD, it still returns `{ok:true,reused:true}` without throwing. | pass | tr_mrwzz2jx_297bf7bf: rejected repair delivery still resolves reused:true. |
| AC5 | acceptance_criterion | **AC5** Given multiple repair signals for one absent branch, workflow history serializes them: first inserts; later signals preserve every first-record field and `lastSignalAt`; exactly one branch key exists. | pass | tr_mrwzz2jx_297bf7bf: reducer repeated-repair test and Temporal handler first-write-wins test. |
| AC6 | acceptance_criterion | **AC6** Existing create/resume/workflow signal suites remain green; full-create still uses `worktreeCreatedSignal` exactly once and setup-failure behavior remains unchanged. | pass | tr_mrwzz2jx_297bf7bf: corrected targeted 4-file suite passed; tr_mrx005fs_7978f132 pnpm run check passed. |
| C1 | constraint | **C1** Conditional existence check MUST execute inside the change workflow reducer; client probe is optimization only. | respected | change-state.ts repair reducer performs workflow-side if-absent check; client only probes. |
| C2 | constraint | **C2** Repair reducer MUST NOT overwrite any existing `worktrees[branch]` record. | respected | change-state.ts early return on existing worktrees[branch] precedes all mutation. |
| C3 | constraint | **C3** Successful insertion may mutate only `worktrees[branch]` and `lastSignalAt`; no `taskQueue` or unrelated behavioral state. | respected | Repair reducer only assigns worktrees[branch] and lastSignalAt on absent insertion. |
| C4 | constraint | **C4** Existing-record no-op MUST NOT update `lastSignalAt`. | respected | Existing-record branch returns before setLastSignalAt; exact no-op tests pass. |
| C5 | constraint | **C5** Repair runs only after `pathExists` + `rev-parse HEAD` confirm disk worktree usability. | respected | index.ts validates pathExists and rev-parse HEAD before query/signal. |
| C6 | constraint | **C6** Repair delivery remains best-effort and cannot block reuse. | respected | fireWorktreeSignal catches timeout/error; Step 0 ignores warning result and returns reused:true. |
| DONT1 | avoidance | **A1** Do not reuse `worktreeCreatedSignal` for recovery; its whole-record replacement semantics are unsafe after false-null. | respected | Dedicated worktreeRegistrationRepairedSignal added; worktreeCreatedSignal stays full-create-only. |
| DONT2 | avoidance | **A2** Do not convert `setup_failed` to ready without rerunning setup. | respected | Existing setup_failed record is reducer no-op; no readiness conversion. |
| DONT3 | avoidance | **A3** Do not add resume-path repair wiring; null already falls through to Step 0. | respected | Resume path unchanged; absent record falls through to Step 0. |
| DONT4 | avoidance | **A4** Do not weaken isolation guard. | respected | Isolation guard untouched; repair restores the record it reads. |
| DONT5 | avoidance | **A5** Do not change full-create signal behavior. | respected | Full-create worktreeCreatedSignal path unchanged; targeted regression suite passes. |
| DONT6 | avoidance | **A6** Do not add client-side CAS/version heuristics; workflow history owns atomicity. | respected | No client CAS/version heuristic; Temporal handler serializes if-absent repair. |

