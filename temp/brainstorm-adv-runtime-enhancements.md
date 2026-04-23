# Brainstorm: ADV Runtime Enhancements

**Started:** 2026-01-25
**Status:** Active
**Phase:** Diverge

---

## Problem Framing

### Context: Current ADV Architecture

ADV currently provides:
- **Tasks**: Tracked via `change.json`, with status, TDD evidence, dependencies
- **Store**: JSON files (source of truth) + SQLite (cache), unified via `Store` interface
- **Tools**: `adv_task_*` tools for CRUD operations
- **TDD Tracking**: Phase tracking (red/green/complete) with evidence recording
- **Plugin Hooks**: `event`, `tool.execute.before`, `tool.execute.after`, `experimental.session.compacting`

**Key insight**: Task execution is currently *documentation-driven* - the agent follows instructions but there's no runtime enforcement.

### Three Enhancement Areas

1. **Todo Continuation as Runtime Hook**
   - Problem: Agent can "complete" tasks without doing the work
   - Need: Runtime enforcement that tasks cannot be skipped

2. **Wisdom Accumulation**
   - Problem: Learnings from one task don't inform subsequent tasks
   - Need: Context passed between tasks in a change

3. **Background Agent Support**
   - Problem: Research blocks main task execution
   - Need: Parallel research capability

**Point of View:**
Agents working on ADV changes need runtime guardrails and accumulated context because documentation-only enforcement allows tasks to be skipped and knowledge to be lost between tasks.

**How Might We...?**

1. How might we enforce task completion at runtime rather than relying on documentation?
2. How might we capture and pass learnings between tasks in a change?
3. How might we enable parallel research without blocking the main task flow?
4. How might we design these to work together as a cohesive system?
5. How might we implement these with minimal changes to the existing store/tools?

---

## Ideas (Diverge)

### HMW #1: Enforce task completion at runtime

1. **Hook into `tool.execute.after` for `adv_task_update`** - Intercept task status updates and validate completion criteria before allowing "done" status
2. **Add `completion_criteria` field to Task** - Define what must be present (test evidence, file changes, etc.) before task can close
3. **Gate task transitions in the store** - Store.tasks.update() rejects "done" if criteria not met
4. **Emit blocking warnings** - Plugin emits warning events when task completion attempted without evidence
5. **Auto-reopen incomplete tasks** - If task marked done but missing evidence, automatically revert to in_progress
6. **Task completion checklist tool** - New tool `adv_task_verify` that checks completion criteria
7. **TDD evidence as hard requirement** - For logic tasks, require both red+green evidence before done
8. **Hook `tool.execute.before` for any file editing** - Track which files were modified during a task
9. **Integrate with git status** - Compare git diff before/after task to ensure actual changes happened
10. **Completion attestation** - Agent must explicitly attest to what was done via structured notes ⚡
11. **Block archive if incomplete tasks** - `adv_change_archive` fails if any tasks marked done without proper evidence

### HMW #2: Capture and pass learnings between tasks

12. **Add `wisdom` field to Change** - JSON object accumulating key learnings
13. **`adv_change_wisdom` tool** - Add/query accumulated wisdom
14. **Task completion auto-captures** - When task completes, prompt for/extract lessons learned
15. **Include wisdom in `adv_task_ready` response** - Next task context includes relevant prior learnings
16. **Tag-based wisdom retrieval** - Wisdom entries tagged by topic, surfaced when relevant task starts
17. **Wisdom inheritance from parent changes** - Child changes inherit wisdom from parent
18. **AI-summarized wisdom** - Use LLM to distill learnings into actionable guidelines ⚡
19. **Wisdom in `experimental.session.compacting`** - Preserve wisdom across context compaction
20. **Cross-change wisdom search** - `adv_wisdom_search` finds learnings across all changes
21. **Automatic pattern detection** - Track repeated issues/solutions and surface as wisdom ⚡
22. **Task notes → wisdom pipeline** - Structured notes on task completion feed into wisdom
23. **Wisdom expiration** - Time-decay for learnings that may become stale
24. **Failure wisdom priority** - Failures/blockers captured with higher weight than successes

### HMW #3: Enable parallel research without blocking

25. **`adv_task_spawn_research` tool** - Spawn a background research task that runs in parallel
26. **Research task type** - New task type that doesn't block main flow
27. **Background task queue** - Plugin maintains queue of research tasks executed between main tasks
28. **Research results mailbox** - Results stored for main agent to poll/retrieve
29. **Async research via sub-agent** - Use Task tool to spawn research, track via plugin state
30. **Research timeout** - Auto-cancel research that takes too long
31. **Research priority levels** - Urgent research can interrupt, low-pri runs opportunistically
32. **Merge research into task context** - When research completes, auto-inject into relevant task
33. **Speculative execution** - Start likely-needed research before main task explicitly requests ⚡
34. **Research deduplication** - Don't re-research if similar query already answered
35. **Research cache in SQLite** - Store research results for reuse across sessions
36. **Hook Task tool spawning** - `tool.execute.before` for Task detects research spawns
37. **Background agent status tracking** - Already have `activeSubAgents` counter, extend it
38. **Research as wisdom source** - Research findings automatically feed into wisdom accumulation

### HMW #4: Design as cohesive system

39. **Task lifecycle events** - Emit events at task start/complete for other systems to hook
40. **Unified context object** - Single object passed to tasks containing wisdom + research + state
41. **Change session abstraction** - Wrap change execution in session with full context
42. **Pipeline architecture** - Each task goes through: prep → execute → validate → capture
43. **State machine for tasks** - Formal state machine with guarded transitions
44. **Context injection in tool responses** - Tool results include relevant wisdom/research automatically
45. **ADV runtime wrapper** - `/adv-apply` becomes orchestrator that manages all this ⚡
46. **Observable task streams** - Event stream for real-time task progress monitoring
47. **Rollback capability** - If task fails validation, can rollback changes

### HMW #5: Minimal changes to existing code

48. **Extend existing types** - Add optional fields rather than new types
49. **Backwards compatible storage** - New fields default to undefined, old changes still work
50. **Hooks-only implementation** - Use existing hook infrastructure, no new hook types
51. **Gradual rollout** - Feature flags for each enhancement
52. **Thin wrapper pattern** - New tools wrap existing tools with additional behavior
53. **Store decorator pattern** - Wrap store with validation/capture layer
54. **Convention over configuration** - Smart defaults, opt-out rather than opt-in

---

## Clusters

<to be organized after diverge>

---

## Evaluation (Converge)

<to be completed after clustering>

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|

---

## Open Questions

- [ ] How does the plugin communicate with the agent runtime?
- [x] Is there a hook/event system in opencode-plugin we can leverage? → YES: event, tool.execute.before/after, session.compacting
- [ ] What's the boundary between plugin and agent behavior?
- [ ] How would background agents coordinate (same project context, different task)?
- [ ] Can we intercept and modify tool responses via hooks?
- [ ] What's the limit on state we can track in the plugin?

---

## Next Steps

<defined during wrap-up>

---

*Working draft. When ready: `/adv-proposal "<summary>"`*
