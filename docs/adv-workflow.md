# ADV Workflow Diagram

ADV is a **7-gate collaborative workflow**. Each gate is owned by a specific command and enforced in sequence — you cannot complete a gate until prior gates are satisfied.

See also: [docs/adv-gates.md](adv-gates.md) for gate-by-gate behavior.

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
│  │ 2. discovery│  context analysis → agreement.md (/adv-agree)        │
│  └──────┬──────┘                                                      │
│         │ /adv-design                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 3. design   │  architecture → design.md (/adv-present)             │
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
│         │ /adv-accept                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 6. acceptance│ user sign-off against agreement.md                  │
│  └──────┬──────┘                                                      │
│         │ /adv-harden                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 7. release  │  hardening pass → /adv-archive applies spec deltas   │
│  └──────┬──────┘                                                      │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────┐                                                         │
│  │ ARCHIVED │  ◄─── Specs updated, change moves to archive            │
│  └──────────┘                                                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Gate Ownership

| Gate       | Owning command        | Produces                     |
|------------|-----------------------|------------------------------|
| proposal   | `/adv-proposal`         | `problem-statement.md`         |
| discovery  | `/adv-discover` + `/adv-agree` | `agreement.md`                 |
| design     | `/adv-design` + `/adv-present` | `design.md`                    |
| planning   | `/adv-prep`             | Task graph in `change.json`    |
| execution  | `/adv-apply`            | Code / docs / ops deliverables |
| acceptance | `/adv-review` + `/adv-accept` | User sign-off                |
| release    | `/adv-harden` + `/adv-archive`| Spec deltas applied, git finalized |

Gates are sequential — `/adv-harden` is blocked until `acceptance` is done, `/adv-archive` is blocked until all 7 are satisfied. See [docs/adv-gates.md](adv-gates.md) for the full gate contract.

## Fast-Track

For small, well-scoped work, `/adv-task` fast-tracks a discussed change by synthesizing the proposal, discovery, design, and planning gates in one pass. Execution and acceptance still run through `/adv-apply` + `/adv-accept` as normal.
