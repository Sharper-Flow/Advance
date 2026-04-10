# ADV 7-Gate Quality Checklist

All changes must complete 7 sequential quality gates before archival.

## Gate Sequence

```
proposal → discovery → design → planning → execution → acceptance → release
```

| # | Gate ID | Description | Triggered By | Artifact |
|---|---------|-------------|--------------|----------|
| 1 | `proposal` | Problem statement confirmed | `/adv-proposal` | `problem-statement.md` |
| 2 | `discovery` | Context gathered, objectives agreed | `/adv-discover` + `/adv-agree` | `agreement.md` |
| 3 | `design` | Architecture decisions validated | `/adv-design` + `/adv-present` | `design.md` |
| 4 | `planning` | Task graph synthesized | `/adv-prep` | Task graph in `change.json` |
| 5 | `execution` | Deliverables produced via TDD | `/adv-apply` (all tasks done) | Code, docs, ops deliverables |
| 6 | `acceptance` | User accepts deliverables | `/adv-review` + `/adv-accept` | User sign-off |
| 7 | `release` | Final quality pass and archive | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized |

## Gate Status Values

| Value | Meaning |
|-------|---------|
| `pending` | Not yet completed |
| `done` | Completed with timestamp + actor evidence |
| `skipped` | Explicitly skipped with documented reason |

## Enforcement Rules

1. **Sequential**: Gates MUST be completed in order (cannot skip ahead)
2. **Blocking**: Archive/Complete BLOCKS unless all 7 gates satisfied
3. **Cancelled Tasks**: At `execution` gate, cancelled tasks need user approval

## Gate-Specific Behaviors

### Proposal Gate

Owner: `/adv-proposal`

Produces `problem-statement.md` — the confirmed problem statement with success criteria and constraints. This is the entry point for all changes.

### Discovery Gate

Owner: `/adv-discover` + `/adv-agree`

Produces `agreement.md` — context analysis, objectives, and constraints agreed with the user. The discovery and planning gates evaluate the full change including completed tasks — completed work is evidence to validate, not acceptance proof. Follow-up tasks are added where gaps are found.

### Design Gate

Owner: `/adv-design` + `/adv-present`

Produces `design.md` — validated architecture decisions and implementation strategy. Design decisions are frozen after this gate completes.

### Planning Gate

Owner: `/adv-prep`

Produces the task graph in `change.json`. After this gate completes, `metadata.tdd_intent` is frozen on all tasks and no new tasks can be added (use `adv_task_reclassify_tdd` with user approval to change TDD intent).

### Execution Gate

Owner: `/adv-apply`

All tasks must be done (or properly cancelled with user approval). `/adv-apply` stops if discovery, design, or planning gates are pending — it MUST NOT complete pre-implementation gates.

### Acceptance Gate

Owner: `/adv-review` + `/adv-accept`

Absorbs the old `review` + `signoff` gates. `/adv-review` emits a `REVIEW_FINDINGS` block (blocker, issue, suggestion, question). `/adv-accept` presents an acceptance criteria checklist for user confirmation.

### Release Gate

Owner: `/adv-harden` + `/adv-archive`

Absorbs the old `harden` gate. Before running quality scanners, `/adv-harden` performs pre-flight checks:

1. **Acceptance gate prerequisite** — acceptance gate must be complete
2. **Cancellation & cross-repo audit** — all cancelled tasks need approval, cross-repo tasks must be done
3. **Review findings audit** — actionable findings must be resolved or documented as accepted debt
4. **Merge compatibility check** — non-destructive dry-run merge against the default branch (`git merge --no-commit --no-ff`); blocks on conflicts

`/adv-archive` runs Phase 9 Git Finalization: stage → commit → detect default branch → merge/PR → verify → cleanup worktree → remove temp artifacts.

## Checking Gate Status

```bash
# View gate status for a change
adv_gate_status({ changeId: "my-change" })

# Complete a gate
adv_gate_complete({ changeId: "my-change", gateId: "proposal" })
```
