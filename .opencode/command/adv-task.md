---
name: adv-task
description: Fast-track a discussed change: synthesize contract, validate, prep, and hand off
---

# ADV Task — Fast-Track a Discussed Change

Fast-track a discussed change through proposal, discovery, design, and planning, then hand off to Build. Use when user and agent already agree on what needs doing.

## Command Boundary

**Produces:** Change scaffold, validated approach (Context7), complete task graph.

**Crosses boundaries intentionally** (fast-track exemption): creates tasks (normally prep-only), completes proposal + discovery + design + planning gates.

**Pipeline:** Quick Contract → proposal → discovery → agreement → design → present → prep → hand off

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Argument Handling

`$ARGUMENTS` is optional. × Never ask "what do you want to work on?" — derive from conversation.

| Invocation | Behavior |
|------------|----------|
| No args | Synthesize from recent conversation |
| With hint | Use hint as anchor, fill from conversation |

---

## Phase 0: Quick Contract

Extract agreed change from conversation. Emit QUICK CONTRACT block: INTENT (1-3 sentences), LBP TARGETS (decisions requiring validation), SCOPE (files/modules), SUCCESS CRITERIA (measurable).

Ask via `question`: Confirmed — execute (Recommended), Modify contract, Abort.

- Modify → re-synthesize → re-confirm
- Abort → stop
- Confirmed → Phase 1

---

## Phase 1: Create Change

`adv_change_create summary: "{2-5 words}" proposal: "{rendered proposal markdown}"` — include Intent, LBP Targets, Scope, Success Criteria sections. Capture `changeId`.

× Persist proposal via tool call only — no direct filesystem writes.

---

## Phase 2: Discovery + Design Validation

### Load Context

`adv_project_context` → full tech stack.

### Spawn Research Sub-Agents

1-2 agents in parallel (single message):

| Target Type | Agent |
|-------------|-------|
| Library/API | `librarian` |
| Architecture/pattern | `adv-researcher` |
| Both | Both |

Pass the minimum project context each agent needs. Redact secrets, internal URLs, and unrelated operational details before external research. If sub-agents fail → inline Context7 fallback → if no result → Kagi.

### Synthesize Verdicts

| Verdict | Meaning |
|---------|---------|
| ✅ Confirmed | Aligns with official recommendations |
| ⚠️ Caution | Works but preferred alternative exists |
| ❌ Conflict | Docs/community advises against |

### Halt on Conflict

If any ❌ → ask via `question`: Adopt recommended, Keep original, Abort.

### Complete Gate

`adv_gate_complete changeId: {id} gateId: discovery`

---

## Phase 3: Prep — Generate Tasks

### Scan Codebase

Read files in scope → understand patterns, dependencies. Check `adv_change_list` for conflicts.

### Generate Tasks

Decompose contract into atomic `tk-` tasks via `adv_task_add`:
- Implementable in single session
- Clear testable success condition
- TDD guidance in description (logic-heavy → required, trivial → note skip)
- Dependency order with `blockedBy`

### Complete Gate

`adv_gate_complete changeId: {id} gateId: planning`

---

## Phase 4: Build Handoff

Emit READY FOR BUILD banner: change ID, intent, LBP validation table, task list, gate status. × Do NOT begin implementation.

```
/adv-task READY FOR BUILD
Next: /adv-apply {changeId}
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Create change | `adv_change_create` |
| Research | Task tool (librarian, adv-researcher) |
| Fallback | `context7_resolve-library-id`, `context7_query-docs`, `kagi_kagi_search_fetch` |
| Context | `adv_project_context` |
| Conflicts | `adv_change_list` |
| Add tasks | `adv_task_add` |
| Gates | `adv_gate_complete` |
