---
name: adv-apply
description: Implement change with TDD, retry on failure, and final verification
---

# ADV Apply — Produce Deliverables with TDD and Retry

Implement an ADV change using TDD. Produce the agreed deliverables — code, docs, ops changes, or verification artifacts — and pursue every task to completion.

## Task Completion Policy

| Exit | Condition |
|------|-----------|
| ✅ Done | Implementation verified, tests pass |
| 🔁 Doom Loop | 3 genuine fix attempts failed with documented diagnosis |
| 🌍 Environmental | Missing external dependency → escalate immediately |

Cross-repo tasks: switch `workdir` to target path. "Different repo" is × never a valid exit. Cancellation: use `adv_task_cancel` with user approval only.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain
3. If none → suggest `/adv-proposal`

---

## Phase 0: Load Skill + Gate Check + Worktree

`skill("adv-apply-methodology")` → provides TDD work loop, retry protocol (error classification, diagnosis requirement, budget exhaustion), context freshness rules, and task completion criteria. If the skill is unavailable, use ADV_INSTRUCTIONS.md §TDD Protocol, §Doom Loop Detection, §Context Freshness as inline fallback.

**Gate check:** `adv_gate_status` → discovery/design/planning must be complete. × MUST NOT complete pre-implementation gates.

**Worktree assessment:** If 3+ files or high-risk change → suggest worktree isolation. Check for existing `change/{change-id}` worktree → reuse if healthy, prune if stale. If `worktree_create` unavailable → proceed in-place.

**Overlap warning:** Check `adv_change_list` for other active changes with overlapping affected files → emit advisory if found.

---

## Phase 1: Load Change Context

1. `adv_change_show changeId: <target>` → extract title, status, deltas
2. `adv_task_list changeId: <target>` → total/completed counts
3. `adv_task_ready changeId: <target>` → unblocked tasks

Display CONTRACT ACTIVE banner: objective, success criteria from deltas, task list with status, retry policy summary. Begin work immediately — invocation plus completed pre-implementation gates is approval.

---

## Phase 2: TDD Work Loop

**Context freshness:** `adv_change_show` once at phase start. Per task: `adv_task_show` only — × do NOT call `adv_change_show` before every task. Use task IDs only in TodoWrite.

**Cross-repo execution:** Check `target_repo`/`target_path` → switch `workdir` → execute → switch back. See ADV_INSTRUCTIONS.md §Cross-Repo Execution.

For each ready task (`adv_task_ready`):

1. **Start:** `adv_task_show` → `adv_task_update status: "in_progress"`
2. **Red:** `[ADV:TDD_RED]` → write failing test → run → show failure evidence
3. **Green:** `[ADV:TDD_GREEN]` → implement → run → if fails: apply retry protocol from skill → show pass evidence
4. **Verify:** Run build/tests/lint → retry protocol if failures
5. **Complete:** `adv_task_update status: "done"` → emit CONTRACT STATUS
6. **Next:** `adv_task_ready` → next task

For `metadata.tdd_intent: "not_applicable"` tasks: skip Red/Green phases, verify manually, include rationale.

---

## Phase 3: Final Verification + Completion

**Global final loop:** Run full build + all tests + lint + type check. If any fail → retry protocol → continue until pass or budget exhausted.

**Pre-completion checklist:** All tasks done or properly cancelled (each with `cancellation.approved_by_user: true`), no tasks skipped/deferred, all trivial skips have rationale.

**Final validation:** `adv_change_validate` → must pass. `adv_gate_complete gateId: execution`.

Emit CONTRACT FULFILLED: objective, criteria met, cancelled tasks (if any), completion mode (UNASSISTED/GUIDED/PARTIAL TAKEOVER), gate status. Next: `/adv-review {change-id}`.

---

## Key Tools

| State | Tool |
|-------|------|
| Task status | `adv_task_update` |
| Task details | `adv_task_show` |
| Task list | `adv_task_list` |
| Ready tasks | `adv_task_ready` |
| Change data | `adv_change_show` |
| Validation | `adv_change_validate` |