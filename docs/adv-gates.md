# ADV 7-Gate Quality Checklist

All changes must complete 7 sequential quality gates before archival.

## Gate Sequence

```
proposal → discovery → design → planning → execution → acceptance → release
```

| #   | Gate ID      | Description                                  | Triggered By                   | Artifact                              |
| --- | ------------ | -------------------------------------------- | ------------------------------ | ------------------------------------- |
| 1   | `proposal`   | Problem statement + User Outcomes confirmed  | `/adv-proposal`                | `problem-statement.md`, `proposal.md` |
| 2   | `discovery`  | Context gathered, criteria agreed            | `/adv-discover`                | `agreement.md`, `ChangeContract`      |
| 3   | `design`     | Architecture + technical criteria validated  | `/adv-design`                  | `design.md`                           |
| 4   | `planning`   | Task graph synthesized from agreement/design | `/adv-prep`                    | Task graph in `change.json`           |
| 5   | `execution`  | Deliverables produced via TDD                | `/adv-apply` (all tasks done)  | Code, docs, ops deliverables          |
| 6   | `acceptance` | User accepts deliverables                    | `/adv-review`                  | User sign-off                         |
| 7   | `release`    | Final quality pass and archive               | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized    |

## Gate Status Values

| Value               | Meaning                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `pending`           | Not yet started                                                                   |
| `in_progress`       | A workflow phase is actively running for this gate                                |
| `awaiting_approval` | Phase output is staged; waiting for explicit user approval                        |
| `stuck`             | Surfaced blocker; gate cannot advance until the blocker is resolved or re-entered |
| `done`              | Completed with timestamp + actor evidence                                         |
| `skipped`           | Explicitly skipped with documented reason                                         |

The signal-driven model exposes per-gate state transitions via dedicated signals:
`gateInProgressSignal`, `gateAwaitingApprovalSignal`, `gateStuckSignal`, `gateCompletedSignal`,
`gateReenteredSignal`. Gate state is queried via `getGateStatusQuery`.

## Enforcement Rules

<!-- rq-gateArtifactEnforcement01 rq-gateReadiness01 rq-gateArtifactAudit01 rq-acceptanceProjection01 -->

1. **Sequential**: Gates MUST be completed in order (cannot skip ahead)
2. **Blocking**: Archive/Complete BLOCKS unless all 7 gates satisfied
3. **Cancelled Tasks**: At `execution` gate, cancelled tasks need user approval
4. **Artifact-backed**: The workflow validates proposal.md, agreement.md, design.md, and generated acceptance.md before marking their gates done.
5. **Structured blockers**: When workflow readiness rejects completion, the gate enters `stuck` with `stuck_reason` and machine-readable `readiness_blockers` for tool surfacing.

## Gate-Specific Behaviors

### Proposal Gate

Owner: `/adv-proposal` | **Pauses for:** proposal confirmation

Produces `proposal.md` and `problem-statement.md` — the confirmed problem statement, implementation-free `## User Outcomes`, scope boundaries, constraints, and discovery agenda. Proposal does not own engineering acceptance criteria or testable success criteria; those are firmed in discovery. This is the entry point for all changes. The proposal gate is artifact-backed: direct `gateCompletedSignal` calls still require workflow-readable `proposal.md` evidence unless an explicit migration/replay compatibility rationale is recorded.

### Discovery Gate

Owner: `/adv-discover` | **Pauses for:** agreement sign-off (user-facing outcome questions only)

Produces `agreement.md` — context analysis, objectives, success criteria, acceptance criteria, constraints, and avoidances agreed with the user. `/adv-discover` Phase 4 (the agreement phase) includes a mandatory clarification loop that triages all open questions from discovery: technical questions are resolved autonomously via LBP research, while user-facing questions (priorities, behavior, downsides, AC boundaries) are presented to the user. No question may be silently deferred. Phase 4.5.1 adds an explicit criteria checkpoint before `agreement.md` is persisted and the discovery gate completes, offering approve, `/adv-clarify` handoff, or write-in edit outcomes; if the user selects `/adv-clarify`, discovery stops and resumes only after the user reruns `/adv-discover`. Discovery also runs an advisory implementation-free guard: mechanism-encoding criteria are flagged as likely design-derived but do not hard-block the gate by themselves. The discovery and planning gates evaluate the full change including completed tasks — completed work is evidence to validate, not acceptance proof. Follow-up tasks are added where gaps are found. The discovery gate is artifact-backed by workflow-readable `agreement.md` and the minted `ChangeContract`.

### Design Gate

Owner: `/adv-design` | **Pauses for:** design approval when real tradeoffs depend on user values, when the design validator returns CONFLICT, or when the agent identifies contract-compromise risk (rq-designval04); auto-continues for straightforward deterministic designs with no compromise risk

Produces `design.md` — validated architecture decisions, implementation strategy, and `## Design-Derived Criteria` for technical budgets/limits created by the selected design. `/adv-design` must not invent new user-facing acceptance criteria. If design invalidates approved criteria, routine re-entry starts from discovery before prep resumes. Design decisions are frozen after this gate completes. The design gate is artifact-backed by workflow-readable `design.md`.

### Planning Gate

Owner: `/adv-prep` | **Auto-continues** when clean (no user approval needed)

Produces the task graph in `change.json`. Prep maps criteria/design into tasks; it does not firm criteria or rewrite `agreement.md`. Criteria gaps discovered during prep route back to discovery/design through `adv_change_reenter`. After this gate completes, `metadata.tdd_intent` is frozen on all tasks. Genuine scope changes are handled via `adv_change_reenter` rather than mid-execution mutation.

### Execution Gate

Owner: `/adv-apply` | **Auto-continues** when clean (pauses only for doom-loop recovery or cancellations)

All tasks must be done (or properly cancelled with user approval). `/adv-apply` stops if discovery, design, or planning gates are pending — it MUST NOT complete pre-implementation gates. The execution gate implies every non-cancelled task with file changes is checkpointed via `adv_task_checkpoint`. Checkpoint commits are verified local rollback/audit points scoped to the change worktree; archive remains the separate publication path and worktree cleanup is blocked until integration.

### Acceptance Gate

Owner: `/adv-review` | **Pauses for:** user acceptance of delivered work

Absorbs the old `review` + `signoff` gates. `/adv-review` emits a `REVIEW_FINDINGS` block (blocker, issue, suggestion, question), persists and verifies acceptance proof, presents the acceptance criteria checklist, and completes the acceptance gate after user confirmation. The acceptance gate is artifact-backed by typed `contract.reviewMatrix`, generated `acceptance.md`, and workflow-visible `executive-summary.md` evidence. Manually edited markdown is not authoritative acceptance proof.

`/adv-review` Phase 7 persists `executive-summary.md` before the acceptance prompt. For new contract-era changes it is acceptance proof: it must be represented by workflow-visible artifact metadata, including content hash, and verified by gate readiness. It also remains the release-note/archive sign-off narrative read via `adv_change_show include.executiveSummary`.

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
