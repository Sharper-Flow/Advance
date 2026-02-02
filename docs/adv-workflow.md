# ADV Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ADV WORKFLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /adv-proposal "summary"                                    │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────┐                                                │
│  │  DRAFT  │ ──────────────────────────────────────────┐    │
│  └────┬────┘                                           │    │
│       │ define requirements                            │    │
│       ▼                                                │    │
│  /adv-validate {change-id}                             │    │
│       │                                                │    │
│       ▼                                                │    │
│  ┌─────────┐    errors?    ┌──────────┐               │    │
│  │ ACTIVE  │ ────────────► │  FIX IT  │ ──────────────┘    │
│  └────┬────┘               └──────────┘                     │
│       │ validation passed                                   │
│       ▼                                                     │
│  /adv-apply {change-id}                                     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────┐                    │
│  │  TDD LOOP                           │                    │
│  │  ┌─────────────────────────────┐    │                    │
│  │  │ 1. Get ready task           │    │                    │
│  │  │ 2. [TDD_RED] Write test     │    │                    │
│  │  │ 3. [TDD_GREEN] Implement    │    │                    │
│  │  │ 4. Mark task done           │    │                    │
│  │  │ 5. Repeat until all done    │    │                    │
│  │  └─────────────────────────────┘    │                    │
│  └────────────────┬────────────────────┘                    │
│                   │ all tasks complete                      │
│                   ▼                                         │
│  /adv-archive {change-id}                                   │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐                                               │
│  │ ARCHIVED │ ◄─── Specs updated, docs generated            │
│  └──────────┘                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## State Transitions

| From | To | Trigger |
|------|-----|---------|
| (none) | DRAFT | `/adv-proposal` |
| DRAFT | ACTIVE | `/adv-validate` (pass) |
| ACTIVE | DRAFT | Validation errors |
| ACTIVE | ARCHIVED | `/adv-archive` |

## Key Commands by State

| State | Primary Commands |
|-------|-----------------|
| DRAFT | Edit `proposal.md`, add tasks, add deltas |
| ACTIVE | `/adv-apply`, `/adv-task`, `adv_task_update` |
| ARCHIVED | Read-only, specs updated |
