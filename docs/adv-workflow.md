# ADV Workflow Diagram

ADV is a **7-gate collaborative workflow**. Each gate is owned by a specific command and enforced in sequence — you cannot complete a gate until prior gates are satisfied.

See also:
- [docs/adv-gates.md](adv-gates.md) for gate-by-gate behavior
- [docs/adv-autonomy-compliance-matrix.md](adv-autonomy-compliance-matrix.md) for agent-decides vs user-confirms boundaries

## Gate Sequence

```
┌───────────────────────────────────────────────────────────────────────┐
│                  ADV 7-GATE COLLABORATIVE WORKFLOW                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  /adv-proposal "summary"                                              │
│       │                                                               │
│       ▼                                                               │
│  ┌─────────────┐                                                      │
│  │ 1. proposal │  problem-statement.md + success criteria             │
│  └──────┬──────┘                                                      │
│         │ /adv-discover                                               │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 2. discovery│  context analysis → agreement.md                     │
│  └──────┬──────┘                                                      │
│         │ /adv-design                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 3. design   │  architecture → design.md                            │
│  └──────┬──────┘                                                      │
│         │ /adv-prep                                                   │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 4. planning │  task graph, sequencing, TDD intent                  │
│  └──────┬──────┘                                                      │
│         │ /adv-apply  (tasks run through /adv-review inline)          │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 5. execution│  code, docs, ops deliverables                        │
│  └──────┬──────┘                                                      │
│         │ /adv-review                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 6. acceptance│ user sign-off against agreement.md                  │
│  └──────┬──────┘                                                      │
│         │ /adv-harden                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 7. release  │  hardening pass → /adv-archive applies deltas + wisdom│
│  └──────┬──────┘                                                      │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────┐                                                         │
│  │ ARCHIVED │  ◄─── Specs updated, durable wisdom captured, archived  │
│  └──────────┘                                                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Gate Ownership

| Gate       | Owning command        | Produces                     |
|------------|-----------------------|------------------------------|
| proposal   | `/adv-proposal`         | `problem-statement.md`         |
| discovery  | `/adv-discover`         | `agreement.md`                 |
| design     | `/adv-design`           | `design.md`                    |
| planning   | `/adv-prep`             | Task graph in `change.json`    |
| execution  | `/adv-apply`            | Code / docs / ops deliverables |
| acceptance | `/adv-review` | User sign-off                |
| release    | `/adv-harden` + `/adv-archive`| Spec deltas applied, git finalized |

Gates are sequential — `/adv-harden` is blocked until `acceptance` is done, `/adv-archive` is blocked until all 7 are satisfied. See [docs/adv-gates.md](adv-gates.md) for the full gate contract.

## Re-Entry Flow (Scope Expansion)

Gates are normally forward-only, but mid-change scope expansion can route back through earlier gates via `adv_change_reenter`:

```
                          ┌──────────────────────────────────────────────┐
                          │         RE-ENTRY (SCOPE EXPANSION)           │
                          │                                              │
                          │  During execution, new scope discovered:     │
                          │                                              │
                          │  adv_change_reenter(fromGate: "discovery")   │
                          │       │                                      │
                          │       ▼                                      │
                          │  Cascade reset: discovery → design →         │
                          │    planning → execution → acceptance →       │
                          │    release all reset to PENDING              │
                          │                                              │
                          │  Upstream gates (proposal) stay DONE         │
                          │  Existing tasks & completed work PRESERVED   │
                          │                                              │
                          │  Walk reopened gates normally:               │
                          │  /adv-discover → /adv-design → /adv-prep    │
                          │    → /adv-apply (resume)                    │
                          └──────────────────────────────────────────────┘
```

Re-entry is recorded in `reentry_history[]` on the change for audit. See [docs/adv-gates.md](adv-gates.md) for cascade reset semantics and constraints.

## Fast-Track

For small, well-scoped work, `/adv-task` fast-tracks a discussed change by synthesizing the proposal, discovery, design, and planning gates in one pass. Execution and acceptance still run through `/adv-apply` + `/adv-review` as normal.
