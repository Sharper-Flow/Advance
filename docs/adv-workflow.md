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
│  │ 1. proposal │  change.documents.problemStatement +                │
│  │             │  change.documents.proposal                           │
│  └──────┬──────┘                                                      │
│         │ /adv-discover                                               │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 2. discovery│  context analysis → change.documents.agreement       │
│  └──────┬──────┘                                                      │
│         │ /adv-design                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 3. design   │  architecture → change.documents.design              │
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
│  │ 6. acceptance│ user sign-off against change.documents.acceptance    │
│  │             │ + change.documents.executiveSummary                 │
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

Narrative artifacts persist only in `change.documents.{kind}` inside the active change projection. Markdown files materialize only in archive bundles through `writeArchiveBundleFiles`.

## Gate Ownership

| Gate       | Owning command        | Produces                     |
|------------|-----------------------|------------------------------|
| proposal   | `/adv-proposal`         | `change.documents.problemStatement`, `change.documents.proposal` |
| discovery  | `/adv-discover`         | `change.documents.agreement`                 |
| design     | `/adv-design`           | `change.documents.design`                    |
| planning   | `/adv-prep`             | Task graph in `change.json`    |
| execution  | `/adv-apply`            | Code / docs / ops deliverables |
| acceptance | `/adv-review` | `change.documents.acceptance`, `change.documents.executiveSummary`, `contract.reviewMatrix` |
| release    | `/adv-harden` + `/adv-archive`| Spec deltas applied, git finalized |

Gates are sequential — `/adv-harden` is blocked until `acceptance` is done, `/adv-archive` is blocked until all 7 are satisfied. See [docs/adv-gates.md](adv-gates.md) for the full gate contract.

See [Per-Gate Line-Item Map](#per-gate-line-item-map) in [docs/adv-gates.md](adv-gates.md) for the canonical per-gate task/artifact/writer/approval map.

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

For small, well-understood durable work, `/adv-task` fast-tracks a tracked change by assessing spec-law impact, synthesizing the proposal, discovery, design, and planning gates, and creating task state before implementation. Execution and acceptance still run through `/adv-apply` + `/adv-review` as normal.
