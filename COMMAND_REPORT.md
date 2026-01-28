# ADV Command Implementation Report

**Generated:** 2026-01-22 | **Total Commands:** 15 | **Total Lines:** 3,578

---

## Command Inventory

| Command | Lines | Size | Confidence | Sub-Agents | Description |
|---------|------:|-----:|:----------:|:----------:|-------------|
| `adv-status` | 114 | 2.5KB | HIGH | No | Project overview - specs, changes, recommendations |
| `adv-proposal` | 219 | 4.8KB | HIGH | No | Create new change proposal with scaffolding |
| `adv-validate` | 214 | 4.4KB | HIGH | No | Validate change against specs |
| `adv-clarify` | 87 | 3.0KB | HIGH | No | Socratic clarifying questions |
| `adv-prep` | 254 | 5.5KB | HIGH | Optional | Gap analysis - missing scenarios, tasks, concerns |
| `adv-research` | 275 | 5.4KB | MEDIUM | Yes (N) | Validate architectural decisions via Context7 |
| `adv-apply` | 287 | 5.8KB | HIGH | No | Implement change with TDD workflow |
| `adv-review` | 307 | 6.5KB | MEDIUM | Yes (4) | Code review - correctness, security, architecture |
| `adv-harden` | 348 | 7.8KB | MEDIUM | Yes (5) | AI-slop detection, test coverage, cleanup |
| `adv-audit` | 327 | 6.8KB | MEDIUM | Yes (4) | Project-wide spec/implementation drift detection |
| `adv-archive` | 263 | 5.2KB | HIGH | No | Archive completed change, update specs |
| `adv-refactor` | 307 | 6.2KB | LOW | Yes (5) | Refresh stale proposals to match codebase |
| `adv-ralph` | 245 | 5.5KB | MEDIUM | No | Autonomous implementation with retry |
| `adv-coordinate` | 170 | 3.9KB | MEDIUM | No | Multi-change conflict detection |
| `adv-roadmap` | 161 | 3.3KB | HIGH | No | Progress dashboard |

---

## Confidence Legend

| Level | Meaning | Testing Required |
|-------|---------|------------------|
| **HIGH** | Direct tool calls, simple orchestration | Basic smoke test |
| **MEDIUM** | Sub-agent coordination, complex state | Integration test with real changes |
| **LOW** | Novel patterns, untested in ADV context | Full workflow validation |

---

## Architecture Summary

### Hybrid Pattern (All Commands)

```
┌─────────────────────────────────────────────────────────────┐
│  USER REQUEST                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Target Resolution                                       │
│     └── adv_change_list / adv_spec_list                     │
│     └── question tool (if ambiguous)                        │
│                                                             │
│  2. Load Context                                            │
│     └── adv_change_show / adv_spec_show                     │
│     └── adv_task_list                                       │
│                                                             │
│  3. Display Contract Banner (from tool state)               │
│     ┌────────────────────────────────────┐                  │
│     │ =========== CONTRACT ACTIVE ====== │                  │
│     │ OBJECTIVE: {from change.title}     │                  │
│     │ CRITERIA: {from tool state}        │                  │
│     └────────────────────────────────────┘                  │
│                                                             │
│  4. Execute (tools update state)                            │
│     └── adv_task_update status: "done"                      │
│     └── adv_change_validate                                 │
│                                                             │
│  5. CONTRACT FULFILLED Banner                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sub-Agent Commands

| Command | Agents | Purpose |
|---------|--------|---------|
| `adv-review` | 4 parallel | Traceability, Logic, Security, Architecture |
| `adv-harden` | 5 parallel | Tests, AI-Slop, Docs, Cleanup, Spec Alignment |
| `adv-audit` | 4 staged | Parser → Mapper + Conflicts → Drift |
| `adv-research` | N parallel | One per architectural decision |
| `adv-refactor` | 5 parallel | Drift, Deps, Conflicts, Tasks, Obsolescence |

---

## Key Features

| Feature | Commands Using It |
|---------|-------------------|
| Contract Banners | All 15 |
| `question` tool | apply, archive, review, harden, audit, ralph, coordinate |
| Anti-Loop Protocol | prep, research, review, harden, audit, refactor |
| Doom Loop Detection | apply, ralph |
| TDD (Red/Green) | apply, ralph |
| Autonomous Retry | ralph |

---

## File Statistics

```
Total Commands:     15
Total Lines:        3,578
Average Lines:      238
Largest:            adv-harden (348 lines)
Smallest:           adv-clarify (87 lines)
Total Size:         77KB
```

---

## Recommendations

### Immediate Testing Priority

1. **adv-apply** - Core workflow, must work perfectly
2. **adv-validate** - Gate for all implementations
3. **adv-archive** - Critical for spec updates

### Integration Testing Required

4. **adv-review** - Verify 4-agent orchestration
5. **adv-harden** - Verify 5-agent orchestration + cleanup

### Needs Workflow Validation

6. **adv-refactor** - Novel bidirectional reconciliation pattern
7. **adv-audit** - Complex staged sub-agent execution

---

## Source Mapping

| ADV Command | OpenSpec Source | Adaptation Notes |
|-------------|-----------------|------------------|
| adv-apply | openspec-apply | Tool calls replace CLI |
| adv-archive | openspec-archive | adv_change_archive tool |
| adv-audit | openspec-audit | adv_spec_* tools |
| adv-clarify | openspec-clarify | No changes needed |
| adv-coordinate | openspec-coordinate | Tool-based state |
| adv-harden | openspec-harden | Same sub-agent patterns |
| adv-prep | openspec-prep | adv_task_add for gaps |
| adv-proposal | openspec-proposal | adv_change_create |
| adv-ralph | openspec-ralph | ADV retry markers |
| adv-refactor | openspec-refactor | Context7 integration |
| adv-research | openspec-research | Context7 integration |
| adv-review | openspec-review | Same 4-agent pattern |
| adv-roadmap | openspec-roadmap | adv_status tool |
| adv-status | openspec-status | adv_status tool |
| adv-validate | openspec-validate | adv_change_validate |
