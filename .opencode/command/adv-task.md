---
name: adv-task
description: Fast-track small changes: assess spec-law impact, prep, and hand off
---
<!-- manifest: adv-task · requiresChangeId: false · scope: creates[change, proposal, tasks] reads[specs, codebase] modifies[proposal, design] gates[proposal, discovery, design, planning] -->
# ADV Task — Fast-Track Small Changes
Fast-track a small, well-understood durable change through proposal, discovery, design, and planning, then hand off to Build. Use when user and agent already agree on what needs doing and need tracked change/task state before implementation.
## Command Boundary
**Produces:** Change scaffold, spec-law impact assessment, validated approach (Context7), complete task graph.

**Crosses boundaries intentionally** (fast-track exemption): creates tasks (normally prep-only), completes proposal + discovery + design + planning gates.

**Pipeline:** Quick Contract → proposal → discovery → spec-law impact → agreement → design → present → prep → hand off
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
Extract agreed change from conversation. Emit QUICK CONTRACT block:

- **INTENT:** {1-3 sentences}
- **LBP TARGETS:** {decisions requiring validation}
- **SCOPE:** {files/modules}
- **SUCCESS CRITERIA:** {measurable}

Ask via `question`: Confirmed — execute (Recommended), Modify contract, Abort.
- Modify → re-synthesize → re-confirm
- Abort → stop
- Confirmed → Phase 1

---
## Phase 1: Create Change
`adv_change_create summary: "{2-5 words}" proposal: "{rendered proposal markdown}"` — include Intent, LBP Targets, Scope, Success Criteria sections. Capture `changeId`.

× Persist proposal via tool call only — no direct filesystem writes.
### Complete Gate
`adv_gate_complete changeId: {id} gateId: proposal`

---
## Phase 2: Discovery + Design Validation
### Load Context
`adv_project_context` → full tech stack.

### Spec-Law Impact Assessment
Before task generation, `/adv-task` MUST determine whether the fast-tracked change needs durable spec-law updates. Use `adv_spec action: "list"` plus targeted `adv_spec action: "search"` / `adv_spec action: "show"` for affected capabilities inferred from the Quick Contract and proposal.

Classify **Spec-law impact** as exactly one:

| Outcome | Meaning | Required action |
|---------|---------|-----------------|
| **Add** | New durable behavior, capability, or requirement is introduced | Persist draft spec-delta obligations |
| **Modify** | Existing spec law needs behavior, acceptance, or constraint changes | Persist draft spec-delta obligations |
| **Remove** | Existing durable behavior or requirement is removed/subtracted | Persist draft spec-delta obligations |
| **No spec law update required** | Implementation-only change preserves existing law | Persist explicit no-delta rationale |
| **Uncertain** | Impact cannot be resolved quickly | Stop fast-track; continue the same change through `/adv-proposal` or deeper discovery |

For **Add**, **Modify**, or **Remove**, persist draft spec-delta obligations via `adv_change_update` before planning:

- affected capability/spec
- delta kind: add, modify, or remove
- concrete `rq-*` requirement IDs
- at least one Given/When/Then scenario per obligation
- rationale linking the obligation to the agreed change

For **No spec law update required**, persist `No spec law update required: {rationale}` in the proposal/design context before planning.

For **Uncertain**, `/adv-task` MUST NOT complete planning or create implementation tasks for the uncertain scope. Carry the same change forward into `/adv-proposal` or keep investigating until impact is clear. Do not create a duplicate change for the same scope; if the user chooses to abandon the created change instead, closure requires explicit user approval through the owning ADV cleanup/cancel path.

This phase is the crash-safe fast-path guard: durable change/task state and spec-law intent must exist before implementation begins.

### Spawn Research Sub-Agent
Spawn `adv-researcher` for docs/API/examples + architecture validation in a single message:
| Target Type | Agent |
|-------------|-------|
| Library/API | `adv-researcher` |
| Architecture/pattern | `adv-researcher` (independent validator) |
| Both | `adv-researcher` |

Pass the minimum project context the agent needs. Redact secrets, internal URLs, and unrelated operational details before external research. If the sub-agent fails → inline Context7 fallback → if no result → Exa.
### Synthesize Verdicts
| Verdict | Meaning |
|---------|---------|
| ✅ Confirmed | Aligns with official recommendations |
| ⚠️ Caution | Works but preferred alternative exists |
| ❌ Conflict | Docs/community advises against |
### Halt on Conflict
If any ❌ → ask via `question`: Adopt recommended, Keep original, Abort.
### Complete Gates
`adv_gate_complete changeId: {id} gateId: discovery`
`adv_gate_complete changeId: {id} gateId: design`

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

Use the fast-track variant of the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
{Summarize combined decisions from proposal+discovery+design+planning.}

## Delivered
- Change scaffold created
- Spec-law impact: {Add|Modify|Remove|No spec law update required}
- LBP validation: {Confirmed|Caution|Conflict}
- Task graph synthesized
- Proposal + agreement + design artifacts produced

---

> **{change-id}**
> task ✓ → apply
>
> → `/adv-apply {change-id}`
```

× Do NOT begin implementation.

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Create change | `adv_change_create` |
| Research | Task tool (adv-researcher) |
| Fallback | Context7 (`context7_resolve-library-id` + `context7_query-docs`) for library docs, `webfetch` if Context7 is absent, `exa_web_search_exa` |
| Context | `adv_project_context` |
| Conflicts | `adv_change_list` |
| Add tasks | `adv_task_add` |
| Gates | `adv_gate_complete` |
