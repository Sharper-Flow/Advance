# ADV - Spec-Driven Development Instructions

ADV (Advance) enables spec-driven development where **specs become laws**. Requirements are formally defined, validated, and enforced during implementation.

## Core Concept

1. **Specs define the law**: Requirements in specs are authoritative
2. **Changes are proposals**: All modifications go through a change workflow
3. **Validation enforces laws**: Changes are validated against existing specs
4. **TDD drives implementation**: Test-first development with evidence
5. **Archive promotes changes**: Completed changes update specs permanently

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Project overview (specs, changes, recommendations) |
| `/adv-proposal <summary>` | Create new change proposal |
| `/adv-validate <change-id>` | Validate change against specs |
| `/adv-apply <change-id>` | Implement change with autonomous retry and TDD |
| `/adv-archive <change-id>` | Archive completed change |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Socratic clarifying questions |
| `/adv-prep <change-id>` | Gap analysis - add missing scenarios, tasks |
| `/adv-research <target>` | Validate architectural decisions via Context7 |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Code review (correctness, security, architecture) |
| `/adv-harden <change-id>` | AI-slop detection, test coverage, doc hygiene, cleanup |
| `/adv-audit [capability]` | Spec/implementation drift detection |

### Fast-Track

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a pre-discussed change — chat contract → LBP research → prep → autonomous implement |

### Advanced

| Command | Purpose |
|---------|---------|
| `/adv-refactor <change-id>` | Refresh stale proposals |
| `/adv-coordinate` | Multi-change conflict detection |

## Status Markers

Emit at START of each response:

| Marker | When | Tab emoji |
|--------|------|-----------|
| `[ADV:ROCKET]` | Active work | 🚀 |
| `[ADV:TDD_RED]` | Writing tests (red phase) | 🔴 |
| `[ADV:TDD_GREEN]` | Implementing (green phase) | 🟢 |
| `[ADV:MOON]` | Sub-agents running | 📡 |
| `[ADV:EARTH]` | Complete / awaiting input | 🌍 |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle | 💀 |
| `[ADV:MIC]` | Needs user approval | 🎤 |
| `[ADV:TASK_STATUS_REPORT]` | Emitting task report | — |

Tab title format: `<emoji> <normalized change code>` when active change is set (e.g. `📡 Feature X`); bare `<emoji>` when no active change. camelCase/kebab/snake_case IDs are split to Title Case words; common verb prefixes (add/fix/update/improve/create/remove/refactor/change) are stripped.

System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

## Critical Protocols

### Context Freshness

**Work one task at a time with fresh context.** Before EACH task:
1. Re-read change via `adv_change_show`
2. Look up the specific task via `adv_task_show` (returns full task + parent changeId)
3. Review relevant proposal sections

**TodoWrite Rules:** Use task IDs only (`tk-abc123`), not descriptions. Forces context lookup via `adv_task_show`.

### TDD Protocol (RSTC)

**RED Phase:** Write failing test → run → emit `[ADV:TDD_RED]` → show output
**GREEN Phase:** Implement → run → emit `[ADV:TDD_GREEN]` → show output
**Trivial Tasks:** Note `(trivial: docs change)` and skip TDD

### Doom Loop Detection

After 3 failed attempts on a task:

1. **STOP** - Don't retry same approach
2. **Emit** `[ADV:DOOM_LOOP]` marker
3. **Document** all 3 attempts with diagnosis
4. **Ask** via `question` tool for guidance

**No Skip/Defer:** Tasks must complete or doom loop. Prohibited:
- Skipping "to revisit later"
- Deferring "until more information"
- Marking blocked without 3 genuine attempts
- Cancelling tasks without explicit user approval (use `adv_task_cancel`)
- Cancelling cross-repo tasks because they target a different repository

### Cross-Repo Execution Protocol

Changes often span multiple repositories (e.g., frontend + backend, app + database).
Tasks targeting other repos MUST be executed there — not cancelled or skipped.

**Key rules:**
1. Tasks with `target_repo`/`target_path` metadata must be executed in the target directory
2. Switch `workdir` to the target repo path for all tool calls on that task
3. "Different repo" / "out of scope" is NEVER a valid cancellation reason
4. If a task title hints at another repo but lacks metadata, confirm with the user via `question` tool

**Project config supports generic repo routing:**
```json
{
  "related_repos": [
    { "id": "backend", "path": "/home/user/dev/my-backend", "role": "API server" },
    { "id": "db", "path": "/home/user/dev/my-db", "role": "Database migrations" }
  ]
}
```

**Review and Harden gates block** if cross-repo tasks are incomplete or cancelled without approval.

### Cancellation Policy

**All task cancellations require explicit user approval.**

- `adv_task_update` rejects `status: "cancelled"` — use `adv_task_cancel` instead
- `adv_task_cancel` requires: per-task reasons, `approvedByUser: true`, approval evidence
- Batch cancellation is allowed — agent presents all cancellations to user, user approves the batch
- The agent MUST show each task with its reason before calling `adv_task_cancel`
- Review and Harden gates BLOCK if any cancelled task lacks `cancellation.approved_by_user`

**Workflow:**
1. Agent identifies tasks to cancel with per-task reasons
2. Agent presents table to user via `question` tool
3. User approves (or rejects/reviews individually)
4. Agent calls `adv_task_cancel` with approval evidence

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining tasks.
See: [docs/adv-task-report.md](docs/adv-task-report.md)

## 6-Gate Quality Checklist

| Gate | Triggered By |
|------|--------------|
| 1. `research` | `/adv-research` or Context7 |
| 2. `prep` | `/adv-prep` |
| 3. `implementation` | All tasks done |
| 4. `review` | `/adv-review` |
| 5. `harden` | `/adv-harden` |
| 6. `signoff` | User confirmation |

Gates are sequential. Archive blocks until all 6 satisfied.
See: [docs/adv-gates.md](docs/adv-gates.md)

**Gate behaviors:**
- `/adv-review` emits a `REVIEW_FINDINGS` block listing all actionable findings (`blocker`, `issue`, `suggestion`, `question`).
- `/adv-harden` **blocks** if any actionable review findings are unresolved and not documented as accepted debt in `proposal.md`. `nit:` findings are not required.
- `/adv-archive` **runs mandatory Phase 9 Git Finalization**: stage+commit all changes, detect default branch, merge (or open PR), verify merge is clean, clean up worktree, remove temp artifacts.

## Sub-Agent Selection

When spawning sub-agents via the Task tool, select based on the task type:

| Agent | Use For | Tools |
|-------|---------|-------|
| `librarian` | Documentation, API references, code examples | Context7, grep.app, Kagi |
| `adv-researcher` | Architectural validation, simplicity analysis | Context7, Kagi, ADV read-only |
| `explore` | Codebase navigation, find usages | Read, Glob, Grep |
| `general` | Complex multi-step implementation | Full tool access |

### Orchestrator Pattern

For parallel research: spawn `librarian` (docs) + `adv-researcher` (architecture validation) simultaneously, then synthesize.

## Worktree Integration

ADV uses **external mutable state** so that all worktrees of the same repo share changes, archive, wisdom, agenda, and the SQLite cache. Specs remain in-repo (`.adv/specs/`).

### External State Layout

Mutable state lives at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`:

```
{project-id}/
├── changes/          # Active change proposals
├── archive/          # Completed changes
├── db/spec.db        # SQLite FTS cache
├── wisdom.jsonl      # Project-level learnings
├── agenda.jsonl      # Work queue
└── handoff.json      # Session handoff (fallback, multi-session only)
```

**project-id** = root commit SHA (`git rev-list --max-parents=0 HEAD`), stable across all worktrees.

### Inline Worktree Protocol (Default)

When a worktree is created during an active ADV change, continue in the same agent session:

1. **Create worktree** via `worktree_create`
2. **Capture worktree path** from tool output
3. **Switch execution context** by setting `workdir` to the worktree path for subsequent tool calls
4. **Continue implementation inline** in the same conversation/session

No session handoff is required for the default flow.

### Session Handoff Protocol (Fallback)

Use handoff only when explicitly using multi-session workflows (for example, a separate OpenCode session):

1. **Parent session** writes `handoff.json` with `{changeId, currentTaskId, gateStatus, objective}`
2. **Child session** reads and clears `handoff.json` on startup, hydrating `PluginState.activeChange`
3. **system.transform** injects `[ADV:WORKTREE_SESSION]` marker with full change context

### When Worktrees Are Used

Phase 0 of `/adv-apply` handles worktree assessment automatically:

| Command | Threshold | Default |
|---------|-----------|---------|
| `/adv-apply` | 3+ files or high-risk signals | Suggest worktree |

`/adv-apply` follows a deterministic 4-step sequence:
1. **Assess risk** — count affected files, evaluate risk signals
2. **Check tool availability** — verify `worktree_create` is available, skip with `[ADV:INFO]` if not
3. **Ask user** — present choice via `question` tool
4. **Create and switch inline** — create worktree, then continue in the same session with `workdir` set to the new path

### Worktree Cleanup Protocol

**`/adv-archive` handles git finalization automatically** via its mandatory Phase 9. This includes staging+committing all changes, merging to the default branch, verifying the merge is clean, and deleting the worktree.

Phase 9 steps (run automatically after archive):
1. Stage and commit all modified files
2. Detect default branch (`main` / `trunk` / remote HEAD)
3. Merge `change/{change-id}` to default branch (or push + open PR)
4. Verify merge: `git log --oneline {default}..change/{change-id}` must return empty
5. Delete worktree via `worktree_delete` (gracefully skipped if tool unavailable)
6. Remove temp artifacts (`.bak`, `.tmp`, `.orig`)

**Never delete a worktree with unmerged commits.** Phase 9 enforces this — it will not call `worktree_delete` until the merge is verified clean.

### Graceful Degradation

If `worktree_create`/`worktree_delete` tools are not installed, commands skip Phase 0 with:
```
[ADV:INFO] Worktree tools not available — proceeding with in-place implementation.
```
All other ADV functionality works identically.

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance
**Skip for:** Bug fixes, typos, deps, exploration


