# ADV 7-Gate Quality Checklist

All changes must complete 7 sequential quality gates before archival.

## Gate Sequence

```
proposal → discovery → design → planning → execution → acceptance → release
```

| #   | Gate ID      | Description                         | Triggered By                   | Artifact                           |
| --- | ------------ | ----------------------------------- | ------------------------------ | ---------------------------------- |
| 1   | `proposal`   | Problem statement confirmed         | `/adv-proposal`                | `problem-statement.md`             |
| 2   | `discovery`  | Context gathered, objectives agreed | `/adv-discover`                | `agreement.md`                     |
| 3   | `design`     | Architecture decisions validated    | `/adv-design`                  | `design.md`                        |
| 4   | `planning`   | Task graph synthesized              | `/adv-prep`                    | Task graph in `change.json`        |
| 5   | `execution`  | Deliverables produced via TDD       | `/adv-apply` (all tasks done)  | Code, docs, ops deliverables       |
| 6   | `acceptance` | User accepts deliverables           | `/adv-review`                  | User sign-off                      |
| 7   | `release`    | Final quality pass and archive      | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized |

## Gate Status Values

| Value     | Meaning                                   |
| --------- | ----------------------------------------- |
| `pending` | Not yet completed                         |
| `done`    | Completed with timestamp + actor evidence |
| `skipped` | Explicitly skipped with documented reason |

## Enforcement Rules

1. **Sequential**: Gates MUST be completed in order (cannot skip ahead)
2. **Blocking**: Archive/Complete BLOCKS unless all 7 gates satisfied
3. **Cancelled Tasks**: At `execution` gate, cancelled tasks need user approval

## Gate-Specific Behaviors

### Proposal Gate

Owner: `/adv-proposal` | **Pauses for:** proposal confirmation

Produces `problem-statement.md` — the confirmed problem statement with success criteria and constraints. This is the entry point for all changes.

### Discovery Gate

Owner: `/adv-discover` | **Pauses for:** agreement sign-off (user-facing outcome questions only)

Produces `agreement.md` — context analysis, objectives, and constraints agreed with the user. `/adv-discover` Phase 4 (the agreement phase) includes a mandatory clarification loop that triages all open questions from discovery: technical questions are resolved autonomously via LBP research, while user-facing questions (priorities, behavior, downsides, AC boundaries) are presented to the user. No question may be silently deferred. Phase 4.5.1 adds an explicit **Acceptance Criteria Checkpoint** before `agreement.md` is persisted and the discovery gate completes, offering approve, `/adv-clarify` handoff, or write-in edit outcomes; if the user selects `/adv-clarify`, discovery stops and resumes only after the user reruns `/adv-discover`. The discovery and planning gates evaluate the full change including completed tasks — completed work is evidence to validate, not acceptance proof. Follow-up tasks are added where gaps are found.

### Design Gate

Owner: `/adv-design` | **Pauses for:** design approval when real tradeoffs depend on user values, when the design validator returns CONFLICT, or when the agent identifies contract-compromise risk (rq-designval04); auto-continues for straightforward deterministic designs with no compromise risk

Produces `design.md` — validated architecture decisions and implementation strategy. Design decisions are frozen after this gate completes.

### Planning Gate

Owner: `/adv-prep` | **Auto-continues** when clean (no user approval needed)

Produces the task graph in `change.json`. After this gate completes, `metadata.tdd_intent` is frozen on all tasks and no new tasks can be added (use `adv_task_reclassify_tdd` with user approval to change TDD intent).

### Execution Gate

Owner: `/adv-apply` | **Auto-continues** when clean (pauses only for doom-loop recovery or cancellations)

All tasks must be done (or properly cancelled with user approval). `/adv-apply` stops if discovery, design, or planning gates are pending — it MUST NOT complete pre-implementation gates. The execution gate implies every non-cancelled task with file changes is checkpointed via `adv_task_checkpoint`. Checkpoint commits are verified local rollback/audit points scoped to the change worktree; archive remains the separate publication path and worktree cleanup is blocked until integration.

### Acceptance Gate

Owner: `/adv-review` | **Pauses for:** user acceptance of delivered work

Absorbs the old `review` + `signoff` gates. `/adv-review` emits a `REVIEW_FINDINGS` block (blocker, issue, suggestion, question), presents the acceptance criteria checklist, and completes the acceptance gate after user confirmation.

### Release Gate

Owner: `/adv-harden` + `/adv-archive` | **Pauses for:** archive sign-off only

Absorbs the old `harden` gate. Before running quality scanners, `/adv-harden` performs pre-flight checks:

1. **Acceptance gate prerequisite** — acceptance gate must be complete
2. **Cancellation & cross-repo audit** — all cancelled tasks need approval, cross-repo tasks must be done
3. **Review findings audit** — validated in-scope findings must be resolved (no report-only, future-work, or accepted-debt path)
4. **Merge compatibility check** — non-destructive dry-run merge against the default branch (`git merge --no-commit --no-ff`); blocks on conflicts

`/adv-archive` runs Phase 9 Git Finalization: stage → commit → detect default branch → refresh basis → choose `--ff-only` / reconcile / PR path → verify → cleanup worktree → remove temp artifacts. During archive, durable convention/pattern wisdom can also be promoted to project-level wisdom so lessons survive beyond a single change.

## Re-Entry (Scope Expansion)

Gates are normally forward-only, but scope expansion during execution requires routing new objectives back through the workflow. The `adv_change_reenter` tool enables this by reopening a gate and cascading the reset downstream.

### Cascade Reset Semantics

When `adv_change_reenter(changeId, fromGate, reason, scopeDelta?, approvalEvidence?)` is called:

1. The target gate (`fromGate`) and all downstream gates are reset to `pending`
2. All upstream gates (before `fromGate`) remain `done`
3. Existing tasks and completed work are **preserved** — only gate state is reset
4. After reset, the planning gate is `pending`, so `adv_task_add` is unblocked for new tasks
5. Optional audit evidence may be recorded when re-entry follows an explicit user instruction

Example: reopening from `discovery` resets discovery + design + planning + execution + acceptance + release to `pending`. The `proposal` gate remains `done`.

### Audit Trail

Each re-entry appends to `reentry_history[]` on the change, recording:

- `from_gate` — which gate was reopened
- `reason` — why re-entry was needed
- `scope_delta` — what new scope is being added (optional)
- `reopened_by` — actor who triggered re-entry
- `approval_evidence` — optional audit evidence when re-entry follows an explicit user instruction
- `reopened_at` — timestamp
- `gates_reset` — list of gates that were reset to pending

### When to Use Re-Entry

| Situation                                           | Action                                           |
| --------------------------------------------------- | ------------------------------------------------ |
| New acceptance criteria discovered during execution | `adv_change_reenter` from earliest affected gate |
| Architecture assumptions invalidated by findings    | `adv_change_reenter` from `design`               |
| User requests scope expansion affecting agreement   | `adv_change_reenter` from `discovery`            |
| Bug fix within existing scope                       | Normal task workflow (no re-entry needed)        |
| Minor wording fix to docs                           | Edit directly (no re-entry needed)               |
| Clarification that doesn't change objectives        | `adv_change_update` (no re-entry needed)         |

### Constraints

- Cannot reopen a gate that is already `pending`
- After re-entry, walk the reopened gates normally before resuming execution
- `/adv-apply` stops if any pre-implementation gate is pending (standard prerequisite check)

## Checking Gate Status

```bash
# View gate status for a change
adv_gate_status({ changeId: "my-change" })

# Complete a gate
adv_gate_complete({ changeId: "my-change", gateId: "proposal" })
```
