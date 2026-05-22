# Open Issue Long-Term Solution Ownership — 2026-05-04

Status: researched issue-triage note. Use this as routing evidence when drafting ADV/OCA changes or commenting on GitHub issues.

## Repository boundary

| Issue / cluster | Correct repo | Long-term owner | Reason |
|---|---|---|---|
| `#37` / `#39` checkpoint commit succeeds but task-run ledger update fails | Advance | Advance plugin runtime | `adv_task_checkpoint`, Temporal store adapter, workflow update handlers, and task-run state machine all live in this repo. |
| `#40` cached plugin/self-update confusion | Split | Advance + OCA | Advance can inspect loaded runtime provenance; OCA owns plugin install/update/build/session handoff. |
| `#36` missing-from-disk worktree registry cleanup | Advance | Advance worktree tools | Registry, triage, and delete safety gates live under `plugin/src/tools/worktree/`. |
| `#38` merged non-ADV worktree cleanup blocked | Advance | Advance worktree tools | `adv_worktree_delete` enforces branch integration/ADV archive safety. |
| `#33` worker-health false-negative wording | Advance | Advance diagnostics | `adv_status`, `adv_temporal_diagnose`, queue serviceability, and formatted health output live in this repo. |

## Long-term solution shape

### Checkpoint ledger recovery (`#37`, `#39`)

Build a ledger reconciliation primitive, not another retry loop.

- Primary seams: `plugin/src/tools/checkpoint.ts`, `plugin/src/storage/store-temporal/tasks.ts`, `plugin/src/temporal/workflows.ts`, `plugin/src/temporal/change-state.ts`, `plugin/src/temporal/retry-wrapper.ts`.
- Recovery should inspect `TaskRunState`, task completion verification, `checkpointSha`, `touched_files`, current branch, and `HEAD`.
- It may synthesize only missing safe ledger events with `recovered: true` audit payloads, then record the checkpoint idempotently.
- Error surfaces should preserve operation name and domain failure text, for example `Invalid task-run transition from red_recorded via checkpoint`, instead of collapsing to generic `Workflow Update failed`.
- This primitive should serve `adv_task_checkpoint`, evidence fallback recovery, and future workflow repair.

### Self-update / cached plugin runtime (`#40`)

Split the solution by layer.

Advance owns runtime provenance diagnostics:

- loaded module URL / plugin root derived from `import.meta.url`
- loaded `dist/index.js` and `dist/temporal/worker.js` mtime/hash
- plugin checkout branch + HEAD
- source-vs-dist freshness check
- cwd/worktree-vs-loaded-plugin-root mismatch warning

OCA owns deterministic rebuild + session handoff:

- plugin doctor check for source/dist freshness
- explicit Advance rebuild/update command path
- session/window helper that starts a new OpenCode process in the intended worktree after rebuild
- docs that distinguish Temporal worker restart from OpenCode host/tool reload

### Worktree cleanup (`#36`, `#38`)

Split delete safety into explicit classes.

- `adv_archived_branch`: current strict path — archived, merged, clean.
- `non_adv_merged_branch`: allow delete when no matching active ADV change exists, tree is clean, and branch is reachable from default.
- `missing_from_disk_registry`: allow registry row removal when registry references a missing path and the git branch is absent or already integrated/archived; `force:true` may bypass integration checks for this class with audit logging.

### Worker health wording (`#33`)

Make formatted health serviceability-first.

- `queue_serviceability.status === "serviceable"` with no blockers is healthy even if the local process is peer-owned.
- `worker_process_alive:false` remains raw diagnostic evidence, not the primary user-facing verdict.
- Stale queue warnings should render separately from current worker liveness.

## Sequencing recommendation

1. Checkpoint ledger recovery (`#37`/`#39`) — autonomy blocker.
2. Self-update diagnostics and OCA handoff (`#40` + OCA companion ticket) — prevents self-fix confusion.
3. Worktree cleanup classes (`#36`/`#38`) — small, isolated safety fix.
4. Worker health wording (`#33`) — diagnostic polish once queue serviceability is already correct.
