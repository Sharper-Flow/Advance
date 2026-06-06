## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal: Start cross-project change workflows

## Problem

`adv_change_create --target_path` creates the target change disk-only (`createLegacyStore`), never starting the target Temporal change workflow. With the worker-free Visibility status read, disk-only changes have no search attributes and are invisible to `adv status`/launcher. Confirmed: `reworkRelatedCards` in pokeedge is disk-only and missing from the launcher.

## Proposal

1. **Start target workflow on cross-project create.** In the `change.ts` cross-project branch, after `targetStore.changes.create(...)`, start the target project's change workflow via the shared Temporal client using `buildChangeWorkflowId(targetProjectId, changeId)` + `buildProjectTaskQueue(targetProjectId)` and `ensureChangeWorkflowStarted` (seed from the created change, `projectionChangesDir` = target changes dir). Idempotent; fire-and-forget; never query the target workflow from this process.
2. **Reconcile existing disk-only changes (self-heal).** Add a bounded reconciliation that, for a project, detects changes present on disk but absent from Temporal Visibility and starts their workflows (hydrating from disk). Runs opportunistically (e.g., on session/worker start for the local project) so orphans created before this fix — like `reworkRelatedCards` — become visible.

## Why not an anti-pattern

- Single namespace; isolation by workflowId/taskQueue. Starting a target-project workflow from another project's client is normal.
- `client.workflow.start` does not require a live worker; start-time search attributes make the change immediately Visibility-listable.
- `ensureChangeWorkflowStarted` is idempotent and disk-hydrating; the target worker reconciles richer attrs when it next runs.
- Do not synchronously query the target workflow from the source process (the original timeout bug); the Visibility read avoids queries.

## Success criteria

1. After a cross-project `adv_change_create --target_path`, the target change has a Temporal workflow and appears in the target project's `adv status --json` (`live:true`) and launcher rows.
2. The source process never blocks on a target-workflow query; create succeeds even if no target worker is running.
3. Disk-only changes created before this fix become visible after reconciliation (verify with `reworkRelatedCards`).
4. Behavior is idempotent (re-create / re-reconcile does not duplicate or error) and preserves cross-project trust gating.
5. When Temporal is unreachable, create still writes the disk projection and surfaces a clear non-fatal warning (no silent success claim of full live registration).

## Scope

- `plugin/src/tools/change.ts` — cross-project create path: start target workflow.
- Workflow-start reuse: `ensureChangeWorkflowStarted` / `startChangeWorkflow`.
- Reconciliation helper + its trigger (local session/worker start).
- Tests: cross-project create starts workflow; no source-side query; idempotency; reconciliation of pre-existing disk-only change; Temporal-down disk-only fallback warning.
- Spec/docs: advance-meta note that cross-project create registers the target Temporal workflow.

## Out of scope

- Multi-namespace / multi-Temporal-server topologies.
- Changing the worker-free Visibility read contract (`rq-statusCliWorkerFree01`).
- Backfilling archived/closed changes.