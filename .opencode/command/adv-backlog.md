---
name: adv-backlog
description: Capture future work before it becomes an Epic or change
requiresChangeId: false
---

<!--
  Spec citations:
    rq-backlogDurability01, rq-backlogFormat01, rq-backlogLifecycle01,
    rq-backlogPromotion01, rq-backlogArchive01, rq-backlogSchemaVersion01,
    rq-backlogConcurrency01, rq-backlogEpicBridge01
-->

# ADV Repo Backlog — Capture Future Work

Add, inspect, promote, and archive lightweight future-work items in `.adv/backlog.jsonl` — git-tracked, branch-local, and promotable to an ADV change or Epic shell entry.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** a confirmed backlog item, list, promotion, or archive action using typed backlog tools.

**× MUST NOT:** create implementation tasks, complete gates, add CLI mutation verbs, or read ADV state files directly.

**Gate:** None.

## Boundary vs Nearby Commands

- `/adv-backlog` — capture, inspect, or promote repo-level future work.
- `/adv-epic` — create or update initiative containers; can import backlog items via `backlog_ref`.
- `/adv-proposal` — create a normal ADV change for one work item.
- `/adv-triage` — coalesce overlapped changes↔issues and surface portfolio balance; does not mutate repo backlog state.

## Phase 1: Frame the Item

1. Restate the future work in one sentence.
2. Confirm:
   - backlog item title
   - success hint / rough acceptance criteria
   - optional explicit id (auto-generated if omitted)
3. If the request is clearly an active change or Epic, recommend `/adv-proposal` or `/adv-epic` instead.

## Phase 2: List or Inspect Before Mutation

Use typed tools only:

| Purpose                       | Tool                |
| ----------------------------- | ------------------- |
| List active backlog items     | `adv_backlog_list`  |
| Show one backlog item         | `adv_backlog_show`  |
| Add a new item                | `adv_backlog_add`   |
| Promote an item               | `adv_backlog_promote` |
| Archive an item               | `adv_backlog_archive` |

Rules:

- Heuristics may rank likely duplicates, but typed reads plus user choice own the decision.
- Surface evidence neutrally; do not hide a default recommendation.
- If the read fails, stop before mutation and surface the tool error/remediation.

## Phase 3: Duplicate / Overlap Decision

If no plausible overlap exists, proceed to mutation.

If a similar active item exists, present the evidence and ask the user to choose exactly one:

| Option          | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| update existing | Use `adv_backlog_add` with the same id to append a new active record |
| add anyway      | Create a distinct item with a new auto-generated id                  |
| promote         | Use `adv_backlog_promote` to link the existing item to a change or Epic shell |
| stop            | Do not mutate backlog state                                          |

× MUST NOT call `adv_backlog_add` for a clear duplicate until the user chooses `add anyway`.

## Phase 4: Mutate Through Typed Backlog Tools

After confirmation:

1. Add the item with `adv_backlog_add`.
2. Promote to a change or Epic shell with `adv_backlog_promote` when the user is ready.
3. Archive stale items with `adv_backlog_archive`.

### Epic bridge

To import a backlog item into an Epic as a shell entry, use `adv_epic_add_shell` with `backlog_ref`. The shell title and success hint derive from the backlog item unless explicitly overridden, and the shell records `imported_from` provenance. The binding is one-way: later backlog edits do not update the shell.

× MUST NOT directly edit `.adv/backlog.jsonl` or ADV state files.

## Output

Emit a compact final report:

- Backlog item id and title
- Action taken (added/promoted/archived/listed)
- Promotion target, if any
- Remaining follow-up actions, or `None`
