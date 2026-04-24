# Bug: Orphaned Temporal Workflows from Removed Dogfood Migration

**Filed:** 2026-04-23
**Severity:** Medium — currently blocking some `adv_*` tools in non-advance repos
**Labels:** `bug`, `temporal`, `cleanup`, `tech-debt`, `post-migration`

> **Filing note:** This bug was originally going to be filed as an `adv_agenda_add`
> item (user preference), but the agenda tool itself is blocked by this exact bug
> when called from a non-advance repo. The tool failed with:
> `"Project workflow unavailable: Temporal worker not ready for queue advance-130a2464148195261e97211e0387f72e78f27843"`.
> That queue is one of the 21 stuck queues. Filing as markdown under
> `docs/bugs/` instead so the report is durable.

## Summary

Local Temporal dev server (`127.0.0.1:7233`) has **5,447 `changeWorkflow`
executions stuck in `Running` state** across **21 project-scoped task queues**,
with **zero pollers registered** on any queue. Workflows were created on
2026-04-20 by the now-deleted `plugin/scripts/dogfood-migration.ts` and have
been idle ever since. Each workflow's history is only 2 events
(`WorkflowExecutionStarted`, `WorkflowTaskScheduled`) — the first workflow task
was scheduled but never dispatched because no worker is polling.

## Severity — Medium

Currently manifesting as:

- `adv_agenda_add` (and almost certainly other `adv_*` tools that go through the
  project workflow) fails in any non-advance repo that had its `adv/project/*`
  workflow started by the sweep on 2026-04-20. Reproduced today in
  `/home/jrede/scratch` (project id `130a2464...`) while filing this very bug
- Pollutes `temporal workflow list` with 5.4k orphans, hiding real work
- Each orphan sits until namespace retention (24h) evicts it — but `start-dev`
  persistence may extend this, and new orphans could accumulate if a similar
  tool is re-introduced
- Confuses post-hoc debugging (spent ~1 hour tracing "5,447 stuck workflows"
  that *look* like a critical runtime bug)

Not currently causing CPU/memory harm — workflows are idle.

## Evidence

Host: `127.0.0.1:7233` (local `temporal server start-dev`, PID 128208, up 1d4h).

```bash
temporal workflow count --query 'ExecutionStatus="Running"'
# Total: 5447
temporal workflow count --query 'ExecutionStatus="Completed"'
# Total: 0
temporal workflow count --query 'ExecutionStatus="Failed"'
# Total: 0
```

Breakdown by task queue (top 10 of 21):

```
551  advance-67fe3e95bc2afb49e94cada183986fa1712e47d5
469  advance-bdf259aa162ae192af5b18899ccdc653b085528d   (advance repo itself)
326  advance-130a2464148195261e97211e0387f72e78f27843   (scratch repo — blocking this session)
324  advance-4d6b589871e3687c746bf043301cfb4ac98ea049
308  advance-2b90653f967c3ba63cd13c9422164ee1ab44b2fc
305  advance-0eda64e7ff39bc71b34a70755f6cdd9fac7bda12
304  advance-2741f2eb3588f31cb785ffb5e7098f27ef0873c9
301  advance-548a340e204172c060bc0d3eea3a7de930af28d7
300  advance-6f85aebf461c84fa97e1d1570b32ec83fa191248
297  advance-adf61288cf2a241d5c14df50c4129a6b47e64294
```

Workflow-count per project closely matches `changes/` directory count in
`~/.local/share/opencode/plugins/advance/{projectId}/`, confirming the
1-workflow-per-change migration pattern:

```
projectId=548a340e...  wf=301  changes=300 archive=0    total=300
projectId=4d6b5898...  wf=324  changes=323 archive=173  total=496
projectId=67fe3e95...  wf=551  changes=552 archive=248  total=800
projectId=bdf259aa...  wf=469  changes=130 archive=112  total=242 (duplicate starts — multiple sweep runs)
```

No pollers on any of these queues:

```
temporal task-queue describe --task-queue advance-548a340e...
Pollers:
  BuildID  TaskQueueType  Identity  LastAccessTime  RatePerSecond
  (empty)
```

Sample workflow history (idle):

```
temporal workflow show --workflow-id "adv/change/548a340e.../gateParity39"
  1  WorkflowExecutionStarted
  2  WorkflowTaskScheduled
```

Leaked state on disk matches. Example:

```
~/.local/share/opencode/plugins/advance/548a340e.../changes/gateParity39/
├── change.json  (created 2026-04-20T04:59:19Z)
└── proposal.md
```

## Root Cause

Commit **`bb2d901`** ("feat(temporal): migrate ADV state to Temporal workflows",
2026-04-20) shipped `plugin/scripts/dogfood-migration.ts`. That script:

1. Discovered all ~288 project dirs in `~/.local/share/opencode/plugins/advance/`
2. For each, iterated every change in `changes/` and called
   `ensureChangeWorkflowStarted` on the **real** local Temporal dev server
   (`127.0.0.1:7233`), keyed by per-project task queue `advance-{projectId}`
3. Created an in-process worker polling only **one** task queue (the
   controlling project's queue)
4. The sweep called `worker.registerQueue(taskQueue)` to pick up additional
   queues as it discovered them — but ran against a wall-clock `DEADLINE_MS`,
   at which point the worker exited whether all per-project workflows reached
   `done` or not
5. Cleanup called `worker.shutdown()` + `bundle.connection.close()`, which
   cleaned up the client and worker — but **did NOT terminate the started
   workflows**

The `deleted 288 project dirs × ~300 changes each` math lines up with the
reported ledger: `docs/temporal-migration-dogfood.md` in commit `bb2d901`
records `"imported 288 changes"`, `"imported 289 changes"`, `"imported 309
changes"`, etc. for each project.

Commit **`24bf177`** ("task(tk-DAZl9MZ-): completed", 2026-04-22) **deleted**
the dogfood migration infrastructure:

- `plugin/scripts/dogfood-migration.ts`
- `plugin/scripts/adv-migration-describe.ts`
- `plugin/scripts/adv-migration-ledger.ts`
- `plugin/scripts/adv-migration-terminate.ts` ← **the only cleanup tool was deleted**
- `plugin/scripts/smoke-migration-worker.ts`
- `plugin/src/temporal/migrate-runner.ts`
- `docs/temporal-migration-dogfood.md`

Important: `adv-migration-terminate.ts` only targeted `adv/migration/*` workflow
IDs (the `migrateAllProjectsWorkflow` orchestrator). It did not cover the
`adv/change/*` or `adv/project/*` workflows that the sweep enqueued on
per-project queues. And now even that limited tool is gone.

`docs/temporal-recovery.md` currently covers worker model,
`adv_workflow_repair` for `adv/project/*`, and `NonDeterministicWorkflowError`
— but has no runbook for mass-terminating stale `adv/change/*` workflows.

## Related Files

- `plugin/src/temporal/client.ts:53` — `buildProjectTaskQueue(projectId)`
  returns `advance-{projectId}`
- `plugin/src/temporal/migration.ts:107-159` — `ensureChangeWorkflowStarted`
  (still in tree; correctly idempotent). Called by both live code paths and
  the deleted dogfood sweep
- `plugin/src/storage/store-legacy.ts:74-79` — `createLegacyStore` with
  `externalRoot` isolates filesystem state but does not isolate Temporal
  state when the client bundle wires to the real server
- Git lineage: `bb2d901` (introduce), `24bf177` (delete)

## Proposed Fixes

### 1. Immediate cleanup (one-off)

Add an operator script targeting stale `adv/change/*` AND `adv/project/*`
workflows. Example commands (verify batch-terminate-via-query in the local
`temporal` version):

```bash
# Terminate orphaned change workflows
temporal workflow terminate \
  --query 'ExecutionStatus="Running" AND WorkflowType="changeWorkflow" AND StartTime < "2026-04-23T00:00:00Z"' \
  --reason "2026-04-20 dogfood migration orphans"

# Terminate orphaned project workflows (this unblocks adv_agenda_add in non-advance repos)
temporal workflow terminate \
  --query 'ExecutionStatus="Running" AND WorkflowType="projectWorkflow"' \
  --reason "2026-04-20 dogfood migration orphans"
```

### 2. Prevent recurrence in future migration/bootstrap tools

Any tool that calls `ensureChangeWorkflowStarted` en masse against the
production dev server must:

- Register pollers for every task queue it enqueues on, OR
- Emit a clear termination-on-cleanup path that runs regardless of whether
  the sweep completed within the deadline, OR
- Use `TestWorkflowEnvironment` (ephemeral in-process server) instead of the
  real dev server for dry runs / validation

### 3. Runbook gap

Add a section to `docs/temporal-recovery.md` titled "Stale `adv/change/*` and
`adv/project/*` workflows" documenting:

- **Detection:** `temporal workflow list` + count, `temporal task-queue
  describe` shows no pollers, `adv_agenda_add` fails with "Temporal worker not
  ready for queue ..."
- **Safe batch-terminate** commands with `StartTime` filter
- **Lineage note:** retired dogfood migration tool (bb2d901 → 24bf177) so
  future operators don't re-discover this
- **User-visible symptom:** `adv_*` tools in arbitrary non-advance repos will
  fail with "Temporal worker not ready" until either (a) the orphaned project
  workflow is terminated, or (b) a live worker registers for that queue

### 4. Guardrail (optional)

Consider a plugin-init check that warns when the connected Temporal server has
`Running` workflows on a task queue with no poller. Could surface via
`adv_status` under a "temporal health" section. Would have caught this within
minutes of a bad run.

## Impact Scope

- Primarily affects the one environment that ran the dogfood migration
  (likely just the ADV author)
- Workflows should naturally expire via 24h namespace retention, but
  `start-dev` persistence may extend this
- Fresh ADV installs are unaffected — dogfood migration tool is already gone
  from HEAD
- **Currently blocking:** `adv_agenda_add` (and likely other adv tools) in any
  non-advance repo whose project ID appears in the orphaned set. Reproduced
  today in `/home/jrede/scratch` (project id `130a2464...`) while filing this
  very bug

## Context

Investigation started when a user asked why system load looked high (load avg
16.75 on 16 cores). Load was from concurrent opencode processes, not Temporal.
But the Temporal dive surfaced this latent issue.
